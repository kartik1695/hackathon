"""
Report views — computed from existing models, no new DB schema needed.
All manager-only endpoints check role in [manager, hr, cfo, admin].
"""
import logging
from datetime import date, timedelta
from collections import defaultdict

from django.db.models import Count, Q, Avg
from rest_framework.response import Response
from rest_framework.views import APIView

from core.permissions import IsEmployee, IsManager
from .models import Employee, Department

logger = logging.getLogger("hrms")

# ── helpers ───────────────────────────────────────────────────────────────────

MANAGER_ROLES = {"manager", "hr", "cfo", "admin"}


def _require_manager(request):
    emp = getattr(request.user, "employee", None)
    if not emp or emp.role not in MANAGER_ROLES:
        return None, Response({"error": "Manager access required", "code": "FORBIDDEN"}, status=403)
    return emp, None


def _working_days(start: date, end: date) -> int:
    total = 0
    cur = start
    while cur <= end:
        if cur.weekday() < 5:
            total += 1
        cur += timedelta(days=1)
    return total


# ── 1. Org Stats ──────────────────────────────────────────────────────────────

class OrgStatsView(APIView):
    """GET /api/employees/reports/org-stats/"""
    permission_classes = [IsManager]

    def get(self, request):
        from .services import ReportInsightsService

        svc = ReportInsightsService()
        report_key = svc.build_report_key(svc.REPORT_ORG_STATS)
        cached = svc.get_snapshot(report_key)
        if cached is not None:
            logger.info("report cache hit report_key=%s", report_key)
            return Response(cached)

        payload = svc.compute_org_stats()
        svc.save_snapshot(report_key, payload, params={})
        logger.info("report cache miss report_key=%s", report_key)
        return Response(payload)


# ── 2. Attendance Anomalies ───────────────────────────────────────────────────

class AttendanceAnomalyReportView(APIView):
    """GET /api/employees/reports/attendance-anomalies/?days=30"""
    permission_classes = [IsManager]

    def get(self, request):
        from .services import ReportInsightsService

        days = int(request.query_params.get("days", 30))
        svc = ReportInsightsService()
        report_key = svc.build_report_key(svc.REPORT_ATTENDANCE_ANOMALIES, {"days": days})
        cached = svc.get_snapshot(report_key)
        if cached is not None:
            logger.info("report cache hit report_key=%s", report_key)
            return Response(cached)

        payload = svc.compute_attendance_anomalies(days=days)
        svc.save_snapshot(report_key, payload, params={"days": days})
        logger.info("report cache miss report_key=%s", report_key)
        return Response(payload)


# ── 3. Burnout Risk ───────────────────────────────────────────────────────────

class BurnoutRiskReportView(APIView):
    """GET /api/employees/reports/burnout/?days=30"""
    permission_classes = [IsManager]

    def get(self, request):
        from .services import ReportInsightsService

        days = int(request.query_params.get("days", 30))
        svc = ReportInsightsService()
        report_key = svc.build_report_key(svc.REPORT_BURNOUT, {"days": days})
        cached = svc.get_snapshot(report_key)
        if cached is not None:
            logger.info("report cache hit report_key=%s", report_key)
            return Response(cached)

        payload = svc.compute_burnout_risk(days=days)
        svc.save_snapshot(report_key, payload, params={"days": days})
        logger.info("report cache miss report_key=%s", report_key)
        return Response(payload)


# ── 4. Attrition Risk ─────────────────────────────────────────────────────────

class AttritionRiskReportView(APIView):
    """GET /api/employees/reports/attrition/?days=60"""
    permission_classes = [IsManager]

    def get(self, request):
        from .services import ReportInsightsService

        days = int(request.query_params.get("days", 60))
        svc = ReportInsightsService()
        report_key = svc.build_report_key(svc.REPORT_ATTRITION, {"days": days})
        cached = svc.get_snapshot(report_key)
        if cached is not None:
            logger.info("report cache hit report_key=%s", report_key)
            return Response(cached)

        payload = svc.compute_attrition_risk(days=days)
        svc.save_snapshot(report_key, payload, params={"days": days})
        logger.info("report cache miss report_key=%s", report_key)
        return Response(payload)


# ── 5. Individual Employee Report ─────────────────────────────────────────────

