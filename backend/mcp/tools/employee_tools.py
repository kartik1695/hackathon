"""
Employee MCP Tools
==================
All employee-related data access for the AI layer.
Every tool:
  - Enforces RBAC via ensure_role / requester_role
  - Returns {"error": ..., "code": ...} on failure — never raises
  - Is the ONLY way the AI reads employee data from the DB

Tools exposed
-------------
get_employee_profile          — full profile of one employee
get_my_profile                — shortcut: requester's own profile
get_employee_manager_chain    — manager hierarchy (up to 5 hops)
get_direct_reports            — immediate reports of a manager
get_peers                     — colleagues in same team (same manager) or dept
get_org_tree                  — recursive subtree under a manager (max depth 3)
get_department_employees      — all employees in a department
list_departments              — departments with headcount
search_employees              — flexible filter: role/title/dept/joined_after
get_largest_teams             — managers ranked by team size
get_new_hires                 — employees who joined within N days
get_employees_by_role         — all employees with a given role
get_employee_by_emp_id        — look up by "EMP001" string
find_employee_by_name         — fuzzy name / email search
"""

import logging
from datetime import date, timedelta

from mcp.rbac import ensure_role
from mcp.registry import tool

logger = logging.getLogger("hrms")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _allow_personal_details() -> bool:
    try:
        from django.conf import settings as s
        return bool(getattr(s, "ALLOW_DIRECTORY_PERSONAL_DETAILS", False))
    except Exception:
        return False


def _requester_emp(requester_id: int):
    """Return the Employee record for requester_id or None."""
    from apps.employees.models import Employee
    return (
        Employee._default_manager
        .select_related("user", "department", "manager")
        .filter(user_id=requester_id)
        .first()
    )


def _emp_dict(emp, include_contact: bool) -> dict:
    """Serialize one Employee to a plain dict."""
    mgr_user = emp.manager.user if emp.manager else None
    return {
        "id": emp.id,
        "employee_id": emp.employee_id,
        "name": emp.user.get_full_name() or emp.user.email,
        "email": emp.user.email if include_contact else None,
        "phone_number": getattr(emp.user, "phone_number", None) if include_contact else None,
        "role": emp.role,
        "title": emp.title,
        "department": emp.department.code if emp.department else None,
        "department_name": emp.department.name if emp.department else None,
        "is_active": emp.is_active,
        "joined_on": str(emp.joined_on) if emp.joined_on else None,
        "manager_id": emp.manager.id if emp.manager else None,
        "manager_employee_id": emp.manager.employee_id if emp.manager else None,
        "manager_name": mgr_user.get_full_name() if mgr_user else None,
        "manager_email": mgr_user.email if include_contact and mgr_user else None,
    }


def _include_contact(requester_role: str, target_emp_id: int, requester_emp) -> bool:
    allow = _allow_personal_details()
    if allow:
        return True
    if requester_role in ("hr", "cfo", "admin", "manager"):
        return True
    # Employee can always see their own contact
    if requester_emp and requester_emp.id == target_emp_id:
        return True
    return False


def _normalize_person_query(raw: str) -> str:
    text = (raw or "").strip()
    for ch in ("?", "!", ",", ".", ":", ";", '"', "'", "(", ")", "[", "]"):
        text = text.replace(ch, " ")
    text = " ".join(text.split()).lower()
    for marker in ("phone number of ", "phone of ", "email of ", "mail of "):
        if marker in text:
            return text.split(marker, 1)[1].strip()
    for marker in (" phone number", " phone", " email", " mail"):
        if marker in text:
            candidate = text.split(marker, 1)[0].strip()
            for prefix in ("what is ", "what's ", "tell me ", "give me ", "show me ", "please ", "can you tell me "):
                if candidate.startswith(prefix):
                    candidate = candidate[len(prefix):].strip()
            if candidate.endswith(" of"):
                candidate = candidate[:-3].strip()
            if candidate.endswith(" for"):
                candidate = candidate[:-4].strip()
            return candidate
    return text


# ---------------------------------------------------------------------------
# Tool: get_employee_profile
# ---------------------------------------------------------------------------

