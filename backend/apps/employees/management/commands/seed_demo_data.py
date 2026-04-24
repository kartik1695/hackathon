"""
Management command: seed_demo_data

Populates realistic demo data for HRMS-AI dashboard visibility:
  - Skills (dept-appropriate) + EmployeeSkill assignments
  - Leave history (6 months) with varied utilisation patterns
  - Attendance logs (90 days) with realistic present/absent/WFH patterns
  - Attendance penalties for high-risk employees
  - Varied leave balances to create burnout/hoarder signals

Usage:
  python manage.py seed_demo_data
  python manage.py seed_demo_data --clear   # wipe seeded data first
"""

import random
import logging
from datetime import date, timedelta, datetime, time
from django.core.management.base import BaseCommand
from django.db import transaction

logger = logging.getLogger("hrms")

# ── Skill catalogue by dept keyword ──────────────────────────────────────────

DEPT_SKILLS = {
    "Engineering": [
        "Python", "Django", "React", "TypeScript", "PostgreSQL", "Docker",
        "Kubernetes", "AWS", "REST API Design", "System Design", "Git",
        "CI/CD", "Redis", "Celery", "GraphQL", "Microservices",
    ],
    "Data Science": [
        "Python", "Machine Learning", "Deep Learning", "SQL", "Pandas",
        "NumPy", "TensorFlow", "PyTorch", "Data Visualisation", "Statistics",
        "NLP", "Computer Vision", "Spark", "Databricks", "Power BI",
    ],
    "Product": [
        "Product Roadmapping", "User Research", "Figma", "Data Analysis",
        "A/B Testing", "Stakeholder Management", "JIRA", "OKRs",
        "Competitive Analysis", "SQL", "Go-to-Market Strategy",
    ],
    "Human Resources": [
        "Talent Acquisition", "Onboarding", "Performance Management",
        "HRMS Tools", "Employment Law", "Payroll Processing",
        "Learning & Development", "Employee Relations", "HRIS Systems",
    ],
    "Finance & Accounts": [
        "Financial Reporting", "Tally ERP", "MS Excel", "Tax Compliance",
        "Budgeting & Forecasting", "Accounts Payable", "Accounts Receivable",
        "GST", "Audit", "Financial Modelling",
    ],
    "Operation Excellence": [
        "Process Optimisation", "Six Sigma", "Lean Management",
        "Supply Chain Management", "Logistics", "Data Analysis",
        "Project Management", "MS Excel", "ERP Systems", "KPI Dashboards",
    ],
    "4PL": [
        "Supply Chain Management", "Logistics", "Vendor Management",
        "Freight Management", "SAP", "Process Optimisation",
        "Client Management", "Contract Negotiation", "ERP Systems",
    ],
    "Control Tower": [
        "Operations Management", "Data Analysis", "Excel Advanced",
        "Logistics Coordination", "Real-time Monitoring", "Problem Solving",
        "Communication", "ERP Systems",
    ],
    "Administration": [
        "Office Management", "MS Office", "Communication", "Coordination",
        "Vendor Management", "Facility Management", "Documentation",
    ],
    "Delivery & Customer Success": [
        "Client Relationship Management", "Communication", "Problem Solving",
        "Logistics", "SLA Management", "CRM Tools", "Data Analysis",
    ],
    "Sales": [
        "B2B Sales", "CRM", "Negotiation", "Market Research",
        "Lead Generation", "Presentation Skills", "Client Onboarding",
    ],
    "DEFAULT": [
        "Communication", "MS Office", "Problem Solving", "Teamwork",
        "Time Management", "Documentation", "Data Entry",
    ],
}

SKILL_LEVELS = [1, 2, 3, 4, 5]
SKILL_LEVEL_WEIGHTS = [5, 20, 40, 25, 10]  # most people at level 3

LEAVE_TYPES = ["CL", "PL", "SL"]


def _working_days_list(start: date, end: date):
    """Return list of Mon-Fri dates between start and end inclusive."""
    days = []
    cur = start
    while cur <= end:
        if cur.weekday() < 5:
            days.append(cur)
        cur += timedelta(days=1)
    return days


