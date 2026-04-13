from abc import ABC, abstractmethod


class BaseNotificationHandler(ABC):
    @abstractmethod
    def send(self, recipient_email: str, subject: str, body: str, metadata: dict) -> bool:
        raise NotImplementedError

    @property
    @abstractmethod
    def channel_name(self) -> str:
        raise NotImplementedError
