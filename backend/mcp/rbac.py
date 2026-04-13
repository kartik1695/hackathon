def ensure_role(requester_role: str, allowed_roles: list[str]) -> dict | None:
    if requester_role not in allowed_roles:
        return {"error": "Forbidden", "code": "FORBIDDEN", "details": {"allowed_roles": allowed_roles}}
    return None