@tool("get_employee_profile")
def get_employee_profile(
    employee_id: int,
    requester_id: int,
    requester_role: str,
    input_data: dict | None = None,
) -> dict:
    """
    Full profile of one employee.
    - Employees can only see their own profile (unless ALLOW_DIRECTORY_PERSONAL_DETAILS).
    - Managers can see their direct reports.
    - HR/CFO/Admin can see anyone.
    """
    err = ensure_role(requester_role, ["employee", "manager", "hr", "cfo", "admin"])
    if err:
        return err

    from apps.employees.models import Employee

    allow = _allow_personal_details()
    req_emp = _requester_emp(requester_id)
    if not req_emp:
        return {"error": "Employee profile not found for requester", "code": "EMPLOYEE_NOT_FOUND"}

    # RBAC access check
    if not allow:
        if requester_role == "employee" and employee_id != req_emp.id:
            return {"error": "Forbidden", "code": "FORBIDDEN"}
        if requester_role == "manager" and employee_id != req_emp.id:
            is_report = Employee._default_manager.filter(pk=employee_id, manager_id=req_emp.id).exists()
            if not is_report:
                return {"error": "Forbidden", "code": "FORBIDDEN"}

    emp = (
        Employee._default_manager
        .select_related("user", "department", "manager", "manager__user")
        .filter(pk=employee_id)
        .first()
    )
    if not emp:
        return {"error": "Employee not found", "code": "EMPLOYEE_NOT_FOUND"}

    ic = _include_contact(requester_role, employee_id, req_emp)
    logger.info(
        "MCP tool ok tool=get_employee_profile requester_id=%s employee_pk=%s include_contact=%s",
        requester_id, emp.id, ic,
    )
    return {"employee": _emp_dict(emp, ic)}


# ---------------------------------------------------------------------------
# Tool: get_my_profile
# ---------------------------------------------------------------------------

@tool("get_my_profile")
def get_my_profile(
    employee_id: int,
    requester_id: int,
    requester_role: str,
    input_data: dict | None = None,
) -> dict:
    """
    Shortcut — returns the profile of the requester themselves.
    Useful for queries like "what is my role?", "show me my profile",
    "who am I?", "what department am I in?".
    """
    err = ensure_role(requester_role, ["employee", "manager", "hr", "cfo", "admin"])
    if err:
        return err

    req_emp = _requester_emp(requester_id)
    if not req_emp:
        return {"error": "Employee profile not found", "code": "EMPLOYEE_NOT_FOUND"}

    from apps.employees.models import Employee
    emp = (
        Employee._default_manager
        .select_related("user", "department", "manager", "manager__user")
        .filter(pk=req_emp.id)
        .first()
    )
    logger.info("MCP tool ok tool=get_my_profile requester_id=%s", requester_id)
    return {"employee": _emp_dict(emp, include_contact=True)}


# ---------------------------------------------------------------------------
# Tool: get_employee_manager_chain
# ---------------------------------------------------------------------------

@tool("get_employee_manager_chain")
def get_employee_manager_chain(
    employee_id: int,
    requester_id: int,
    requester_role: str,
    input_data: dict | None = None,
) -> dict:
    """
    Returns the manager hierarchy for an employee (up to 5 hops).
    Answers: "who is John's manager?", "show me the reporting chain for EMP003",
    "who does Sarah ultimately report to?".
    """
    allow = _allow_personal_details()
    allowed_roles = (
        ["employee", "manager", "hr", "cfo", "admin"] if allow
        else ["manager", "hr", "cfo", "admin"]
    )
    err = ensure_role(requester_role, allowed_roles)
    if err:
        return err

    from apps.employees.models import Employee

    emp = (
        Employee._default_manager
        .select_related(
            "manager", "manager__user",
            "manager__manager", "manager__manager__user",
            "manager__manager__manager", "manager__manager__manager__user",
        )
        .filter(pk=employee_id)
        .first()
    )
    if not emp:
        return {"error": "Employee not found", "code": "EMPLOYEE_NOT_FOUND"}

    ic = _include_contact(requester_role, employee_id, _requester_emp(requester_id))
    chain: list[dict] = []
    cur = emp.manager
    hops = 0
    while cur and hops < 5:
        cu = getattr(cur, "user", None)
        chain.append({
            "level": hops + 1,
            "employee_id": cur.employee_id,
            "name": cu.get_full_name() if cu else None,
            "email": cu.email if ic and cu else None,
            "phone_number": getattr(cu, "phone_number", None) if ic and cu else None,
            "role": cur.role,
            "title": cur.title,
            "department": cur.department.code if cur.department else None,
        })
        cur = cur.manager
        hops += 1

    logger.info("MCP tool ok tool=get_employee_manager_chain employee_pk=%s hops=%s", emp.id, hops)
    return {
        "employee": {"id": emp.id, "employee_id": emp.employee_id, "name": emp.user.get_full_name()},
        "manager_chain": chain,
    }


# ---------------------------------------------------------------------------
# Tool: get_direct_reports
# ---------------------------------------------------------------------------

