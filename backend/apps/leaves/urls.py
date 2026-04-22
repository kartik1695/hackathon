from django.urls import path

from .views import (
    CompOffApproveView,
    CompOffListCreateView,
    CompOffPendingView,
    CompOffRejectView,
    LeaveApplyOnBehalfView,
    LeaveApproveView,
    LeaveBalanceView,
    LeaveCancelView,
    LeaveDetailView,
    LeaveListCreateView,
    LeavePendingApprovalsView,
    LeaveRejectView,
    LeaveRenotifyView,
    LeaveSimulateView,
    LeaveTeamAllView,
    LeaveTeamCalendarView,
    LeaveTypesView,
)

urlpatterns = [
    # Employee leave management
    path("", LeaveListCreateView.as_view(), name="leave-list-create"),
    path("balance/", LeaveBalanceView.as_view(), name="leave-balance"),
    path("types/", LeaveTypesView.as_view(), name="leave-types"),
    path("simulate/", LeaveSimulateView.as_view(), name="leave-simulate"),
    path("<int:leave_id>/", LeaveDetailView.as_view(), name="leave-detail"),
    path("<int:leave_id>/approve/", LeaveApproveView.as_view(), name="leave-approve"),
    path("<int:leave_id>/reject/", LeaveRejectView.as_view(), name="leave-reject"),
    path("<int:leave_id>/cancel/", LeaveCancelView.as_view(), name="leave-cancel"),
    path("<int:leave_id>/renotify/", LeaveRenotifyView.as_view(), name="leave-renotify"),

    # Manager views
    path("pending/", LeavePendingApprovalsView.as_view(), name="leave-pending-approvals"),
    path("team/", LeaveTeamCalendarView.as_view(), name="leave-team-calendar"),
    path("team/all/", LeaveTeamAllView.as_view(), name="leave-team-all"),
    path("on-behalf/<int:employee_id>/", LeaveApplyOnBehalfView.as_view(), name="leave-apply-on-behalf"),

    # Comp Off
    path("comp-off/", CompOffListCreateView.as_view(), name="comp-off-list-create"),
    path("comp-off/pending/", CompOffPendingView.as_view(), name="comp-off-pending"),
    path("comp-off/<int:comp_off_id>/approve/", CompOffApproveView.as_view(), name="comp-off-approve"),
    path("comp-off/<int:comp_off_id>/reject/", CompOffRejectView.as_view(), name="comp-off-reject"),
]
