from abc import ABC, abstractmethod

from apollo.models import ExecutionEvent, RequestEvent


TransportEvent = RequestEvent | ExecutionEvent


class EventTransport(ABC):
    @abstractmethod
    async def send(self, event: TransportEvent) -> None:
        """Send an Apollo event to its destination."""
        raise NotImplementedErrory

