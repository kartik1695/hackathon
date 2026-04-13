from django.contrib import admin

from .models import PayrollSlip


@admin.register(PayrollSlip)
class PayrollSlipAdmin(admin.ModelAdmin):
    list_display = ("employee", "period_year", "period_month", "gross_pay", "net_pay", "created_at")
    list_filter = ("period_year", "period_month")
