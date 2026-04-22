import logging

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from core.permissions import IsEmployee, IsManager
from core.utils import error_response

from .models import CompOffRequest, LeaveBalance, LeavePolicy, LeaveRequest
from .repositories import (
    CompOffRequestReadRepository,
    LeaveBalanceReadRepository,
    LeaveRequestReadRepository,
)
from .serializers import (
    CompOffRejectSerializer,
    CompOffRequestCreateSerializer,
    CompOffRequestSerializer,
    LeaveApplySerializer,
    LeaveBalanceSerializer,
    LeavePolicySerializer,
    LeaveRejectSerializer,
    LeaveRequestSerializer,
    LeaveSimulateSerializer,
)
from .services import CompOffService, LeaveService

logger = logging.getLogger("hrms")


class LeaveListCreateView(APIView):
    """GET my leaves (paginated). POST apply a new leave."""
    permission_classes = [IsEmployee]

    def get(self, request):
        try:
            limit = int(request.query_params.get("limit", 50))
            offset = int(request.query_params.get("offset", 0))
        except (TypeError, ValueError):
            return Response(error_response("Invalid limit/offset", "INVALID_INPUT"), status=400)
        limit = max(1, min(100, limit))
        offset = max(0, offset)

        qs = (
            LeaveRequestReadRepository().model.objects.filter(employee_id=request.user.employee.id)
            .select_related("employee__user", "approver", "applied_by")
            .order_by("-created_at")
        )

        status_filter = request.query_params.get("status")
        if status_filter:
            qs = qs.filter(status=status_filter.upper())

        total = qs.count()
        leaves = list(qs[offset: offset + limit])
        return Response({
            "count": total,
            "limit": limit,
            "offset": offset,
            "results": LeaveRequestSerializer(leaves, many=True).data,
        })

    def post(self, request):
        serializer = LeaveApplySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            leave = LeaveService(request.user.employee).apply(
                serializer.validated_data, applied_by=request.user
            )
        except (ValueError, PermissionError) as exc:
            return Response(error_response(str(exc), "LEAVE_APPLY_FAILED"), status=400)
        return Response(LeaveRequestSerializer(leave).data, status=status.HTTP_201_CREATED)


class LeaveDetailView(APIView):
    """GET a single leave request."""
    permission_classes = [IsEmployee]

    def get(self, request, leave_id: int):
        leave = LeaveRequestReadRepository().get_by_id(leave_id)
        if not leave:
            return Response(error_response("Leave not found", "LEAVE_NOT_FOUND"), status=404)
        emp = getattr(request.user, "employee", None)
        if not emp:
            return Response(error_response("No employee profile", "NO_EMPLOYEE"), status=403)
        # Employee can see own leave; manager can see team's leave
        is_own = leave.employee_id == emp.id
        is_manager = leave.employee.manager_id == emp.id
        is_hr = emp.role in ("hr", "admin")
        if not (is_own or is_manager or is_hr):
            return Response(error_response("Forbidden", "FORBIDDEN"), status=403)
        return Response(LeaveRequestSerializer(leave).data)


class LeaveApproveView(APIView):
    """POST manager approves a leave."""
    permission_classes = [IsManager]

    def post(self, request, leave_id: int):
        leave = LeaveRequestReadRepository().get_by_id(leave_id)
        if not leave:
            return Response(error_response("Leave not found", "LEAVE_NOT_FOUND"), status=404)
        try:
            leave = LeaveService(leave.employee).approve(leave, request.user)
        except (PermissionError, ValueError) as exc:
            return Response(error_response(str(exc), "APPROVE_FAILED"), status=403)
        return Response(LeaveRequestSerializer(leave).data)


class LeaveRejectView(APIView):
    """POST manager rejects a leave with an optional reason."""
    permission_classes = [IsManager]

    def post(self, request, leave_id: int):
        serializer = LeaveRejectSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        leave = LeaveRequestReadRepository().get_by_id(leave_id)
        if not leave:
            return Response(error_response("Leave not found", "LEAVE_NOT_FOUND"), status=404)
        try:
            leave = LeaveService(leave.employee).reject(
                leave, request.user, serializer.validated_data.get("rejection_reason", "")
            )
        except (PermissionError, ValueError) as exc:
            return Response(error_response(str(exc), "REJECT_FAILED"), status=403)
        return Response(LeaveRequestSerializer(leave).data)