@tool("get_direct_reports")
def get_direct_reports(
    employee_id: int,
    requester_id: int,
    requester_role: str,
    input_data: dict | None = None,
) -> dict:
    """
    All immediate direct reports of a manager.
    Answers: "who is in Alice's team?", "who reports to EMP005?",
    "list my team members", "how many people report to Bob?".
    """
    allow = _allow_personal_details()
    allowed_roles = (
        ["employee", "manager", "hr", "cfo", "admin"] if allow
        else ["manager", "hr", "cfo", "admin"]
    )
    err = ensure_role(requester_role, allowed_roles)
    if err:
        return err

    from apps.employees.models import Employee

    req_emp = _requester_emp(requester_id)
    if not req_emp:
        return {"error": "Employee profile not found for requester", "code": "EMPLOYEE_NOT_FOUND"}

    # Managers can only see their own reports unless allow_personal_details
    if not allow and requester_role == "manager" and employee_id != req_emp.id:
        return {"error": "Forbidden", "code": "FORBIDDEN"}

    manager = (
        Employee._default_manager
        .select_related("user", "department")
        .filter(pk=employee_id)
        .first()
    )
    if not manager:
        return {"error": "Employee not found", "code": "EMPLOYEE_NOT_FOUND"}

    ic = _include_contact(requester_role, employee_id, req_emp)
    reports_qs = (
        Employee._default_manager
        .select_related("user", "department", "manager", "manager__user")
        .filter(manager_id=employee_id, is_active=True)
        .order_by("user__name")[:100]
    )

    reports = [_emp_dict(e, ic) for e in reports_qs]
    logger.info(
        "MCP tool ok tool=get_direct_reports manager_pk=%s reports=%s", employee_id, len(reports)
    )
    return {
        "manager": _emp_dict(manager, ic),
        "direct_reports": reports,
        "total_reports": len(reports),
    }


# ---------------------------------------------------------------------------
# Tool: get_peers
# ---------------------------------------------------------------------------

@tool("get_peers")
def get_peers(
    employee_id: int,
    requester_id: int,
    requester_role: str,
    input_data: dict | None = None,
) -> dict:
    """
    Returns colleagues who share the same manager as the given employee
    (i.e. teammates). Falls back to same-department employees if no manager.
    Answers: "who are my peers?", "who are John's teammates?",
    "who else is in the same team as Sarah?".
    """
    err = ensure_role(requester_role, ["employee", "manager", "hr", "cfo", "admin"])
    if err:
        return err

    from apps.employees.models import Employee

    req_emp = _requester_emp(requester_id)
    emp = (
        Employee._default_manager
        .select_related("user", "department", "manager", "manager__user")
        .filter(pk=employee_id)
        .first()
    )
    if not emp:
        return {"error": "Employee not found", "code": "EMPLOYEE_NOT_FOUND"}

    ic = _include_contact(requester_role, employee_id, req_emp)

    if emp.manager_id:
        peers_qs = (
            Employee._default_manager
            .select_related("user", "department", "manager", "manager__user")
            .filter(manager_id=emp.manager_id, is_active=True)
            .exclude(pk=employee_id)
            .order_by("user__name")[:50]
        )
        basis = "same_manager"
    elif emp.department_id:
        peers_qs = (
            Employee._default_manager
            .select_related("user", "department", "manager", "manager__user")
            .filter(department_id=emp.department_id, is_active=True)
            .exclude(pk=employee_id)
            .order_by("user__name")[:50]
        )
        basis = "same_department"
    else:
        return {"peers": [], "basis": "none", "note": "No manager or department found for this employee"}

    peers = [_emp_dict(e, ic) for e in peers_qs]
    logger.info("MCP tool ok tool=get_peers employee_pk=%s basis=%s peers=%s", employee_id, basis, len(peers))
    return {
        "employee": {"id": emp.id, "employee_id": emp.employee_id, "name": emp.user.get_full_name()},
        "peers": peers,
        "basis": basis,
        "total_peers": len(peers),
    }


# ---------------------------------------------------------------------------
# Tool: get_org_tree
# ---------------------------------------------------------------------------

@tool("get_org_tree")
def get_org_tree(
    employee_id: int,
    requester_id: int,
    requester_role: str,
    input_data: dict | None = None,
) -> dict:
    """
    Returns a recursive org tree rooted at `employee_id` (max depth 3).
    Answers: "show me the org chart under Alice", "who is under Bob?",
    "give me the full team structure for EMP010", "what does John's org look like?".
    """
    err = ensure_role(requester_role, ["manager", "hr", "cfo", "admin"])
    if err:
        return err

    from apps.employees.models import Employee

    req_emp = _requester_emp(requester_id)
    ic = _include_contact(requester_role, employee_id, req_emp)

    def _subtree(manager_pk: int, depth: int) -> list[dict]:
        if depth <= 0:
            return []
        reports_qs = (
            Employee._default_manager
            .select_related("user", "department", "manager", "manager__user")
            .filter(manager_id=manager_pk, is_active=True)
            .order_by("user__name")[:30]
        )
        nodes = []
        for e in reports_qs:
            node = _emp_dict(e, ic)
            node["reports"] = _subtree(e.id, depth - 1)
            node["report_count"] = len(node["reports"])
            nodes.append(node)
        return nodes

    root = (
        Employee._default_manager
        .select_related("user", "department", "manager", "manager__user")
        .filter(pk=employee_id)
        .first()
    )
    if not root:
        return {"error": "Employee not found", "code": "EMPLOYEE_NOT_FOUND"}

    tree = _emp_dict(root, ic)
    tree["reports"] = _subtree(root.id, depth=3)
    tree["report_count"] = len(tree["reports"])

    logger.info("MCP tool ok tool=get_org_tree root_pk=%s", employee_id)
    return {"org_tree": tree}


