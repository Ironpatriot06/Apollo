from datetime import datetime

from pydantic import BaseModel, Field


class RequestEvent(BaseModel):
    request_id: str
    method: str
    path: str
    status_code: int
    started_at: datetime
    duration_ms: float = Field(ge=0)
