import asyncio

from apollo.models import ExecutionEvent, RequestEvent

QueueEvent = RequestEvent | ExecutionEvent


class EventQueue:
    def __init__(self, max_size: int = 1000) -> None:
        self._queue: asyncio.Queue[QueueEvent] = asyncio.Queue(
            maxsize=max_size
        )

    def put(self, event: QueueEvent) -> bool:
        try:
            self._queue.put_nowait(event)
            return True
        except asyncio.QueueFull:
            return False

    async def get(self) -> QueueEvent:
        return await self._queue.get()

    def task_done(self) -> None:
        self._queue.task_done()

    def size(self) -> int:
        return self._queue.qsize()
