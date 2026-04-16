import logging

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from core.permissions import IsEmployee, IsHR
from core.utils import error_response

from .models import Employee
from .serializers import EmployeeCreateSerializer, EmployeeSerializer
from .services import EmployeeService

logger = logging.getLogger("hrms")


class EmployeeListCreateView(APIView):
    serializer_class = EmployeeCreateSerializer

    def get_permissions(self):
        # GET is open to any authenticated employee; POST is HR-only
        if self.request.method == "POST":
            return [IsHR()]
        return [IsEmployee()]

    def get(self, request):
        try:
            limit = int(request.query_params.get("limit", 50))
            offset = int(request.query_params.get("offset", 0))
        except (TypeError, ValueError):
            return Response(error_response("Invalid limit/offset", "INVALID_INPUT"), status=400)
        limit = max(1, min(10000, limit))
        offset = max(0, offset)

        qs = Employee.objects.select_related(
            "user", "department", "manager__user"
        ).order_by("employee_id")

        # Optional filters
        dept = request.query_params.get("department")
        role = request.query_params.get("role")
        search = request.query_params.get("search", "").strip()
        if dept:
            qs = qs.filter(department__name__icontains=dept)
        if role:
            qs = qs.filter(role=role)
        if search:
            qs = qs.filter(user__name__icontains=search)

        total = qs.count()
        employees = list(qs[offset : offset + limit])
        return Response(
            {
                "count": total,
                "limit": limit,
                "offset": offset,
                "results": EmployeeSerializer(
                    employees, many=True, context={"request": request}
                ).data,
            }
        )

    def post(self, request):
        serializer = EmployeeCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        employee = EmployeeService().create_employee(serializer.validated_data.copy())
        return Response(EmployeeSerializer(employee).data, status=status.HTTP_201_CREATED)


class EmployeeDetailView(APIView):
    """GET /api/employees/<id>/ — retrieve a single employee by primary key."""

    permission_classes = [IsEmployee]

    def get(self, request, pk):
        try:
            employee = Employee.objects.select_related(
                "user", "department", "manager__user"
            ).get(pk=pk)
        except Employee.DoesNotExist:
            return Response(
                error_response("Employee not found", "NOT_FOUND"), status=404
            )

        return Response(EmployeeSerializer(employee, context={"request": request}).data)


class MeView(APIView):
    """GET /api/employees/me/ — current authenticated user's profile."""
    permission_classes = [IsEmployee]
    serializer_class = EmployeeSerializer

    def get(self, request):
        employee = getattr(request.user, "employee", None)
        if not employee:
            return Response(error_response("Employee profile not found", "EMPLOYEE_NOT_FOUND"), status=404)
        return Response(EmployeeSerializer(employee).data)