# ---------------------------------------------------------------------------
# Tool: get_department_employees
# ---------------------------------------------------------------------------

@tool("get_department_employees")
def get_department_employees(
    employee_id: int,
    requester_id: int,
    requester_role: str,
    input_data: dict | None = None,
) -> dict:
    """
    All active employees in a specific department.
    Answers: "list all employees in Engineering", "who is in the HR team?",
    "show me everyone in Finance", "how many people are in Sales?".

    input_data keys:
      - department_code  (str)  e.g. "ENG"
      - department_name  (str)  partial match, e.g. "engineering"
    """
    err = ensure_role(requester_role, ["employee", "manager", "hr", "cfo", "admin"])
    if err:
        return err

    from apps.employees.models import Department, Employee

    input_data = input_data or {}
    dept_code = (input_data.get("department_code") or "").strip().upper()
    dept_name = (input_data.get("department_name") or "").strip()

    if not dept_code and not dept_name:
        # Try to infer from the query text
        query = (input_data.get("query") or "").lower()
        # Check all dept names/codes against the query
        all_depts = list(Department.objects.all())
        for d in all_depts:
            if d.code.lower() in query or d.name.lower() in query:
                dept_code = d.code
                break

    if not dept_code and not dept_name:
        return {"error": "department_code or department_name is required", "code": "INVALID_INPUT"}

    try:
        if dept_code:
            dept = Department.objects.get(code__iexact=dept_code)
        else:
            dept = Department.objects.filter(name__icontains=dept_name).first()
            if not dept:
                return {"error": f"Department not found: {dept_name}", "code": "DEPT_NOT_FOUND"}
    except Department.DoesNotExist:
        return {"error": f"Department not found: {dept_code}", "code": "DEPT_NOT_FOUND"}

    req_emp = _requester_emp(requester_id)
    ic = _include_contact(requester_role, -1, req_emp)

    emps = (
        Employee._default_manager
        .select_related("user", "department", "manager", "manager__user")
        .filter(department=dept, is_active=True)
        .order_by("user__name")[:200]
    )

    items = [_emp_dict(e, ic) for e in emps]
    logger.info("MCP tool ok tool=get_department_employees dept=%s count=%s", dept.code, len(items))
    return {
        "department": {"code": dept.code, "name": dept.name},
        "employees": items,
        "total": len(items),
    }


# ---------------------------------------------------------------------------
# Tool: list_departments
# ---------------------------------------------------------------------------

@tool("list_departments")
def list_departments(
    employee_id: int,
    requester_id: int,
    requester_role: str,
    input_data: dict | None = None,
) -> dict:
    """
    All departments with headcount.
    Answers: "what departments exist?", "list all teams in the company",
    "how many departments do we have?", "which is the largest department?".
    """
    err = ensure_role(requester_role, ["employee", "manager", "hr", "cfo", "admin"])
    if err:
        return err

    from django.db.models import Count
    from apps.employees.models import Department

    depts = (
        Department.objects
        .annotate(headcount=Count("employees", filter=__import__("django.db.models", fromlist=["Q"]).Q(employees__is_active=True)))
        .order_by("-headcount", "name")
    )

    items = [
        {"code": d.code, "name": d.name, "headcount": d.headcount}
        for d in depts
    ]
    logger.info("MCP tool ok tool=list_departments count=%s", len(items))
    return {"departments": items, "total_departments": len(items)}


# ---------------------------------------------------------------------------
# Tool: search_employees
# ---------------------------------------------------------------------------

