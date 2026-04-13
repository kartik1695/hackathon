import os

from celery import Celery
from celery.schedules import crontab

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.development")

app = Celery("hrms")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()

app.conf.task_routes = {
    "tasks.leave_tasks.*": {"queue": "leave"},
    "tasks.notification_tasks.*": {"queue": "notifications"},
    "tasks.burnout_tasks.*": {"queue": "analytics"},
    "tasks.review_tasks.*": {"queue": "ai_heavy"},
    "tasks.forecast_tasks.*": {"queue": "analytics"},
}

app.conf.beat_schedule = {
    "burnout-scan-daily": {
        "task": "tasks.burnout_tasks.burnout_scan_all",
        "schedule": crontab(minute=0, hour=2),
    },
    "leave-forecast-daily": {
        "task": "tasks.forecast_tasks.generate_leave_forecast_current_month",
        "schedule": crontab(minute=0, hour=3),
    },
}
