from rest_framework.permissions import BasePermission


class IsEmployee(BasePermission):
    def has_permission(self, request, view):
        return hasattr(request.user, "employee") and request.user.employee.is_active


class IsManager(BasePermission):
    def has_permission(self, request, view):
        return hasattr(request.user, "employee") and request.user.employee.role in ("manager", "hr", "cfo", "admin")


class IsHR(BasePermission):
    def has_permission(self, request, view):
        return hasattr(request.user, "employee") and request.user.employee.role in ("hr", "admin")


class IsCFO(BasePermission):
    def has_permission(self, request, view):
        return hasattr(request.user, "employee") and request.user.employee.role in ("cfo", "hr", "admin")
