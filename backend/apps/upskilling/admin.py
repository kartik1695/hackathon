from django.contrib import admin
from .models import Skill, EmployeeSkill, SkillRoadmap, RoadmapStep


class RoadmapStepInline(admin.TabularInline):
    model = RoadmapStep
    extra = 0


@admin.register(Skill)
class SkillAdmin(admin.ModelAdmin):
    list_display = ("name", "created_at")
    search_fields = ("name",)


@admin.register(EmployeeSkill)
class EmployeeSkillAdmin(admin.ModelAdmin):
    list_display = ("employee", "skill", "level", "acquired_at")
    list_filter = ("skill", "level")
    search_fields = ("employee__user__name", "skill__name")


@admin.register(SkillRoadmap)
class SkillRoadmapAdmin(admin.ModelAdmin):
    list_display = ("skill_name", "employee", "status", "created_at", "updated_at")
    list_filter = ("status", "created_at")
    search_fields = ("skill_name", "employee__user__name")
    inlines = [RoadmapStepInline]


@admin.register(RoadmapStep)
class RoadmapStepAdmin(admin.ModelAdmin):
    list_display = ("title", "roadmap", "order", "status", "is_completed")
    list_filter = ("status", "is_completed")
    search_fields = ("title", "roadmap__skill_name")
