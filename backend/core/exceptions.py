from rest_framework.exceptions import APIException


class HRMSAPIException(APIException):
    status_code = 400
    default_detail = "Request failed"
    default_code = "REQUEST_FAILED"

    def __init__(self, message: str, code: str, status_code: int = 400, details: dict | None = None):
        self.status_code = status_code
        super().__init__({"error": message, "code": code, "details": details or {}})
