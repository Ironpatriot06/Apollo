import asyncio
from datetime import datetime, timezone

from apollo.models import RequestEvent
from apollo.queue import EventQueue, EventWorker


async def main() -> None:
    queue = EventQueue()
    worker = EventWorker(queue)

    await worker.start()

    event = RequestEvent(
        request_id="test-worker",
        method="GET",
        path="/",
        status_code=200,
        started_at=datetime.now(timezone.utc),
        duration_ms=1,
    )

    queue.put(event)

    await asyncio.sleep(0.1)

    await worker.stop()


if __name__ == "__main__":
    asyncio.run(main())
