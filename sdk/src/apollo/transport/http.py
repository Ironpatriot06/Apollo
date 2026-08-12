import httpx

from apollo.models import RequestEvent

from .base import EventTransport


class HTTPTransport(EventTransport):
    def __init__(self, endpoint: str) -> None:
        self.endpoint = endpoint

    async def send(self, event: RequestEvent) -> None:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                self.endpoint,
                json=event.model_dump(mode="json"),
            )

            response.raise_for_status()
