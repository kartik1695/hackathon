from django.contrib.auth import get_user_model
from rest_framework import serializers

from .models import Department, Employee

User = get_user_model()


class DepartmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Department
        fields = ("id", "name", "code")


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("id", "name", "phone_number", "email")


class UserPublicSerializer(serializers.ModelSerializer):
    """Name-only — used when requester is a regular employee."""
    class Meta:
        model = User
        fields = ("id", "name")


class ManagerSummarySerializer(serializers.ModelSerializer):
    name = serializers.CharField(source="user.name", read_only=True)
    email = serializers.EmailField(source="user.email", read_only=True)

    class Meta:
        model = Employee
        fields = ("id", "employee_id", "name", "email", "title")


class EmployeeSerializer(serializers.ModelSerializer):
    user = serializers.SerializerMethodField()
    department = DepartmentSerializer(read_only=True)
    manager = ManagerSummarySerializer(read_only=True)

    class Meta:
        model = Employee
        fields = (
            "id",
            "employee_id",
            "role",
            "title",
            "is_active",
            "joined_on",
            "user",
            "department",
            "manager",
        )

    def get_user(self, obj):
        from django.conf import settings
        request = self.context.get("request")
        requester = getattr(request, "user", None) if request else None
        requester_employee = getattr(requester, "employee", None) if requester else None
        requester_role = getattr(requester_employee, "role", "employee") if requester_employee else "employee"
        # HR, managers, admins, CFO see full contact details; employees see name only
        if getattr(settings, "ALLOW_DIRECTORY_PERSONAL_DETAILS", True) or requester_role in ("manager", "hr", "cfo", "admin"):
            return UserSerializer(obj.user).data
        return UserPublicSerializer(obj.user).data


class EmployeeCreateSerializer(serializers.Serializer):
    email = serializers.EmailField()
    name = serializers.CharField(max_length=150)
    phone_number = serializers.CharField(max_length=32)
    password = serializers.CharField(min_length=8, write_only=True)

    employee_id = serializers.CharField(max_length=32)
    role = serializers.ChoiceField(choices=Employee.ROLE_CHOICES, default=Employee.ROLE_EMPLOYEE)
    department_id = serializers.IntegerField(required=False, allow_null=True)
    manager_id = serializers.IntegerField(required=False, allow_null=True)
    title = serializers.CharField(max_length=120, required=False, allow_blank=True)
