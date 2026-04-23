import logging
from datetime import timedelta

from django.db.models import Avg, Count
from django.db.models.functions import TruncDate
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.authentication import JWTAuthentication

from core.permissions import IsEmployee, IsManager

from .models import AnonymousFeedback, OrgInsightSnapshot

logger = logging.getLogger("hrms")

MIN_FEEDBACK_THRESHOLD = 5


class FeedbackSubmitView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsEmployee]

    def post(self, request):
        text = (request.data.get("text") or "").strip()
        if len(text) < 10:
            return Response({"error": "Feedback too short (min 10 chars)", "code": "TOO_SHORT"}, status=400)
        if len(text) > 2000:
            return Response({"error": "Feedback too long (max 2000 chars)", "code": "TOO_LONG"}, status=400)

        fb = AnonymousFeedback.objects.create(raw_text=text)

        try:
            from tasks.feedback_tasks import ProcessFeedbackTask
            ProcessFeedbackTask().apply_async(args=[fb.id], countdown=2)
        except Exception:
            logger.exception("Failed to queue feedback processing task for id=%s", fb.id)

        return Response({
            "status": "submitted",
            "message": "Your feedback has been received anonymously and will shape org-wide insights.",
        })


class OrgInsightsView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsManager]

    def get(self, request):
        days = min(int(request.query_params.get("days", 30)), 90)
        since = timezone.now() - timedelta(days=days)

        qs = AnonymousFeedback.objects.filter(is_processed=True, processed_at__gte=since)
        total = qs.count()

        if total < MIN_FEEDBACK_THRESHOLD:
            return Response({
                "insufficient_data": True,
                "count": total,
                "threshold": MIN_FEEDBACK_THRESHOLD,
            })

        # Overall sentiment
        overall = qs.aggregate(avg=Avg("sentiment_score"))["avg"] or 0.0
        avg_confidence = qs.aggregate(c=Avg("confidence"))["c"] or 0.0

        # Sentiment distribution
        sentiment_dist = list(
            qs.values("sentiment_label").annotate(count=Count("id"))
        )

        # Daily trend
        daily_trend = list(
            qs.annotate(date=TruncDate("processed_at"))
            .values("date")
            .annotate(avg_sentiment=Avg("sentiment_score"), count=Count("id"))
            .order_by("date")
        )
        for row in daily_trend:
            row["date"] = row["date"].isoformat()
            row["avg_sentiment"] = round(row["avg_sentiment"] or 0, 3)

        # Emotions aggregation (avg across all feedback)
        all_emotions = list(qs.values_list("emotions", flat=True))
        emotion_keys = ["frustration", "anxiety", "satisfaction", "neutral"]
        emotion_agg = {}
        for k in emotion_keys:
            vals = [e.get(k, 0) for e in all_emotions if isinstance(e, dict)]
            emotion_agg[k] = round(sum(vals) / len(vals), 3) if vals else 0.0

        # Topic frequency
        topic_counts: dict[str, int] = {}
        for topics in qs.values_list("topics", flat=True):
            if isinstance(topics, list):
                for t in topics:
                    topic_counts[t] = topic_counts.get(t, 0) + 1
        top_topics = [
            {"topic": t, "count": c}
            for t, c in sorted(topic_counts.items(), key=lambda x: -x[1])[:8]
        ]

        # Risk rates (% of submissions with flag)
        risk_keys = ["burnout", "attrition", "morale_decline", "toxic_culture"]
        risk_counts = {k: 0 for k in risk_keys}
        for flags in qs.values_list("risk_flags", flat=True):
            if isinstance(flags, dict):
                for k in risk_keys:
                    if flags.get(k):
                        risk_counts[k] += 1
        risk_rates = {k: round(risk_counts[k] / total * 100, 1) for k in risk_keys}

        # Weekly trends (last 4 weeks)
        weekly_trends = []
        for i in range(3, -1, -1):
            w_end = timezone.now() - timedelta(weeks=i)
            w_start = w_end - timedelta(weeks=1)
            w_qs = AnonymousFeedback.objects.filter(
                is_processed=True, processed_at__range=(w_start, w_end)
            )
            w_total = w_qs.count()
            w_topics: dict[str, int] = {}
            for topics in w_qs.values_list("topics", flat=True):
                if isinstance(topics, list):
                    for t in topics:
                        w_topics[t] = w_topics.get(t, 0) + 1
            weekly_trends.append({
                "week": w_start.strftime("%b %d"),
                "total": w_total,
                "avg_sentiment": round(
                    w_qs.aggregate(a=Avg("sentiment_score"))["a"] or 0, 3
                ),
                "top_topics": sorted(w_topics.items(), key=lambda x: -x[1])[:3],
            })

        # Latest AI summary snapshot
        snapshot = OrgInsightSnapshot.objects.first()
        latest_summary = None
        if snapshot:
            latest_summary = {
                "ai_summary": snapshot.ai_summary,
                "recommendations": snapshot.recommendations,
                "generated_at": snapshot.generated_at.isoformat(),
                "period": f"{snapshot.period_start} to {snapshot.period_end}",
                "feedback_count": snapshot.feedback_count,
            }

        return Response({
            "insufficient_data": False,
            "total": total,
            "days": days,
            "overall_sentiment": round(overall, 3),
            "avg_confidence": round(avg_confidence, 3),
            "sentiment_dist": sentiment_dist,
            "daily_trend": daily_trend,
            "emotions": emotion_agg,
            "top_topics": top_topics,
            "risk_rates": risk_rates,
            "weekly_trends": weekly_trends,
            "latest_summary": latest_summary,
        })


class GenerateOrgSummaryView(APIView):
    """HR/admin triggered: generate fresh AI narrative snapshot."""
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsManager]

    def post(self, request):
        try:
            from tasks.feedback_tasks import GenerateOrgSummaryTask
            GenerateOrgSummaryTask().apply_async()
        except Exception:
            logger.exception("Failed to queue GenerateOrgSummaryTask")
            return Response({"error": "Failed to queue", "code": "QUEUE_ERROR"}, status=500)
        return Response({"status": "queued", "message": "AI org summary generation started."})
