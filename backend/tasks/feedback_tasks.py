import json
import logging
from datetime import date, timedelta

from config.celery import app
from core.tasks.base import BaseHRMSTask

logger = logging.getLogger("hrms")

TOPIC_LABELS = [
    "work_life_balance", "compensation", "management", "career_growth",
    "culture", "workload", "communication", "recognition", "team_dynamics",
]

PROCESS_FEEDBACK_PROMPT = """You are an HR analytics AI. Analyze the following anonymous employee feedback and return ONLY valid JSON.

Feedback:
\"\"\"{text}\"\"\"

Return JSON with exactly these keys:
{{
  "sentiment_score": <float -1.0 to 1.0>,
  "sentiment_label": <"positive" | "neutral" | "negative">,
  "emotions": {{
    "frustration": <float 0-1>,
    "anxiety": <float 0-1>,
    "satisfaction": <float 0-1>,
    "neutral": <float 0-1>
  }},
  "topics": <list of strings from: {topics}>,
  "risk_flags": {{
    "burnout": <bool>,
    "attrition": <bool>,
    "morale_decline": <bool>,
    "toxic_culture": <bool>
  }},
  "confidence": <float 0-1>
}}

Rules:
- emotions values must sum to approximately 1.0
- topics must be from the allowed list only
- Return ONLY the JSON object, no markdown, no explanation
"""

ORG_SUMMARY_PROMPT = """You are an organizational psychologist AI. Below are aggregated (anonymous) employee feedback metrics for the past 30 days.

Data:
- Total submissions: {total}
- Average sentiment score: {avg_sentiment:.2f} (range -1 to 1)
- Sentiment distribution: {sentiment_dist}
- Top concerns: {top_topics}
- Emotional landscape: {emotions}
- Risk rates (%): {risk_rates}

Write a professional org-wide insight summary for leadership. Include:
1. A 3-4 sentence narrative summary of the current organizational mood
2. Key patterns and concerns
3. Notable risks
4. 3-5 specific, actionable recommendations

Return ONLY valid JSON:
{{
  "ai_summary": "<narrative summary>",
  "recommendations": ["<rec1>", "<rec2>", "<rec3>", ...]
}}
"""


class ProcessFeedbackTask(BaseHRMSTask):
    name = "tasks.feedback_tasks.process_feedback"

    def execute(self, feedback_id: int):
        from django.utils import timezone
        from apps.feedback.models import AnonymousFeedback
        from core.llm.factory import LLMProviderFactory
        from core.llm.base import LLMMessage

        fb = AnonymousFeedback.objects.filter(pk=feedback_id, is_processed=False).first()
        if not fb:
            logger.info("Feedback %s not found or already processed", feedback_id)
            return {"status": "skipped"}

        raw = fb.raw_text
        if not raw.strip():
            logger.warning("Feedback %s has empty raw_text", feedback_id)
            return {"status": "empty"}

        prompt = PROCESS_FEEDBACK_PROMPT.format(
            text=raw[:1500],
            topics=", ".join(TOPIC_LABELS),
        )

        try:
            provider = LLMProviderFactory.get_provider()
            response = provider.complete(
                [LLMMessage(role="user", content=prompt)],
                temperature=0.1,
            )
            content = response.content.strip()
            # strip markdown fences if present
            if content.startswith("```"):
                content = content.split("```")[1]
                if content.startswith("json"):
                    content = content[4:]
            data = json.loads(content)
        except Exception as exc:
            logger.exception("LLM processing failed for feedback %s: %s", feedback_id, exc)
            # Still mark processed so we don't retry infinitely; store nulls
            fb.is_processed = True
            fb.processed_at = timezone.now()
            fb.raw_text = ""
            fb.save(update_fields=["is_processed", "processed_at", "raw_text"])
            return {"status": "llm_error", "error": str(exc)}

        fb.sentiment_score = float(data.get("sentiment_score") or 0)
        fb.sentiment_label = data.get("sentiment_label") or "neutral"
        fb.emotions = data.get("emotions") or {}
        fb.topics = [t for t in (data.get("topics") or []) if t in TOPIC_LABELS]
        fb.risk_flags = data.get("risk_flags") or {}
        fb.confidence = float(data.get("confidence") or 0.5)
        fb.is_processed = True
        fb.processed_at = timezone.now()
        fb.raw_text = ""  # wipe raw text — anonymity guarantee
        fb.save()

        logger.info(
            "Feedback %s processed: sentiment=%s topics=%s",
            feedback_id, fb.sentiment_label, fb.topics,
        )
        return {"status": "ok", "sentiment": fb.sentiment_label}


