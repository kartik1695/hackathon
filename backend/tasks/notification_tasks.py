import logging

from config.celery import app
from core.notifications.dispatcher import NotificationDispatcher
from core.notifications.handlers.email_handler import EmailHandler
from core.notifications.handlers.inapp_handler import InAppHandler
from core.notifications.handlers.slack_handler import SlackHandler
from core.tasks.base import BaseHRMSTask

logger = logging.getLogger("hrms")


class DispatchNotificationTask(BaseHRMSTask):
    name = "tasks.notification_tasks.dispatch_notification"

    def execute(self, channels: list[str], recipient: str, subject: str, body: str, metadata: dict | None = None):
        dispatcher = NotificationDispatcher()
        dispatcher.register(EmailHandler())
        dispatcher.register(SlackHandler())
        dispatcher.register(InAppHandler())
        results = dispatcher.dispatch(channels, recipient, subject, body, metadata or {})
        logger.info("Notification dispatch complete recipient=%s results=%s", recipient, results)
        return results


dispatch_notification = app.register_task(DispatchNotificationTask())
