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


class EmployeeSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)
    department = DepartmentSerializer(read_only=True)

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
            "manager_id",
        )


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
