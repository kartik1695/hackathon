from django.urls import path
from . import views

urlpatterns = [
    path("submit/", views.FeedbackSubmitView.as_view(), name="feedback-submit"),
    path("insights/", views.OrgInsightsView.as_view(), name="feedback-insights"),
    path("generate-summary/", views.GenerateOrgSummaryView.as_view(), name="feedback-generate-summary"),
]
