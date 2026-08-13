import asyncio
import time
import uuid
from datetime import datetime, timezone

from apollo.context import clear_request_id, set_request_id
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from apollo.models import RequestEvent
from apollo.queue import EventQueue, EventWorker
from apollo.transport import HTTPTransport


class ApolloMiddleware:
    def __init__(
        self,
        app: ASGIApp,
        queue: EventQueue | None = None,
    ) -> None:
        self.app = app
        self.queue = queue or EventQueue()
        self.worker = EventWorker(
            self.queue,
            HTTPTransport(
                "http://127.0.0.1:8001/api/v1/events",
                execution_endpoint=(
                    "http://127.0.0.1:8001/api/v1/execution-events"
                ),
            ),
        )
        self._worker_started = False
        self._worker_lock = asyncio.Lock()

    async def _ensure_worker_started(self) -> None:
        if self._worker_started:
            return

        async with self._worker_lock:
            if self._worker_started:
                return

            await self.worker.start()
            self._worker_started = True

    async def __call__(
        self,
        scope: Scope,
        receive: Receive,
        send: Send,
    ) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        await self._ensure_worker_started()

        request_id = str(uuid.uuid4())
        set_request_id(request_id)
        started_at = datetime.now(timezone.utc)
        start_time = time.perf_counter()

        status_code = 500

        async def send_wrapper(message: Message) -> None:
            nonlocal status_code

            if message["type"] == "http.response.start":
                status_code = message["status"]

            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            duration_ms = (time.perf_counter() - start_time) * 1000

            event = RequestEvent(
                request_id=request_id,
                method=scope["method"],
                path=scope["path"],
                status_code=status_code,
                started_at=started_at,
                duration_ms=duration_ms,
            )

            self.queue.put(event)
            clear_request_id()

    async def start(self) -> None:
        await self.worker.start()
        self._worker_started = True

    async def stop(self) -> None:
        await self.worker.stop()
        self._worker_started = False
