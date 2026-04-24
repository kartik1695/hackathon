import logging

from django.db import transaction

from .models import Employee
from .repositories import DepartmentReadRepository, EmployeeReadRepository, EmployeeWriteRepository, UserWriteRepository

logger = logging.getLogger("hrms")


class EmployeeService:
    def __init__(
        self,
        read_repo: EmployeeReadRepository | None = None,
        write_repo: EmployeeWriteRepository | None = None,
        user_write_repo: UserWriteRepository | None = None,
        dept_read_repo: DepartmentReadRepository | None = None,
    ):
        self.read_repo = read_repo or EmployeeReadRepository()
        self.write_repo = write_repo or EmployeeWriteRepository()
        self.user_write_repo = user_write_repo or UserWriteRepository()
        self.dept_read_repo = dept_read_repo or DepartmentReadRepository()

    @transaction.atomic
    def create_employee(self, validated_data: dict) -> Employee:
        dept_id = validated_data.pop("department_id", None)
        manager_id = validated_data.pop("manager_id", None)

        user = self.user_write_repo.create(
            password=validated_data.pop("password"),
            email=validated_data.pop("email"),
            name=validated_data.pop("name"),
            phone_number=validated_data.pop("phone_number"),
        )

        department = self.dept_read_repo.get_by_id(dept_id) if dept_id else None
        manager = self.read_repo.get_by_id(manager_id) if manager_id else None

        employee = self.write_repo.create(user=user, department=department, manager=manager, **validated_data)
        logger.info("Employee created employee_id=%s user_id=%s", employee.employee_id, user.id)
        return employee


