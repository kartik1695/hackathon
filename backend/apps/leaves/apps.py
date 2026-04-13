from django.apps import AppConfig


class LeavesConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.leaves"

    def ready(self):
        try:
            from . import signals  # noqa: F401
        except Exception:
            pass
