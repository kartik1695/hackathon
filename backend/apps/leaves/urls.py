from django.urls import path

from .views import LeaveApproveView, LeaveListCreateView, LeaveSimulateView

urlpatterns = [
    path("", LeaveListCreateView.as_view(), name="leave-list-create"),
    path("simulate/", LeaveSimulateView.as_view(), name="leave-simulate"),
    path("<int:leave_id>/approve/", LeaveApproveView.as_view(), name="leave-approve"),
]
