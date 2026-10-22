"""Aplicação Flask/WSGI. Produção: gunicorn --config gunicorn.conf.py app:app."""
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

from dotenv import load_dotenv
from flask import Flask, jsonify, request, send_from_directory

from sensor import SensorStore, SourceError, summarize

load_dotenv()
ROOT = Path(__file__).resolve().parent
APP_VERSION = (ROOT / 'VERSION').read_text(encoding='utf-8').strip()
app = Flask(__name__, static_folder=str(ROOT / 'static'), static_url_path='/static')
app.config.update(
    DEBUG=False,
    TESTING=False,
    MAX_CONTENT_LENGTH=16 * 1024,
    SESSION_COOKIE_SECURE=True,
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE='Lax',
)
app.json.ensure_ascii = False
# Cache somente da fonte pública, sem dados de sessão ou preferências de usuários.
store = SensorStore()
STALE_AFTER = max(30, int(os.getenv('STALE_AFTER_SECONDS', '180')))


@app.after_request
def headers(response):
    response.headers['X-App-Version'] = APP_VERSION
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    policy = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
    response.headers['Content-Security-Policy'] = policy
    if request.path.startswith('/api/'):
        response.headers['Cache-Control'] = 'no-store'
    return response


@app.get('/api/health')
def health():
    return {'status': 'ok', 'service': 'iot-dashboard', 'version': APP_VERSION}


@app.get('/api/readings')
def readings():
    period = request.args.get('period', 'all')
    if period not in {'1h', '6h', '24h', 'all'}:
        return jsonify(error='Período inválido. Use 1h, 6h, 24h ou all.'), 422
    try:
        data, fetched_at, source_error = store.get()
    except SourceError as exc:
        return jsonify(error=str(exc)), 502
    records = data['records']
    latest = datetime.fromisoformat(records[-1]['timestamp'])
    now = datetime.now(timezone.utc)
    age = max(0, int((now - latest).total_seconds()))
    if period != 'all':
        cutoff = (latest - timedelta(hours=int(period[:-1]))).isoformat()
        records = [r for r in records if r['timestamp'] >= cutoff]
    stale_after = STALE_AFTER
    return {
        'version': APP_VERSION,
        'sensor': {'name': os.getenv('SENSOR_NAME', 'ESP32 • Ambiente 01'), 'id': 'ESP32-01', 'timezone': os.getenv('SENSOR_TIMEZONE', 'America/Sao_Paulo')},
        'source': {'type': 'Google Sheets', 'fetched_at': fetched_at, 'last_reading_at': latest.isoformat(), 'age_seconds': age,
                   'status': 'source_error' if source_error else ('stale' if age > stale_after else 'online'),
                   'stale_after_seconds': stale_after, 'rejected_rows': data['rejected_rows'], 'partial_rows': data['partial_rows']},
        'period': period, 'total': len(records), 'total_available': len(data['records']),
        'stats': summarize(records), 'records': records,
    }


@app.get('/')
def index():
    return send_from_directory(app.static_folder, 'index.html')


@app.errorhandler(500)
def internal_error(error):
    # Flask registra a exceção no servidor; a resposta não expõe traceback.
    return jsonify(error='Erro interno ao processar a consulta.'), 500
