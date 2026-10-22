"""Configuração WSGI para o serviço Linux do Render (sem reload em produção)."""
import os

bind = f"0.0.0.0:{int(os.environ.get('PORT', '10000'))}"
workers = max(1, int(os.environ.get('WEB_CONCURRENCY', '1')))
worker_class = 'gthread'
threads = max(1, int(os.environ.get('GUNICORN_THREADS', '4')))
timeout = 60
graceful_timeout = 30
keepalive = 5
max_requests = 1000
max_requests_jitter = 100
accesslog = '-'
errorlog = '-'
loglevel = 'info'
capture_output = True
# Carrega o app e cria o lock do cache dentro de cada worker.
preload_app = False
reload = False
