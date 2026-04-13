from rest_framework import serializers

from .models import InAppNotification


class InAppNotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = InAppNotification
        fields = ("id", "recipient_email", "subject", "body", "metadata", "read", "created_at")
