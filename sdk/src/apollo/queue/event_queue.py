import asyncio

from apollo.models import RequestEvent


class EventQueue:
    def __init__(self, max_size: int = 1000) -> None:
        self._queue: asyncio.Queue[RequestEvent] = asyncio.Queue(
            maxsize=max_size
        )

    def put(self, event: RequestEvent) -> bool:
        try:
            self._queue.put_nowait(event)
            return True
        except asyncio.QueueFull:
            return False

    async def get(self) -> RequestEvent:
        return await self._queue.get()

    def task_done(self) -> None:
        self._queue.task_done()

    def size(self) -> int:
        return self._queue.qsize()
