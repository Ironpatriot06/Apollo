import asyncio
from datetime import datetime, timezone

from apollo.models import RequestEvent
from apollo.transport import HTTPTransport


async def main() -> None:
    transport = HTTPTransport(
        "http://127.0.0.1:8001/api/v1/events"
    )

    event = RequestEvent(
        request_id="http-transport-test",
        method="GET",
        path="/test",
        status_code=200,
        started_at=datetime.now(timezone.utc),
        duration_ms=3.5,
    )

    await transport.send(event)


if __name__ == "__main__":
    asyncio.run(main())
