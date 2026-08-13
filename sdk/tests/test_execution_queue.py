import asyncio
from datetime import datetime, timezone

from apollo.models import ExecutionEvent
from apollo.queue import EventQueue


async def main() -> None:
    queue = EventQueue(max_size=2)

    event = ExecutionEvent(
        event_id="event-123",
        request_id="request-123",
        event_type="SQL",
        started_at=datetime.now(timezone.utc),
        duration_ms=2.4,
        metadata={
            "query": "SELECT 1",
        },
    )

    assert queue.put(event) is True
    assert queue.size() == 1

    retrieved = await queue.get()

    assert retrieved.event_id == "event-123"
    assert retrieved.request_id == "request-123"
    assert retrieved.event_type == "SQL"

    queue.task_done()

    print("ExecutionEvent queue OK")


asyncio.run(main())