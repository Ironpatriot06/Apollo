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


async def _seed_timeline(
    client: httpx.AsyncClient,
) -> dict[str, Any]:
    started_at = datetime(2026, 1, 1, tzinfo=timezone.utc)
    request_id = "request-timeline-123"

    request = {
        "request_id": request_id,
        "method": "GET",
        "path": "/users/42",
        "status_code": 200,
        "started_at": started_at.isoformat(),
        "duration_ms": 12.4,
    }
    await client.post("/api/v1/events", json=request)

    events = [
        {
            "event_id": "event-http-out",
            "request_id": request_id,
            "event_type": "HTTP_OUT",
            "started_at": (started_at + timedelta(milliseconds=3)).isoformat(),
            "duration_ms": 0.41,
            "metadata": {
                "method": "GET",
                "url": "https://example.com/profile",
                "status_code": 200,
            },
        },
        {
            "event_id": "event-sql",
            "request_id": request_id,
            "event_type": "SQL",
            "started_at": (started_at + timedelta(milliseconds=1)).isoformat(),
            "duration_ms": 0.31,
            "metadata": {
                "query": "SELECT id, name FROM users WHERE id = :user_id",
            },
        },
        {
            "event_id": "event-exception",
            "request_id": request_id,
            "event_type": "EXCEPTION",
            "started_at": (started_at + timedelta(milliseconds=2)).isoformat(),
            "duration_ms": 0.0,
            "metadata": {
                "exception_type": "ValueError",
                "message": "boom",
            },
        },
        {
            "event_id": "event-other-request",
            "request_id": "request-other-123",
            "event_type": "SQL",
            "started_at": started_at.isoformat(),
            "duration_ms": 0.2,
            "metadata": {
                "query": "SELECT should_not_appear",
            },
        },
    ]

    for event in events:
        await client.post("/api/v1/execution-events", json=event)

    return request


async def _test_existing_request_can_be_retrieved_with_timeline() -> None:
    async for client in _with_test_client():
        request = await _seed_timeline(client)

        response = await client.get(
            f"/api/v1/events/{request['request_id']}/timeline"
        )

        assert response.status_code == 200
        body = response.json()
        assert body["request"]["request_id"] == request["request_id"]
        assert body["request"]["method"] == "GET"
        assert body["request"]["path"] == "/users/42"
        assert body["request"]["status_code"] == 200
        assert body["request"]["duration_ms"] == 12.4

        events = body["events"]
        assert [event["event_id"] for event in events] == [
            "event-sql",
            "event-exception",
            "event-http-out",
        ]
        assert [event["event_type"] for event in events] == [
            "SQL",
            "EXCEPTION",
            "HTTP_OUT",
        ]
        assert all(
            event["event_id"] != "event-other-request"
            for event in events
        )
        assert events[0]["metadata"] == {
            "query": "SELECT id, name FROM users WHERE id = :user_id",
        }
        assert events[2]["metadata"] == {
            "method": "GET",
            "url": "https://example.com/profile",
            "status_code": 200,
        }


async def _test_missing_request_id_returns_404() -> None:
    async for client in _with_test_client():
        response = await client.get(
            "/api/v1/events/request-missing/timeline"
        )

        assert response.status_code == 404


async def _test_existing_request_endpoint_still_works() -> None:
    async for client in _with_test_client():
        request = await _seed_timeline(client)

        response = await client.get(
            f"/api/v1/events/{request['request_id']}"
        )

        assert response.status_code == 200
        body = response.json()
        assert body["request_id"] == request["request_id"]
        assert body["method"] == "GET"
        assert body["path"] == "/users/42"


def test_existing_request_can_be_retrieved_with_timeline() -> None:
    asyncio.run(_test_existing_request_can_be_retrieved_with_timeline())


def test_missing_request_id_returns_404() -> None:
    asyncio.run(_test_missing_request_id_returns_404())


def test_existing_request_endpoint_still_works() -> None:
    asyncio.run(_test_existing_request_endpoint_still_works())