class Command(BaseCommand):
    help = "Seed realistic demo data for HRMS-AI dashboard"

    def add_arguments(self, parser):
        parser.add_argument("--clear", action="store_true", help="Clear seeded data before inserting")

    def handle(self, *args, **options):
        from apps.employees.models import Employee, Department
        from apps.leaves.models import LeaveBalance, LeaveRequest, LeavePolicy
        from apps.attendance.models import AttendanceLog, AttendancePenalty
        from apps.upskilling.models import Skill, EmployeeSkill

        if options["clear"]:
            self.stdout.write("Clearing seeded data...")
            AttendancePenalty.objects.all().delete()
            AttendanceLog.objects.all().delete()
            LeaveRequest.objects.all().delete()
            EmployeeSkill.objects.all().delete()
            Skill.objects.all().delete()
            self.stdout.write("  cleared.")

        from apps.payroll.models import PayrollSlip

        with transaction.atomic():
            self._seed_skills(Employee, Department, Skill, EmployeeSkill)
            self._seed_leave_history(Employee, LeaveBalance, LeaveRequest)
            self._seed_attendance(Employee, AttendanceLog, AttendancePenalty)
            self._seed_payroll(Employee, PayrollSlip)

        self.stdout.write(self.style.SUCCESS("✓ Demo data seeded successfully."))

    # ── Skills ────────────────────────────────────────────────────────────────

    def _seed_skills(self, Employee, Department, Skill, EmployeeSkill):
        self.stdout.write("Seeding skills...")

        # Create all unique skills
        all_skill_names = set()
        for skills in DEPT_SKILLS.values():
            all_skill_names.update(skills)

        skill_objs = {}
        for name in all_skill_names:
            obj, _ = Skill.objects.get_or_create(name=name)
            skill_objs[name] = obj

        self.stdout.write(f"  {len(skill_objs)} skills created.")

        # Assign 3-7 skills per employee based on dept
        employees = list(Employee.objects.filter(is_active=True).select_related("department"))
        created = 0

        for emp in employees:
            if EmployeeSkill.objects.filter(employee=emp).exists():
                continue

            dept_name = emp.department.name if emp.department else ""
            # Find matching dept key
            skill_pool = DEPT_SKILLS["DEFAULT"]
            for key, skills in DEPT_SKILLS.items():
                if key.lower() in dept_name.lower() or dept_name.lower() in key.lower():
                    skill_pool = skills
                    break

            # Managers get +2 extra skills
            count = random.randint(4, 7) if emp.role == "manager" else random.randint(3, 6)
            chosen = random.sample(skill_pool, min(count, len(skill_pool)))

            for skill_name in chosen:
                level = random.choices(SKILL_LEVELS, weights=SKILL_LEVEL_WEIGHTS)[0]
                EmployeeSkill.objects.get_or_create(
                    employee=emp,
                    skill=skill_objs[skill_name],
                    defaults={"level": level},
                )
                created += 1

        self.stdout.write(f"  {created} employee-skill assignments created.")

    # ── Leave History ─────────────────────────────────────────────────────────

    def _seed_leave_history(self, Employee, LeaveBalance, LeaveRequest):
        self.stdout.write("Seeding leave history...")

        employees = list(Employee.objects.filter(is_active=True).select_related("user", "leave_balance"))
        today = date.today()

        # Persona buckets
        # healthy: 3-6 leaves, balanced, approved
        # hoarder (burnout risk): 0-1 leaves used, balance very high
        # overuser (attrition risk): 8-12 leaves, some rejected
        # normal: 2-4 leaves

        created = 0
        for i, emp in enumerate(employees):
            if LeaveRequest.objects.filter(employee=emp).exists():
                continue

            persona = _pick_persona(i, len(employees))
            _create_leave_history(emp, today, persona, LeaveRequest, LeaveBalance)
            created += 1

        self.stdout.write(f"  Leave history created for {created} employees.")

    # ── Attendance ────────────────────────────────────────────────────────────

    def _seed_attendance(self, Employee, AttendanceLog, AttendancePenalty):
        self.stdout.write("Seeding attendance logs (90 days)...")

        employees = list(Employee.objects.filter(is_active=True))
        today = date.today()
        start = today - timedelta(days=90)
        working_days = _working_days_list(start, today - timedelta(days=1))

        created = 0
        penalty_created = 0

        for i, emp in enumerate(employees):
            existing = set(
                AttendanceLog.objects.filter(employee=emp, date__gte=start).values_list("date", flat=True)
            )
            persona = _pick_persona(i, len(employees))

            for day in working_days:
                if day in existing:
                    continue

                status, check_in, check_out = _day_status(day, persona, emp)
                AttendanceLog.objects.create(
                    employee=emp,
                    date=day,
                    status=status,
                    check_in=check_in,
                    check_out=check_out,
                )
                created += 1

                # Add penalty for persistent absences (attrition/burnout signal)
                if status == "ABSENT" and persona in ("overuser", "at_risk") and random.random() < 0.3:
                    try:
                        AttendancePenalty.objects.get_or_create(
                            employee=emp,
                            date=day,
                            defaults={
                                "penalty_type": "LOP",
                                "days_deducted": 1.0,
                                "status": "ACTIVE",
                                "payroll_locked": False,
                            },
                        )
                        penalty_created += 1
                    except Exception:
                        pass

        self.stdout.write(f"  {created} attendance logs created, {penalty_created} penalties.")

    # ── Payroll ───────────────────────────────────────────────────────────────

    def _seed_payroll(self, Employee, PayrollSlip):
        self.stdout.write("Seeding payroll slips (6 months)...")

        # Salary ranges by title keywords (INR annual CTC in lakhs)
        SALARY_BAND = {
            "founder": (80, 150),
            "coo": (60, 100),
            "ceo": (80, 150),
            "vp": (40, 80),
            "head": (30, 60),
            "senior manager": (20, 35),
            "manager": (15, 28),
            "senior": (10, 20),
            "lead": (12, 22),
            "analyst": (5, 12),
            "associate": (4, 9),
            "executive": (3, 7),
            "intern": (1.5, 3),
        }

        today = date.today()
        employees = list(Employee.objects.filter(is_active=True))
        created = 0

        for emp in employees:
            # Determine monthly gross from title
            title = (emp.title or "").lower()
            monthly_gross = None
            for key, (lo, hi) in SALARY_BAND.items():
                if key in title:
                    annual_lakh = random.uniform(lo, hi)
                    monthly_gross = round((annual_lakh * 100000) / 12)
                    break
            if monthly_gross is None:
                monthly_gross = round(random.uniform(4, 15) * 100000 / 12)

            # Add slight variation month-on-month (bonus, deductions)
            for i in range(5, -1, -1):
                total_month = today.month - i
                if total_month <= 0:
                    m_year = today.year - 1
                    m_month = total_month + 12
                else:
                    m_year = today.year
                    m_month = total_month

                # Skip current incomplete month
                if m_year == today.year and m_month == today.month:
                    continue

                variation = random.uniform(0.95, 1.10)
                gross = round(monthly_gross * variation)
                net = round(gross * random.uniform(0.75, 0.82))  # ~20-25% deductions

                _, was_created = PayrollSlip.objects.get_or_create(
                    employee=emp,
                    period_year=m_year,
                    period_month=m_month,
                    defaults={"gross_pay": gross, "net_pay": net},
                )
                if was_created:
                    created += 1

        self.stdout.write(f"  {created} payroll slips created.")


