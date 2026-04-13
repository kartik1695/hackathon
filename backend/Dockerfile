FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN adduser --disabled-password --gecos "" appuser

COPY requirements/ /app/requirements/
RUN pip install --no-cache-dir -r /app/requirements/base.txt

COPY . /app/

RUN chown -R appuser:appuser /app
USER appuser
