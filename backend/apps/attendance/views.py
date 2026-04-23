from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework import status

from core.permissions import IsEmployee, IsHR, IsManager

from .models import AttendanceLog

from .serializers import (
    AttendanceCheckInSerializer,
    AttendanceLogSerializer,
    AttendancePenaltySerializer,
    AttendancePolicyCreateSerializer,
    AttendancePolicySerializer,
    PenaltyActionSerializer,
    RegularizationApplySerializer,
    RegularizationRejectSerializer,
    RegularizationRequestSerializer,
    WFHApplySerializer,
    WFHRejectSerializer,
    WFHRequestSerializer,
)
from .services import (
    AttendancePenaltyService,
    AttendancePolicyService,
    AttendanceService,
    RegularizationService,
    WFHService,
)


def _error(msg, code="BAD_REQUEST", http_status=400):
    return Response({"error": msg, "code": code, "details": {}}, status=http_status)


# ── Existing ──────────────────────────────────────────────────────────────────

class AttendanceCheckInView(APIView):
    permission_classes = [IsEmployee]

    def post(self, request):
        serializer = AttendanceCheckInSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        employee = request.user.employee
        log = AttendanceService(employee).check_in(
            serializer.validated_data["date"],
            serializer.validated_data["status"],
        )
        return Response(AttendanceLogSerializer(log).data)


class AttendanceCheckOutView(APIView):
    permission_classes = [IsEmployee]

    def post(self, request):
        from datetime import date
        employee = request.user.employee
        try:
            log = AttendanceService(employee).check_out(date.today())
        except ValueError as e:
            return Response({"error": str(e), "code": "CHECKOUT_ERROR"}, status=400)
        return Response(AttendanceLogSerializer(log).data)


class AttendanceTodayView(APIView):
    """GET /api/attendance/today/ — current user's today log (null if none)."""
    permission_classes = [IsEmployee]

    def get(self, request):
        from datetime import date
        from .repositories import AttendanceLogReadRepository
        employee = request.user.employee
        log = AttendanceLogReadRepository().get_by_employee_and_date(employee.id, date.today())
        if not log:
            return Response(None)
        return Response(AttendanceLogSerializer(log).data)


class AttendanceWeekView(APIView):
    """GET /api/attendance/week/ — current user's logs for the current ISO week.
    Also marks days that are approved leave.
    Returns list of 7 dicts (Mon–Sun):
      { date, weekday, status, check_in, check_out, hours, is_leave, is_today }
    """
    permission_classes = [IsEmployee]

    def get(self, request):
        from datetime import date, timedelta
        from .repositories import AttendanceLogReadRepository
        from apps.leaves.models import LeaveRequest

        employee = request.user.employee
        today = date.today()

        # ISO week: Monday = 0
        monday = today - timedelta(days=today.weekday())
        week_dates = [monday + timedelta(days=i) for i in range(7)]

        logs = {
            log.date: log
            for log in AttendanceLogReadRepository().list(
                employee_id=employee.id,
                date__gte=monday,
                date__lte=week_dates[-1],
            )
        }

        approved_leave_dates = set(
            d
            for leave in LeaveRequest.objects.filter(
                employee=employee,
                status="APPROVED",
                from_date__lte=week_dates[-1],
                to_date__gte=monday,
            )
            for d in (
                leave.from_date + timedelta(days=x)
                for x in range((leave.to_date - leave.from_date).days + 1)
            )
            if monday <= d <= week_dates[-1]
        )

        result = []
        day_names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
        for i, d in enumerate(week_dates):
            log = logs.get(d)
            hours = None
            if log and log.check_in and log.check_out:
                delta = log.check_out - log.check_in
                hours = round(delta.total_seconds() / 3600, 1)
            elif log and log.check_in and d == today:
                # partial day — time so far
                from datetime import datetime, timezone
                elapsed = (datetime.now(tz=timezone.utc) - log.check_in).total_seconds()
                hours = round(elapsed / 3600, 1)

            result.append({
                "date": d.isoformat(),
                "weekday": day_names[i],
                "weekday_short": day_names[i][0],
                "status": log.status if log else ("ON_LEAVE" if d in approved_leave_dates else None),
                "check_in": log.check_in.isoformat() if log and log.check_in else None,
                "check_out": log.check_out.isoformat() if log and log.check_out else None,
                "hours": hours,
                "is_leave": d in approved_leave_dates,
                "is_today": d == today,
                "is_future": d > today,
            })

        return Response(result)


