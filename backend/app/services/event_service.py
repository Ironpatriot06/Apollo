from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ExecutionEvent
from app.models import Request
from app.schemas.events import RequestEvent
from app.schemas.execution_events import ExecutionEvent as ExecutionEventSchema


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