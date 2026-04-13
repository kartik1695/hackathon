import logging

from .base import BaseNotificationHandler

logger = logging.getLogger("hrms")


class NotificationDispatcher:
    def __init__(self):
        self._handlers: list[BaseNotificationHandler] = []

    def register(self, handler: BaseNotificationHandler) -> None:
        self._handlers.append(handler)

    def dispatch(self, channels: list[str], recipient: str, subject: str, body: str, metadata: dict | None = None):
        results: dict[str, bool] = {}
        payload = metadata or {}
        for handler in self._handlers:
            if handler.channel_name in channels:
                try:
                    results[handler.channel_name] = handler.send(recipient, subject, body, payload)
                except Exception:
                    logger.exception("Notification handler failed channel=%s recipient=%s", handler.channel_name, recipient)
                    results[handler.channel_name] = False
        return results