class OrgInsightsView(APIView):
    """GET /api/attendance/org-insights/
    Returns today's attendance summary across all active employees + dept breakdown.
    """
    permission_classes = [IsEmployee]

    def get(self, request):
        from datetime import date
        from django.db.models import Count
        from apps.employees.models import Employee
        from apps.leaves.models import LeaveRequest

        today = date.today()

        active_emps = Employee.objects.filter(is_active=True).select_related("department")
        total = active_emps.count()
        emp_ids = list(active_emps.values_list("id", flat=True))

        # Today's logs
        logs_today = {
            log.employee_id: log.status
            for log in AttendanceLog.objects.filter(employee_id__in=emp_ids, date=today)
        }

        # Approved leaves today
        on_leave_ids = set(
            LeaveRequest.objects.filter(
                employee_id__in=emp_ids,
                status="APPROVED",
                from_date__lte=today,
                to_date__gte=today,
            ).values_list("employee_id", flat=True)
        )

        present = wfh = on_leave = absent = 0
        for emp_id in emp_ids:
            if emp_id in on_leave_ids:
                on_leave += 1
            else:
                s = logs_today.get(emp_id, "ABSENT")
                if s in ("PRESENT", "REGULARIZED"):
                    present += 1
                elif s in ("WFH", "WFH_PENDING"):
                    wfh += 1
                else:
                    absent += 1

        # Dept breakdown — count employees per department
        dept_counts = (
            active_emps.values("department__name")
            .annotate(count=Count("id"))
            .order_by("-count")[:8]
        )
        by_dept = [
            {"name": row["department__name"] or "Other", "count": row["count"]}
            for row in dept_counts
        ]

        return Response({
            "total": total,
            "by_status": {"present": present, "wfh": wfh, "on_leave": on_leave, "absent": absent},
            "by_dept": by_dept,
        })


# ── Regularization ────────────────────────────────────────────────────────────

class RegularizationListView(APIView):
    permission_classes = [IsEmployee]

    def get(self, request):
        employee = request.user.employee
        from .repositories import RegularizationReadRepository
        repo = RegularizationReadRepository()

        extra = {}
        status_filter = request.query_params.get("status")
        if status_filter:
            extra["status"] = status_filter.upper()

        scope = request.query_params.get("scope")
        if scope == "me":
            items = repo.list(employee_id=employee.id, **extra)
            return Response(RegularizationRequestSerializer(items, many=True).data)

        if employee.role in ("hr", "admin"):
            items = repo.list(**extra)
        elif employee.role in ("manager",):
            items = repo.list(employee__manager_id=employee.id, **extra)
        else:
            items = repo.list(employee_id=employee.id, **extra)

        return Response(RegularizationRequestSerializer(items, many=True).data)

    def post(self, request):
        serializer = RegularizationApplySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        employee = request.user.employee
        svc = RegularizationService(employee)
        try:
            req = svc.apply(
                target_date=serializer.validated_data["date"],
                requested_check_out=serializer.validated_data["requested_check_out"],
                requested_check_in=serializer.validated_data.get("requested_check_in"),
                reason=serializer.validated_data.get("reason", ""),
                applied_by=request.user,
            )
            return Response(RegularizationRequestSerializer(req).data, status=status.HTTP_201_CREATED)
        except (ValueError, PermissionError) as e:
            return _error(str(e))


