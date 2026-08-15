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


async def _seed_requests(
    client: httpx.AsyncClient,
) -> list[dict[str, Any]]:
    started_at = datetime(2026, 1, 1, tzinfo=timezone.utc)
    requests = [
        {
            "request_id": "request-oldest",
            "method": "GET",
            "path": "/users/1",
            "status_code": 200,
            "started_at": started_at.isoformat(),
            "duration_ms": 11.0,
        },
        {
            "request_id": "request-middle",
            "method": "POST",
            "path": "/users",
            "status_code": 201,
            "started_at": (started_at + timedelta(seconds=1)).isoformat(),
            "duration_ms": 12.0,
        },
        {
            "request_id": "request-error",
            "method": "GET",
            "path": "/users/2",
            "status_code": 500,
            "started_at": (started_at + timedelta(seconds=2)).isoformat(),
            "duration_ms": 13.0,
        },
        {
            "request_id": "request-newest",
            "method": "GET",
            "path": "/users/1",
            "status_code": 200,
            "started_at": (started_at + timedelta(seconds=3)).isoformat(),
            "duration_ms": 14.0,
        },
    ]

    for request in requests:
        response = await client.post("/api/v1/events", json=request)
        assert response.status_code == 202

    return requests


async def _test_returns_requests_newest_first() -> None:
    async for client in _with_test_client():
        await _seed_requests(client)

        response = await client.get("/api/v1/requests")

        assert response.status_code == 200
        body = response.json()
        assert body["total"] == 4
        assert body["limit"] == 20
        assert body["offset"] == 0
        assert [item["request_id"] for item in body["items"]] == [
            "request-newest",
            "request-error",
            "request-middle",
            "request-oldest",
        ]


async def _test_limit_offset_and_total() -> None:
    async for client in _with_test_client():
        await _seed_requests(client)

        response = await client.get("/api/v1/requests?limit=2&offset=1")

        assert response.status_code == 200
        body = response.json()
        assert body["total"] == 4
        assert body["limit"] == 2
        assert body["offset"] == 1
        assert [item["request_id"] for item in body["items"]] == [
            "request-error",
            "request-middle",
        ]


async def _test_filters() -> None:
    async for client in _with_test_client():
        await _seed_requests(client)

        status_response = await client.get(
            "/api/v1/requests?status_code=500"
        )
        assert status_response.status_code == 200
        status_body = status_response.json()
        assert status_body["total"] == 1
        assert [item["request_id"] for item in status_body["items"]] == [
            "request-error"
        ]

        path_response = await client.get(
            "/api/v1/requests?path=/users/1"
        )
        assert path_response.status_code == 200
        path_body = path_response.json()
        assert path_body["total"] == 2
        assert [item["request_id"] for item in path_body["items"]] == [
            "request-newest",
            "request-oldest",
        ]

        method_response = await client.get("/api/v1/requests?method=POST")
        assert method_response.status_code == 200
        method_body = method_response.json()
        assert method_body["total"] == 1
        assert [item["request_id"] for item in method_body["items"]] == [
            "request-middle"
        ]

        combined_response = await client.get(
            "/api/v1/requests?method=GET&path=/users/1&status_code=200"
        )
        assert combined_response.status_code == 200
        combined_body = combined_response.json()
        assert combined_body["total"] == 2
        assert [item["request_id"] for item in combined_body["items"]] == [
            "request-newest",
            "request-oldest",
        ]


async def _test_empty_result() -> None:
    async for client in _with_test_client():
        await _seed_requests(client)

        response = await client.get("/api/v1/requests?path=/missing")

        assert response.status_code == 200
        body = response.json()
        assert body["items"] == []
        assert body["total"] == 0
        assert body["limit"] == 20
        assert body["offset"] == 0


async def _test_existing_timeline_endpoint_still_works() -> None:
    async for client in _with_test_client():
        started_at = datetime(2026, 1, 1, tzinfo=timezone.utc)
        request = {
            "request_id": "request-with-timeline",
            "method": "GET",
            "path": "/users/42",
            "status_code": 200,
            "started_at": started_at.isoformat(),
            "duration_ms": 12.4,
        }
        execution_event = {
            "event_id": "event-sql-for-list-test",
            "request_id": "request-with-timeline",
            "event_type": "SQL",
            "started_at": started_at.isoformat(),
            "duration_ms": 0.31,
            "metadata": {"query": "SELECT 1"},
        }

        await client.post("/api/v1/events", json=request)
        await client.post("/api/v1/execution-events", json=execution_event)

        response = await client.get(
            "/api/v1/events/request-with-timeline/timeline"
        )

        assert response.status_code == 200
        body = response.json()
        assert body["request"]["request_id"] == "request-with-timeline"
        assert body["events"][0]["event_id"] == "event-sql-for-list-test"


def test_returns_requests_newest_first() -> None:
    asyncio.run(_test_returns_requests_newest_first())


def test_limit_offset_and_total() -> None:
    asyncio.run(_test_limit_offset_and_total())


def test_filters() -> None:
    asyncio.run(_test_filters())


def test_empty_result() -> None:
    asyncio.run(_test_empty_result())


def test_existing_timeline_endpoint_still_works() -> None:
    asyncio.run(_test_existing_timeline_endpoint_still_works())
