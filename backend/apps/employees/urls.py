from django.urls import path

from .views import EmployeeDetailView, EmployeeListCreateView, MeView, TeamStatusView
from .report_views import (
    OrgStatsView,
    AttendanceAnomalyReportView,
    BurnoutRiskReportView,
    AttritionRiskReportView,
    EmployeeReportView,
    DeptHealthReportView,
    LeaveUtilisationTrendView,
    PayrollSummaryView,
    AIInsightsView,
    SkillSalaryAnalysisView,
)

urlpatterns = [
    path("",                          EmployeeListCreateView.as_view(),       name="employee-list-create"),
    path("me/",                       MeView.as_view(),                       name="employee-me"),
    path("team-status/",              TeamStatusView.as_view(),               name="employee-team-status"),
    path("reports/org-stats/",        OrgStatsView.as_view(),                 name="report-org-stats"),
    path("reports/attendance-anomalies/", AttendanceAnomalyReportView.as_view(), name="report-attendance-anomalies"),
    path("reports/burnout/",          BurnoutRiskReportView.as_view(),        name="report-burnout"),
    path("reports/attrition/",        AttritionRiskReportView.as_view(),      name="report-attrition"),
    path("reports/dept-health/",      DeptHealthReportView.as_view(),         name="report-dept-health"),
    path("reports/leave-trend/",      LeaveUtilisationTrendView.as_view(),    name="report-leave-trend"),
    path("reports/payroll-summary/",  PayrollSummaryView.as_view(),           name="report-payroll-summary"),
    path("reports/ai-insights/",      AIInsightsView.as_view(),               name="report-ai-insights"),
    path("reports/skill-salary/",     SkillSalaryAnalysisView.as_view(),      name="report-skill-salary"),
    path("reports/<int:pk>/",         EmployeeReportView.as_view(),           name="report-employee"),
    path("<int:pk>/",                 EmployeeDetailView.as_view(),           name="employee-detail"),
]
