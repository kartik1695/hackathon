"""
Management command: import_keka_employees

Fetches employees from the Keka HR API and populates:
  - Department
  - User  (email, name, phone)
  - Employee (employee_id, title, department, role, joined_on)

Then makes a second pass using the Keka team-lookup API to wire up
manager → reportee relationships.

Usage:
  python manage.py import_keka_employees --token <bearer_token>

  # dry-run (no DB writes):
  python manage.py import_keka_employees --token <token> --dry-run

  # skip the hierarchy pass (faster):
  python manage.py import_keka_employees --token <token> --skip-hierarchy
"""

import time
import logging
import re
import urllib.request
import urllib.error
import json as _json

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

logger = logging.getLogger("hrms")

KEKA_BASE           = "https://3scsolution.keka.com/k/default/api"
DIRECTORY_URL       = f"{KEKA_BASE}/publicprofile/employeedirectory"
TEAM_URL_TPL        = f"{KEKA_BASE}/employee/lookup/team/{{keka_id}}"
PROFILE_HEADER_TPL  = f"{KEKA_BASE}/employee/{{keka_id}}/profile/profileheader"
DEFAULT_PASSWORD    = "Hrms@3sc2025!"   # employees must change on first login


def _keka_post(url: str, token: str, payload: dict) -> dict:
    body = _json.dumps(payload).encode()
    req = urllib.request.Request(
        url,
        data=body,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json; charset=UTF-8",
            "Accept": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return _json.loads(resp.read())


def _keka_get(url: str, token: str) -> dict:
    req = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return _json.loads(resp.read())


def _fetch_all_employees(token: str, stdout) -> list[dict]:
    """Page through the directory endpoint and return all employee records."""
    employees = []
    page = 1
    page_size = 500

    while True:
        payload = {
            "pagingOptions": {"pageIndex": page, "pageSize": page_size},
            "sortingOptions": {"orderBy": "displayName", "direction": "asc"},
            "filterOptions": {
                "filters": {
                    "2778": {
                        "value": [], "type": 2,
                        "isGlobalFilter": True, "isAllSelected": True,
                        "isUnAssignedSelected": False, "excludeFromAPI": False,
                    }
                },
                "searchKey": "",
            },
            "searchableOptions": [],
        }
        resp = _keka_post(DIRECTORY_URL, token, payload)
        if not resp.get("succeeded"):
            raise CommandError(f"Keka directory API failed: {resp.get('message')} {resp.get('errors')}")

        items = resp["data"]["items"]
        employees.extend(items)
        stdout.write(f"  Fetched page {page}: {len(items)} employees (total so far: {len(employees)})")

        if page >= resp["data"]["totalPages"]:
            break
        page += 1
        time.sleep(0.2)   # be gentle with the API

    return employees


def _fetch_profile_header(keka_id: int, token: str) -> dict | None:
    """Fetch profile header for a single employee; returns None on any error."""
    try:
        resp = _keka_get(PROFILE_HEADER_TPL.format(keka_id=keka_id), token)
        if resp.get("succeeded") is False:
            return None
        return resp.get("data") or None
    except Exception:
        return None


def _slug(name: str) -> str:
    """Turn 'Engineering' → 'ENG', 'Business Development' → 'BD' etc."""
    words = re.sub(r"[^a-zA-Z0-9 ]", "", name).split()
    if len(words) >= 2:
        return "".join(w[0].upper() for w in words)[:8]
    return name[:8].upper()



def _safe_phone(phone: str | None, fallback: str) -> str:
    """Return a non-empty, unique-enough phone string."""
    p = (phone or "").strip()
    if p and len(p) >= 5:
        return p[:32]
    return fallback[:32]


class Command(BaseCommand):
    help = "Import employees from Keka HR and populate Department / User / Employee tables."

    def add_arguments(self, parser):
        parser.add_argument("--token", required=True, help="Keka Bearer token")
        parser.add_argument("--dry-run", action="store_true", help="Print what would be done without writing to DB")
        parser.add_argument("--skip-hierarchy", action="store_true", help="Skip the manager hierarchy pass")
        parser.add_argument("--password", default=DEFAULT_PASSWORD, help="Default password for created users")

    def handle(self, *args, **options):
        token        = options["token"]
        dry_run      = options["dry_run"]
        skip_hier    = options["skip_hierarchy"]
        password     = options["password"]

        self.stdout.write(self.style.MIGRATE_HEADING("=== Keka Employee Import ==="))
        if dry_run:
            self.stdout.write(self.style.WARNING("DRY RUN — no database changes will be made.\n"))

        # ── PHASE 1: fetch all employees ───────────────────────────────────
        self.stdout.write("Fetching employees from Keka directory…")
        try:
            raw_employees = _fetch_all_employees(token, self.stdout)
        except urllib.error.HTTPError as exc:
            raise CommandError(f"HTTP {exc.code} fetching directory: {exc.reason}")
        self.stdout.write(self.style.SUCCESS(f"Fetched {len(raw_employees)} employees from Keka.\n"))

        # ── PHASE 2: upsert departments + users + employees ────────────────
        stats = {"departments": 0, "users_created": 0, "users_updated": 0,
                 "employees_created": 0, "employees_updated": 0, "skipped": 0}

        # keka_id (int) → Employee pk — used in hierarchy pass
        keka_id_to_employee: dict[int, int] = {}
        # employee_number → Employee pk
        emp_num_to_pk: dict[str, int] = {}

        from apps.employees.models import Department, Employee, User
        from apps.leaves.models import LeaveBalance, LeavePolicy

        if not dry_run:
            self._upsert_records(
                raw_employees, password,
                Department, User, Employee, LeaveBalance, LeavePolicy,
                stats, keka_id_to_employee, emp_num_to_pk,
            )
        else:
            self.stdout.write(f"Would upsert {len(raw_employees)} employee records.")

        self.stdout.write(self.style.SUCCESS(
            f"Phase 2 done: departments={stats['departments']}  "
            f"users_created={stats['users_created']}  users_updated={stats['users_updated']}  "
            f"employees_created={stats['employees_created']}  employees_updated={stats['employees_updated']}  "
            f"skipped={stats['skipped']}\n"
        ))

        # ── PHASE 3: hierarchy (manager → reportee) ────────────────────────
        if skip_hier:
            self.stdout.write("Skipping hierarchy pass (--skip-hierarchy).")
        elif not dry_run:
            self._build_hierarchy(token, keka_id_to_employee, Employee)
        else:
            self.stdout.write("DRY RUN: skipping hierarchy pass.")

        self.stdout.write(self.style.SUCCESS("\n=== Import complete ==="))

    # -----------------------------------------------------------------------

    def _upsert_records(
        self, raw_employees, password,
        Department, User, Employee, LeaveBalance, LeavePolicy,
        stats, keka_id_to_employee, emp_num_to_pk,
    ):
        # Pre-load existing employees by employee_number for dedup
        existing_by_empnum = {e.employee_id: e for e in Employee.objects.select_related("user").all()}

        # Collect unique departments first
        dept_map: dict[int, Department] = {}   # keka departmentId → Department

        # Phase 2a: departments
        dept_name_set: dict[str, Department] = {d.name: d for d in Department.objects.all()}
        for rec in raw_employees:
            dept_name = (rec.get("department") or "").strip()
            dept_id   = rec.get("departmentId")
            if not dept_name or not dept_id:
                continue
            if dept_id in dept_map:
                continue
            if dept_name in dept_name_set:
                dept_map[dept_id] = dept_name_set[dept_name]
            else:
                code = _slug(dept_name)
                # Ensure code uniqueness
                base_code = code
                suffix = 1
                existing_codes = set(Department.objects.values_list("code", flat=True))
                while code in existing_codes:
                    code = f"{base_code}{suffix}"
                    suffix += 1
                dept = Department.objects.create(name=dept_name, code=code)
                dept_map[dept_id] = dept
                dept_name_set[dept_name] = dept
                stats["departments"] += 1
                self.stdout.write(f"  Created dept: {dept_name} ({code})")

        # Phase 2b: users + employees
        for rec in raw_employees:
            keka_id    = rec.get("id")
            emp_num    = (rec.get("employeeNumber") or "").strip()
            email      = (rec.get("email") or "").strip().lower()
            name       = (rec.get("displayName") or "").strip()
            phone      = rec.get("workPhone") or rec.get("mobilePhone") or ""
            title      = (rec.get("jobtitle") or "").strip()
            dept_id    = rec.get("departmentId")

            if not emp_num or not email or not name:
                self.stdout.write(self.style.WARNING(f"  Skipping incomplete record: {rec}"))
                stats["skipped"] += 1
                continue

            dept = dept_map.get(dept_id)
            role = "employee"   # hierarchy pass will promote to "manager" where applicable

            try:
                with transaction.atomic():
                    # User
                    phone_val = _safe_phone(phone, f"keka_{emp_num}")
                    user, user_created = User.objects.get_or_create(
                        email=email,
                        defaults={"name": name, "phone_number": phone_val},
                    )
                    if user_created:
                        user.set_password(password)
                        user.save(update_fields=["password"])
                        stats["users_created"] += 1
                    else:
                        changed = False
                        if user.name != name:
                            user.name = name
                            changed = True
                        new_phone = _safe_phone(phone, f"keka_{emp_num}")
                        if user.phone_number != new_phone and new_phone != f"keka_{emp_num}":
                            # Only update if we have a real phone number
                            try:
                                user.phone_number = new_phone
                                user.save(update_fields=["phone_number", "name"] if changed else ["phone_number"])
                                changed = False
                            except Exception:
                                pass
                        if changed:
                            user.save(update_fields=["name"])
                        stats["users_updated"] += 1

                    # Employee
                    if emp_num in existing_by_empnum:
                        emp = existing_by_empnum[emp_num]
                        emp.title      = title
                        emp.role       = role
                        emp.department = dept
                        emp.is_active  = True
                        emp.save(update_fields=["title", "role", "department", "is_active", "updated_at"])
                        stats["employees_updated"] += 1
                    else:
                        emp = Employee.objects.create(
                            user=user,
                            employee_id=emp_num,
                            title=title,
                            role=role,
                            department=dept,
                            is_active=True,
                        )
                        stats["employees_created"] += 1

                    keka_id_to_employee[keka_id] = emp.pk
                    emp_num_to_pk[emp_num] = emp.pk

            except Exception as exc:
                self.stdout.write(self.style.ERROR(f"  Error processing {emp_num} ({email}): {exc}"))
                stats["skipped"] += 1
                continue

            # Leave balance — outside the atomic block so a missing table never rolls back the employee
            _ensure_leave_balance(emp, LeaveBalance, LeavePolicy)

    def _build_hierarchy(self, token, keka_id_to_employee, Employee):
        """Fetch each employee's profile header to get their direct reportingTo manager,
        then wire up manager FK and promote managers to role="manager".

        This approach works regardless of job title — any employee can have reportees.
        """
        self.stdout.write("Building manager hierarchy via profile headers…")

        all_keka_ids = list(keka_id_to_employee.keys())
        total = len(all_keka_ids)
        self.stdout.write(f"  Fetching profile headers for {total} employees…")

        # keka_id → reporting_to (keka_id of their manager)
        reporting_map: dict[int, int] = {}

        for i, keka_id in enumerate(all_keka_ids):
            profile = _fetch_profile_header(keka_id, token)
            if profile:
                reporting_to = profile.get("reportingTo")
                if reporting_to:
                    reporting_map[keka_id] = reporting_to

            if (i + 1) % 50 == 0:
                self.stdout.write(f"  Fetched {i+1}/{total} profiles…")
            time.sleep(0.1)

        self.stdout.write(f"  {len(reporting_map)} employees have a reporting manager.")

        # Wire up manager FK: for each employee, find their manager's Employee pk
        wired = 0
        manager_pks: set[int] = set()
        for keka_id, mgr_keka_id in reporting_map.items():
            emp_pk = keka_id_to_employee.get(keka_id)
            mgr_pk = keka_id_to_employee.get(mgr_keka_id)
            if not emp_pk or not mgr_pk:
                continue
            try:
                Employee.objects.filter(pk=emp_pk).update(manager_id=mgr_pk)
                manager_pks.add(mgr_pk)
                wired += 1
            except Exception as exc:
                logger.debug("Hierarchy wire failed emp_pk=%s mgr_pk=%s: %s", emp_pk, mgr_pk, exc)

        # Promote all employees who have at least one reportee to role="manager"
        if manager_pks:
            promoted = Employee.objects.filter(pk__in=manager_pks).update(role="manager")
            self.stdout.write(f"  Promoted {promoted} employees to role=manager.")

        self.stdout.write(self.style.SUCCESS(f"Hierarchy pass done: {wired} reportee links created."))


def _ensure_leave_balance(emp, LeaveBalance, LeavePolicy):
    """Create a zeroed LeaveBalance if one doesn't exist, seeded from policies.
    Fully safe — swallows all errors (e.g. table not migrated yet)."""
    try:
        if LeaveBalance.objects.filter(employee=emp).exists():
            return
        cl_policy = LeavePolicy.objects.filter(leave_type="CL").first()
        el_policy = LeavePolicy.objects.filter(leave_type="EL").first()
        sl_policy = LeavePolicy.objects.filter(leave_type="SL").first()
        LeaveBalance.objects.create(
            employee=emp,
            casual_remaining=cl_policy.annual_allocation if cl_policy else 12,
            earned_remaining=el_policy.annual_allocation if el_policy else 15,
            sick_remaining=sl_policy.annual_allocation if sl_policy else 10,
        )
    except Exception:
        pass   # table may not be migrated yet; leave balance created later
