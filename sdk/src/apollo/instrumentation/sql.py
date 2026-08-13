import time
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import event
from sqlalchemy.engine import Engine
from sqlalchemy.ext.asyncio import AsyncEngine

from apollo.context import get_request_id
from apollo.models import ExecutionEvent
from apollo.queue import EventQueue


class ApolloSQLAlchemy:
    def __init__(
        self,
        engine: Engine | AsyncEngine,
        queue: EventQueue,
    ) -> None:
        self.engine = engine
        self.queue = queue
        self._target = (
            engine.sync_engine
            if isinstance(engine, AsyncEngine)
            else engine
        )
        self._installed = False

        self.install()

    def install(self) -> None:
        if self._installed:
            return

        event.listen(
            self._target,
            "before_cursor_execute",
            self._before_cursor_execute,
        )
        event.listen(
            self._target,
            "after_cursor_execute",
            self._after_cursor_execute,
        )
        self._installed = True

    def uninstall(self) -> None:
        if not self._installed:
            return

        event.remove(
            self._target,
            "before_cursor_execute",
            self._before_cursor_execute,
        )
        event.remove(
            self._target,
            "after_cursor_execute",
            self._after_cursor_execute,
        )
        self._installed = False

    def _before_cursor_execute(
        self,
        conn: Any,
        cursor: Any,
        statement: str,
        parameters: Any,
        context: Any,
        executemany: bool,
    ) -> None:
        context._apollo_started_at = datetime.now(timezone.utc)
        context._apollo_start_time = time.perf_counter()

    def _after_cursor_execute(
        self,
        conn: Any,
        cursor: Any,
        statement: str,
        parameters: Any,
        context: Any,
        executemany: bool,
    ) -> None:
        request_id = get_request_id()
        if request_id is None:
            return

        started_at = getattr(
            context,
            "_apollo_started_at",
            datetime.now(timezone.utc),
        )
        start_time = getattr(context, "_apollo_start_time", None)
        duration_ms = (
            (time.perf_counter() - start_time) * 1000
            if start_time is not None
            else 0.0
        )

        self.queue.put(
            ExecutionEvent(
                event_id=str(uuid.uuid4()),
                request_id=request_id,
                event_type="SQL",
                started_at=started_at,
                duration_ms=duration_ms,
                metadata={"query": statement},
            )
        )