@tool("search_employees")
def search_employees(
    employee_id: int,
    requester_id: int,
    requester_role: str,
    input_data: dict | None = None,
) -> dict:
    """
    Flexible employee search with optional filters.
    Answers: "find all senior engineers", "list all managers", "who joined this year?",
    "show employees with title Lead", "find active employees in Engineering joined after 2024".

    input_data keys (all optional):
      - role           (str)  e.g. "manager" | "employee" | "hr" | "cfo"
      - title          (str)  partial match
      - department_code (str)
      - joined_after   (str)  ISO date "YYYY-MM-DD"
      - joined_before  (str)  ISO date "YYYY-MM-DD"
      - is_active      (bool) default True
      - query          (str)  free-text fallback parsed by this tool
      - limit          (int)  max results, default 50
    """
    err = ensure_role(requester_role, ["employee", "manager", "hr", "cfo", "admin"])
    if err:
        return err

    from apps.employees.models import Employee

    input_data = input_data or {}
    filters: dict = {}

    role_filter = (input_data.get("role") or "").strip().lower()
    if role_filter:
        filters["role"] = role_filter

    title_filter = (input_data.get("title") or "").strip()
    if title_filter:
        filters["title__icontains"] = title_filter

    dept_code = (input_data.get("department_code") or "").strip().upper()
    if dept_code:
        filters["department__code__iexact"] = dept_code

    joined_after = (input_data.get("joined_after") or "").strip()
    if joined_after:
        try:
            filters["joined_on__gte"] = date.fromisoformat(joined_after)
        except ValueError:
            pass

    joined_before = (input_data.get("joined_before") or "").strip()
    if joined_before:
        try:
            filters["joined_on__lte"] = date.fromisoformat(joined_before)
        except ValueError:
            pass

    # Default: only active employees
    is_active = input_data.get("is_active")
    if is_active is None:
        filters["is_active"] = True
    elif is_active:
        filters["is_active"] = True

    # Parse free-text query for common patterns
    query_text = (input_data.get("query") or "").lower()
    if query_text and not role_filter:
        for r in ("manager", "hr", "cfo", "admin", "employee"):
            if r in query_text:
                filters["role"] = r
                break
    if query_text and not dept_code:
        from apps.employees.models import Department
        for d in Department.objects.all():
            if d.code.lower() in query_text or d.name.lower() in query_text:
                filters["department__code__iexact"] = d.code
                break

    limit = min(int(input_data.get("limit") or 50), 200)

    req_emp = _requester_emp(requester_id)
    ic = _include_contact(requester_role, -1, req_emp)

    # Employees can only search within their own department (unless allow_personal_details)
    if not _allow_personal_details() and requester_role == "employee":
        if req_emp and req_emp.department_id:
            filters["department_id"] = req_emp.department_id

    qs = (
        Employee._default_manager
        .select_related("user", "department", "manager", "manager__user")
        .filter(**filters)
        .order_by("user__name")[:limit]
    )

    items = [_emp_dict(e, ic) for e in qs]
    logger.info("MCP tool ok tool=search_employees filters=%s results=%s", filters, len(items))
    return {"employees": items, "total": len(items), "filters_applied": filters}


# ---------------------------------------------------------------------------
# Tool: get_largest_teams
# ---------------------------------------------------------------------------

@tool("get_largest_teams")
def get_largest_teams(
    employee_id: int,
    requester_id: int,
    requester_role: str,
    input_data: dict | None = None,
) -> dict:
    """
    Returns managers ranked by their number of direct reports.
    Answers: "who has the largest team?", "which manager manages the most people?",
    "top 5 managers by team size", "who has the most direct reports?".

    input_data keys:
      - limit  (int)  default 10
    """
    err = ensure_role(requester_role, ["manager", "hr", "cfo", "admin"])
    if err:
        return err

    from django.db.models import Count
    from apps.employees.models import Employee

    input_data = input_data or {}
    limit = min(int(input_data.get("limit") or 10), 50)

    req_emp = _requester_emp(requester_id)
    ic = _include_contact(requester_role, -1, req_emp)

    managers = (
        Employee._default_manager
        .select_related("user", "department")
        .annotate(report_count=Count("direct_reports", filter=__import__("django.db.models", fromlist=["Q"]).Q(direct_reports__is_active=True)))
        .filter(report_count__gt=0, is_active=True)
        .order_by("-report_count")[:limit]
    )

    items = []
    for m in managers:
        d = _emp_dict(m, ic)
        d["direct_report_count"] = m.report_count
        items.append(d)

    logger.info("MCP tool ok tool=get_largest_teams results=%s", len(items))
    return {"managers_by_team_size": items}


# ---------------------------------------------------------------------------
# Tool: get_new_hires
# ---------------------------------------------------------------------------