# ── Helpers ───────────────────────────────────────────────────────────────────

def _pick_persona(idx: int, total: int) -> str:
    """Deterministic persona assignment for visual variety in reports."""
    bucket = idx % 10
    if bucket < 5:
        return "healthy"       # 50% — good attendance, normal leaves
    elif bucket < 7:
        return "hoarder"       # 20% — burnout risk (leave hoarding)
    elif bucket < 9:
        return "overuser"      # 20% — attrition risk (high absences)
    else:
        return "at_risk"       # 10% — both signals


PERSONA_ATTENDANCE = {
    # (present_prob, wfh_prob, absent_prob)
    "healthy":   (0.88, 0.08, 0.04),
    "hoarder":   (0.90, 0.06, 0.04),  # high attendance BUT hoards leave
    "overuser":  (0.68, 0.10, 0.22),  # high absence
    "at_risk":   (0.60, 0.05, 0.35),
}


def _day_status(day: date, persona: str, emp):
    """Return (status, check_in dt, check_out dt) for a working day."""
    probs = PERSONA_ATTENDANCE.get(persona, (0.85, 0.08, 0.07))
    roll = random.random()

    if roll < probs[0]:
        status = "PRESENT"
        # Occasional late arrivals
        late = persona in ("overuser", "at_risk") and random.random() < 0.3
        hour_in = random.choice([9, 9, 9, 10, 10, 11]) if late else random.choice([8, 9, 9, 9])
        check_in = datetime.combine(day, time(hour_in, random.randint(0, 59)))
        check_out = datetime.combine(day, time(random.choice([17, 18, 18, 19]), random.randint(0, 59)))
        return status, check_in, check_out

    elif roll < probs[0] + probs[1]:
        status = "WFH"
        check_in = datetime.combine(day, time(9, random.randint(0, 30)))
        check_out = datetime.combine(day, time(18, random.randint(0, 59)))
        return status, check_in, check_out

    else:
        return "ABSENT", None, None


