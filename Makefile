# ── Docker (full stack) ─────────────────────────────────────────────────────
build:
	docker-compose build

up:
	docker-compose up -d

down:
	docker-compose down

logs:
	docker-compose logs -f web

celery-logs:
	docker-compose logs -f celery_worker_default celery_worker_ai

beat-logs:
	docker-compose logs -f celery_beat

migrate-docker:
	docker-compose exec web python manage.py migrate

shell-docker:
	docker-compose exec web python manage.py shell

seed-docker:
	docker-compose exec web python manage.py seed_demo_data

ingest-docker:
	docker-compose exec web python manage.py ingest_rag_docs

test-docker:
	docker-compose exec web pytest

# ── Local dev (only infra in Docker, Django native) ─────────────────────────
infra-up:
	docker-compose -f docker-compose.local.yml up -d

infra-down:
	docker-compose -f docker-compose.local.yml down

install:
	cd backend && pip install -r requirements/development.txt

migrate:
	cd backend && DJANGO_SETTINGS_MODULE=config.settings.local python manage.py migrate

run:
	cd backend && DJANGO_SETTINGS_MODULE=config.settings.local python manage.py runserver 0.0.0.0:8000

worker:
	cd backend && DJANGO_SETTINGS_MODULE=config.settings.local celery -A config worker -Q leave,notifications,ai_heavy,analytics -c 4 --loglevel=info

beat:
	cd backend && DJANGO_SETTINGS_MODULE=config.settings.local celery -A config beat --loglevel=info

shell:
	cd backend && DJANGO_SETTINGS_MODULE=config.settings.local python manage.py shell

test:
	cd backend && DJANGO_SETTINGS_MODULE=config.settings.local pytest

seed:
	cd backend && DJANGO_SETTINGS_MODULE=config.settings.local python manage.py seed_demo_data

ingest:
	cd backend && DJANGO_SETTINGS_MODULE=config.settings.local python manage.py ingest_rag_docs

# ── Shared ───────────────────────────────────────────────────────────────────
clean:
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null; true
	find . -name "*.pyc" -delete 2>/dev/null; true

pgvector:
	cd backend && DJANGO_SETTINGS_MODULE=config.settings.local python manage.py create_pgvector_extension

.PHONY: build up down logs migrate run worker beat shell test seed ingest clean \
        infra-up infra-down install pgvector celery-logs beat-logs