@tool("get_new_hires")
def get_new_hires(
    employee_id: int,
    requester_id: int,
    requester_role: str,
    input_data: dict | None = None,
) -> dict:
    """
    Employees who joined within the last N days (default 30).
    Answers: "who joined recently?", "new hires this month", "employees who joined this year",
    "who has joined in the last 90 days?", "list recent joiners".

    input_data keys:
      - days          (int)  lookback window, default 30
      - department_code (str)  optional filter
    """
    err = ensure_role(requester_role, ["manager", "hr", "cfo", "admin"])
    if err:
        return err

    from apps.employees.models import Employee

    input_data = input_data or {}

    # Support "this year" / "this month" from query text
    query_text = (input_data.get("query") or "").lower()
    if "this year" in query_text:
        cutoff = date(date.today().year, 1, 1)
    elif "this month" in query_text:
        today = date.today()
        cutoff = date(today.year, today.month, 1)
    else:
        days = int(input_data.get("days") or 30)
        cutoff = date.today() - timedelta(days=days)

    filters: dict = {"joined_on__gte": cutoff, "is_active": True}

    dept_code = (input_data.get("department_code") or "").strip().upper()
    if dept_code:
        filters["department__code__iexact"] = dept_code

    req_emp = _requester_emp(requester_id)
    ic = _include_contact(requester_role, -1, req_emp)

    qs = (
        Employee._default_manager
        .select_related("user", "department", "manager", "manager__user")
        .filter(**filters)
        .order_by("-joined_on")[:100]
    )

    items = [_emp_dict(e, ic) for e in qs]
    logger.info("MCP tool ok tool=get_new_hires cutoff=%s results=%s", cutoff, len(items))
    return {"new_hires": items, "since": str(cutoff), "total": len(items)}


# ---------------------------------------------------------------------------
# Tool: get_employees_by_role
# ---------------------------------------------------------------------------

@tool("get_employees_by_role")
def get_employees_by_role(
    employee_id: int,
    requester_id: int,
    requester_role: str,
    input_data: dict | None = None,
) -> dict:
    """
    List all employees with a specific role.
    Answers: "list all managers", "who are the HR people?", "show all admins",
    "how many managers does the company have?", "who is the CFO?".

    input_data keys:
      - role  (str)  required: "employee" | "manager" | "hr" | "cfo" | "admin"
    """
    err = ensure_role(requester_role, ["employee", "manager", "hr", "cfo", "admin"])
    if err:
        return err

    from apps.employees.models import Employee

    input_data = input_data or {}
    role = (input_data.get("role") or "").strip().lower()

    # Try to infer from query text
    if not role:
        query_text = (input_data.get("query") or "").lower()
        for r in ("cfo", "admin", "manager", "hr", "employee"):
            if r in query_text:
                role = r
                break

    valid_roles = ("employee", "manager", "hr", "cfo", "admin")
    if role not in valid_roles:
        return {
            "error": f"Invalid role '{role}'. Must be one of: {valid_roles}",
            "code": "INVALID_INPUT",
        }

    req_emp = _requester_emp(requester_id)
    ic = _include_contact(requester_role, -1, req_emp)

    qs = (
        Employee._default_manager
        .select_related("user", "department", "manager", "manager__user")
        .filter(role=role, is_active=True)
        .order_by("user__name")[:100]
    )

    items = [_emp_dict(e, ic) for e in qs]
    logger.info("MCP tool ok tool=get_employees_by_role role=%s results=%s", role, len(items))
    return {"role": role, "employees": items, "total": len(items)}


# ---------------------------------------------------------------------------
# Tool: get_employee_by_emp_id
# ---------------------------------------------------------------------------

@tool("get_employee_by_emp_id")
def get_employee_by_emp_id(
    employee_id: int,
    requester_id: int,
    requester_role: str,
    input_data: dict | None = None,
) -> dict:
    """
    Look up an employee by their string employee_id (e.g. "EMP001").
    Answers: "show me details for EMP007", "get profile of EMP-001",
    "who is employee ID EMP012?".

    input_data keys:
      - emp_id  (str)  the string employee ID
    """
    err = ensure_role(requester_role, ["employee", "manager", "hr", "cfo", "admin"])
    if err:
        return err

    from apps.employees.models import Employee

    input_data = input_data or {}
    emp_id_str = (input_data.get("emp_id") or input_data.get("employee_id_str") or "").strip()

    # Try to extract from query text if not given directly
    if not emp_id_str:
        import re
        query_text = input_data.get("query") or ""
        match = re.search(r"\bEMP[-_]?\d+\b", query_text, re.IGNORECASE)
        if match:
            emp_id_str = match.group(0).replace("-", "").replace("_", "").upper()

    if not emp_id_str:
        return {"error": "emp_id is required", "code": "INVALID_INPUT"}

    req_emp = _requester_emp(requester_id)

    emp = (
        Employee._default_manager
        .select_related("user", "department", "manager", "manager__user")
        .filter(employee_id__iexact=emp_id_str)
        .first()
    )
    if not emp:
        return {"error": f"Employee not found: {emp_id_str}", "code": "EMPLOYEE_NOT_FOUND"}

    # RBAC
    allow = _allow_personal_details()
    if not allow and requester_role == "employee" and emp.id != (req_emp.id if req_emp else None):
        return {"error": "Forbidden", "code": "FORBIDDEN"}
    if not allow and requester_role == "manager" and emp.id != (req_emp.id if req_emp else None):
        is_report = Employee._default_manager.filter(pk=emp.id, manager_id=req_emp.id if req_emp else -1).exists()
        if not is_report:
            return {"error": "Forbidden", "code": "FORBIDDEN"}

    ic = _include_contact(requester_role, emp.id, req_emp)
    logger.info("MCP tool ok tool=get_employee_by_emp_id emp_id=%s", emp_id_str)
    return {"employee": _emp_dict(emp, ic)}


