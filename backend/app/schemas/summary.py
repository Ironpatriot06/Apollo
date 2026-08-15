from pydantic import BaseModel

from app.schemas.events import RequestEvent


class EventCounts(BaseModel):
    HTTP_IN: int = 0
    HTTP_OUT: int = 0
    SQL: int = 0
    EXCEPTION: int = 0


class RequestSummary(BaseModel):
    request: RequestEvent
    total_events: int
    event_counts: EventCounts
    total_execution_duration_ms: float
    has_error: bool
