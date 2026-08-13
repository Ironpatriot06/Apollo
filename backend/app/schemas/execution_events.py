from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class ExecutionEvent(BaseModel):
    event_id: str = Field(min_length=1, max_length=36)
    request_id: str = Field(min_length=1, max_length=36)
    event_type: str = Field(min_length=1, max_length=50)
    started_at: datetime
    duration_ms: float
    metadata: dict[str, Any] = Field(default_factory=dict)