class RegularizationDetailView(APIView):
    permission_classes = [IsEmployee]

    def _get_req(self, pk):
        from .repositories import RegularizationReadRepository
        return RegularizationReadRepository().get_by_id(pk)

    def get(self, request, pk):
        req = self._get_req(pk)
        if not req:
            return _error("Not found", "NOT_FOUND", 404)
        employee = request.user.employee
        if employee.role not in ("hr", "admin") and req.employee_id != employee.id and req.employee.manager_id != employee.id:
            return _error("Forbidden", "FORBIDDEN", 403)
        return Response(RegularizationRequestSerializer(req).data)

    def delete(self, request, pk):
        req = self._get_req(pk)
        if not req:
            return _error("Not found", "NOT_FOUND", 404)
        employee = request.user.employee
        svc = RegularizationService(employee)
        try:
            req = svc.cancel(req, request.user)
            return Response(RegularizationRequestSerializer(req).data)
        except (ValueError, PermissionError) as e:
            return _error(str(e))


class RegularizationApproveView(APIView):
    permission_classes = [IsManager]

    def post(self, request, pk):
        from .repositories import RegularizationReadRepository
        req = RegularizationReadRepository().get_by_id(pk)
        if not req:
            return _error("Not found", "NOT_FOUND", 404)
        svc = RegularizationService(req.employee)
        try:
            req = svc.approve(req, request.user)
            return Response(RegularizationRequestSerializer(req).data)
        except (ValueError, PermissionError) as e:
            return _error(str(e))


class RegularizationRejectView(APIView):
    permission_classes = [IsManager]

    def post(self, request, pk):
        from .repositories import RegularizationReadRepository
        req = RegularizationReadRepository().get_by_id(pk)
        if not req:
            return _error("Not found", "NOT_FOUND", 404)
        serializer = RegularizationRejectSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        svc = RegularizationService(req.employee)
        try:
            req = svc.reject(req, request.user, serializer.validated_data.get("rejection_reason", ""))
            return Response(RegularizationRequestSerializer(req).data)
        except (ValueError, PermissionError) as e:
            return _error(str(e))


# ── WFH ───────────────────────────────────────────────────────────────────────

class WFHListView(APIView):
    permission_classes = [IsEmployee]

    def get(self, request):
        employee = request.user.employee
        from .repositories import WFHReadRepository
        repo = WFHReadRepository()

        extra = {}
        status_filter = request.query_params.get("status")
        if status_filter:
            extra["status"] = status_filter.upper()

        scope = request.query_params.get("scope")
        if scope == "me":
            items = repo.list(employee_id=employee.id, **extra)
            return Response(WFHRequestSerializer(items, many=True).data)

        if employee.role in ("hr", "admin"):
            items = repo.list(**extra)
        elif employee.role in ("manager",):
            items = repo.list(employee__manager_id=employee.id, **extra)
        else:
            items = repo.list(employee_id=employee.id, **extra)

        return Response(WFHRequestSerializer(items, many=True).data)

    def post(self, request):
        serializer = WFHApplySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        employee = request.user.employee
        svc = WFHService(employee)
        try:
            req = svc.apply(
                dates=serializer.validated_data["dates"],
                reason=serializer.validated_data.get("reason", ""),
                applied_by=request.user,
            )
            return Response(WFHRequestSerializer(req).data, status=status.HTTP_201_CREATED)
        except (ValueError, PermissionError) as e:
            return _error(str(e))


class WFHDetailView(APIView):
    permission_classes = [IsEmployee]

    def _get_req(self, pk):
        from .repositories import WFHReadRepository
        return WFHReadRepository().get_by_id(pk)

    def get(self, request, pk):
        req = self._get_req(pk)
        if not req:
            return _error("Not found", "NOT_FOUND", 404)
        employee = request.user.employee
        if employee.role not in ("hr", "admin") and req.employee_id != employee.id and req.employee.manager_id != employee.id:
            return _error("Forbidden", "FORBIDDEN", 403)
        return Response(WFHRequestSerializer(req).data)

    def delete(self, request, pk):
        req = self._get_req(pk)
        if not req:
            return _error("Not found", "NOT_FOUND", 404)
        employee = request.user.employee
        svc = WFHService(employee)
        try:
            req = svc.cancel(req, request.user)
            return Response(WFHRequestSerializer(req).data)
        except (ValueError, PermissionError) as e:
            return _error(str(e))


