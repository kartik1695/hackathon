import logging

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from core.permissions import IsHR
from core.utils import error_response

from .serializers import EmployeeCreateSerializer, EmployeeSerializer
from .services import EmployeeService

logger = logging.getLogger("hrms")


class EmployeeListCreateView(APIView):
    permission_classes = [IsHR]
    serializer_class = EmployeeCreateSerializer

    def get(self, request):
        try:
            limit = int(request.query_params.get("limit", 50))
            offset = int(request.query_params.get("offset", 0))
        except (TypeError, ValueError):
            return Response(error_response("Invalid limit/offset", "INVALID_INPUT"), status=400)
        limit = max(1, min(100, limit))
        offset = max(0, offset)

        qs = EmployeeService().read_repo.model.objects.select_related("user", "department", "manager").order_by("employee_id")
        total = qs.count()
        employees = list(qs[offset : offset + limit])
        return Response(
            {
                "count": total,
                "limit": limit,
                "offset": offset,
                "results": EmployeeSerializer(employees, many=True).data,
            }
        )

    def post(self, request):
        serializer = EmployeeCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        employee = EmployeeService().create_employee(serializer.validated_data.copy())
        return Response(EmployeeSerializer(employee).data, status=status.HTTP_201_CREATED)


class MeView(APIView):
    serializer_class = EmployeeSerializer

    def get(self, request):
        employee = getattr(request.user, "employee", None)
        if not employee:
            return Response(error_response("Employee profile not found", "EMPLOYEE_NOT_FOUND"), status=404)
        return Response(EmployeeSerializer(employee).data)
