from django.contrib import admin

from .models import AttendanceAnomaly, AttendanceLog


@admin.register(AttendanceLog)
class AttendanceLogAdmin(admin.ModelAdmin):
    list_display = ("employee", "date", "status", "check_in", "check_out", "created_at")
    list_filter = ("status", "date")
    search_fields = ("employee__employee_id", "employee__user__username")


@admin.register(AttendanceAnomaly)
class AttendanceAnomalyAdmin(admin.ModelAdmin):
    list_display = ("employee", "date", "anomaly_type", "resolved", "created_at")
    list_filter = ("anomaly_type", "resolved")
    search_fields = ("employee__employee_id",)