class WFHApproveView(APIView):
    permission_classes = [IsManager]

    def post(self, request, pk):
        from .repositories import WFHReadRepository
        req = WFHReadRepository().get_by_id(pk)
        if not req:
            return _error("Not found", "NOT_FOUND", 404)
        svc = WFHService(req.employee)
        try:
            req = svc.approve(req, request.user)
            return Response(WFHRequestSerializer(req).data)
        except (ValueError, PermissionError) as e:
            return _error(str(e))


class WFHRejectView(APIView):
    permission_classes = [IsManager]

    def post(self, request, pk):
        from .repositories import WFHReadRepository
        req = WFHReadRepository().get_by_id(pk)
        if not req:
            return _error("Not found", "NOT_FOUND", 404)
        serializer = WFHRejectSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        svc = WFHService(req.employee)
        try:
            req = svc.reject(req, request.user, serializer.validated_data.get("rejection_reason", ""))
            return Response(WFHRequestSerializer(req).data)
        except (ValueError, PermissionError) as e:
            return _error(str(e))


# ── Penalties ─────────────────────────────────────────────────────────────────

class AttendancePenaltyListView(APIView):
    permission_classes = [IsEmployee]

    def get(self, request):
        employee = request.user.employee
        from .repositories import AttendancePenaltyReadRepository
        repo = AttendancePenaltyReadRepository()

        if employee.role in ("hr", "admin"):
            items = repo.list()
        elif employee.role in ("manager",):
            items = repo.list(employee__manager_id=employee.id)
        else:
            items = repo.list(employee_id=employee.id)

        return Response(AttendancePenaltySerializer(items, many=True).data)


class AttendancePenaltyReverseView(APIView):
    permission_classes = [IsManager]

    def post(self, request, pk):
        from .repositories import AttendancePenaltyReadRepository
        penalty = AttendancePenaltyReadRepository().get_by_id(pk)
        if not penalty:
            return _error("Not found", "NOT_FOUND", 404)
        serializer = PenaltyActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        svc = AttendancePenaltyService()
        try:
            penalty = svc.reverse(penalty, request.user, serializer.validated_data.get("reason", ""))
            return Response(AttendancePenaltySerializer(penalty).data)
        except (ValueError, PermissionError) as e:
            return _error(str(e))


class AttendancePenaltyWaiveView(APIView):
    permission_classes = [IsHR]

    def post(self, request, pk):
        from .repositories import AttendancePenaltyReadRepository
        penalty = AttendancePenaltyReadRepository().get_by_id(pk)
        if not penalty:
            return _error("Not found", "NOT_FOUND", 404)
        serializer = PenaltyActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        svc = AttendancePenaltyService()
        try:
            penalty = svc.waive(penalty, request.user, serializer.validated_data.get("reason", ""))
            return Response(AttendancePenaltySerializer(penalty).data)
        except (ValueError, PermissionError) as e:
            return _error(str(e))


# ── Policy ────────────────────────────────────────────────────────────────────

class AttendancePolicyView(APIView):
    def get_permissions(self):
        if self.request.method == "POST":
            return [IsHR()]
        return [IsEmployee()]

    def get(self, request):
        svc = AttendancePolicyService()
        policy = svc.get_active()
        if not policy:
            return Response(svc.get_active_or_default())
        return Response(AttendancePolicySerializer(policy).data)

    def post(self, request):
        serializer = AttendancePolicyCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        svc = AttendancePolicyService()
        policy = svc.create_version(serializer.validated_data, request.user)
        return Response(AttendancePolicySerializer(policy).data, status=status.HTTP_201_CREATED)


class AttendancePolicyHistoryView(APIView):
    permission_classes = [IsHR]

    def get(self, request):
        from .repositories import AttendancePolicyReadRepository
        items = AttendancePolicyReadRepository().list_all()
        return Response(AttendancePolicySerializer(items, many=True).data)