class GenerateOrgSummaryTask(BaseHRMSTask):
    name = "tasks.feedback_tasks.generate_org_summary"

    def execute(self):
        from django.db.models import Avg, Count
        from django.utils import timezone
        from apps.feedback.models import AnonymousFeedback, OrgInsightSnapshot
        from core.llm.factory import LLMProviderFactory
        from core.llm.base import LLMMessage

        since = timezone.now() - __import__("datetime").timedelta(days=30)
        qs = AnonymousFeedback.objects.filter(is_processed=True, processed_at__gte=since)
        total = qs.count()

        if total < 5:
            logger.info("Insufficient feedback for org summary: %s", total)
            return {"status": "insufficient_data", "count": total}

        avg_sentiment = qs.aggregate(a=Avg("sentiment_score"))["a"] or 0
        sentiment_dist = dict(
            qs.values_list("sentiment_label").annotate(c=Count("id")).values_list("sentiment_label", "c")
        )

        topic_counts: dict[str, int] = {}
        emotion_sums: dict[str, float] = {}
        risk_counts: dict[str, int] = {"burnout": 0, "attrition": 0, "morale_decline": 0, "toxic_culture": 0}

        for fb in qs.values("topics", "emotions", "risk_flags"):
            for t in (fb["topics"] or []):
                topic_counts[t] = topic_counts.get(t, 0) + 1
            for k, v in (fb["emotions"] or {}).items():
                emotion_sums[k] = emotion_sums.get(k, 0) + float(v or 0)
            for k in risk_counts:
                if (fb["risk_flags"] or {}).get(k):
                    risk_counts[k] += 1

        top_topics = sorted(topic_counts.items(), key=lambda x: -x[1])[:6]
        emotions = {k: round(v / total, 2) for k, v in emotion_sums.items()}
        risk_rates = {k: round(v / total * 100, 1) for k, v in risk_counts.items()}

        prompt = ORG_SUMMARY_PROMPT.format(
            total=total,
            avg_sentiment=avg_sentiment,
            sentiment_dist=sentiment_dist,
            top_topics=dict(top_topics),
            emotions=emotions,
            risk_rates=risk_rates,
        )

        try:
            provider = LLMProviderFactory.get_provider()
            response = provider.complete(
                [LLMMessage(role="user", content=prompt)],
                temperature=0.4,
            )
            content = response.content.strip()
            if content.startswith("```"):
                content = content.split("```")[1]
                if content.startswith("json"):
                    content = content[4:]
            data = json.loads(content)
        except Exception as exc:
            logger.exception("Org summary LLM failed: %s", exc)
            return {"status": "llm_error", "error": str(exc)}

        today = timezone.now().date()
        OrgInsightSnapshot.objects.create(
            period_start=today - __import__("datetime").timedelta(days=30),
            period_end=today,
            feedback_count=total,
            avg_sentiment=round(avg_sentiment, 3),
            ai_summary=data.get("ai_summary", ""),
            recommendations=data.get("recommendations", []),
            topic_summary=dict(top_topics),
            risk_summary=risk_rates,
        )

        logger.info("OrgInsightSnapshot created for period ending %s", today)
        return {"status": "ok", "count": total}


app.register_task(ProcessFeedbackTask())
app.register_task(GenerateOrgSummaryTask())