class EmployeeReportView(APIView):
    """GET /api/employees/reports/<pk>/"""
    permission_classes = [IsManager]

    def get(self, request, pk):
        from apps.attendance.models import AttendanceLog, AttendancePenalty
        from apps.leaves.models import LeaveRequest, LeaveBalance

        try:
            emp = Employee.objects.select_related("user", "department", "manager__user").get(pk=pk)
        except Employee.DoesNotExist:
            return Response({"error": "Not found", "code": "NOT_FOUND"}, status=404)

        days = 30
        since = date.today() - timedelta(days=days)
        working_days = max(1, _working_days(since, date.today()))

        # Attendance
        logs = AttendanceLog.objects.filter(employee=emp, date__gte=since)
        absent = logs.filter(status="ABSENT").count()
        present = logs.filter(status__in=["PRESENT", "REGULARIZED", "WFH"]).count()
        attendance_rate = round((present / working_days) * 100)

        # Leave utilisation
        leave_util = 0
        try:
            balance = emp.leave_balance
            entitlement = 40
            used = max(0, entitlement - (balance.casual_remaining + balance.sick_remaining + balance.privilege_remaining))
            leave_util = round((used / entitlement) * 100)
        except Exception:
            pass

        # Burnout score
        burnout_score = 0
        burnout_signals = []
        if leave_util < 20:
            burnout_score += 25
            burnout_signals.append("Leave hoarding")
        if absent / working_days > 0.25:
            burnout_score += 30
            burnout_signals.append(f"High absence rate ({absent} days)")
        penalties = AttendancePenalty.objects.filter(
            employee=emp, date__gte=since, status="ACTIVE"
        ).count()
        if penalties >= 3:
            burnout_score += 20
            burnout_signals.append(f"{penalties} penalties")
        burnout_score = min(100, burnout_score)

        if burnout_score >= 70:
            burnout_risk = "critical"
        elif burnout_score >= 50:
            burnout_risk = "high"
        elif burnout_score >= 25:
            burnout_risk = "medium"
        else:
            burnout_risk = "low"

        # Motivation = inverse of absences + leave util
        motivation_score = min(100, max(0, round(
            (attendance_rate * 0.6) + (leave_util * 0.2) + (max(0, 100 - burnout_score) * 0.2)
        )))
        if motivation_score >= 75:
            motivation_label = "Highly Engaged"
        elif motivation_score >= 55:
            motivation_label = "Moderately Engaged"
        elif motivation_score >= 35:
            motivation_label = "Low Engagement"
        else:
            motivation_label = "Disengaged"

        # Attrition risk
        attrition_score = 0
        tenure_years = (date.today() - emp.created_at.date()).days / 365
        if tenure_years > 3:
            attrition_score += 20
        if absent / working_days > 0.2:
            attrition_score += 25
        rejected = LeaveRequest.objects.filter(
            employee=emp, status="REJECTED", created_at__date__gte=since
        ).count()
        if rejected >= 2:
            attrition_score += 20
        attrition_score = min(100, attrition_score)
        attrition_risk = "high" if attrition_score >= 55 else "medium" if attrition_score >= 30 else "low"

        # Performance trend (proxy via attendance trajectory)
        mid = since + timedelta(days=days // 2)
        first_half_absent = logs.filter(status="ABSENT", date__lt=mid).count()
        second_half_absent = logs.filter(status="ABSENT", date__gte=mid).count()
        if second_half_absent > first_half_absent + 1:
            performance_trend = "declining"
        elif second_half_absent < first_half_absent - 1:
            performance_trend = "improving"
        else:
            performance_trend = "stable"

        # Strengths and watch points
        strengths = []
        watch_points = []
        if attendance_rate >= 85:
            strengths.append(f"Consistent attendance ({attendance_rate}%)")
        if leave_util >= 60:
            strengths.append("Healthy leave utilisation")
        if penalties == 0:
            strengths.append("No attendance penalties")
        if motivation_score >= 70:
            strengths.append(f"High engagement score ({motivation_score}%)")

        if leave_util < 30:
            watch_points.append("Leave hoarding — potential burnout signal")
        if absent > 5:
            watch_points.append(f"{absent} absent days this month")
        if rejected >= 2:
            watch_points.append(f"{rejected} leave requests rejected — frustration risk")
        if penalties >= 2:
            watch_points.append(f"{penalties} active attendance penalties")
        if tenure_years > 3:
            watch_points.append(f"Long tenure ({round(tenure_years, 1)}y) without data on growth")

        if not strengths:
            strengths = ["Attendance data available for review"]
        if not watch_points:
            watch_points = ["No significant concerns flagged"]

        # AI summary (rule-based, no LLM call to keep it sync)
        ai_summary = (
            f"{emp.user.name if emp.user else emp.employee_id} shows a {motivation_label.lower()} profile "
            f"with {attendance_rate}% attendance rate over the last {days} days. "
            f"Burnout risk is {burnout_risk} (score: {burnout_score}/100) and attrition risk is {attrition_risk}. "
            f"Leave utilisation stands at {leave_util}% of annual entitlement. "
            f"Performance trend appears {performance_trend} based on attendance trajectory. "
        )
        if burnout_signals:
            ai_summary += f"Key signals: {', '.join(burnout_signals)}. "
        ai_summary += (
            "Recommend a 1:1 check-in to discuss workload balance and growth trajectory."
            if burnout_risk in ("high", "critical") else
            "Employee appears stable — continue regular check-ins."
        )

        # Radar data
        radar = [
            {"metric": "Attendance",    "score": attendance_rate},
            {"metric": "Wellbeing",     "score": max(0, 100 - burnout_score)},
            {"metric": "Motivation",    "score": motivation_score},
            {"metric": "Leave Health",  "score": min(100, leave_util + 30)},
            {"metric": "Stability",     "score": max(0, 100 - attrition_score)},
            {"metric": "Consistency",   "score": max(0, 100 - (absent * 8))},
        ]

        return Response({
            "employee_id": emp.id,
            "name": emp.user.name if emp.user else emp.employee_id,
            "department": emp.department.name if emp.department else "—",
            "role": emp.title or emp.role,
            "attendance_rate": attendance_rate,
            "leave_utilisation": leave_util,
            "burnout_score": burnout_score,
            "burnout_risk": burnout_risk,
            "motivation_score": motivation_score,
            "motivation_label": motivation_label,
            "attrition_risk": attrition_risk,
            "performance_trend": performance_trend,
            "ai_summary": ai_summary,
            "strengths": strengths,
            "watch_points": watch_points,
            "radar": radar,
        })


# ── 6. Dept Health Overview ───────────────────────────────────────────────────

class DeptHealthReportView(APIView):
    """GET /api/employees/reports/dept-health/"""
    permission_classes = [IsManager]

    def get(self, request):
        from .services import ReportInsightsService

        days = int(request.query_params.get("days", 30))
        svc = ReportInsightsService()
        report_key = svc.build_report_key(svc.REPORT_DEPT_HEALTH, {"days": days})
        cached = svc.get_snapshot(report_key)
        if cached is not None:
            logger.info("report cache hit report_key=%s", report_key)
            return Response(cached)

        payload = svc.compute_dept_health(days=days)
        svc.save_snapshot(report_key, payload, params={"days": days})
        logger.info("report cache miss report_key=%s", report_key)
        return Response(payload)


# ── 7. Leave Utilisation Trend ────────────────────────────────────────────────

class LeaveUtilisationTrendView(APIView):
    """GET /api/employees/reports/leave-trend/ — last 6 months monthly avg util"""
    permission_classes = [IsManager]

    def get(self, _request):
        from .services import ReportInsightsService

        svc = ReportInsightsService()
        report_key = svc.build_report_key(svc.REPORT_LEAVE_TREND)
        cached = svc.get_snapshot(report_key)
        if cached is not None:
            logger.info("report cache hit report_key=%s", report_key)
            return Response(cached)

        payload = svc.compute_leave_trend()
        svc.save_snapshot(report_key, payload, params={})
        logger.info("report cache miss report_key=%s", report_key)
        return Response(payload)


# ── 8. Payroll Summary ────────────────────────────────────────────────────────

class PayrollSummaryView(APIView):
    """GET /api/employees/reports/payroll-summary/ — monthly payroll trend + dept breakdown"""
    permission_classes = [IsManager]

    def get(self, _request):
        from .services import ReportInsightsService

        svc = ReportInsightsService()
        report_key = svc.build_report_key(svc.REPORT_PAYROLL_SUMMARY)
        cached = svc.get_snapshot(report_key)
        if cached is not None:
            logger.info("report cache hit report_key=%s", report_key)
            return Response(cached)

        payload = svc.compute_payroll_summary()
        svc.save_snapshot(report_key, payload, params={})
        logger.info("report cache miss report_key=%s", report_key)
        return Response(payload)


# ── 9. AI Insights ────────────────────────────────────────────────────────────

class AIInsightsView(APIView):
    """GET /api/employees/reports/ai-insights/ — LLM-powered org health summary"""
    permission_classes = [IsManager]

    def get(self, request):
        from .services import ReportInsightsService

        svc = ReportInsightsService()
        report_key = svc.build_report_key(svc.REPORT_AI_INSIGHTS)
        cached = svc.get_snapshot(report_key)
        if cached is not None:
            logger.info("report cache hit report_key=%s", report_key)
            return Response(cached)

        payload = svc.compute_ai_insights()
        svc.save_snapshot(report_key, payload, params={})
        logger.info("report cache miss report_key=%s", report_key)
        return Response(payload)


# ── 10. Skill-Salary Analysis ─────────────────────────────────────────────────

class SkillSalaryAnalysisView(APIView):
    """GET /api/employees/reports/skill-salary/ — per-employee skill vs salary alignment"""
    permission_classes = [IsManager]

    def get(self, request):
        from .services import ReportInsightsService

        svc = ReportInsightsService()
        report_key = svc.build_report_key(svc.REPORT_SKILL_SALARY)
        cached = svc.get_snapshot(report_key)
        if cached is not None:
            logger.info("report cache hit report_key=%s", report_key)
            return Response(cached)

        payload = svc.compute_skill_salary()
        svc.save_snapshot(report_key, payload, params={})
        logger.info("report cache miss report_key=%s", report_key)
        return Response(payload)
