from django.apps import AppConfig


class AttendanceConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.attendance"

    def ready(self):
        try:
            from . import signals  # noqa: F401
        except Exception:
            pass
