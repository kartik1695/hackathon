from rest_framework import serializers

from .models import AttendanceAnomaly, AttendanceLog


class AttendanceLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = AttendanceLog
        fields = ("id", "employee", "date", "check_in", "check_out", "status", "created_at")


class AttendanceCheckInSerializer(serializers.Serializer):
    date = serializers.DateField()
    status = serializers.ChoiceField(choices=AttendanceLog.STATUS_CHOICES, default=AttendanceLog.STATUS_PRESENT)


class AttendanceAnomalySerializer(serializers.ModelSerializer):
    class Meta:
        model = AttendanceAnomaly
        fields = ("id", "employee", "date", "anomaly_type", "description", "resolved", "created_at")
