import asyncio
from datetime import datetime, timezone
from uuid import uuid4

from apollo.models import ExecutionEvent
from apollo.transport import HTTPTransport


async def main() -> None:
    transport = HTTPTransport(
        "http://127.0.0.1:8001/api/v1/execution-events"
    )

    event = ExecutionEvent(
        event_id=str(uuid4()),
        request_id=str(uuid4()),
        event_type="SQL",
        started_at=datetime.now(timezone.utc),
        duration_ms=2.4,
        metadata={
            "query": "SELECT 1",
        },
    )

    await transport.send(event)


if __name__ == "__main__":
    asyncio.run(main())
