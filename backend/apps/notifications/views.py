from rest_framework.response import Response
from rest_framework.views import APIView

from core.permissions import IsEmployee

from .models import InAppNotification
from .serializers import InAppNotificationSerializer


class NotificationListView(APIView):
    permission_classes = [IsEmployee]
    serializer_class = InAppNotificationSerializer

    def get(self, request):
        qs = InAppNotification.objects.filter(recipient_email=request.user.email).order_by("-created_at")[:100]
        return Response(InAppNotificationSerializer(qs, many=True).data)
