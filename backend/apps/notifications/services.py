import logging

from .models import InAppNotification

logger = logging.getLogger("hrms")


class InAppNotificationService:
    def create_notification(self, recipient_email: str, subject: str, body: str, metadata: dict) -> InAppNotification:
        notification = InAppNotification.objects.create(
            recipient_email=recipient_email, subject=subject, body=body, metadata=metadata or {}
        )
        logger.info("In-app notification saved id=%s recipient=%s", notification.id, recipient_email)
        return notification
