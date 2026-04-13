from django.contrib import admin

from .models import Goal, ReviewCycle


@admin.register(Goal)
class GoalAdmin(admin.ModelAdmin):
    list_display = ("employee", "title", "status", "created_at")
    list_filter = ("status",)


@admin.register(ReviewCycle)
class ReviewCycleAdmin(admin.ModelAdmin):
    list_display = ("employee", "period_start", "period_end", "status", "created_at")
    list_filter = ("status",)
