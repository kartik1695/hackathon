from django.urls import path

from .views import PolicyIngestView

urlpatterns = [
    path("policy/ingest/", PolicyIngestView.as_view(), name="policy-ingest"),
]

