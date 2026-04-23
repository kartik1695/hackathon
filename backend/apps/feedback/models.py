from django.db import models


class AnonymousFeedback(models.Model):
    SENTIMENT_POSITIVE = "positive"
    SENTIMENT_NEUTRAL = "neutral"
    SENTIMENT_NEGATIVE = "negative"
    SENTIMENT_CHOICES = [
        (SENTIMENT_POSITIVE, "Positive"),
        (SENTIMENT_NEUTRAL, "Neutral"),
        (SENTIMENT_NEGATIVE, "Negative"),
    ]

    submitted_at = models.DateTimeField(auto_now_add=True)
    processed_at = models.DateTimeField(null=True, blank=True, db_index=True)
    raw_text = models.TextField(blank=True, default="")  # wiped after AI processing
    sentiment_score = models.FloatField(null=True, blank=True)   # -1.0 to 1.0
    sentiment_label = models.CharField(max_length=20, choices=SENTIMENT_CHOICES, null=True, blank=True)
    emotions = models.JSONField(default=dict)   # {frustration, anxiety, satisfaction, neutral} → 0-1
    topics = models.JSONField(default=list)     # ["workload", "management", ...]
    risk_flags = models.JSONField(default=dict) # {burnout, attrition, morale_decline, toxic_culture} → bool
    confidence = models.FloatField(null=True, blank=True)        # 0-1
    is_processed = models.BooleanField(default=False, db_index=True)

    class Meta:
        ordering = ["-submitted_at"]

    def __str__(self):
        return f"Feedback #{self.id} ({self.submitted_at.date()}) processed={self.is_processed}"


class OrgInsightSnapshot(models.Model):
    """Periodic AI-generated org-wide summary (no raw data)."""
    period_start = models.DateField()
    period_end = models.DateField()
    feedback_count = models.IntegerField(default=0)
    avg_sentiment = models.FloatField(null=True, blank=True)
    ai_summary = models.TextField(blank=True, default="")
    recommendations = models.JSONField(default=list)
    topic_summary = models.JSONField(default=dict)
    risk_summary = models.JSONField(default=dict)
    generated_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-period_end"]

    def __str__(self):
        return f"OrgInsight {self.period_start}–{self.period_end} ({self.feedback_count} submissions)"
