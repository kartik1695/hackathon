import os
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.local")
django.setup()

from apps.employees.models import User, Employee, Department

# Check if any employees exist
employees = Employee.objects.all()
if not employees.exists():
    print("No employees found. Creating a test employee...")
    dept, _ = Department.objects.get_or_create(name="Engineering", code="ENG")
    user = User.objects.create_user(
        email="test@example.com",
        password="testpassword",
        name="Test User",
        phone_number="1234567890"
    )
    employee = Employee.objects.create(
        user=user,
        employee_id="EMP001",
        role="employee",
        department=dept,
        title="Software Engineer"
    )
    print(f"Created employee: {employee}")
else:
    for emp in employees:
        print(f"Found employee: {emp.employee_id} - {emp.user.name} ({emp.role})")
