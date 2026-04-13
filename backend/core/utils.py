import logging

logger = logging.getLogger("hrms")


def error_response(message: str, code: str, details: dict | None = None) -> dict:
    payload = {"error": message, "code": code, "details": details or {}}
    logger.info("API error code=%s message=%s", code, message)
    return payload
