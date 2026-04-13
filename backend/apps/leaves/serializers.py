from rest_framework import serializers

from .models import LeaveRequest


class LeaveRequestSerializer(serializers.ModelSerializer):
    class Meta:
        model = LeaveRequest
        fields = (
            "id",
            "employee",
            "approver",
            "leave_type",
            "from_date",
            "to_date",
            "days_count",
            "status",
            "spof_flag",
            "conflict_flag",
            "conflict_context",
            "ai_context_card",
            "created_at",
        )


class LeaveApplySerializer(serializers.Serializer):
    leave_type = serializers.ChoiceField(choices=LeaveRequest._meta.get_field("leave_type").choices)
    from_date = serializers.DateField()
    to_date = serializers.DateField()
    days_count = serializers.FloatField(min_value=0.5)


class LeaveSimulateSerializer(serializers.Serializer):
    leave_type = serializers.ChoiceField(choices=LeaveRequest._meta.get_field("leave_type").choices)
    days = serializers.IntegerField(min_value=1)
