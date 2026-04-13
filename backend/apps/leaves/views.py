import logging

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from core.permissions import IsEmployee, IsManager
from core.utils import error_response

from .repositories import LeaveRequestReadRepository
from .serializers import LeaveApplySerializer, LeaveRequestSerializer, LeaveSimulateSerializer
from .services import LeaveService

logger = logging.getLogger("hrms")


class LeaveListCreateView(APIView):
    permission_classes = [IsEmployee]
    serializer_class = LeaveApplySerializer

    def get(self, request):
        try:
            limit = int(request.query_params.get("limit", 50))
            offset = int(request.query_params.get("offset", 0))
        except (TypeError, ValueError):
            return Response(error_response("Invalid limit/offset", "INVALID_INPUT"), status=400)
        limit = max(1, min(100, limit))
        offset = max(0, offset)

        qs = (
            LeaveRequestReadRepository()
            .model.objects.filter(employee_id=request.user.employee.id)
            .select_related("employee", "approver")
            .order_by("-created_at")
        )
        total = qs.count()
        leaves = list(qs[offset : offset + limit])
        return Response(
            {
                "count": total,
                "limit": limit,
                "offset": offset,
                "results": LeaveRequestSerializer(leaves, many=True).data,
            }
        )

    def post(self, request):
        serializer = LeaveApplySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        leave = LeaveService(request.user.employee).apply(serializer.validated_data)
        return Response(LeaveRequestSerializer(leave).data, status=status.HTTP_201_CREATED)


class LeaveApproveView(APIView):
    permission_classes = [IsManager]
    serializer_class = LeaveRequestSerializer

    def post(self, request, leave_id: int):
        leave = LeaveRequestReadRepository().get_by_id(leave_id)
        if not leave:
            return Response(error_response("Leave not found", "LEAVE_NOT_FOUND"), status=404)
        try:
            leave = LeaveService(leave.employee).approve(leave, request.user)
        except PermissionError as exc:
            logger.info("Leave approve denied leave_id=%s user_id=%s", leave_id, request.user.id)
            return Response(error_response(str(exc), "FORBIDDEN"), status=403)
        return Response(LeaveRequestSerializer(leave).data)


class LeaveSimulateView(APIView):
    permission_classes = [IsEmployee]
    serializer_class = LeaveSimulateSerializer

    def post(self, request):
        serializer = LeaveSimulateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = LeaveService(request.user.employee).simulate(
            serializer.validated_data["leave_type"], serializer.validated_data["days"]
        )
        return Response(result)
