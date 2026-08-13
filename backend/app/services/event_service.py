from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models import Request
from app.schemas.events import RequestEvent


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
