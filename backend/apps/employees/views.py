import logging
from datetime import date

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
            # Support both limit/offset and page/page_size styles.
            page = request.query_params.get("page")
            page_size = request.query_params.get("page_size")
            if page is not None or page_size is not None:
                page = int(page or 1)
                limit = int(page_size or 50)
                page = max(1, page)
                offset = (page - 1) * limit
            else:
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
        org_nodes = list(qs.values("id", "manager_id"))
        employees = list(qs[offset : offset + limit])
        return Response(
            {
                "count": total,
                "limit": limit,
                "offset": offset,
                "page": (offset // limit) + 1,
                "page_size": limit,
                "org": org_nodes,
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


class TeamStatusView(APIView):
    """GET /api/employees/team-status/
    Returns today's attendance status for:
      - direct_reports: employees whose manager is me
      - peers: employees sharing the same manager as me
    """
    permission_classes = [IsEmployee]

    def get(self, request):
        from apps.attendance.models import AttendanceLog
        from apps.leaves.models import LeaveRequest

        me = getattr(request.user, "employee", None)
        if not me:
            return Response(error_response("Employee not found", "NOT_FOUND"), status=404)

        today = date.today()

        # direct reports (my team)
        direct_reports = list(
            Employee.objects.filter(manager=me, is_active=True)
            .select_related("user", "department")
        )
        # peers (same manager, excluding self)
        peers = []
        if me.manager_id:
            peers = list(
                Employee.objects.filter(manager_id=me.manager_id, is_active=True)
                .exclude(pk=me.pk)
                .select_related("user", "department")
            )

        all_emps = direct_reports + peers
        emp_ids = [e.id for e in all_emps]

        # today's attendance logs
        logs = {
            log.employee_id: log.status
            for log in AttendanceLog.objects.filter(employee_id__in=emp_ids, date=today)
        }

        # approved leaves today
        on_leave_ids = set(
            LeaveRequest.objects.filter(
                employee_id__in=emp_ids,
                status="APPROVED",
                from_date__lte=today,
                to_date__gte=today,
            ).values_list("employee_id", flat=True)
        )

        def _emp_data(emp):
            log_status = logs.get(emp.id, "PRESENT")
            if emp.id in on_leave_ids:
                today_status = "ON_LEAVE"
            elif log_status in ("WFH", "WFH_PENDING"):
                today_status = "WFH"
            elif log_status == "ABSENT":
                today_status = "ABSENT"
            else:
                today_status = "PRESENT"
            return {
                "id": emp.id,
                "name": emp.user.name if emp.user else emp.employee_id,
                "title": emp.title or emp.role,
                "department": emp.department.name if emp.department else "",
                "status": today_status,
            }

        return Response({
            "direct_reports": [_emp_data(e) for e in direct_reports],
            "peers": [_emp_data(e) for e in peers],
        })
