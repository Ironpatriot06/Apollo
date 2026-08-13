import asyncio
from typing import Any

import pytest

from apollo.context import clear_request_id, set_request_id
from apollo.instrumentation import ApolloExceptionInstrumentation
from apollo.middleware import ApolloMiddleware
from apollo.models import ExecutionEvent, RequestEvent
from apollo.queue import EventQueue
from apollo.transport import HTTPTransport


async def _get_event(queue: EventQueue) -> RequestEvent | ExecutionEvent:
    event = await queue.get()
    queue.task_done()
    return event


def test_exception_instrumentation_can_be_initialized() -> None:
    queue = EventQueue()
    instrumentation = ApolloExceptionInstrumentation(queue=queue)

    assert instrumentation.queue is queue


def test_exception_capture_creates_execution_event() -> None:
    queue = EventQueue()
    instrumentation = ApolloExceptionInstrumentation(queue=queue)

    set_request_id("request-exception-123")
    try:
        try:
            raise ValueError("bad token=secret")
        except ValueError as exc:
            instrumentation.capture_exception(exc)
    finally:
        clear_request_id()

    event = asyncio.run(_get_event(queue))

    assert isinstance(event, ExecutionEvent)
    assert event.event_id
    assert event.request_id == "request-exception-123"
    assert event.event_type == "EXCEPTION"
    assert event.metadata["exception_type"] == "ValueError"
    assert event.metadata["message"] == "bad token=REDACTED"
    assert "traceback" in event.metadata


def test_exception_instrumentation_does_not_call_http_transport(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fail_send(self: HTTPTransport, event: ExecutionEvent) -> None:
        raise AssertionError("EXCEPTION instrumentation bypassed EventQueue")

    monkeypatch.setattr(HTTPTransport, "send", fail_send)

    queue = EventQueue()
    instrumentation = ApolloExceptionInstrumentation(queue=queue)

    set_request_id("request-exception-no-transport")
    try:
        try:
            raise RuntimeError("boom")
        except RuntimeError as exc:
            instrumentation.capture_exception(exc)
    finally:
        clear_request_id()

    event = asyncio.run(_get_event(queue))

    assert isinstance(event, ExecutionEvent)
    assert event.event_type == "EXCEPTION"


def test_middleware_captures_exception_and_reraises() -> None:
    async def app(
        scope: dict[str, Any],
        receive: Any,
        send: Any,
    ) -> None:
        raise RuntimeError("request failed")

    async def run_request() -> tuple[ExecutionEvent, RequestEvent]:
        queue = EventQueue()
        middleware = ApolloMiddleware(app, queue=queue)

        async def skip_worker_start() -> None:
            return None

        middleware._ensure_worker_started = skip_worker_start

        scope = {
            "type": "http",
            "method": "GET",
            "path": "/explode",
        }

        async def receive() -> dict[str, Any]:
            return {"type": "http.request", "body": b"", "more_body": False}

        async def send(message: dict[str, Any]) -> None:
            return None

        with pytest.raises(RuntimeError, match="request failed"):
            await middleware(scope, receive, send)

        exception_event = await _get_event(queue)
        request_event = await _get_event(queue)

        assert isinstance(exception_event, ExecutionEvent)
        assert isinstance(request_event, RequestEvent)
        return exception_event, request_event

    exception_event, request_event = asyncio.run(run_request())

    assert exception_event.event_type == "EXCEPTION"
    assert exception_event.request_id == request_event.request_id
    assert exception_event.metadata["exception_type"] == "RuntimeError"
    assert exception_event.metadata["message"] == "request failed"
    assert request_event.status_code == 500