def _create_leave_history(emp, today: date, persona: str, LeaveRequest, LeaveBalance):
    """Create leave requests for past 6 months for one employee."""
    six_months_ago = today - timedelta(days=180)

    # How many leaves based on persona
    if persona == "healthy":
        count = random.randint(3, 6)
        reject_chance = 0.05
    elif persona == "hoarder":
        count = random.randint(0, 1)  # barely takes any — hoarding signal
        reject_chance = 0.0
    elif persona == "overuser":
        count = random.randint(7, 12)
        reject_chance = 0.30
    else:  # at_risk
        count = random.randint(6, 10)
        reject_chance = 0.35

    used_dates = set()

    for _ in range(count):
        leave_type = random.choice(LEAVE_TYPES)

        # Pick a random start in the 6-month window
        offset = random.randint(0, 170)
        start = six_months_ago + timedelta(days=offset)
        # Skip weekends
        while start.weekday() >= 5:
            start += timedelta(days=1)

        # 1-3 days
        days = random.choices([1, 2, 3], weights=[60, 30, 10])[0]
        end = start + timedelta(days=days - 1)
        while end.weekday() >= 5:
            end += timedelta(days=1)

        # Don't overlap
        span = set((start + timedelta(d)).isoformat() for d in range((end - start).days + 1))
        if span & used_dates:
            continue
        used_dates |= span

        # Don't create future leaves
        if start > today:
            continue

        status = "REJECTED" if random.random() < reject_chance else "APPROVED"
        if start > today - timedelta(days=1):
            status = "PENDING"

        # count working days in range
        wdays = len(_working_days_list(start, end))
        if wdays == 0:
            continue

        try:
            LeaveRequest.objects.create(
                employee=emp,
                leave_type=leave_type,
                from_date=start,
                to_date=end,
                days_count=float(wdays),
                reason=_leave_reason(leave_type),
                status=status,
            )
        except Exception as e:
            pass  # overlap constraint — skip

    # Update balance to reflect persona
    _adjust_balance(emp, persona, LeaveBalance)


def _adjust_balance(emp, persona, LeaveBalance):
    """Adjust leave balance to create visible report signals."""
    try:
        lb = LeaveBalance.objects.get(employee=emp)
    except LeaveBalance.DoesNotExist:
        return

    if persona == "hoarder":
        # Very high remaining = not taking leaves = burnout signal
        lb.casual_remaining = random.uniform(10, 12)
        lb.privilege_remaining = random.uniform(16, 18)
        lb.sick_remaining = random.uniform(8, 10)
    elif persona == "overuser":
        # Low remaining = heavy user
        lb.casual_remaining = random.uniform(0, 3)
        lb.privilege_remaining = random.uniform(0, 5)
        lb.sick_remaining = random.uniform(0, 2)
    elif persona == "at_risk":
        lb.casual_remaining = random.uniform(0, 2)
        lb.privilege_remaining = random.uniform(0, 4)
        lb.sick_remaining = random.uniform(0, 1)
    else:
        # healthy — moderate usage
        lb.casual_remaining = random.uniform(4, 9)
        lb.privilege_remaining = random.uniform(7, 14)
        lb.sick_remaining = random.uniform(4, 8)

    lb.save()


LEAVE_REASONS = {
    "CL": [
        "Personal work", "Family function", "Medical appointment",
        "Home maintenance", "Festival", "Child school event",
    ],
    "PL": [
        "Family vacation", "Travel", "Wedding anniversary trip",
        "Planned holiday", "Extended family visit",
    ],
    "SL": [
        "Fever and cold", "Medical procedure", "Doctor's advice for rest",
        "Migraine", "Back pain", "Viral infection",
    ],
}


def _leave_reason(leave_type: str) -> str:
    return random.choice(LEAVE_REASONS.get(leave_type, ["Personal reason"]))
