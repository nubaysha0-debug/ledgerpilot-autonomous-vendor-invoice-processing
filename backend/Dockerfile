# LedgerPilot API image. Build from the repository root:
#   docker build -f backend/Dockerfile -t ledgerpilot-api .
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt

COPY backend /app/backend

EXPOSE 8000

CMD ["sh", "-c", "python -m backend.scripts.migrate && exec uvicorn backend.app.main:app --host 0.0.0.0 --port 8000"]
