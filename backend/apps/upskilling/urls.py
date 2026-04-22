from django.urls import path
from . import views

urlpatterns = [
    path("roadmaps/", views.RoadmapListView.as_view(), name="roadmap-list"),
    path("roadmaps/<int:pk>/", views.RoadmapDetailView.as_view(), name="roadmap-detail"),
    path("roadmaps/<int:pk>/approve/", views.RoadmapApproveView.as_view(), name="roadmap-approve"),
    path("roadmaps/<int:pk>/reject/", views.RoadmapRejectView.as_view(), name="roadmap-reject"),
    path("roadmaps/pending/", views.PendingRoadmapApprovalsView.as_view(), name="roadmap-pending"),
    path("team/roadmaps/", views.TeamRoadmapsView.as_view(), name="team-roadmaps"),
    path("steps/<int:pk>/submit/", views.StepSubmitView.as_view(), name="step-submit"),
    path("steps/<int:pk>/approve/", views.StepApproveView.as_view(), name="step-approve"),
    path("steps/<int:pk>/reject/", views.StepRejectView.as_view(), name="step-reject"),
]
