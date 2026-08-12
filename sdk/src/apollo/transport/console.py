from apollo.models import RequestEvent

from .base import EventTransport


class ConsoleTransport(EventTransport):
    async def send(self, event: RequestEvent) -> None:
        print(f"[Apollo Transport] {event.model_dump_json()}")
