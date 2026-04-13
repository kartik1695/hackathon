export DJANGO_DEBUG=True
export DJANGO_SETTINGS_MODULE=config.settings.development
export DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1

export DATABASE_URL=postgresql://hrms:hrms_secret@127.0.0.1:5432/hrms
export REDIS_URL=redis://127.0.0.1:6379/0
export CELERY_RESULT_BACKEND=redis://127.0.0.1:6379/1
export RABBITMQ_URL=amqp://hrms:hrms_secret@127.0.0.1:5672//

export LLM_PROVIDER=ollama
export OLLAMA_BASE_URL=http://localhost:11434
export OLLAMA_MODEL=kimi-k2.5:cloud

export EMBEDDING_PROVIDER=ollama
export OLLAMA_EMBED_MODEL=nomic-embed-text
