from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.init_db import init_db
from app.db.session import get_db
from app.schemas.events import RequestEvent
from app.schemas.execution_events import ExecutionEvent
from app.schemas.requests import RequestListResponse
from app.schemas.timeline import RequestTimeline
from app.services.event_service import (
    get_request_event,
    get_request_timeline,
    list_requests,
    save_execution_event,
    save_request_event,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(
    title="Apollo Backend",
    lifespan=lifespan,
)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/v1/events", status_code=status.HTTP_202_ACCEPTED)
async def ingest_event(
    event: RequestEvent,
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    await save_request_event(db, event)

    return {"status": "accepted"}


@app.post(
    "/api/v1/execution-events",
    status_code=status.HTTP_202_ACCEPTED,
)
async def ingest_execution_event(
    event: ExecutionEvent,
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    await save_execution_event(db, event)

    return {"status": "accepted"}


@app.get("/api/v1/requests", response_model=RequestListResponse)
async def get_requests(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    status_code: int | None = None,
    path: str | None = None,
    method: str | None = None,
    db: AsyncSession = Depends(get_db),
) -> RequestListResponse:
    return await list_requests(
        db=db,
        limit=limit,
        offset=offset,
        status_code=status_code,
        path=path,
        method=method,
    )


@app.get(
    "/api/v1/events/{request_id}/timeline",
    response_model=RequestTimeline,
)
async def get_event_timeline(
    request_id: str,
    db: AsyncSession = Depends(get_db),
) -> RequestTimeline:
    timeline = await get_request_timeline(db, request_id)

    if timeline is None:
        raise HTTPException(
            status_code=404,
            detail="Event not found",
        )

    return timeline


@app.get("/api/v1/events/{request_id}")
async def get_event(
    request_id: str,
    db: AsyncSession = Depends(get_db),
) -> dict:
    request = await get_request_event(db, request_id)

    if request is None:
        raise HTTPException(
            status_code=404,
            detail="Event not found",
        )

    return {
        "request_id": request.request_id,
        "method": request.method,
        "path": request.path,
        "status_code": request.status_code,
        "started_at": request.started_at,
        "duration_ms": request.duration_ms,
    }
