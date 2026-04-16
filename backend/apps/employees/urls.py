from django.urls import path

from .views import EmployeeDetailView, EmployeeListCreateView, MeView

urlpatterns = [
    path("",          EmployeeListCreateView.as_view(), name="employee-list-create"),
    path("me/",       MeView.as_view(),                 name="employee-me"),
    path("<int:pk>/", EmployeeDetailView.as_view(),     name="employee-detail"),
]
