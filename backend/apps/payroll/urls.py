from django.urls import path

from .views import PayrollMeView

urlpatterns = [
    path("me/", PayrollMeView.as_view(), name="payroll-me"),
]