class LeaveCancelView(APIView):
    """POST employee cancels own pending leave, or manager cancels team member's leave."""
    permission_classes = [IsEmployee]

    def post(self, request, leave_id: int):
        leave = LeaveRequestReadRepository().get_by_id(leave_id)
        if not leave:
            return Response(error_response("Leave not found", "LEAVE_NOT_FOUND"), status=404)
        try:
            leave = LeaveService(leave.employee).cancel(leave, request.user)
        except (PermissionError, ValueError) as exc:
            return Response(error_response(str(exc), "CANCEL_FAILED"), status=400)
        return Response(LeaveRequestSerializer(leave).data)


class LeaveRenotifyView(APIView):
    """POST employee re-notifies manager about their pending leave."""
    permission_classes = [IsEmployee]

    def post(self, request, leave_id: int):
        leave = LeaveRequestReadRepository().get_by_id(leave_id)
        if not leave:
            return Response(error_response("Leave not found", "LEAVE_NOT_FOUND"), status=404)
        try:
            sent = LeaveService(leave.employee).renotify_manager(leave, request.user)
        except (PermissionError, ValueError) as exc:
            return Response(error_response(str(exc), "RENOTIFY_FAILED"), status=400)
        return Response({"sent": sent})


class LeavePendingApprovalsView(APIView):
    """GET manager sees all pending leaves from their direct reports."""
    permission_classes = [IsManager]

    def get(self, request):
        emp = getattr(request.user, "employee", None)
        if not emp:
            return Response(error_response("No employee profile", "NO_EMPLOYEE"), status=403)
        leaves = LeaveRequestReadRepository().get_pending_for_manager(emp.id)
        return Response({
            "count": len(leaves),
            "results": LeaveRequestSerializer(leaves, many=True).data,
        })


class LeaveApplyOnBehalfView(APIView):
    """POST manager applies a leave on behalf of a direct report."""
    permission_classes = [IsManager]

    def post(self, request, employee_id: int):
        from apps.employees.models import Employee

        manager_emp = getattr(request.user, "employee", None)
        if not manager_emp:
            return Response(error_response("No employee profile", "NO_EMPLOYEE"), status=403)

        target = Employee.objects.select_related("user", "manager", "department").filter(pk=employee_id).first()
        if not target:
            return Response(error_response("Employee not found", "EMPLOYEE_NOT_FOUND"), status=404)

        # Only direct manager or HR/admin can apply on behalf
        if target.manager_id != manager_emp.id and manager_emp.role not in ("hr", "admin"):
            return Response(error_response("You can only apply leave for your direct reports", "FORBIDDEN"), status=403)

        serializer = LeaveApplySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            leave = LeaveService(target).apply(serializer.validated_data, applied_by=request.user)
        except (ValueError, PermissionError) as exc:
            return Response(error_response(str(exc), "LEAVE_APPLY_FAILED"), status=400)
        return Response(LeaveRequestSerializer(leave).data, status=status.HTTP_201_CREATED)


class LeaveTeamCalendarView(APIView):
    """GET manager sees approved team leaves in a date range."""
    permission_classes = [IsManager]

    def get(self, request):
        emp = getattr(request.user, "employee", None)
        if not emp:
            return Response(error_response("No employee profile", "NO_EMPLOYEE"), status=403)

        from_date = request.query_params.get("from_date")
        to_date = request.query_params.get("to_date")
        if not from_date or not to_date:
            return Response(error_response("from_date and to_date required", "INVALID_INPUT"), status=400)

        leaves = LeaveRequestReadRepository().get_team_calendar(emp.id, from_date, to_date)
        return Response({"count": len(leaves), "results": LeaveRequestSerializer(leaves, many=True).data})


