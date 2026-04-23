from django.urls import path
from . import views

urlpatterns = [
    path("roadmaps/", views.RoadmapListView.as_view(), name="roadmap-list"),
    path("roadmaps/pending/", views.PendingRoadmapApprovalsView.as_view(), name="roadmap-pending"),
    path("roadmaps/<int:pk>/", views.RoadmapDetailView.as_view(), name="roadmap-detail"),
    path("roadmaps/<int:pk>/approve/", views.RoadmapApproveView.as_view(), name="roadmap-approve"),
    path("roadmaps/<int:pk>/reject/", views.RoadmapRejectView.as_view(), name="roadmap-reject"),
    path("roadmaps/<int:pk>/copy/", views.CopyRoadmapView.as_view(), name="roadmap-copy"),
    path("team/roadmaps/", views.TeamRoadmapsView.as_view(), name="team-roadmaps"),
    path("steps/<int:pk>/submit/", views.StepSubmitView.as_view(), name="step-submit"),
    path("steps/<int:pk>/approve/", views.StepApproveView.as_view(), name="step-approve"),
    path("steps/<int:pk>/reject/", views.StepRejectView.as_view(), name="step-reject"),
    path("org-insights/", views.OrgLearningInsightsView.as_view(), name="org-learning-insights"),
    path("dept-peers/", views.DeptPeersRoadmapsView.as_view(), name="dept-peers"),
    path("drafts/", views.DraftRoadmapListView.as_view(), name="roadmap-drafts"),
    path("drafts/<int:pk>/confirm/", views.DraftRoadmapConfirmView.as_view(), name="roadmap-draft-confirm"),
]