# ---------------------------------------------------------------------------
# Tool: find_employee_by_name
# ---------------------------------------------------------------------------

@tool("find_employee_by_name")
def find_employee_by_name(
    employee_id: int,
    requester_id: int,
    requester_role: str,
    input_data: dict | None = None,
) -> dict:
    """
    Smart fuzzy name search with:
    - Token-based exact substring matching (first pass)
    - Phonetic / edit-distance fuzzy matching (second pass) for misspellings
    - Spelling-variant mapping for common Indian names (Laxmi/Lakshmi, Priya/Priyа, etc.)
    - Disambiguation metadata so the LLM can ask follow-up questions

    Returns:
      {
        "results": [...],         # matched employees
        "query_used": "...",      # normalised search string
        "match_type": "exact"|"fuzzy"|"none",
        "needs_disambiguation": true|false,
        "disambiguation_hint": "...",  # human-readable hint for the LLM
        "suggestions": [...]      # only when needs_disambiguation=true
      }

    Disambiguation rules:
      - 0 results after fuzzy → needs_disambiguation=True, suggestions = phonetically similar names
      - >1 result            → needs_disambiguation=True (LLM asks user to pick one)
      - exactly 1 result     → needs_disambiguation=False, ready to use the employee id
    """
    err = ensure_role(requester_role, ["employee", "manager", "hr", "cfo", "admin"])
    if err:
        return err

    from apps.employees.models import Employee

    input_data = input_data or {}
    raw_query = (input_data.get("name") or input_data.get("query") or "").strip()
    query = _normalize_person_query(raw_query)

    if not query:
        return {"error": "query is required", "code": "INVALID_INPUT"}

    req_emp = _requester_emp(requester_id)
    allow = _allow_personal_details()

    # ── Step 1: exact substring match ──────────────────────────────────────
    stop_words = {
        "what", "is", "my", "the", "a", "an", "of", "for",
        "phone", "number", "email", "mail", "who", "find",
        "search", "give", "me", "show", "please", "tell",
    }
    tokens = [t for t in query.split() if t not in stop_words and len(t) >= 2]

    base_qs = Employee._default_manager.filter(is_active=True)
    if not allow and requester_role == "employee" and req_emp and req_emp.department_id:
        base_qs = base_qs.filter(department_id=req_emp.department_id)

    qs = base_qs.none()
    match_type = "none"

    if tokens:
        # All tokens must match (AND)
        qs_and = base_qs
        for tok in tokens:
            qs_and = qs_and.filter(user__name__icontains=tok)
        if qs_and.exists():
            qs = qs_and
            match_type = "exact"
        else:
            # Any token matches (OR) — broader net
            qs_or = None
            for tok in tokens:
                tok_qs = (
                    base_qs.filter(user__name__icontains=tok)
                    | base_qs.filter(user__email__icontains=tok)
                )
                qs_or = tok_qs if qs_or is None else (qs_or | tok_qs)
            qs = (qs_or or base_qs.none()).distinct()
            if qs.exists():
                match_type = "partial"

    # ── Step 2: fuzzy / phonetic fallback if 0 results ─────────────────────
    if not qs.exists():
        qs, match_type = _fuzzy_search(base_qs, query, tokens)

    ic = _include_contact(requester_role, -1, req_emp)
    candidates = list(
        qs.select_related("user", "department", "manager", "manager__user")
        .order_by("user__name")[:15]
    )
    items = [_emp_dict(e, ic) for e in candidates]

    # ── Step 3: build disambiguation metadata ──────────────────────────────
    needs_disambig = False
    disambig_hint = ""
    suggestions: list[dict] = []

    if len(items) == 0:
        needs_disambig = True
        disambig_hint = (
            f"No employee found matching '{raw_query}'. "
            "The name might be misspelled. Ask the user to check the spelling or provide the employee ID."
        )

    elif len(items) > 1:
        needs_disambig = True
        # Build concise summary cards for disambiguation
        for item in items[:10]:
            suggestions.append({
                "id": item["id"],
                "employee_id": item["employee_id"],
                "name": item["name"],
                "department": item["department"],
                "title": item["title"],
                "manager_name": item["manager_name"],
            })
        disambig_hint = (
            f"Found {len(items)} employees matching '{raw_query}'. "
            "Ask the user to clarify which one they mean by selecting the employee_id "
            f"from the suggestions list."
        )

    # Single result — clean match, no disambiguation needed
    logger.info(
        "MCP tool ok tool=find_employee_by_name query=%s results=%s match_type=%s needs_disambig=%s",
        query, len(items), match_type, needs_disambig,
    )
    return {
        "results": items,
        "query_used": query,
        "match_type": match_type,
        "needs_disambiguation": needs_disambig,
        "disambiguation_hint": disambig_hint,
        "suggestions": suggestions,
    }