class LeaveTeamAllView(APIView):
    """GET manager sees all team leaves (optionally filtered by status)."""
    permission_classes = [IsManager]

    def get(self, request):
        emp = getattr(request.user, "employee", None)
        if not emp:
            return Response(error_response("No employee profile", "NO_EMPLOYEE"), status=403)
        status_filter = request.query_params.get("status")
        leaves = LeaveRequestReadRepository().get_team_leaves(emp.id, status_filter)
        return Response({"count": len(leaves), "results": LeaveRequestSerializer(leaves, many=True).data})


class LeaveBalanceView(APIView):
    """GET my leave balance."""
    permission_classes = [IsEmployee]

    def get(self, request):
        balance = LeaveBalanceReadRepository().get_by_employee_id(request.user.employee.id)
        if not balance:
            return Response(error_response("Leave balance not initialized", "NO_BALANCE"), status=404)
        return Response(LeaveBalanceSerializer(balance).data)


class LeaveTypesView(APIView):
    """GET all leave types with policy details."""
    permission_classes = [IsEmployee]

    def get(self, request):
        policies = LeavePolicy.objects.all()
        return Response(LeavePolicySerializer(policies, many=True).data)


class LeaveSimulateView(APIView):
    """POST simulate what balance looks like if a leave is taken."""
    permission_classes = [IsEmployee]

    def post(self, request):
        serializer = LeaveSimulateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            result = LeaveService(request.user.employee).simulate(
                serializer.validated_data["leave_type"], serializer.validated_data["days"]
            )
        except ValueError as exc:
            return Response(error_response(str(exc), "SIMULATE_FAILED"), status=400)
        return Response(result)


# ── Comp Off views ────────────────────────────────────────────────────────────

class CompOffListCreateView(APIView):
    """GET my comp off requests. POST request new comp off."""
    permission_classes = [IsEmployee]

    def get(self, request):
        emp = getattr(request.user, "employee", None)
        reqs = CompOffRequestReadRepository().list(employee_id=emp.id) if emp else []
        return Response({"count": len(reqs), "results": CompOffRequestSerializer(reqs, many=True).data})

    def post(self, request):
        serializer = CompOffRequestCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            req = CompOffService(request.user.employee).request(
                worked_on=serializer.validated_data["worked_on"],
                days_claimed=serializer.validated_data["days_claimed"],
                reason=serializer.validated_data.get("reason", ""),
            )
        except ValueError as exc:
            return Response(error_response(str(exc), "COMP_OFF_REQUEST_FAILED"), status=400)
        return Response(CompOffRequestSerializer(req).data, status=status.HTTP_201_CREATED)


class CompOffPendingView(APIView):
    """GET manager sees all pending comp off requests from their team."""
    permission_classes = [IsManager]

    def get(self, request):
        emp = getattr(request.user, "employee", None)
        if not emp:
            return Response(error_response("No employee profile", "NO_EMPLOYEE"), status=403)
        reqs = CompOffRequestReadRepository().get_pending_for_manager(emp.id)
        return Response({"count": len(reqs), "results": CompOffRequestSerializer(reqs, many=True).data})


class CompOffApproveView(APIView):
    """POST manager approves comp off — credits CO balance."""
    permission_classes = [IsManager]

    def post(self, request, comp_off_id: int):
        req = CompOffRequestReadRepository().get_by_id(comp_off_id)
        if not req:
            return Response(error_response("Comp off request not found", "NOT_FOUND"), status=404)
        try:
            req = CompOffService(req.employee).approve(req, request.user)
        except (PermissionError, ValueError) as exc:
            return Response(error_response(str(exc), "COMP_OFF_APPROVE_FAILED"), status=403)
        return Response(CompOffRequestSerializer(req).data)


class CompOffRejectView(APIView):
    """POST manager rejects comp off."""
    permission_classes = [IsManager]

    def post(self, request, comp_off_id: int):
        serializer = CompOffRejectSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        req = CompOffRequestReadRepository().get_by_id(comp_off_id)
        if not req:
            return Response(error_response("Comp off request not found", "NOT_FOUND"), status=404)
        try:
            req = CompOffService(req.employee).reject(
                req, request.user, serializer.validated_data.get("rejection_reason", "")
            )
        except (PermissionError, ValueError) as exc:
            return Response(error_response(str(exc), "COMP_OFF_REJECT_FAILED"), status=403)
        return Response(CompOffRequestSerializer(req).data)
