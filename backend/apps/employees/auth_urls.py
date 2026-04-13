from django.urls import path
from rest_framework.throttling import AnonRateThrottle
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView


class AuthRateThrottle(AnonRateThrottle):
    rate = "10/minute"
    scope = "auth"


class RateLimitedTokenObtainView(TokenObtainPairView):
    throttle_classes = [AuthRateThrottle]


class RateLimitedTokenRefreshView(TokenRefreshView):
    throttle_classes = [AuthRateThrottle]


urlpatterns = [
    path("token/", RateLimitedTokenObtainView.as_view(), name="token_obtain_pair"),
    path("token/refresh/", RateLimitedTokenRefreshView.as_view(), name="token_refresh"),
]
