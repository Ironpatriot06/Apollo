import asyncio
from datetime import datetime, timezone

from apollo.models import RequestEvent
from apollo.transport import ConsoleTransport


async def main() -> None:
    transport = ConsoleTransport()

    event = RequestEvent(
        request_id="test-transport",
        method="GET",
        path="/hello",
        status_code=200,
        started_at=datetime.now(timezone.utc),
        duration_ms=2.5,
    )

    await transport.send(event)


if __name__ == "__main__":
    asyncio.run(main())