# ── Fuzzy helpers ──────────────────────────────────────────────────────────

# Common spelling variants for Indian names (and general English names)
_NAME_VARIANTS: dict[str, list[str]] = {
    "laxmi":    ["lakshmi", "laksmi", "lachmi"],
    "lakshmi":  ["laxmi", "laksmi", "lachmi"],
    "priya":    ["pria", "preya", "priyah"],
    "rahul":    ["rahool", "rahull", "raahul"],
    "amit":     ["ameet", "amitt"],
    "neha":     ["neha", "neeha", "niha"],
    "ravi":     ["raavi", "ravee"],
    "anita":    ["aneeta", "anitha"],
    "suresh":   ["suresh", "sureesh"],
    "ramesh":   ["rameesh", "ramesh"],
    "guru":     ["guroo", "gooroo"],
    "anjali":   ["anjaly", "anjalie"],
    "pooja":    ["puja", "pooja"],
    "puja":     ["pooja"],
    "vikram":   ["vikrum", "vikrem"],
    "deepak":   ["dipak", "deepack"],
    "dipak":    ["deepak"],
    "arun":     ["aroon", "aroone"],
    "john":     ["jon", "jhon", "jonn"],
    "michael":  ["micheal", "mikael", "mikel"],
    "sarah":    ["sara", "saraa", "saara"],
}


def _edit_distance(a: str, b: str) -> int:
    """Simple Levenshtein distance (character-level)."""
    if a == b:
        return 0
    m, n = len(a), len(b)
    if m == 0:
        return n
    if n == 0:
        return m
    # Only keep two rows to save memory
    prev = list(range(n + 1))
    for i in range(1, m + 1):
        curr = [i] + [0] * n
        for j in range(1, n + 1):
            cost = 0 if a[i - 1] == b[j - 1] else 1
            curr[j] = min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost)
        prev = curr
    return prev[n]


def _fuzzy_score(query_tok: str, name_tok: str) -> float:
    """
    Returns a score 0..1. Higher = better match.
    Uses edit distance normalised by length.
    """
    maxlen = max(len(query_tok), len(name_tok), 1)
    dist = _edit_distance(query_tok, name_tok)
    return 1.0 - dist / maxlen


def _fuzzy_search(base_qs, query: str, tokens: list[str]):
    """
    Fuzzy employee search:
    1. Expand tokens via _NAME_VARIANTS
    2. Score all active employees against query tokens
    3. Return employees with score >= threshold
    """
    from apps.employees.models import Employee

    # Build expanded token set (original + variants)
    expanded: set[str] = set(tokens)
    for tok in tokens:
        for variant in _NAME_VARIANTS.get(tok, []):
            expanded.add(variant)

    # Broad fetch: all active employees (capped for performance)
    all_emps = list(base_qs.select_related("user")[:500])

    THRESHOLD = 0.65  # minimum per-token score to consider a match

    scored: list[tuple[float, object]] = []
    for emp in all_emps:
        full_name = (emp.user.get_full_name() or "").lower()
        name_tokens = full_name.split()
        if not name_tokens:
            continue

        # For each query token, find the best matching name token
        token_scores: list[float] = []
        for qt in expanded:
            best = max((_fuzzy_score(qt, nt) for nt in name_tokens), default=0.0)
            token_scores.append(best)

        # Overall score = mean of best per-token scores
        score = sum(token_scores) / len(token_scores) if token_scores else 0.0
        if score >= THRESHOLD:
            scored.append((score, emp))

    # Sort by score descending, return top 10
    scored.sort(key=lambda x: x[0], reverse=True)
    matched_ids = [emp.id for _, emp in scored[:10]]

    if not matched_ids:
        return base_qs.none(), "none"

    # Re-query through Django ORM to preserve normal queryset chaining
    from django.db.models import Case, IntegerField, Value, When
    order = Case(
        *[When(pk=pk, then=Value(i)) for i, pk in enumerate(matched_ids)],
        output_field=IntegerField(),
    )
    qs = (
        Employee._default_manager
        .filter(pk__in=matched_ids, is_active=True)
        .annotate(_sort=order)
        .order_by("_sort")
    )
    return qs, "fuzzy"
