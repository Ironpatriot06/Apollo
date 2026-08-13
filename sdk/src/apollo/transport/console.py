from apollo.transport.base import EventTransport, TransportEvent


class ConsoleTransport(EventTransport):
    async def send(self, event: TransportEvent) -> None:
        print(f"[Apollo Transport] {event.model_dump_json()}")