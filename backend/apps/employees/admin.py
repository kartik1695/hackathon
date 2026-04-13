from django.contrib import admin

from .models import Department, Employee, User


@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ("email", "name", "phone_number", "is_active", "is_staff", "date_joined")
    search_fields = ("email", "name", "phone_number")
    list_filter = ("is_active", "is_staff", "is_superuser")


@admin.register(Department)
class DepartmentAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "created_at")
    search_fields = ("name", "code")


@admin.register(Employee)
class EmployeeAdmin(admin.ModelAdmin):
    list_display = ("employee_id", "user", "role", "department", "manager", "is_active", "created_at")
    list_filter = ("role", "is_active", "department")
    search_fields = ("employee_id", "user__email", "user__name")
