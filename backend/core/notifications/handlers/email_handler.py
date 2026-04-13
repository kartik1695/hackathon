import logging

from django.conf import settings
from django.core.mail import send_mail

from core.notifications.base import BaseNotificationHandler

logger = logging.getLogger("hrms")


class EmailHandler(BaseNotificationHandler):
    @property
    def channel_name(self) -> str:
        return "email"

    def send(self, recipient_email: str, subject: str, body: str, metadata: dict) -> bool:
        try:
            send_mail(
                subject=subject,
                message=body,
                from_email=getattr(settings, "DEFAULT_FROM_EMAIL", None) or getattr(settings, "EMAIL_HOST_USER", None),
                recipient_list=[recipient_email],
                fail_silently=False,
            )
            logger.info("Email sent recipient=%s subject=%s", recipient_email, subject)
            return True
        except Exception:
            logger.exception("Email send failed recipient=%s subject=%s", recipient_email, subject)
            return False
