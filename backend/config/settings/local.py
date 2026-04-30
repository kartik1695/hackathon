from .base import *

DEBUG = True
ALLOWED_HOSTS = ["localhost", "127.0.0.1", "0.0.0.0"]

INSTALLED_APPS += ["debug_toolbar"]
MIDDLEWARE = ["debug_toolbar.middleware.DebugToolbarMiddleware"] + MIDDLEWARE
INTERNAL_IPS = ["127.0.0.1"]

CORS_ALLOW_ALL_ORIGINS = True

ALLOW_DIRECTORY_PERSONAL_DETAILS = True

OFFICE_GEOFENCE_ENABLED = True
OFFICE_GEOFENCE_CENTER_LAT = 12.878529
OFFICE_GEOFENCE_CENTER_LON = 78.639131
OFFICE_GEOFENCE_RADIUS_M = 2500

LOGGING = {
    "version": 1,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "loggers": {
        "django.db.backends": {"handlers": ["console"], "level": "WARNING", "propagate": False},
        "hrms": {"handlers": ["console"], "level": "DEBUG"},
    },
}
