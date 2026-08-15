import asyncio
from collections.abc import AsyncGenerator
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
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


async def _seed_requests(client: httpx.AsyncClient) -> None:
    started_at = datetime(2026, 1, 1, tzinfo=timezone.utc)
    requests = [
        {
            "request_id": "request-fast-ok",
            "method": "GET",
            "path": "/fast",
            "status_code": 200,
            "started_at": started_at.isoformat(),
            "duration_ms": 5.0,
        },
        {
            "request_id": "request-slow-ok",
            "method": "GET",
            "path": "/slow",
            "status_code": 200,
            "started_at": (started_at + timedelta(seconds=1)).isoformat(),
            "duration_ms": 50.0,
        },
        {
            "request_id": "request-slow-error",
            "method": "GET",
            "path": "/slow-error",
            "status_code": 500,
            "started_at": (started_at + timedelta(seconds=2)).isoformat(),
            "duration_ms": 70.0,
        },
        {
            "request_id": "request-client-error",
            "method": "POST",
            "path": "/bad-request",
            "status_code": 404,
            "started_at": (started_at + timedelta(seconds=3)).isoformat(),
            "duration_ms": 10.0,
        },
        {
            "request_id": "request-exception-newest",
            "method": "GET",
            "path": "/explode",
            "status_code": 500,
            "started_at": (started_at + timedelta(seconds=4)).isoformat(),
            "duration_ms": 30.0,
        },
    ]

    for request in requests:
        response = await client.post("/api/v1/events", json=request)
        assert response.status_code == 202

    execution_events = [
        {
            "event_id": "event-exception-one",
            "request_id": "request-slow-error",
            "event_type": "EXCEPTION",
            "started_at": (started_at + timedelta(seconds=2)).isoformat(),
            "duration_ms": 0.0,
            "metadata": {"message": "boom"},
        },
        {
            "event_id": "event-exception-two",
            "request_id": "request-slow-error",
            "event_type": "EXCEPTION",
            "started_at": (
                started_at + timedelta(seconds=2, milliseconds=1)
            ).isoformat(),
            "duration_ms": 0.0,
            "metadata": {"message": "boom again"},
        },
        {
            "event_id": "event-exception-newest",
            "request_id": "request-exception-newest",
            "event_type": "EXCEPTION",
            "started_at": (started_at + timedelta(seconds=4)).isoformat(),
            "duration_ms": 0.0,
            "metadata": {"message": "newest boom"},
        },
        {
            "event_id": "event-other-sql",
            "request_id": "request-fast-ok",
            "event_type": "SQL",
            "started_at": started_at.isoformat(),
            "duration_ms": 0.1,
            "metadata": {"query": "SELECT 1"},
        },
    ]

    for event in execution_events:
        response = await client.post("/api/v1/execution-events", json=event)
        assert response.status_code == 202


async def _test_slow_requests() -> None:
    async for client in _with_test_client():
        await _seed_requests(client)

        response = await client.get(
            "/api/v1/requests/slow?threshold_ms=30&limit=2&offset=1"
        )

        assert response.status_code == 200
        body = response.json()
        assert body["total"] == 3
        assert body["limit"] == 2
        assert body["offset"] == 1
        assert [item["request_id"] for item in body["items"]] == [
            "request-slow-error",
            "request-slow-ok",
        ]


async def _test_failed_requests() -> None:
    async for client in _with_test_client():
        await _seed_requests(client)

        response = await client.get("/api/v1/requests/errors?limit=2")

        assert response.status_code == 200
        body = response.json()
        assert body["total"] == 3
        assert body["limit"] == 2
        assert body["offset"] == 0
        assert [item["request_id"] for item in body["items"]] == [
            "request-exception-newest",
            "request-client-error",
        ]


async def _test_requests_with_exceptions() -> None:
    async for client in _with_test_client():
        await _seed_requests(client)

        response = await client.get("/api/v1/requests/exceptions")

        assert response.status_code == 200
        body = response.json()
        assert body["total"] == 2
        assert [item["request_id"] for item in body["items"]] == [
            "request-exception-newest",
            "request-slow-error",
        ]


async def _test_request_query_empty_results() -> None:
    async for client in _with_test_client():
        await _seed_requests(client)

        slow_response = await client.get(
            "/api/v1/requests/slow?threshold_ms=999"
        )
        assert slow_response.status_code == 200
        assert slow_response.json()["items"] == []
        assert slow_response.json()["total"] == 0


def test_slow_requests() -> None:
    asyncio.run(_test_slow_requests())


def test_failed_requests() -> None:
    asyncio.run(_test_failed_requests())


def test_requests_with_exceptions() -> None:
    asyncio.run(_test_requests_with_exceptions())


def test_request_query_empty_results() -> None:
    asyncio.run(_test_request_query_empty_results())
