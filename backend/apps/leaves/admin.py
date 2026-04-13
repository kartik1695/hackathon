from django.contrib import admin

from .models import LeaveBalance, LeavePolicy, LeaveRequest


@admin.register(LeavePolicy)
class LeavePolicyAdmin(admin.ModelAdmin):
    list_display = ("leave_type", "annual_allocation", "accrual_per_month", "created_at")


@admin.register(LeaveBalance)
class LeaveBalanceAdmin(admin.ModelAdmin):
    list_display = ("employee", "casual_remaining", "earned_remaining", "sick_remaining", "updated_at")


@admin.register(LeaveRequest)
class LeaveRequestAdmin(admin.ModelAdmin):
    list_display = ("id", "employee", "leave_type", "from_date", "to_date", "days_count", "status", "created_at")
    list_filter = ("status", "leave_type")
