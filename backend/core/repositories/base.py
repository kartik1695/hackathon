from abc import ABC, abstractmethod
from typing import Generic, Optional, TypeVar

T = TypeVar("T")


class BaseReadRepository(ABC, Generic[T]):
    @abstractmethod
    def get_by_id(self, id: int) -> Optional[T]:
        raise NotImplementedError

    @abstractmethod
    def list(self, **filters) -> list[T]:
        raise NotImplementedError


class BaseWriteRepository(ABC, Generic[T]):
    @abstractmethod
    def create(self, **kwargs) -> T:
        raise NotImplementedError

    @abstractmethod
    def update(self, instance: T, **kwargs) -> T:
        raise NotImplementedError

    @abstractmethod
    def delete(self, instance: T) -> None:
        raise NotImplementedError
