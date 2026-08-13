from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from app.schemas.events import RequestEvent


class TimelineExecutionEvent(BaseModel):
    event_id: str
    event_type: str
    started_at: datetime
    duration_ms: float
    metadata: dict[str, Any] = Field(default_factory=dict)


class RequestTimeline(BaseModel):
    request: RequestEvent
    events: list[TimelineExecutionEvent]
