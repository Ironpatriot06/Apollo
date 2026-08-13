import asyncio

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from apollo.context import clear_request_id, set_request_id
from apollo.instrumentation import ApolloSQLAlchemy
from apollo.models import ExecutionEvent
from apollo.queue import EventQueue
from apollo.transport import HTTPTransport


pytest.importorskip("aiosqlite")


async def _execute_sql() -> ExecutionEvent:
    queue = EventQueue()
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    instrumentation = ApolloSQLAlchemy(engine=engine, queue=queue)

    try:
        async with engine.begin() as connection:
            await connection.execute(
                text("CREATE TABLE users (id INTEGER PRIMARY KEY)")
            )
            await connection.execute(
                text("INSERT INTO users (id) VALUES (:id)"),
                {"id": 42},
            )

        set_request_id("request-sql-123")

        async with engine.connect() as connection:
            await connection.execute(
                text("SELECT * FROM users WHERE id = :id"),
                {"id": 42},
            )

        event = await queue.get()
        queue.task_done()
        return event
    finally:
        clear_request_id()
        instrumentation.uninstall()
        await engine.dispose()


def test_sqlalchemy_instrumentation_can_be_initialized() -> None:
    queue = EventQueue()
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    instrumentation = ApolloSQLAlchemy(engine=engine, queue=queue)

    assert instrumentation.queue is queue

    instrumentation.uninstall()
    asyncio.run(engine.dispose())


def test_sqlalchemy_operation_creates_execution_event() -> None:
    event = asyncio.run(_execute_sql())

    assert isinstance(event, ExecutionEvent)
    assert event.event_id
    assert event.request_id == "request-sql-123"
    assert event.event_type == "SQL"
    assert event.duration_ms >= 0
    assert "SELECT * FROM users WHERE id =" in event.metadata["query"]


def test_sqlalchemy_event_is_placed_on_existing_queue() -> None:
    event = asyncio.run(_execute_sql())

    assert isinstance(event, ExecutionEvent)


def test_sqlalchemy_instrumentation_does_not_call_http_transport(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fail_send(self: HTTPTransport, event: ExecutionEvent) -> None:
        raise AssertionError("SQL instrumentation bypassed EventQueue")

    monkeypatch.setattr(HTTPTransport, "send", fail_send)

    event = asyncio.run(_execute_sql())

    assert event.event_type == "SQL"
