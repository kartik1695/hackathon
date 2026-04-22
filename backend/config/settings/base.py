import os
from datetime import timedelta
from pathlib import Path
from urllib.parse import urlparse

def Csv():
    def _cast(value: str) -> list[str]:
        return [v.strip() for v in value.split(",") if v.strip()]

    return _cast


def config(key: str, default=None, cast=None):
    val = os.environ.get(key)
    if val is None:
        val = default
    if cast is None:
        return val
    return cast(val)

BASE_DIR = Path(__file__).resolve().parent.parent.parent

_SETTINGS_MODULE = os.environ.get("DJANGO_SETTINGS_MODULE", "")
_IS_LOCAL_SETTINGS = _SETTINGS_MODULE.endswith(".local")

_raw_secret_key = config("DJANGO_SECRET_KEY", default="dev-secret-key-change-me" if _IS_LOCAL_SETTINGS else None)
if not _IS_LOCAL_SETTINGS and (not _raw_secret_key or _raw_secret_key == "dev-secret-key-change-me"):
    raise RuntimeError("DJANGO_SECRET_KEY must be set to a strong value in non-local environments.")
SECRET_KEY = _raw_secret_key

DEBUG = config("DJANGO_DEBUG", default=False, cast=bool)

ALLOWED_HOSTS = config("DJANGO_ALLOWED_HOSTS", default="localhost,127.0.0.1", cast=Csv())

AUTH_USER_MODEL = "employees.User"

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "corsheaders",
    "rest_framework",
    "rest_framework_simplejwt",
    "drf_spectacular",
    "django_celery_results",
    "django_celery_beat",
    "channels",
    "apps.employees",
    "apps.attendance",
    "apps.leaves",
    "apps.payroll",
    "apps.performance",
    "apps.notifications",
    "apps.ai",
    "apps.rag",
    "apps.upskilling",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"


def _database_from_url(url: str) -> dict:
    if not url or not isinstance(url, str):
        raise ValueError(
            "DATABASE_URL is required. Example: postgres://hrms:hrms_secret@127.0.0.1:5432/hrms_local"
        )
    parsed = urlparse(url)
    scheme = (parsed.scheme or "").split("+", 1)[0]
    if scheme not in {"postgres", "postgresql"}:
        raise ValueError("Only PostgreSQL DATABASE_URL is supported")

    return {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": parsed.path.lstrip("/"),
        "USER": parsed.username or "",
        "PASSWORD": parsed.password or "",
        "HOST": parsed.hostname or "",
        "PORT": str(parsed.port) if parsed.port else "",
        "CONN_MAX_AGE": 60,
    }


DATABASES = {
    "default": _database_from_url(
        config("DATABASE_URL", default="postgres://hrms:hrms_secret@127.0.0.1:5432/hrms" if _IS_LOCAL_SETTINGS else None)
    )
}

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = os.path.join(BASE_DIR, "staticfiles")
STATICFILES_STORAGE = "whitenoise.storage.CompressedManifestStaticFilesStorage"

MEDIA_URL = "/media/"
MEDIA_ROOT = os.path.join(BASE_DIR, "media")

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"


REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": (
        "rest_framework.permissions.IsAuthenticated",
    ),
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 50,
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": "20/minute",
        "user": "200/minute",
        "auth": "10/minute",
    },
}

SPECTACULAR_SETTINGS = {
    "TITLE": "HRMS-AI API",
    "DESCRIPTION": "HRMS-AI backend API",
    "VERSION": "1.0.0",
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=config("JWT_ACCESS_TOKEN_LIFETIME_MINUTES", default=60, cast=int)),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=config("JWT_REFRESH_TOKEN_LIFETIME_DAYS", default=7, cast=int)),
}

CORS_ALLOWED_ORIGINS = config("CORS_ALLOWED_ORIGINS", default="", cast=Csv(),)
CORS_ALLOW_ALL_ORIGINS = config("CORS_ALLOW_ALL_ORIGINS", default=False, cast=bool)

REDIS_URL = config("REDIS_URL", default="redis://127.0.0.1:6379/0" if _IS_LOCAL_SETTINGS else None)

CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels_redis.core.RedisChannelLayer",
        "CONFIG": {"hosts": [REDIS_URL]},
    }
}

CELERY_BROKER_URL = config(
    "RABBITMQ_URL", default="amqp://hrms:hrms_secret@127.0.0.1:5672//" if _IS_LOCAL_SETTINGS else None
)
CELERY_RESULT_BACKEND = config("CELERY_RESULT_BACKEND", default=REDIS_URL)
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"
CELERY_TIMEZONE = TIME_ZONE
CELERY_RESULT_EXTENDED = True
CELERY_RESULT_BACKEND_ALWAYS_RETRY = True
CELERY_RESULT_EXPIRES = 60 * 60 * 24 * 7  # 7 days

from celery.schedules import crontab  # noqa: E402

CELERY_BEAT_SCHEDULE = {
    # Runs at 00:01 on the 1st of every month — accrues CL/PL/SL for all active employees
    "monthly-leave-accrual": {
        "task": "tasks.leave_tasks.accrue_monthly_leaves",
        "schedule": crontab(minute=1, hour=0, day_of_month=1),
    },
}

# Security headers (safe defaults for all environments)
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"
SECURE_REFERRER_POLICY = "strict-origin-when-cross-origin"

INTERNAL_API_TOKEN = config("INTERNAL_API_TOKEN", default="")

ALLOW_DIRECTORY_PERSONAL_DETAILS = config("ALLOW_DIRECTORY_PERSONAL_DETAILS", default=True, cast=bool)

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "formatters": {
        "simple": {"format": "%(asctime)s %(levelname)s %(name)s %(message)s"},
    },
    "root": {"handlers": ["console"], "level": "INFO"},
    "loggers": {
        "django": {"handlers": ["console"], "level": "INFO", "propagate": False},
        "hrms": {"handlers": ["console"], "level": "INFO", "propagate": False},
    },
}
