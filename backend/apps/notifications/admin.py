from django.contrib import admin

from .models import InAppNotification


@admin.register(InAppNotification)
class InAppNotificationAdmin(admin.ModelAdmin):
    list_display = ("recipient_email", "subject", "read", "created_at")
    list_filter = ("read",)
    search_fields = ("recipient_email", "subject")
