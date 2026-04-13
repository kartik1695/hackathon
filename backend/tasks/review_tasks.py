import logging

from config.celery import app
from core.tasks.base import BaseHRMSTask

logger = logging.getLogger("hrms")


class ReviewSummaryTask(BaseHRMSTask):
    name = "tasks.review_tasks.review_summary"

    def execute(self, review_cycle_id: int):
        try:
            from apps.performance.models import ReviewCycle
        except ImportError as exc:
            logger.exception("ReviewCycle model import failed")
            return {"status": "error", "error": str(exc)}

        review = ReviewCycle.objects.select_related("employee", "employee__user").filter(pk=review_cycle_id).first()
        if not review:
            logger.info("ReviewCycle not found review_cycle_id=%s", review_cycle_id)
            return {"status": "not_found"}

        try:
            from agents.graph import run_agent
        except ImportError as exc:
            logger.exception("Agent import failed")
            return {"status": "error", "error": str(exc)}

        state = {
            "intent": "review_summary",
            "employee_id": review.employee_id,
            "requester_id": review.employee.user_id,
            "requester_role": "manager",
            "input_data": {"review_cycle_id": review.pk, "period_start": str(review.period_start), "period_end": str(review.period_end)},
            "retrieved_docs": [],
            "tool_results": {},
            "llm_response": None,
            "spof_flag": False,
            "conflict_detected": False,
            "conflict_summary": None,
            "manager_context": None,
            "burnout_score": None,
            "burnout_signals": None,
            "error": None,
        }
        result = run_agent(state)
        ai_draft = result.get("llm_response") or result.get("manager_context") or ""
        review.ai_draft = ai_draft
        review.save(update_fields=["ai_draft", "updated_at"])
        logger.info("Review summary generated review_cycle_id=%s", review_cycle_id)
        return {"status": "ok", "review_cycle_id": review_cycle_id, "ai_draft": ai_draft}


review_summary = app.register_task(ReviewSummaryTask())
