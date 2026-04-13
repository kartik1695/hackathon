export DJANGO_SETTINGS_MODULE=config.settings.local
export DJANGO_DEBUG=True
export DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1,0.0.0.0
export DJANGO_SECRET_KEY=dev-secret-key-change-me

export DATABASE_URL=postgresql://hrms:hrms_secret@127.0.0.1:5432/hrms
export REDIS_URL=redis://127.0.0.1:6379/0
export CELERY_RESULT_BACKEND=redis://127.0.0.1:6379/1
export RABBITMQ_URL=amqp://hrms:hrms_secret@127.0.0.1:5672//

export JWT_ACCESS_TOKEN_LIFETIME_MINUTES=60
export JWT_REFRESH_TOKEN_LIFETIME_DAYS=7

export CORS_ALLOWED_ORIGINS=http://localhost:5173
export CORS_ALLOW_ALL_ORIGINS=True

export INTERNAL_API_TOKEN=change-this-in-production

export SLACK_WEBHOOK_URL=

export EMAIL_HOST=
export EMAIL_PORT=
export EMAIL_HOST_USER=
export EMAIL_HOST_PASSWORD=
export DEFAULT_FROM_EMAIL=

export LLM_PROVIDER=ollama

export OLLAMA_BASE_URL=http://localhost:11434
export OLLAMA_MODEL=kimi-k2.5:cloud

export EMBEDDING_PROVIDER=ollama
export OLLAMA_EMBED_MODEL=nomic-embed-text

export VITE_API_URL=http://localhost:8000
