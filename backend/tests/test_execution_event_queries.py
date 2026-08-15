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


async def _seed_execution_events(client: httpx.AsyncClient) -> None:
    started_at = datetime(2026, 1, 1, tzinfo=timezone.utc)
    events = [
        {
            "event_id": "event-oldest-sql",
            "request_id": "request-a",
            "event_type": "SQL",
            "started_at": started_at.isoformat(),
            "duration_ms": 0.1,
            "metadata": {"query": "SELECT 1"},
        },
        {
            "event_id": "event-middle-http",
            "request_id": "request-a",
            "event_type": "HTTP_OUT",
            "started_at": (started_at + timedelta(seconds=1)).isoformat(),
            "duration_ms": 0.2,
            "metadata": {"method": "GET", "url": "https://example.com"},
        },
        {
            "event_id": "event-newest-sql",
            "request_id": "request-b",
            "event_type": "SQL",
            "started_at": (started_at + timedelta(seconds=2)).isoformat(),
            "duration_ms": 0.3,
            "metadata": {"query": "SELECT 2"},
        },
        {
            "event_id": "event-newest-exception",
            "request_id": "request-b",
            "event_type": "EXCEPTION",
            "started_at": (started_at + timedelta(seconds=3)).isoformat(),
            "duration_ms": 0.0,
            "metadata": {"exception_type": "RuntimeError"},
        },
    ]

    for event in events:
        response = await client.post("/api/v1/execution-events", json=event)
        assert response.status_code == 202


async def _test_execution_event_listing_ordering_and_pagination() -> None:
    async for client in _with_test_client():
        await _seed_execution_events(client)

        response = await client.get(
            "/api/v1/execution-events?limit=2&offset=1"
        )

        assert response.status_code == 200
        body = response.json()
        assert body["total"] == 4
        assert body["limit"] == 2
        assert body["offset"] == 1
        assert [item["event_id"] for item in body["items"]] == [
            "event-newest-sql",
            "event-middle-http",
        ]


async def _test_execution_event_filters_and_metadata() -> None:
    async for client in _with_test_client():
        await _seed_execution_events(client)

        sql_response = await client.get(
            "/api/v1/execution-events?event_type=SQL"
        )
        assert sql_response.status_code == 200
        sql_body = sql_response.json()
        assert sql_body["total"] == 2
        assert [item["event_id"] for item in sql_body["items"]] == [
            "event-newest-sql",
            "event-oldest-sql",
        ]
        assert sql_body["items"][0]["metadata"] == {"query": "SELECT 2"}

        request_response = await client.get(
            "/api/v1/execution-events?request_id=request-a"
        )
        assert request_response.status_code == 200
        request_body = request_response.json()
        assert request_body["total"] == 2
        assert [item["event_id"] for item in request_body["items"]] == [
            "event-middle-http",
            "event-oldest-sql",
        ]
        assert all(
            item["request_id"] == "request-a"
            for item in request_body["items"]
        )

        combined_response = await client.get(
            "/api/v1/execution-events?request_id=request-b&event_type=SQL"
        )
        assert combined_response.status_code == 200
        combined_body = combined_response.json()
        assert combined_body["total"] == 1
        assert combined_body["items"][0]["event_id"] == "event-newest-sql"


async def _test_execution_event_empty_result() -> None:
    async for client in _with_test_client():
        await _seed_execution_events(client)

        response = await client.get(
            "/api/v1/execution-events?request_id=request-missing"
        )

        assert response.status_code == 200
        body = response.json()
        assert body["items"] == []
        assert body["total"] == 0
        assert body["limit"] == 20
        assert body["offset"] == 0


def test_execution_event_listing_ordering_and_pagination() -> None:
    asyncio.run(_test_execution_event_listing_ordering_and_pagination())


def test_execution_event_filters_and_metadata() -> None:
    asyncio.run(_test_execution_event_filters_and_metadata())


def test_execution_event_empty_result() -> None:
    asyncio.run(_test_execution_event_empty_result())
