from django.apps import AppConfig


class EmployeesConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.employees"

    def ready(self):
        try:
            from . import signals  # noqa: F401
        except Exception:
            pass
