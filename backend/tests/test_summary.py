import asyncio
from collections.abc import AsyncGenerator
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
import pytest
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.main import app, get_db


async def _with_test_client() -> AsyncGenerator[httpx.AsyncClient, None]:
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    session_maker = async_sessionmaker(
        bind=engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
        async with session_maker() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(
        transport=transport,
        base_url="http://testserver",
    ) as client:
        try:
            yield client
        finally:
            app.dependency_overrides.clear()
            await engine.dispose()


async def _create_request(
    client: httpx.AsyncClient,
    request_id: str,
    status_code: int = 200,
) -> dict[str, Any]:
    request = {
        "request_id": request_id,
        "method": "GET",
        "path": "/users/42",
        "status_code": status_code,
        "started_at": datetime(
            2026,
            1,
            1,
            tzinfo=timezone.utc,
        ).isoformat(),
        "duration_ms": 47.78,
    }

    response = await client.post("/api/v1/events", json=request)
    assert response.status_code == 202
    return request


async def _create_execution_event(
    client: httpx.AsyncClient,
    event_id: str,
    request_id: str,
    event_type: str,
    duration_ms: float,
    started_offset_ms: int = 0,
) -> None:
    started_at = datetime(2026, 1, 1, tzinfo=timezone.utc) + timedelta(
        milliseconds=started_offset_ms
    )
    event = {
        "event_id": event_id,
        "request_id": request_id,
        "event_type": event_type,
        "started_at": started_at.isoformat(),
        "duration_ms": duration_ms,
        "metadata": {"source": event_type},
    }

    response = await client.post("/api/v1/execution-events", json=event)
    assert response.status_code == 202


async def _test_normal_request_summary() -> None:
    async for client in _with_test_client():
        await _create_request(client, "request-summary-123")
        await _create_execution_event(
            client,
            "event-sql",
            "request-summary-123",
            "SQL",
            0.31,
            started_offset_ms=1,
        )
        await _create_execution_event(
            client,
            "event-http-out",
            "request-summary-123",
            "HTTP_OUT",
            0.48,
            started_offset_ms=2,
        )
        await _create_execution_event(
            client,
            "event-other-request",
            "request-other-123",
            "EXCEPTION",
            99.0,
            started_offset_ms=3,
        )

        response = await client.get(
            "/api/v1/events/request-summary-123/summary"
        )

        assert response.status_code == 200
        body = response.json()
        assert body["request"]["request_id"] == "request-summary-123"
        assert body["request"]["status_code"] == 200
        assert body["total_events"] == 2
        assert body["event_counts"] == {
            "HTTP_IN": 0,
            "HTTP_OUT": 1,
            "SQL": 1,
            "EXCEPTION": 0,
        }
        assert body["total_execution_duration_ms"] == pytest.approx(0.79)
        assert body["has_error"] is False


async def _test_summary_has_error_for_500_request() -> None:
    async for client in _with_test_client():
        await _create_request(
            client,
            "request-summary-500",
            status_code=500,
        )

        response = await client.get(
            "/api/v1/events/request-summary-500/summary"
        )

        assert response.status_code == 200
        body = response.json()
        assert body["total_events"] == 0
        assert body["event_counts"] == {
            "HTTP_IN": 0,
            "HTTP_OUT": 0,
            "SQL": 0,
            "EXCEPTION": 0,
        }
        assert body["total_execution_duration_ms"] == 0
        assert body["has_error"] is True


async def _test_summary_has_error_for_exception_event() -> None:
    async for client in _with_test_client():
        await _create_request(client, "request-summary-exception")
        await _create_execution_event(
            client,
            "event-exception",
            "request-summary-exception",
            "EXCEPTION",
            0.0,
        )

        response = await client.get(
            "/api/v1/events/request-summary-exception/summary"
        )

        assert response.status_code == 200
        body = response.json()
        assert body["event_counts"]["EXCEPTION"] == 1
        assert body["has_error"] is True


async def _test_missing_request_returns_404() -> None:
    async for client in _with_test_client():
        response = await client.get(
            "/api/v1/events/request-missing/summary"
        )

        assert response.status_code == 404
        assert response.json()["detail"] == "Event not found"


async def _test_existing_timeline_endpoint_still_works() -> None:
    async for client in _with_test_client():
        await _create_request(client, "request-summary-timeline")
        await _create_execution_event(
            client,
            "event-sql-timeline",
            "request-summary-timeline",
            "SQL",
            0.31,
        )

        response = await client.get(
            "/api/v1/events/request-summary-timeline/timeline"
        )

        assert response.status_code == 200
        body = response.json()
        assert body["request"]["request_id"] == "request-summary-timeline"
        assert body["events"][0]["event_id"] == "event-sql-timeline"


def test_normal_request_summary() -> None:
    asyncio.run(_test_normal_request_summary())


def test_summary_has_error_for_500_request() -> None:
    asyncio.run(_test_summary_has_error_for_500_request())


def test_summary_has_error_for_exception_event() -> None:
    asyncio.run(_test_summary_has_error_for_exception_event())


def test_missing_request_returns_404() -> None:
    asyncio.run(_test_missing_request_returns_404())


def test_existing_timeline_endpoint_still_works() -> None:
    asyncio.run(_test_existing_timeline_endpoint_still_works())
