import asyncio

import httpx
import pytest

from apollo.context import clear_request_id, set_request_id
from apollo.instrumentation import ApolloHTTPX
from apollo.models import ExecutionEvent
from apollo.queue import EventQueue
from apollo.transport import HTTPTransport


async def _get_event(queue: EventQueue) -> ExecutionEvent:
    event = await queue.get()
    queue.task_done()
    return event


def test_httpx_instrumentation_can_be_initialized() -> None:
    queue = EventQueue()
    instrumentation = ApolloHTTPX(queue=queue)

    assert instrumentation.queue is queue


def test_httpx_success_creates_http_out_execution_event() -> None:
    queue = EventQueue()
    instrumentation = ApolloHTTPX(queue=queue)

    set_request_id("request-http-out-123")
    try:
        with instrumentation.client(
            transport=instrumentation.transport(
                httpx.MockTransport(
                    lambda request: httpx.Response(200)
                )
            )
        ) as client:
            response = client.get(
                "https://example.com/users/42?token=secret&filter=active"
            )
    finally:
        clear_request_id()

    assert response.status_code == 200
    assert queue.size() == 1

    event = asyncio.run(_get_event(queue))

    assert isinstance(event, ExecutionEvent)
    assert event.event_id
    assert event.request_id == "request-http-out-123"
    assert event.event_type == "HTTP_OUT"
    assert event.duration_ms >= 0
    assert event.metadata == {
        "method": "GET",
        "url": (
            "https://example.com/users/42?"
            "token=REDACTED&filter=active"
        ),
        "status_code": 200,
    }
    assert "headers" not in event.metadata
    assert "cookies" not in event.metadata
    assert "body" not in event.metadata


def test_async_httpx_success_creates_http_out_execution_event() -> None:
    async def run_request() -> tuple[httpx.Response, ExecutionEvent]:
        queue = EventQueue()
        instrumentation = ApolloHTTPX(queue=queue)

        async def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(201)

        set_request_id("request-async-http-out-123")
        try:
            async with instrumentation.async_client(
                transport=instrumentation.async_transport(
                    httpx.MockTransport(handler)
                )
            ) as client:
                response = await client.post("https://example.com/widgets")
        finally:
            clear_request_id()

        return response, await _get_event(queue)

    response, event = asyncio.run(run_request())

    assert response.status_code == 201
    assert event.request_id == "request-async-http-out-123"
    assert event.event_type == "HTTP_OUT"
    assert event.metadata["method"] == "POST"
    assert event.metadata["url"] == "https://example.com/widgets"
    assert event.metadata["status_code"] == 201


def test_httpx_failure_creates_safe_http_out_execution_event() -> None:
    queue = EventQueue()
    instrumentation = ApolloHTTPX(queue=queue)

    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("connection failed", request=request)

    set_request_id("request-http-out-error-123")
    try:
        with instrumentation.client(
            transport=instrumentation.transport(
                httpx.MockTransport(handler)
            )
        ) as client:
            with pytest.raises(httpx.ConnectError):
                client.get("https://example.com/fail?api_key=secret")
    finally:
        clear_request_id()

    event = asyncio.run(_get_event(queue))

    assert event.request_id == "request-http-out-error-123"
    assert event.event_type == "HTTP_OUT"
    assert event.duration_ms >= 0
    assert event.metadata["method"] == "GET"
    assert event.metadata["url"] == (
        "https://example.com/fail?api_key=REDACTED"
    )
    assert event.metadata["status_code"] is None
    assert event.metadata["error_type"] == "ConnectError"
    assert event.metadata["error"] == "connection failed"


def test_httpx_instrumentation_does_not_call_http_transport(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fail_send(self: HTTPTransport, event: ExecutionEvent) -> None:
        raise AssertionError("HTTP_OUT instrumentation bypassed EventQueue")

    monkeypatch.setattr(HTTPTransport, "send", fail_send)

    queue = EventQueue()
    instrumentation = ApolloHTTPX(queue=queue)

    set_request_id("request-http-out-no-transport")
    try:
        with instrumentation.client(
            transport=instrumentation.transport(
                httpx.MockTransport(
                    lambda request: httpx.Response(204)
                )
            )
        ) as client:
            client.delete("https://example.com/widgets/42")
    finally:
        clear_request_id()

    event = asyncio.run(_get_event(queue))

    assert event.event_type == "HTTP_OUT"
