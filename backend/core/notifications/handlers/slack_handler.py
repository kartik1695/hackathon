import json
import logging
import os
import urllib.request

from core.notifications.base import BaseNotificationHandler

logger = logging.getLogger("hrms")


class SlackHandler(BaseNotificationHandler):
    @property
    def channel_name(self) -> str:
        return "slack"

    def send(self, recipient_email: str, subject: str, body: str, metadata: dict) -> bool:
        webhook = os.environ.get("SLACK_WEBHOOK_URL")
        if not webhook:
            logger.info("Slack webhook not configured; skipping")
            return False
        payload = {"text": f"*{subject}*\n{body}"}
        try:
            req = urllib.request.Request(
                webhook,
                data=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                ok = 200 <= resp.status < 300
                logger.info("Slack send status=%s ok=%s", resp.status, ok)
                return ok
        except Exception:
            logger.exception("Slack send failed")
            return False
