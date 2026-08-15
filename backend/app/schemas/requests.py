from pydantic import BaseModel

from app.schemas.events import RequestEvent


class RequestListResponse(BaseModel):
    items: list[RequestEvent]
    total: int
    limit: int
    offset: int
