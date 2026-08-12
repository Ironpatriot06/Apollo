from abc import ABC, abstractmethod

from apollo.models import RequestEvent


class EventTransport(ABC):
    @abstractmethod
    async def send(self, event: RequestEvent) -> None:
        """Send an Apollo event to its destination."""
        raise NotImplementedError
