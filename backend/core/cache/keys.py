class CacheKeys:
    @staticmethod
    def burnout_score(employee_id: int) -> str:
        return f"burnout:{employee_id}"

    @staticmethod
    def rate_limit(user_id: int, endpoint: str) -> str:
        return f"rate:{user_id}:{endpoint}"

    @staticmethod
    def leave_forecast(dept_id: int, year_month: str) -> str:
        return f"forecast:{dept_id}:{year_month}"

    @staticmethod
    def headcount_snapshot(date_str: str) -> str:
        return f"headcount:{date_str}"

    @staticmethod
    def cfo_weekly_report(date_str: str) -> str:
        return f"cfo_report:{date_str}"
