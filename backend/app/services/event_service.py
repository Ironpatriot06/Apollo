from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ExecutionEvent
from app.models import Request
from app.schemas.events import RequestEvent
from app.schemas.execution_events import ExecutionEvent as ExecutionEventSchema
from app.schemas.requests import RequestListResponse
from app.schemas.timeline import RequestTimeline, TimelineExecutionEvent


async def save_request_event(
    db: AsyncSession,
    event: RequestEvent,
) -> Request:
    request = Request(
        request_id=event.request_id,
        method=event.method,
        path=event.path,
        status_code=event.status_code,
        started_at=event.started_at,
        duration_ms=event.duration_ms,
    )

    db.add(request)
    await db.commit()
    await db.refresh(request)

    return request

async def get_request_event(

    db: AsyncSession,

    request_id: str,

) -> Request | None:

    result = await db.execute(

        select(Request).where(Request.request_id == request_id)

    )

    return result.scalar_one_or_none()

async def save_execution_event(
    db: AsyncSession,
    event: ExecutionEventSchema,
) -> ExecutionEvent:
    execution_event = ExecutionEvent(
        event_id=event.event_id,
        request_id=event.request_id,
        event_type=event.event_type,
        started_at=event.started_at,
        duration_ms=event.duration_ms,
        event_metadata=event.metadata,
    )

    db.add(execution_event)
    await db.commit()
    await db.refresh(execution_event)

    return execution_event


async def get_request_execution_events(
    db: AsyncSession,
    request_id: str,
) -> list[ExecutionEvent]:
    result = await db.execute(
        select(ExecutionEvent)
        .where(ExecutionEvent.request_id == request_id)
        .order_by(ExecutionEvent.started_at.asc())
    )

    return list(result.scalars().all())


async def get_request_timeline(
    db: AsyncSession,
    request_id: str,
) -> RequestTimeline | None:
    request = await get_request_event(db, request_id)

    if request is None:
        return None

    execution_events = await get_request_execution_events(db, request_id)

    return RequestTimeline(
        request=RequestEvent(
            request_id=request.request_id,
            method=request.method,
            path=request.path,
            status_code=request.status_code,
            started_at=request.started_at,
            duration_ms=request.duration_ms,
        ),
        events=[
            TimelineExecutionEvent(
                event_id=event.event_id,
                event_type=event.event_type,
                started_at=event.started_at,
                duration_ms=event.duration_ms,
                metadata=event.event_metadata,
            )
            for event in execution_events
        ],
    )


async def list_requests(
    db: AsyncSession,
    limit: int,
    offset: int,
    status_code: int | None = None,
    path: str | None = None,
    method: str | None = None,
) -> RequestListResponse:
    filters = []

    if status_code is not None:
        filters.append(Request.status_code == status_code)

    if path is not None:
        filters.append(Request.path == path)

    if method is not None:
        filters.append(Request.method == method)

    total_result = await db.execute(
        select(func.count()).select_from(Request).where(*filters)
    )
    total = total_result.scalar_one()

    requests_result = await db.execute(
        select(Request)
        .where(*filters)
        .order_by(
		Request.started_at.desc(),
		Request.id.desc(),
	)
        .limit(limit)
        .offset(offset)
    )
    requests = requests_result.scalars().all()

    return RequestListResponse(
        items=[
            RequestEvent(
                request_id=request.request_id,
                method=request.method,
                path=request.path,
                status_code=request.status_code,
                started_at=request.started_at,
                duration_ms=request.duration_ms,
            )
            for request in requests
        ],
        total=total,
        limit=limit,
        offset=offset,
    )
