import logging

from core.notifications.base import BaseNotificationHandler

logger = logging.getLogger("hrms")


class InAppHandler(BaseNotificationHandler):
    @property
    def channel_name(self) -> str:
        return "inapp"

    def send(self, recipient_email: str, subject: str, body: str, metadata: dict) -> bool:
        try:
            from apps.notifications.services import InAppNotificationService
        except Exception:
            logger.exception("InAppNotificationService not available")
            return False

        try:
            InAppNotificationService().create_notification(recipient_email, subject, body, metadata)
            logger.info("In-app notification created recipient=%s subject=%s", recipient_email, subject)
            return True
        except Exception:
            logger.exception("In-app notification failed recipient=%s subject=%s", recipient_email, subject)
            return False
