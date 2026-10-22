"""Leitura e normalização da fonte CSV original, sem dependência de pandas."""
import csv
import io
import logging
import math
import os
import threading
import time
import unicodedata
from datetime import datetime, timezone
from urllib.parse import urlparse
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

DEFAULT_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQsdThO_5fB7mVU4BZWuFmxA9TvnJzYfr04RhD1064FMTrbdr2IKuTXePPTfIEwPkRDOV_k09C2r3gk/pub?gid=120810159&single=true&output=csv"
MAX_BYTES = 8 * 1024 * 1024
MAX_ROWS = 50000
logger = logging.getLogger(__name__)


class SourceError(Exception):
    pass


def normalize(value):
    return ''.join(c for c in unicodedata.normalize('NFKD', value.strip().lower()) if not unicodedata.combining(c))


def number(value, minimum, maximum):
    try:
        result = float(str(value).strip().replace(',', '.'))
        return result if math.isfinite(result) and minimum <= result <= maximum else None
    except (ValueError, TypeError):
        return None


def timestamp(value, zone):
    value = value.strip()
    try:
        parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    except ValueError:
        parsed = None
        for fmt in ('%d/%m/%Y %H:%M:%S', '%d/%m/%Y %H:%M', '%d/%m/%Y'):
            try:
                parsed = datetime.strptime(value, fmt)
                break
            except ValueError:
                continue
        if parsed is None:
            return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=zone)
    return parsed.astimezone(timezone.utc).isoformat()


def parse_csv(content, zone_name='America/Sao_Paulo'):
    zone = ZoneInfo(zone_name)
    # Google Sheets pode exportar CRCRLF; splitlines evita linhas artificiais.
    content = '\n'.join(content.lstrip('\ufeff').splitlines())
    try:
        dialect = csv.Sniffer().sniff(content[:8192], delimiters=',;\t')
    except csv.Error:
        dialect = csv.excel
    reader = csv.DictReader(io.StringIO(content), dialect=dialect)
    fields = {normalize(c): c for c in (reader.fieldnames or [])}
    temp = fields.get('temperatura') or fields.get('temperature')
    hum = fields.get('umidade') or fields.get('humidity')
    stamp = next((fields[k] for k in ('carimbo de data/hora', 'timestamp', 'data/hora', 'datetime') if k in fields), None)
    date = fields.get('data') or fields.get('date')
    hour = fields.get('hora') or fields.get('time')
    if not temp or not hum or not (stamp or date):
        raise SourceError('CSV sem as colunas de temperatura, umidade e data/hora esperadas.')
    records, rejected, partial = [], 0, 0
    for index, row in enumerate(reader):
        if index >= MAX_ROWS:
            raise SourceError('A fonte excedeu o limite de 50.000 linhas. Arquive os dados antigos na planilha.')
        raw_time = row.get(stamp, '') if stamp else f"{row.get(date, '')} {row.get(hour, '') if hour else ''}".strip()
        at = timestamp(raw_time or '', zone)
        temperature = number(row.get(temp), -100, 150)
        humidity = number(row.get(hum), 0, 100)
        if at is None or (temperature is None and humidity is None):
            rejected += 1
            continue
        if temperature is None or humidity is None:
            partial += 1
        records.append({'timestamp': at, 'temperature': temperature, 'humidity': humidity})
    records.sort(key=lambda r: r['timestamp'])
    if not records:
        raise SourceError('A planilha ainda não contém leituras válidas.')
    return {'records': records, 'rejected_rows': rejected, 'partial_rows': partial}


def fetch_source():
    url = os.getenv('SENSOR_CSV_URL', DEFAULT_URL)
    if urlparse(url).scheme != 'https':
        raise SourceError('Configure SENSOR_CSV_URL com uma URL HTTPS.')
    request = Request(url, headers={'User-Agent': 'IoT/1.0.0', 'Accept': 'text/csv'})
    with urlopen(request, timeout=12) as response:
        raw = response.read(MAX_BYTES + 1)
    if len(raw) > MAX_BYTES:
        raise SourceError('O CSV excede o limite de 8 MB.')
    return parse_csv(raw.decode('utf-8-sig'), os.getenv('SENSOR_TIMEZONE', 'America/Sao_Paulo'))


class SensorStore:
    """Cache público limitado por processo, com atualização serializada entre threads.

    Os consumidores devem tratar os snapshots retornados como somente leitura.
    Cada atualização substitui o snapshot, sem acumular histórico em memória.
    """
    def __init__(self):
        self.lock = threading.Lock()
        self.data = None
        self.checked = 0
        self.fetched_at = None
        self.failed = False
        self.last_error = None

    def get(self):
        with self.lock:
            if time.monotonic() - self.checked < 8:
                if self.data is not None:
                    return self.data, self.fetched_at, self.failed
                if self.failed:
                    raise SourceError(self.last_error)
            try:
                data = fetch_source()
            except Exception as exc:
                self.checked = time.monotonic()
                self.failed = True
                self.last_error = str(exc) if isinstance(exc, SourceError) else 'Não foi possível consultar a planilha. Verifique a publicação e tente novamente.'
                # Não registra URL, conteúdo do CSV ou mensagens de rede potencialmente sensíveis.
                logger.warning('Falha na consulta da fonte do sensor (%s)', type(exc).__name__)
                if self.data is None:
                    raise SourceError(self.last_error) from exc
            else:
                self.data = data
                self.fetched_at = datetime.now(timezone.utc).isoformat()
                self.failed = False
                self.last_error = None
                self.checked = time.monotonic()
            return self.data, self.fetched_at, self.failed


def summarize(records):
    result = {}
    for metric in ('temperature', 'humidity'):
        values = [r[metric] for r in records if r[metric] is not None]
        result[metric] = {
            'current': records[-1][metric] if records else None,
            'min': min(values) if values else None,
            'max': max(values) if values else None,
            'mean': round(sum(values) / len(values), 2) if values else None,
        }
    return result
