import os

from celery import Celery
from celery.schedules import crontab

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.development")

app = Celery("hrms")
app.config_from_object("django.conf:settings", namespace="CELERY")
# tasks/ is a top-level package — not in INSTALLED_APPS, so autodiscover_tasks() won't find it.
# Use conf.imports to force-import every task module so workers register all tasks on startup.
app.conf.imports = (
    "tasks.leave_tasks",
    "tasks.notification_tasks",
    "tasks.burnout_tasks",
    "tasks.review_tasks",
    "tasks.forecast_tasks",
    "tasks.chat_tasks",
    "tasks.rag_policy_tasks",
    "tasks.attendance_tasks",
    "tasks.feedback_tasks",
)
app.autodiscover_tasks()

app.conf.task_routes = {
    "tasks.leave_tasks.*":         {"queue": "leave"},
    "tasks.notification_tasks.*":  {"queue": "notifications"},
    "tasks.burnout_tasks.*":       {"queue": "analytics"},
    "tasks.review_tasks.*":        {"queue": "ai_heavy"},
    "tasks.forecast_tasks.*":      {"queue": "analytics"},
    "tasks.chat_tasks.*":          {"queue": "ai_heavy"},   # entity extraction + session summarisation
    "tasks.rag_policy_tasks.*":    {"queue": "ai_heavy"},   # RAG ingestion
    "tasks.attendance_tasks.*":    {"queue": "leave"},      # attendance shares leave queue
    "tasks.feedback_tasks.*":      {"queue": "ai_heavy"},
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
    # ── Attendance ──────────────────────────────────────────────────────────
    "create-daily-attendance-logs": {
        "task": "tasks.attendance_tasks.create_daily_attendance_logs",
        "schedule": crontab(minute=5, hour=0),  # 00:05 — just after midnight
    },
    "scan-attendance-anomalies": {
        "task": "tasks.attendance_tasks.scan_attendance_anomalies",
        "schedule": crontab(minute=0, hour=1),  # 01:00 — after logs created
    },
    "notify-prepayroll-penalties": {
        "task": "tasks.attendance_tasks.notify_prepayroll_penalties",
        "schedule": crontab(minute=0, hour=9, day_of_month=25),  # 25th at 09:00
    },
}
