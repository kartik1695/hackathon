from rest_framework.permissions import BasePermission


class CanViewEmployee(BasePermission):
    def has_permission(self, request, view):
        return hasattr(request.user, "employee") and request.user.employee.is_active
