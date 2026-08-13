import httpx

from apollo.models import ExecutionEvent

from .base import EventTransport, TransportEvent


class HTTPTransport(EventTransport):
    def __init__(
        self,
        endpoint: str,
        execution_endpoint: str | None = None,
    ) -> None:
        self.endpoint = endpoint
        self.execution_endpoint = execution_endpoint

    async def send(self, event: TransportEvent) -> None:
        endpoint = self._endpoint_for(event)

        async with httpx.AsyncClient() as client:
            response = await client.post(
                endpoint,
                json=event.model_dump(mode="json"),
            )

            response.raise_for_status()

    def _endpoint_for(self, event: TransportEvent) -> str:
        if isinstance(event, ExecutionEvent) and self.execution_endpoint:
            return self.execution_endpoint

        return self.endpoint
