from rest_framework import serializers
from .models import SkillRoadmap, RoadmapStep, Skill, EmployeeSkill


class RoadmapStepSerializer(serializers.ModelSerializer):
    class Meta:
        model = RoadmapStep
        fields = [
            "id", "title", "description", "order", "status", "is_completed",
            "completed_at", "phase", "difficulty", "duration", "resource_url",
            "resource_type", "submission_notes", "submission_url", "feedback",
            "reviewed_at",
        ]
        read_only_fields = [
            "id", "is_completed", "completed_at", "feedback", "reviewed_at",
        ]


class SkillRoadmapSerializer(serializers.ModelSerializer):
    steps = RoadmapStepSerializer(many=True, read_only=True)
    employee_name = serializers.SerializerMethodField()

    class Meta:
        model = SkillRoadmap
        fields = [
            "id", "skill_name", "description", "status", "mentors",
            "created_at", "updated_at", "steps", "employee_name", "employee_id",
        ]
        read_only_fields = ["id", "status", "created_at", "updated_at", "employee_name", "employee_id"]

    def get_employee_name(self, obj):
        try:
            return obj.employee.user.name
        except Exception:
            return ""


class SkillRoadmapListSerializer(serializers.ModelSerializer):
    employee_name = serializers.SerializerMethodField()
    step_count = serializers.SerializerMethodField()
    completed_steps = serializers.SerializerMethodField()

    class Meta:
        model = SkillRoadmap
        fields = [
            "id", "skill_name", "status", "created_at", "updated_at",
            "employee_name", "employee_id", "step_count", "completed_steps",
        ]

    def get_employee_name(self, obj):
        try:
            return obj.employee.user.name
        except Exception:
            return ""

    def get_step_count(self, obj):
        return obj.steps.count()

    def get_completed_steps(self, obj):
        return obj.steps.filter(is_completed=True).count()
