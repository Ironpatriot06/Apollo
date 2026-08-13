import time
import uuid
from datetime import datetime, timezone
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import httpx

from apollo.context import get_request_id
from apollo.models import ExecutionEvent
from apollo.queue import EventQueue


SENSITIVE_QUERY_KEYS = {
    "access_token",
    "api_key",
    "apikey",
    "auth",
    "authorization",
    "client_secret",
    "cookie",
    "key",
    "password",
    "secret",
    "session",
    "signature",
    "token",
}


class ApolloHTTPX:
    def __init__(self, queue: EventQueue) -> None:
        self.queue = queue

    def transport(
        self,
        wrapped: httpx.BaseTransport | None = None,
    ) -> httpx.BaseTransport:
        return ApolloHTTPXTransport(
            queue=self.queue,
            wrapped=wrapped or httpx.HTTPTransport(),
        )

    def async_transport(
        self,
        wrapped: httpx.AsyncBaseTransport | None = None,
    ) -> httpx.AsyncBaseTransport:
        return ApolloAsyncHTTPXTransport(
            queue=self.queue,
            wrapped=wrapped or httpx.AsyncHTTPTransport(),
        )

    def client(self, **kwargs: Any) -> httpx.Client:
        kwargs.setdefault("transport", self.transport())
        return httpx.Client(**kwargs)

    def async_client(self, **kwargs: Any) -> httpx.AsyncClient:
        kwargs.setdefault("transport", self.async_transport())
        return httpx.AsyncClient(**kwargs)


class ApolloHTTPXTransport(httpx.BaseTransport):
    def __init__(
        self,
        queue: EventQueue,
        wrapped: httpx.BaseTransport,
    ) -> None:
        self.queue = queue
        self.wrapped = wrapped

    def handle_request(self, request: httpx.Request) -> httpx.Response:
        started_at = datetime.now(timezone.utc)
        start_time = time.perf_counter()

        try:
            response = self.wrapped.handle_request(request)
        except Exception as exc:
            self._record_event(
                request=request,
                started_at=started_at,
                duration_ms=(time.perf_counter() - start_time) * 1000,
                status_code=None,
                error=exc,
            )
            raise

        self._record_event(
            request=request,
            started_at=started_at,
            duration_ms=(time.perf_counter() - start_time) * 1000,
            status_code=response.status_code,
            error=None,
        )
        return response

    def close(self) -> None:
        self.wrapped.close()

    def _record_event(
        self,
        request: httpx.Request,
        started_at: datetime,
        duration_ms: float,
        status_code: int | None,
        error: Exception | None,
    ) -> None:
        _record_http_out_event(
            queue=self.queue,
            request=request,
            started_at=started_at,
            duration_ms=duration_ms,
            status_code=status_code,
            error=error,
        )


class ApolloAsyncHTTPXTransport(httpx.AsyncBaseTransport):
    def __init__(
        self,
        queue: EventQueue,
        wrapped: httpx.AsyncBaseTransport,
    ) -> None:
        self.queue = queue
        self.wrapped = wrapped

    async def handle_async_request(
        self,
        request: httpx.Request,
    ) -> httpx.Response:
        started_at = datetime.now(timezone.utc)
        start_time = time.perf_counter()

        try:
            response = await self.wrapped.handle_async_request(request)
        except Exception as exc:
            self._record_event(
                request=request,
                started_at=started_at,
                duration_ms=(time.perf_counter() - start_time) * 1000,
                status_code=None,
                error=exc,
            )
            raise

        self._record_event(
            request=request,
            started_at=started_at,
            duration_ms=(time.perf_counter() - start_time) * 1000,
            status_code=response.status_code,
            error=None,
        )
        return response

    async def aclose(self) -> None:
        await self.wrapped.aclose()

    def _record_event(
        self,
        request: httpx.Request,
        started_at: datetime,
        duration_ms: float,
        status_code: int | None,
        error: Exception | None,
    ) -> None:
        _record_http_out_event(
            queue=self.queue,
            request=request,
            started_at=started_at,
            duration_ms=duration_ms,
            status_code=status_code,
            error=error,
        )


def _record_http_out_event(
    queue: EventQueue,
    request: httpx.Request,
    started_at: datetime,
    duration_ms: float,
    status_code: int | None,
    error: Exception | None,
) -> None:
    request_id = get_request_id()
    if request_id is None:
        return

    url = _safe_url(request.url)
    metadata: dict[str, Any] = {
        "method": request.method,
        "url": url,
        "status_code": status_code,
    }

    if error is not None:
        metadata["error_type"] = error.__class__.__name__
        metadata["error"] = _safe_error_message(error, request.url, url)

    queue.put(
        ExecutionEvent(
            event_id=str(uuid.uuid4()),
            request_id=request_id,
            event_type="HTTP_OUT",
            started_at=started_at,
            duration_ms=duration_ms,
            metadata=metadata,
        )
    )


def _safe_url(url: httpx.URL) -> str:
    parts = urlsplit(str(url))
    host = parts.hostname or ""

    if ":" in host and not host.startswith("["):
        host = f"[{host}]"

    if parts.port is not None:
        host = f"{host}:{parts.port}"

    query = urlencode(
        [
            (
                key,
                "REDACTED"
                if key.lower() in SENSITIVE_QUERY_KEYS
                else value,
            )
            for key, value in parse_qsl(
                parts.query,
                keep_blank_values=True,
            )
        ],
        doseq=True,
    )

    return urlunsplit(
        (
            parts.scheme,
            host,
            parts.path,
            query,
            parts.fragment,
        )
    )


def _safe_error_message(
    error: Exception,
    raw_url: httpx.URL,
    safe_url: str,
) -> str:
    return str(error).replace(str(raw_url), safe_url)[:500]
