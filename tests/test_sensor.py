from datetime import datetime, timedelta, timezone
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import runpy
from unittest.mock import patch
from wsgiref.validate import validator

import pytest
from werkzeug.test import Client
from werkzeug.wrappers import Response

import app as web
from sensor import SensorStore, SourceError, parse_csv, summarize


def test_original_google_format_and_chronological_order():
    content = '\ufeffCarimbo de data/hora,Data,Hora,Temperatura,Umidade\r\r\n22/10/2026 09:45:00,22/10/2026,09:45:00,25.6,70\r\r\n22/10/2026 09:44:00,22/10/2026,09:44:00,24.6,76.1'
    data = parse_csv(content)
    assert len(data['records']) == 2
    assert data['records'][0]['timestamp'] == '2026-10-22T12:44:00+00:00'
    assert summarize(data['records'])['temperature'] == {'current': 25.6, 'min': 24.6, 'max': 25.6, 'mean': 25.1}


def test_decimal_comma_bad_rows_and_partial_measurement():
    data = parse_csv('Data;Hora;Temperatura;Umidade\n22/10/2026;09:00:00;24,5;65,2\n22/10/2026;09:01:00;55.6.0;66\ninvalid;09:02:00;25;60\n22/10/2026;09:03:00;NaN;101')
    assert data['records'][0]['temperature'] == 24.5
    assert data['records'][1]['temperature'] is None
    assert data['partial_rows'] == 1
    assert data['rejected_rows'] == 2
    assert summarize(data['records'])['temperature']['current'] is None


def test_iso_dates_and_infinity():
    data = parse_csv('timestamp,temperature,humidity\n2026-10-22T12:00:00Z,inf,60\n2026-10-22T12:01:00-03:00,25,50')
    assert data['records'][0]['temperature'] is None
    assert data['records'][1]['timestamp'] == '2026-10-22T15:01:00+00:00'


@pytest.mark.parametrize('csv', ['<html>Not published</html>', 'Data,Temperatura,Umidade\ninvalid,25,60', 'Data,Temperatura\n22/10/2026,25'])
def test_empty_or_unpublished_source(csv):
    with pytest.raises(SourceError):
        parse_csv(csv)


def test_cache_then_source_failure_preserves_last_good_data():
    store = SensorStore()
    data = {'records': [{'timestamp': '2026-10-22T12:00:00+00:00', 'temperature': 25, 'humidity': 60}]}
    with patch('sensor.fetch_source', return_value=data) as fetch:
        assert store.get()[0] == data
        assert store.get()[2] is False
        assert fetch.call_count == 1
    store.checked = 0
    with patch('sensor.fetch_source', side_effect=TimeoutError):
        assert store.get()[0] == data
        assert store.get()[2] is True


def test_cold_failure_returns_source_error():
    with patch('sensor.fetch_source', side_effect=TimeoutError), pytest.raises(SourceError):
        SensorStore().get()


def sample_data():
    now = datetime.now(timezone.utc)
    rows = [{'timestamp': (now - timedelta(hours=h)).isoformat(), 'temperature': 25+h, 'humidity': 60} for h in (7, 2, 0)]
    return {'records': rows, 'rejected_rows': 0, 'partial_rows': 0}


def test_api_period_status_security_and_static():
    client = web.app.test_client()
    with patch.object(web.store, 'get', return_value=(sample_data(), datetime.now(timezone.utc).isoformat(), False)):
        response = client.get('/api/readings?period=1h')
        assert response.status_code == 200
        assert response.get_json()['total'] == 1
        assert response.get_json()['total_available'] == 3
        assert response.get_json()['source']['status'] == 'online'
        assert response.headers['cache-control'] == 'no-store'
        assert client.get('/api/readings?period=invalid').status_code == 422
    assert client.get('/').status_code == 200
    assert client.get('/static/app.js').status_code == 200
    assert client.get('/.env').status_code == 404
    assert client.get('/api/health').get_json()['status'] == 'ok'
    assert client.get('/api/health').get_json()['version'] == web.APP_VERSION
    assert client.get('/api/health').get_json()['service'] == 'iot-dashboard'
    assert response.headers['X-App-Version'] == web.APP_VERSION