class ReportInsightsService:
    REPORT_ORG_STATS = "org-stats"
    REPORT_ATTENDANCE_ANOMALIES = "attendance-anomalies"
    REPORT_BURNOUT = "burnout"
    REPORT_ATTRITION = "attrition"
    REPORT_DEPT_HEALTH = "dept-health"
    REPORT_LEAVE_TREND = "leave-trend"
    REPORT_PAYROLL_SUMMARY = "payroll-summary"
    REPORT_AI_INSIGHTS = "ai-insights"
    REPORT_SKILL_SALARY = "skill-salary"

    def __init__(self, as_of_date=None):
        from datetime import date

        self.as_of_date = as_of_date or date.today()

    @staticmethod
    def build_report_key(base: str, params: dict | None = None) -> str:
        if not params:
            return base
        parts = [f"{k}={params[k]}" for k in sorted(params.keys())]
        return f"{base}?{'&'.join(parts)}"

    @staticmethod
    def _working_days(start, end) -> int:
        from datetime import timedelta

        total = 0
        cur = start
        while cur <= end:
            if cur.weekday() < 5:
                total += 1
            cur += timedelta(days=1)
        return total

    def get_snapshot(self, report_key: str):
        from apps.employees.models import ReportSnapshot

        snap = ReportSnapshot.objects.filter(
            report_key=report_key, as_of_date=self.as_of_date
        ).first()
        return snap.payload if snap else None

    def save_snapshot(self, report_key: str, payload, params: dict | None = None):
        from apps.employees.models import ReportSnapshot

        ReportSnapshot.objects.update_or_create(
            report_key=report_key,
            as_of_date=self.as_of_date,
            defaults={"payload": payload, "params": params or {}},
        )

    def compute_org_stats(self) -> dict:
        from django.db.models import Count
        from apps.attendance.models import AttendanceLog, RegularizationRequest
        from apps.leaves.models import LeaveRequest, LeaveBalance
        from apps.employees.models import Employee, Department

        today = self.as_of_date
        month_start = today.replace(day=1)

        active_emps = Employee.objects.filter(is_active=True)
        total = Employee.objects.count()
        active = active_emps.count()
        dept_count = Department.objects.count()

        emp_ids = list(active_emps.values_list("id", flat=True))

        working_days = self._working_days(month_start, today)
        if working_days > 0:
            present_logs = AttendanceLog.objects.filter(
                employee_id__in=emp_ids,
                date__gte=month_start,
                date__lte=today,
                status__in=["PRESENT", "REGULARIZED", "WFH"],
            ).count()
            max_possible = active * working_days
            avg_attendance = (
                round((present_logs / max_possible) * 100) if max_possible else 0
            )
        else:
            avg_attendance = 0

        balances = LeaveBalance.objects.filter(employee_id__in=emp_ids)
        utilisation_scores = []
        for b in balances:
            entitlement = 40
            used = max(
                0,
                entitlement
                - (b.casual_remaining + b.sick_remaining + b.privilege_remaining),
            )
            utilisation_scores.append(round((used / entitlement) * 100))
        avg_leave_util = (
            round(sum(utilisation_scores) / len(utilisation_scores))
            if utilisation_scores
            else 0
        )

        pending_leaves = LeaveRequest.objects.filter(
            employee_id__in=emp_ids, status="PENDING"
        ).count()
        pending_regs = RegularizationRequest.objects.filter(
            employee_id__in=emp_ids, status="PENDING"
        ).count()

        depts = (
            active_emps.values("department__name")
            .annotate(count=Count("id"))
            .order_by("-count")
        )
        dept_breakdown = [
            {"name": d["department__name"] or "Other", "count": d["count"]}
            for d in depts
        ]

        return {
            "total_employees": total,
            "active_employees": active,
            "departments": dept_count,
            "avg_attendance_rate": avg_attendance,
            "avg_leave_utilisation": avg_leave_util,
            "pending_leaves": pending_leaves,
            "pending_regularizations": pending_regs,
            "dept_breakdown": dept_breakdown,
        }

    def compute_attendance_anomalies(self, days: int = 30) -> list[dict]:
        from datetime import timedelta

        from apps.attendance.models import AttendanceLog, AttendancePenalty
        from apps.employees.models import Employee

        since = self.as_of_date - timedelta(days=days)
        active_emps = Employee.objects.filter(is_active=True).select_related(
            "user", "department"
        )

        results = []
        for emp in active_emps:
            logs = AttendanceLog.objects.filter(employee=emp, date__gte=since)
            absent_days = logs.filter(status="ABSENT").count()
            late_logs = logs.filter(status="PRESENT", check_in__hour__gte=10).count()
            penalties = AttendancePenalty.objects.filter(
                employee=emp, date__gte=since, status="ACTIVE"
            ).count()

            working_days = self._working_days(since, self.as_of_date)
            absent_rate = absent_days / max(working_days, 1)
            score = min(
                100,
                round(
                    (absent_rate * 60)
                    + (late_logs / max(working_days, 1) * 30)
                    + (penalties * 5)
                ),
            )

            if score < 10:
                continue

            if absent_rate > 0.3:
                pattern = "Frequent absences (>30% of days)"
            elif late_logs > 5:
                pattern = f"Consistent late check-ins ({late_logs} days)"
            elif penalties > 2:
                pattern = f"Multiple penalties ({penalties} active)"
            else:
                pattern = "Irregular attendance pattern"

            results.append(
                {
                    "employee_id": emp.id,
                    "employee_name": emp.user.name if emp.user else emp.employee_id,
                    "department": emp.department.name if emp.department else "—",
                    "absent_days": absent_days,
                    "late_days": late_logs,
                    "penalty_count": penalties,
                    "anomaly_score": score,
                    "pattern": pattern,
                }
            )

        results.sort(key=lambda x: x["anomaly_score"], reverse=True)
        return results[:20]

    def compute_burnout_risk(self, days: int = 30) -> list[dict]:
        from datetime import timedelta

        from django.core.exceptions import ObjectDoesNotExist
        from apps.attendance.models import AttendanceLog, AttendancePenalty
        from apps.leaves.models import LeaveRequest
        from apps.employees.models import Employee

        since = self.as_of_date - timedelta(days=days)
        working_days = max(1, self._working_days(since, self.as_of_date))

        active_emps = Employee.objects.filter(is_active=True).select_related(
            "user", "department"
        )
        results = []

        for emp in active_emps:
            signals = []
            score = 0

            try:
                balance = emp.leave_balance
                total_remaining = (
                    balance.casual_remaining
                    + balance.sick_remaining
                    + balance.privilege_remaining
                )
                entitlement = 40
                util_pct = (entitlement - total_remaining) / entitlement * 100
                if util_pct < 20:
                    score += 25
                    signals.append("Leave hoarding — less than 20% utilised")
                elif util_pct < 40:
                    score += 12
                    signals.append("Low leave utilisation")
            except ObjectDoesNotExist:
                pass
            except Exception:
                logger.exception(
                    "burnout compute failed to read leave_balance employee_id=%s",
                    emp.id,
                )

            recent_absent = AttendanceLog.objects.filter(
                employee=emp, date__gte=since, status="ABSENT"
            ).count()
            absent_rate = recent_absent / working_days
            if absent_rate > 0.25:
                score += 30
                signals.append(
                    f"High absence rate ({round(absent_rate * 100)}% of days)"
                )
            elif absent_rate > 0.1:
                score += 15
                signals.append(f"Elevated absences ({recent_absent} days)")

            penalties = AttendancePenalty.objects.filter(
                employee=emp, date__gte=since, status="ACTIVE"
            ).count()
            if penalties >= 3:
                score += 20
                signals.append(f"{penalties} active attendance penalties")

            rejected = LeaveRequest.objects.filter(
                employee=emp, status="REJECTED", created_at__date__gte=since
            ).count()
            if rejected >= 2:
                score += 15
                signals.append(f"{rejected} leave requests rejected recently")

            try:
                from apps.attendance.models import WFHRequest

                wfh_rejected = WFHRequest.objects.filter(
                    employee=emp, status="REJECTED", created_at__date__gte=since
                ).count()
                if wfh_rejected >= 2:
                    score += 10
                    signals.append("Multiple WFH requests rejected")
            except ImportError:
                logger.exception(
                    "burnout compute failed to import WFHRequest employee_id=%s", emp.id
                )
            except Exception:
                logger.exception(
                    "burnout compute failed to read WFHRequest employee_id=%s", emp.id
                )

            score = min(100, score)
            if score == 0 and not signals:
                signals = ["No significant burnout signals"]

            if score >= 70:
                risk_level = "critical"
            elif score >= 50:
                risk_level = "high"
            elif score >= 25:
                risk_level = "medium"
            else:
                risk_level = "low"

            results.append(
                {
                    "employee_id": emp.id,
                    "employee_name": emp.user.name if emp.user else emp.employee_id,
                    "department": emp.department.name if emp.department else "—",
                    "burnout_score": score,
                    "risk_level": risk_level,
                    "signals": signals[:4],
                }
            )

        results.sort(key=lambda x: x["burnout_score"], reverse=True)
        return results[:20]

    def compute_attrition_risk(self, days: int = 60) -> list[dict]:
        from datetime import timedelta

        from apps.attendance.models import (
            AttendanceLog,
            AttendancePenalty,
            RegularizationRequest,
        )
        from apps.leaves.models import LeaveRequest
        from apps.employees.models import Employee

        since = self.as_of_date - timedelta(days=days)
        working_days = max(1, self._working_days(since, self.as_of_date))

        active_emps = Employee.objects.filter(is_active=True).select_related(
            "user", "department"
        )
        results = []

        for emp in active_emps:
            factors = []
            score = 0

            tenure_days = (self.as_of_date - emp.created_at.date()).days
            tenure_years = tenure_days / 365
            if tenure_years > 3:
                score += 20
                factors.append(
                    f"Long tenure ({round(tenure_years, 1)}y) — possible stagnation"
                )
            elif tenure_years < 0.5:
                score += 10
                factors.append("New hire — early attrition window")

            recent_absent = AttendanceLog.objects.filter(
                employee=emp, date__gte=since, status="ABSENT"
            ).count()
            if recent_absent / working_days > 0.2:
                score += 25
                factors.append("High absence rate — disengagement signal")

            rejected = LeaveRequest.objects.filter(
                employee=emp, status="REJECTED", created_at__date__gte=since
            ).count()
            if rejected >= 3:
                score += 20
                factors.append(f"{rejected} rejected leave requests — frustration risk")
            elif rejected >= 1:
                score += 8
                factors.append("Leave request rejected recently")

            penalties = AttendancePenalty.objects.filter(
                employee=emp, date__gte=since, status="ACTIVE"
            ).count()
            if penalties >= 3:
                score += 15
                factors.append(f"{penalties} attendance penalties — engagement drop")

            regs = RegularizationRequest.objects.filter(
                employee=emp, created_at__date__gte=since
            ).count()
            if regs >= 3:
                score += 10
                factors.append("Frequent regularization requests")

            score = min(100, score)
            if score >= 55:
                risk_level = "high"
            elif score >= 30:
                risk_level = "medium"
            else:
                risk_level = "low"

            if score < 5:
                continue

            results.append(
                {
                    "employee_id": emp.id,
                    "employee_name": emp.user.name if emp.user else emp.employee_id,
                    "department": emp.department.name if emp.department else "—",
                    "risk_score": score,
                    "risk_level": risk_level,
                    "factors": factors[:4],
                }
            )

        results.sort(key=lambda x: x["risk_score"], reverse=True)
        return results[:20]

    def compute_dept_health(self, days: int = 30) -> list[dict]:
        from datetime import timedelta

        from django.db.models import Count
        from apps.attendance.models import AttendanceLog, AttendancePenalty
        from apps.leaves.models import LeaveBalance
        from apps.employees.models import Department, Employee

        since = self.as_of_date - timedelta(days=days)
        working_days = max(1, self._working_days(since, self.as_of_date))

        depts = Department.objects.annotate(emp_count=Count("employees")).filter(
            emp_count__gt=0
        )
        results = []

        for dept in depts:
            emps = Employee.objects.filter(department=dept, is_active=True)
            emp_ids = list(emps.values_list("id", flat=True))
            if not emp_ids:
                continue

            total = len(emp_ids)
            present = AttendanceLog.objects.filter(
                employee_id__in=emp_ids,
                date__gte=since,
                status__in=["PRESENT", "REGULARIZED", "WFH"],
            ).count()
            attendance_pct = (
                round((present / (total * working_days)) * 100) if total else 0
            )

            penalties = AttendancePenalty.objects.filter(
                employee_id__in=emp_ids,
                date__gte=since,
                status="ACTIVE",
            ).count()
            burnout_pct = min(100, round((penalties / total) * 20)) if total else 0

            balances = LeaveBalance.objects.filter(employee_id__in=emp_ids)
            util_scores = []
            for b in balances:
                used = max(
                    0,
                    40
                    - (b.casual_remaining + b.sick_remaining + b.privilege_remaining),
                )
                util_scores.append(round((used / 40) * 100))
            avg_util = round(sum(util_scores) / len(util_scores)) if util_scores else 0

            health = round(
                (attendance_pct * 0.5)
                + (max(0, 100 - burnout_pct) * 0.3)
                + (avg_util * 0.2)
            )

            results.append(
                {
                    "dept": dept.name,
                    "employee_count": total,
                    "health": health,
                    "attendance": attendance_pct,
                    "burnout": burnout_pct,
                    "leave_utilisation": avg_util,
                }
            )

        results.sort(key=lambda x: x["health"])
        return results

    def compute_leave_trend(self) -> list[dict]:
        from datetime import date

        from apps.leaves.models import LeaveRequest
        from apps.employees.models import Employee

        today = self.as_of_date
        active_count = max(1, Employee.objects.filter(is_active=True).count())
        results = []

        for i in range(5, -1, -1):
            total_month = today.month - i
            if total_month <= 0:
                m_year = today.year - 1
                m_month = total_month + 12
            else:
                m_year = today.year
                m_month = total_month

            approved = LeaveRequest.objects.filter(
                status="APPROVED",
                from_date__year=m_year,
                from_date__month=m_month,
            ).count()

            avg_days = approved / active_count
            used_pct = min(100, round((avg_days / 4) * 100))
            month_name = date(m_year, m_month, 1).strftime("%b")
            results.append({"month": month_name, "used": used_pct})

        return results

    def compute_payroll_summary(self) -> dict:
        from datetime import date

        from django.db.models import Sum, Avg as DAvg
        from apps.payroll.models import PayrollSlip
        from apps.employees.models import Department

        today = self.as_of_date
        trend = []

        for i in range(5, -1, -1):
            total_month = today.month - i
            if total_month <= 0:
                m_year = today.year - 1
                m_month = total_month + 12
            else:
                m_year = today.year
                m_month = total_month

            slips = PayrollSlip.objects.filter(period_year=m_year, period_month=m_month)
            if slips.exists():
                agg = slips.aggregate(
                    total_gross=Sum("gross_pay"), avg_net=DAvg("net_pay")
                )
                total_gross = float(agg["total_gross"] or 0)
                avg_net = round(float(agg["avg_net"] or 0))
            else:
                total_gross = 0
                avg_net = 0

            month_name = date(m_year, m_month, 1).strftime("%b")
            trend.append(
                {
                    "month": month_name,
                    "total_gross_lakh": round(total_gross / 100000, 1),
                    "avg_net": avg_net,
                }
            )

        last_month = today.month - 1 or 12
        last_year = today.year if today.month > 1 else today.year - 1
        dept_data = []
        for dept in Department.objects.all():
            emp_ids = list(dept.employees.values_list("id", flat=True))
            if not emp_ids:
                continue
            slips = PayrollSlip.objects.filter(
                employee_id__in=emp_ids, period_year=last_year, period_month=last_month
            )
            if not slips.exists():
                continue
            avg = slips.aggregate(avg_gross=DAvg("gross_pay"))["avg_gross"] or 0
            dept_data.append(
                {
                    "dept": dept.name,
                    "avg_gross": round(float(avg)),
                    "employee_count": len(emp_ids),
                }
            )

        dept_data.sort(key=lambda x: x["avg_gross"], reverse=True)
        return {"trend": trend, "dept_breakdown": dept_data[:10]}

    def compute_skill_salary(self) -> list[dict]:
        from apps.payroll.models import PayrollSlip
        from apps.upskilling.models import EmployeeSkill
        from django.db.models import Avg as DAvg
        from apps.employees.models import Department, Employee

        today = self.as_of_date
        last_m = today.month - 1 or 12
        last_y = today.year if today.month > 1 else today.year - 1

        dept_avg: dict[int, float] = {}
        for dept in Department.objects.all():
            d_ids = list(
                dept.employees.filter(is_active=True).values_list("id", flat=True)
            )
            if not d_ids:
                continue
            agg = PayrollSlip.objects.filter(
                employee_id__in=d_ids, period_year=last_y, period_month=last_m
            ).aggregate(avg=DAvg("gross_pay"))
            dept_avg[dept.id] = float(agg["avg"] or 0)

        active_emps = Employee.objects.filter(is_active=True).select_related(
            "user", "department"
        )
        results = []

        for emp in active_emps:
            skills_qs = (
                EmployeeSkill.objects.filter(employee=emp)
                .select_related("skill")
                .order_by("-level")
            )
            if not skills_qs.exists():
                continue
            avg_skill = skills_qs.aggregate(avg=DAvg("level"))["avg"] or 0
            avg_skill = round(float(avg_skill), 2)

            slip = PayrollSlip.objects.filter(
                employee=emp, period_year=last_y, period_month=last_m
            ).first()
            if not slip:
                continue
            gross = float(slip.gross_pay)

            dept_id = emp.department_id
            d_avg = dept_avg.get(dept_id, 0)
            if d_avg == 0:
                continue

            ratio = round(avg_skill / max(1, gross / d_avg), 4)
            if avg_skill >= 3.5 and gross < d_avg * 0.85:
                flag = "underpaid"
            elif avg_skill <= 2.0 and gross > d_avg * 1.20:
                flag = "overpaid"
            else:
                flag = "fair"

            top_skills = [es.skill.name for es in skills_qs[:3]]
            results.append(
                {
                    "employee_id": emp.id,
                    "name": emp.user.name if emp.user else emp.employee_id,
                    "department": emp.department.name if emp.department else "—",
                    "title": emp.title or emp.role,
                    "avg_skill_level": avg_skill,
                    "monthly_gross": round(gross),
                    "dept_avg_gross": round(d_avg),
                    "ratio": ratio,
                    "flag": flag,
                    "skills": top_skills,
                }
            )

        results.sort(key=lambda x: x["ratio"], reverse=True)
        return results[:30]

    def compute_ai_insights(self) -> dict:
        import json
        from datetime import timedelta

        from django.core.exceptions import ObjectDoesNotExist
        from django.db.models import Avg as DAvg, Count
        from apps.attendance.models import AttendanceLog, AttendancePenalty
        from apps.leaves.models import LeaveRequest, LeaveBalance
        from apps.payroll.models import PayrollSlip
        from apps.upskilling.models import EmployeeSkill
        from apps.employees.models import Employee, Department

        today = self.as_of_date
        since_30 = today - timedelta(days=30)
        since_90 = today - timedelta(days=90)
        since_60 = today - timedelta(days=60)
        working_days_30 = max(1, self._working_days(since_30, today))

        active_emps = Employee.objects.filter(is_active=True)
        active_count = active_emps.count()
        dept_count = Department.objects.count()
        emp_ids = list(active_emps.values_list("id", flat=True))

        present_logs = AttendanceLog.objects.filter(
            employee_id__in=emp_ids,
            date__gte=since_30,
            status__in=["PRESENT", "REGULARIZED", "WFH"],
        ).count()
        max_possible = active_count * working_days_30
        att_rate = round((present_logs / max_possible) * 100) if max_possible else 0

        critical = high = medium = low_b = 0
        for emp in active_emps.select_related("user", "department"):
            score = 0
            try:
                bal = emp.leave_balance
                total_rem = (
                    bal.casual_remaining + bal.sick_remaining + bal.privilege_remaining
                )
                util_pct = (40 - total_rem) / 40 * 100
                if util_pct < 20:
                    score += 25
                elif util_pct < 40:
                    score += 12
            except ObjectDoesNotExist:
                pass
            except Exception:
                logger.exception(
                    "ai_insights failed to read leave_balance employee_id=%s", emp.id
                )

            absent = AttendanceLog.objects.filter(
                employee=emp, date__gte=since_30, status="ABSENT"
            ).count()
            absent_rate = absent / working_days_30
            if absent_rate > 0.25:
                score += 30
            elif absent_rate > 0.1:
                score += 15

            penalties_emp = AttendancePenalty.objects.filter(
                employee=emp, date__gte=since_30, status="ACTIVE"
            ).count()
            if penalties_emp >= 3:
                score += 20

            rejected_emp = LeaveRequest.objects.filter(
                employee=emp, status="REJECTED", created_at__date__gte=since_30
            ).count()
            if rejected_emp >= 2:
                score += 15

            score = min(100, score)
            if score >= 70:
                critical += 1
            elif score >= 50:
                high += 1
            elif score >= 25:
                medium += 1
            else:
                low_b += 1

        attr_high = attr_medium = 0
        wd60 = max(1, self._working_days(since_60, today))
        for emp in active_emps.select_related("user", "department"):
            score = 0
            tenure_years = (today - emp.created_at.date()).days / 365
            if tenure_years > 3:
                score += 20
            absent = AttendanceLog.objects.filter(
                employee=emp, date__gte=since_60, status="ABSENT"
            ).count()
            if absent / wd60 > 0.2:
                score += 25
            rejected_emp = LeaveRequest.objects.filter(
                employee=emp, status="REJECTED", created_at__date__gte=since_60
            ).count()
            if rejected_emp >= 3:
                score += 20
            elif rejected_emp >= 1:
                score += 8
            score = min(100, score)
            if score >= 55:
                attr_high += 1
            elif score >= 30:
                attr_medium += 1

        penalties_count = AttendancePenalty.objects.filter(
            employee_id__in=emp_ids, status="ACTIVE"
        ).count()

        hoarders = 0
        for b in LeaveBalance.objects.filter(employee_id__in=emp_ids):
            if (b.casual_remaining + b.sick_remaining + b.privilege_remaining) > 35:
                hoarders += 1

        rejected_leaves = LeaveRequest.objects.filter(
            employee_id__in=emp_ids, status="REJECTED", created_at__date__gte=since_90
        ).count()

        today_m = today.month
        today_y = today.year
        last_m = today_m - 1 or 12
        last_y = today_y if today_m > 1 else today_y - 1

        dept_avg = {}
        for dept in Department.objects.all():
            d_emp_ids = list(
                dept.employees.filter(is_active=True).values_list("id", flat=True)
            )
            if not d_emp_ids:
                continue
            agg = PayrollSlip.objects.filter(
                employee_id__in=d_emp_ids, period_year=last_y, period_month=last_m
            ).aggregate(avg=DAvg("gross_pay"))
            dept_avg[dept.id] = float(agg["avg"] or 0)

        underpaid_count = 0
        for emp in active_emps.select_related("department"):
            skills_qs = EmployeeSkill.objects.filter(employee=emp)
            if not skills_qs.exists():
                continue
            avg_skill = skills_qs.aggregate(avg=DAvg("level"))["avg"] or 0
            slip = PayrollSlip.objects.filter(
                employee=emp, period_year=last_y, period_month=last_m
            ).first()
            if not slip:
                continue
            gross = float(slip.gross_pay)
            dept_id = emp.department_id
            d_avg = dept_avg.get(dept_id, 0)
            if avg_skill >= 3.5 and d_avg > 0 and gross < (d_avg * 0.85):
                underpaid_count += 1

        dept_health_scores = []
        for dept in Department.objects.annotate(emp_count=Count("employees")).filter(
            emp_count__gt=0
        ):
            d_emp_ids = list(
                Employee.objects.filter(department=dept, is_active=True).values_list(
                    "id", flat=True
                )
            )
            if not d_emp_ids:
                continue
            present = AttendanceLog.objects.filter(
                employee_id__in=d_emp_ids,
                date__gte=since_30,
                status__in=["PRESENT", "REGULARIZED", "WFH"],
            ).count()
            att_pct = (
                round((present / (len(d_emp_ids) * working_days_30)) * 100)
                if d_emp_ids
                else 0
            )
            dept_penalties = AttendancePenalty.objects.filter(
                employee_id__in=d_emp_ids,
                date__gte=since_30,
                status="ACTIVE",
            ).count()
            burnout_pct = min(100, round((dept_penalties / len(d_emp_ids)) * 20))
            balances = LeaveBalance.objects.filter(employee_id__in=d_emp_ids)
            util_scores = [
                (
                    max(
                        0,
                        40
                        - (
                            b.casual_remaining
                            + b.sick_remaining
                            + b.privilege_remaining
                        ),
                    )
                    / 40
                    * 100
                )
                for b in balances
            ]
            avg_util = round(sum(util_scores) / len(util_scores)) if util_scores else 0
            health = round(
                (att_pct * 0.5) + (max(0, 100 - burnout_pct) * 0.3) + (avg_util * 0.2)
            )
            dept_health_scores.append((dept.name, health))

        dept_health_scores.sort(key=lambda x: x[1])
        worst_depts = ", ".join(f"{n} ({h}/100)" for n, h in dept_health_scores[:3])

        summary_prompt = f"""You are an AI HR analyst. Analyze this workforce data and return ONLY valid JSON.

Org data ({active_count} employees, {dept_count} departments, supply chain company):
- Attendance rate (30d): {att_rate}%
- Burnout risk: {critical} critical, {high} high, {medium} medium
- Attrition risk: {attr_high} high, {attr_medium} medium
- Active attendance penalties: {penalties_count}
- Leave hoarders (burnout signal — not taking any leave): {hoarders}
- Rejected leave requests (90d): {rejected_leaves}
- Underpaid talent (high skills, below dept avg salary): {underpaid_count} employees
- Dept health concerns: {worst_depts}

Return JSON with exactly this structure (no markdown, no explanation, just JSON):
{{
  "org_health_score": <0-100 integer>,
  "org_health_label": "<Healthy|Needs Attention|At Risk|Critical>",
  "insights": [
    {{"icon": "<emoji>", "title": "<short title>", "body": "<2 sentence insight with specific numbers>", "severity": "<info|warning|critical>"}},
    {{"icon": "<emoji>", "title": "<short title>", "body": "<2 sentence insight with specific numbers>", "severity": "<info|warning|critical>"}},
    {{"icon": "<emoji>", "title": "<short title>", "body": "<2 sentence insight with specific numbers>", "severity": "<info|warning|critical>"}},
    {{"icon": "<emoji>", "title": "<short title>", "body": "<2 sentence insight with specific numbers>", "severity": "<info|warning|critical>"}},
    {{"icon": "<emoji>", "title": "<short title>", "body": "<2 sentence insight with specific numbers>", "severity": "<info|warning|critical>"}}
  ],
  "actions": [
    {{"priority": "<High|Medium|Low>", "action": "<specific HR action>", "impact": "<what it prevents/improves>", "timeline": "<this week|this month|next quarter>"}},
    {{"priority": "<High|Medium|Low>", "action": "<specific HR action>", "impact": "<what it prevents/improves>", "timeline": "<this week|this month|next quarter>"}},
    {{"priority": "<High|Medium|Low>", "action": "<specific HR action>", "impact": "<what it prevents/improves>", "timeline": "<this week|this month|next quarter>"}},
    {{"priority": "<High|Medium|Low>", "action": "<specific HR action>", "impact": "<what it prevents/improves>", "timeline": "<this week|this month|next quarter>"}}
  ],
  "skill_salary_alert": "<one sentence about underpaid talent with count and recommendation>"
}}"""

        result = None
        try:
            from core.llm.factory import LLMProviderFactory
            from core.llm.base import LLMMessage

            provider = LLMProviderFactory.get_provider()
            response = provider.complete(
                [
                    LLMMessage(
                        role="system",
                        content="You are an HR analytics AI. Return only valid JSON, no markdown.",
                    ),
                    LLMMessage(role="user", content=summary_prompt),
                ],
                temperature=0.4,
            )
            raw = response.content.strip()
            if raw.startswith("```"):
                raw = raw.split("```")[1]
                if raw.startswith("json"):
                    raw = raw[4:]
            result = json.loads(raw.strip())
        except Exception:
            logger.exception("[ReportInsightsService] AI insights LLM call failed")

        if result:
            return result

        if att_rate < 70:
            att_label, att_sev = "Critical attendance decline detected", "critical"
        elif att_rate < 85:
            att_label, att_sev = "Attendance below target", "warning"
        else:
            att_label, att_sev = "Attendance is healthy", "info"

        health_score = max(
            0,
            min(
                100,
                round(
                    (att_rate * 0.35)
                    + (max(0, 100 - (critical * 10 + high * 5)) * 0.25)
                    + (max(0, 100 - attr_high * 8) * 0.20)
                    + (max(0, 100 - (hoarders / max(active_count, 1) * 100)) * 0.20)
                ),
            ),
        )
        if health_score >= 80:
            label = "Healthy"
        elif health_score >= 65:
            label = "Needs Attention"
        elif health_score >= 45:
            label = "At Risk"
        else:
            label = "Critical"

        return {
            "org_health_score": health_score,
            "org_health_label": label,
            "insights": [
                {
                    "icon": "📊",
                    "title": att_label,
                    "body": (
                        f"Organisation-wide attendance rate is {att_rate}% over the last 30 days. "
                        f"{'Immediate intervention is recommended.' if att_rate < 70 else 'Monitor for further decline.'}"
                    ),
                    "severity": att_sev,
                },
                {
                    "icon": "🔥",
                    "title": "Burnout Signals Detected",
                    "body": f"{critical} employees are at critical burnout risk and {high} are high risk. Recommend immediate 1:1 check-ins for critical cases.",
                    "severity": "critical" if critical > 0 else "warning",
                },
                {
                    "icon": "🚪",
                    "title": "Attrition Pressure",
                    "body": f"{attr_high} employees flagged as high attrition risk. Retention conversations should be scheduled this month.",
                    "severity": "warning" if attr_high > 0 else "info",
                },
                {
                    "icon": "🏖️",
                    "title": "Leave Hoarding Alert",
                    "body": f"{hoarders} employees have used less than 12.5% of annual leave entitlement. This is a leading burnout indicator.",
                    "severity": "warning" if hoarders > 5 else "info",
                },
                {
                    "icon": "💡",
                    "title": "Skill-Salary Misalignment",
                    "body": f"{underpaid_count} high-skill employees are paid below 85% of dept average. Attrition risk if not corrected.",
                    "severity": "warning" if underpaid_count > 0 else "info",
                },
            ],
            "actions": [
                {
                    "priority": "High",
                    "action": f"Schedule 1:1 check-ins for {critical} critical burnout cases",
                    "impact": "Prevent burnout-driven attrition",
                    "timeline": "this week",
                },
                {
                    "priority": "High",
                    "action": f"Review compensation for {underpaid_count} underpaid high-performers",
                    "impact": "Reduce flight risk for top talent",
                    "timeline": "this month",
                },
                {
                    "priority": "Medium",
                    "action": "Implement mandatory leave policy for hoarders",
                    "impact": "Reduce burnout rate by up to 20%",
                    "timeline": "this month",
                },
                {
                    "priority": "Low",
                    "action": "Run dept health review with worst-performing teams",
                    "impact": "Improve overall org health score",
                    "timeline": "next quarter",
                },
            ],
            "skill_salary_alert": f"{underpaid_count} employees with avg skill level ≥3.5 are paid below 85% of dept average — recommend salary correction to prevent attrition.",
        }

    def precompute_all_and_save(self) -> dict:
        computed = {}

        report_key = self.build_report_key(self.REPORT_ORG_STATS)
        computed[report_key] = self.compute_org_stats()
        self.save_snapshot(report_key, computed[report_key], params={})

        report_key = self.build_report_key(
            self.REPORT_ATTENDANCE_ANOMALIES, {"days": 30}
        )
        computed[report_key] = self.compute_attendance_anomalies(days=30)
        self.save_snapshot(report_key, computed[report_key], params={"days": 30})

        report_key = self.build_report_key(self.REPORT_BURNOUT, {"days": 30})
        computed[report_key] = self.compute_burnout_risk(days=30)
        self.save_snapshot(report_key, computed[report_key], params={"days": 30})

        report_key = self.build_report_key(self.REPORT_ATTRITION, {"days": 60})
        computed[report_key] = self.compute_attrition_risk(days=60)
        self.save_snapshot(report_key, computed[report_key], params={"days": 60})

        report_key = self.build_report_key(self.REPORT_DEPT_HEALTH, {"days": 30})
        computed[report_key] = self.compute_dept_health(days=30)
        self.save_snapshot(report_key, computed[report_key], params={"days": 30})

        report_key = self.build_report_key(self.REPORT_LEAVE_TREND)
        computed[report_key] = self.compute_leave_trend()
        self.save_snapshot(report_key, computed[report_key], params={})

        report_key = self.build_report_key(self.REPORT_PAYROLL_SUMMARY)
        computed[report_key] = self.compute_payroll_summary()
        self.save_snapshot(report_key, computed[report_key], params={})

        report_key = self.build_report_key(self.REPORT_AI_INSIGHTS)
        computed[report_key] = self.compute_ai_insights()
        self.save_snapshot(report_key, computed[report_key], params={})

        report_key = self.build_report_key(self.REPORT_SKILL_SALARY)
        computed[report_key] = self.compute_skill_salary()
        self.save_snapshot(report_key, computed[report_key], params={})

        return computed
