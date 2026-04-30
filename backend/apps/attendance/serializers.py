from datetime import date, timedelta

from rest_framework import serializers

from .models import (
    AttendanceAnomaly,
    AttendanceLog,
    AttendancePenalty,
    AttendancePolicy,
    RegularizationRequest,
    WFHRequest,
)


class AttendanceLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = AttendanceLog
        fields = (
            "id",
            "employee",
            "date",
            "check_in",
            "check_out",
            "check_in_latitude",
            "check_in_longitude",
            "check_in_accuracy_m",
            "check_in_distance_m",
            "check_in_geofence_ok",
            "check_out_latitude",
            "check_out_longitude",
            "check_out_accuracy_m",
            "check_out_distance_m",
            "check_out_geofence_ok",
            "status",
            "created_at",
        )


class AttendanceCheckInSerializer(serializers.Serializer):
    date = serializers.DateField()
    status = serializers.ChoiceField(choices=AttendanceLog.STATUS_CHOICES, default=AttendanceLog.STATUS_PRESENT)
    latitude = serializers.FloatField(required=False, allow_null=True)
    longitude = serializers.FloatField(required=False, allow_null=True)
    accuracy_m = serializers.IntegerField(required=False, allow_null=True)


class AttendanceCheckOutSerializer(serializers.Serializer):
    latitude = serializers.FloatField(required=False, allow_null=True)
    longitude = serializers.FloatField(required=False, allow_null=True)
    accuracy_m = serializers.IntegerField(required=False, allow_null=True)


class AttendanceAnomalySerializer(serializers.ModelSerializer):
    class Meta:
        model = AttendanceAnomaly
        fields = ("id", "employee", "date", "anomaly_type", "description", "resolved", "created_at")


# ── Regularization ────────────────────────────────────────────────────────────

class RegularizationRequestSerializer(serializers.ModelSerializer):
    employee_name = serializers.SerializerMethodField()
    employee_id_str = serializers.SerializerMethodField()

    class Meta:
        model = RegularizationRequest
        fields = (
            "id", "employee", "employee_name", "employee_id_str",
            "date", "requested_check_in", "requested_check_out",
            "reason", "status", "rejection_reason",
            "attempt_number", "penalty_reversed",
            "applied_by", "reviewed_by",
            "created_at", "updated_at",
        )
        read_only_fields = ("id", "status", "rejection_reason", "attempt_number", "penalty_reversed",
                            "applied_by", "reviewed_by", "created_at", "updated_at")

    def get_employee_name(self, obj):
        return obj.employee.user.name if obj.employee.user else ""

    def get_employee_id_str(self, obj):
        return obj.employee.employee_id


class RegularizationApplySerializer(serializers.Serializer):
    date = serializers.DateField()
    requested_check_out = serializers.TimeField()
    requested_check_in = serializers.TimeField(required=False, allow_null=True)
    reason = serializers.CharField(required=False, allow_blank=True, default="")

    def validate_date(self, value):
        if value > date.today():
            raise serializers.ValidationError("Cannot regularize a future date")
        return value


class RegularizationRejectSerializer(serializers.Serializer):
    rejection_reason = serializers.CharField(required=False, allow_blank=True, default="")


# ── WFH ───────────────────────────────────────────────────────────────────────

class WFHRequestSerializer(serializers.ModelSerializer):
    employee_name = serializers.SerializerMethodField()
    employee_id_str = serializers.SerializerMethodField()
    dates_count = serializers.SerializerMethodField()

    class Meta:
        model = WFHRequest
        fields = (
            "id", "employee", "employee_name", "employee_id_str",
            "dates", "dates_count", "reason", "status", "rejection_reason",
            "applied_by", "reviewed_by",
            "created_at", "updated_at",
        )
        read_only_fields = ("id", "status", "rejection_reason", "applied_by", "reviewed_by",
                            "created_at", "updated_at")

    def get_employee_name(self, obj):
        return obj.employee.user.name if obj.employee.user else ""

    def get_employee_id_str(self, obj):
        return obj.employee.employee_id

    def get_dates_count(self, obj):
        return len(obj.dates or [])


class WFHApplySerializer(serializers.Serializer):
    """Accepts either explicit dates list OR from_date+to_date range (expanded internally)."""
    dates = serializers.ListField(child=serializers.DateField(), required=False, allow_empty=False)
    from_date = serializers.DateField(required=False)
    to_date = serializers.DateField(required=False)
    reason = serializers.CharField(required=False, allow_blank=True, default="")

    def validate(self, data):
        has_dates = bool(data.get("dates"))
        has_range = bool(data.get("from_date")) and bool(data.get("to_date"))

        if not has_dates and not has_range:
            raise serializers.ValidationError("Provide either 'dates' list or 'from_date'+'to_date'")

        if has_range:
            from_date = data["from_date"]
            to_date = data["to_date"]
            if from_date > to_date:
                raise serializers.ValidationError("from_date must be before or equal to to_date")
            # Expand range to working days
            expanded = []
            current = from_date
            while current <= to_date:
                if current.weekday() < 5:
                    expanded.append(current)
                current += timedelta(days=1)
            if not expanded:
                raise serializers.ValidationError("No working days in the given date range")
            data["dates"] = expanded

        # Convert date objects to ISO strings
        data["dates"] = [d.isoformat() if hasattr(d, "isoformat") else str(d) for d in data["dates"]]
        return data


class WFHRejectSerializer(serializers.Serializer):
    rejection_reason = serializers.CharField(required=False, allow_blank=True, default="")


# ── Penalty ───────────────────────────────────────────────────────────────────

class AttendancePenaltySerializer(serializers.ModelSerializer):
    employee_name = serializers.SerializerMethodField()
    employee_id_str = serializers.SerializerMethodField()
    reversed_by_name = serializers.SerializerMethodField()

    class Meta:
        model = AttendancePenalty
        fields = (
            "id", "employee", "employee_name", "employee_id_str",
            "date", "penalty_type", "days_deducted", "status",
            "reversal_reason", "reversed_at", "payroll_locked",
            "reversed_by", "reversed_by_name",
            "regularization_request", "created_at",
        )
        read_only_fields = fields

    def get_employee_name(self, obj):
        return obj.employee.user.name if obj.employee.user else ""

    def get_employee_id_str(self, obj):
        return obj.employee.employee_id

    def get_reversed_by_name(self, obj):
        return obj.reversed_by.get_full_name() if obj.reversed_by else ""


class PenaltyActionSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=True, default="")


# ── Policy ────────────────────────────────────────────────────────────────────

class AttendancePolicySerializer(serializers.ModelSerializer):
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = AttendancePolicy
        fields = (
            "id", "version", "regularization_window_working_days",
            "wfh_min_lead_days", "penalty_order", "is_active",
            "notes", "created_by", "created_by_name", "created_at",
        )
        read_only_fields = ("id", "version", "is_active", "created_by", "created_at")

    def get_created_by_name(self, obj):
        return obj.created_by.get_full_name() if obj.created_by else ""


class AttendancePolicyCreateSerializer(serializers.Serializer):
    regularization_window_working_days = serializers.IntegerField(min_value=1, max_value=30, default=3)
    wfh_min_lead_days = serializers.IntegerField(min_value=0, max_value=30, default=1)
    penalty_order = serializers.ListField(
        child=serializers.ChoiceField(choices=["PL", "LOP"]),
        min_length=1,
        default=["PL", "LOP"],
    )
    notes = serializers.CharField(required=False, allow_blank=True, default="")
