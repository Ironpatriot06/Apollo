import asyncio

from apollo.queue.event_queue import EventQueue
from apollo.transport import EventTransport


class EventWorker:
    def __init__(
        self,
        queue: EventQueue,
        transport: EventTransport,
    ) -> None:
        self.queue = queue
        self.transport = transport
        self._task: asyncio.Task[None] | None = None
        self._running = False

    async def start(self) -> None:
        if self._running:
            return

        self._running = True
        self._task = asyncio.create_task(self._run())

    async def stop(self) -> None:
        if not self._running:
            return

        self._running = False

        if self._task:
            self._task.cancel()

            try:
                await self._task
            except asyncio.CancelledError:
                pass

            self._task = None

    async def _run(self) -> None:
        while self._running:
            event = await self.queue.get()

            try:
                await self.transport.send(event)
            except Exception as exc:
                print(f"[Apollo Worker] Transport error: {exc}")
            finally:
                self.queue.task_done()
