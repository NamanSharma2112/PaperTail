# PaperTrail API. Build context: the repository root (see docker-compose.yml).
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app

COPY backend/pyproject.toml ./
COPY backend/papertrail_api ./papertrail_api
# The optional "extra_ca" build secret is only for networks that intercept TLS
# (corporate proxies). Normal builds don't need it.
RUN --mount=type=secret,id=extra_ca,required=false \
    if [ -f /run/secrets/extra_ca ]; then export PIP_CERT=/run/secrets/extra_ca; fi; \
    pip install --no-cache-dir .

# Pilot data and the script that loads it (used by the "seed" service).
COPY backend/scripts ./scripts
COPY pilot /pilot

RUN useradd --create-home --uid 10001 papertrail
USER papertrail

EXPOSE 8000
HEALTHCHECK --interval=5s --timeout=3s --retries=20 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=2)"
CMD ["uvicorn", "papertrail_api.main:app", "--host", "0.0.0.0", "--port", "8000"]