def test_api_stale_and_upstream_errors():
    client = web.app.test_client()
    data = sample_data()
    for row in data['records']:
        row['timestamp'] = (datetime.fromisoformat(row['timestamp']) - timedelta(days=2)).isoformat()
    with patch.object(web.store, 'get', return_value=(data, datetime.now(timezone.utc).isoformat(), False)):
        assert client.get('/api/readings').get_json()['source']['status'] == 'stale'
    with patch.object(web.store, 'get', return_value=(data, datetime.now(timezone.utc).isoformat(), True)):
        assert client.get('/api/readings').get_json()['source']['status'] == 'source_error'
    with patch.object(web.store, 'get', side_effect=SourceError('Fonte indisponível')):
        assert client.get('/api/readings').status_code == 502


def test_wsgi_contract_and_production_flags():
    client = Client(validator(web.app), Response)
    response = client.get('/api/health', buffered=True)
    assert response.status_code == 200
    assert response.get_json()['status'] == 'ok'
    response.close()
    assert web.app.debug is False
    assert web.app.testing is False


def test_threaded_cache_has_one_fetch_and_one_snapshot():
    store = SensorStore()
    with patch('sensor.fetch_source', return_value=sample_data()) as fetch:
        with ThreadPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(lambda _: store.get(), range(32)))
    assert fetch.call_count == 1
    assert all(result[0] is results[0][0] for result in results)


def test_cold_failure_backoff_prevents_serial_network_retries():
    store = SensorStore()
    def get_error(_):
        try:
            store.get()
        except SourceError as exc:
            return str(exc)
    with patch('sensor.fetch_source', side_effect=TimeoutError) as fetch:
        with ThreadPoolExecutor(max_workers=8) as pool:
            errors = list(pool.map(get_error, range(16)))
    assert fetch.call_count == 1
    assert all(message and message == errors[0] for message in errors)


def test_concurrent_periods_do_not_mutate_shared_records():
    data = sample_data()
    def get_count(period):
        with web.app.test_client() as client:
            return client.get('/api/readings', query_string={'period': period}).get_json()['total']
    with patch.object(web.store, 'get', return_value=(data, datetime.now(timezone.utc).isoformat(), False)):
        with ThreadPoolExecutor(max_workers=8) as pool:
            assert list(pool.map(get_count, ['all', '1h'] * 8)) == [3, 1] * 8
    assert len(data['records']) == 3


def test_internal_errors_do_not_expose_tracebacks():
    with patch.object(web.store, 'get', side_effect=RuntimeError('PRIVATE_TEST_VALUE')):
        response = web.app.test_client().get('/api/readings')
    assert response.status_code == 500
    assert response.get_json() == {'error': 'Erro interno ao processar a consulta.'}
    assert 'PRIVATE_TEST_VALUE' not in response.get_data(as_text=True)
    assert response.headers['cache-control'] == 'no-store'


def test_gunicorn_config_uses_render_port_and_concurrency(monkeypatch):
    monkeypatch.setenv('PORT', '12345')
    monkeypatch.setenv('WEB_CONCURRENCY', '2')
    monkeypatch.setenv('GUNICORN_THREADS', '4')
    config = runpy.run_path(str(Path(__file__).resolve().parents[1] / 'gunicorn.conf.py'))
    assert config['bind'] == '0.0.0.0:12345'
    assert config['workers'] == 2
    assert config['threads'] == 4
    assert config['worker_class'] == 'gthread'
    assert config['reload'] is False
    assert config['preload_app'] is False
    assert config['max_requests'] > 0
    assert config['max_requests_jitter'] > 0
