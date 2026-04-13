from django.urls import path

from .views import ReviewMeView

urlpatterns = [
    path("me/", ReviewMeView.as_view(), name="performance-me"),
]
