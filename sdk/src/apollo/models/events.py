from datetime import datetime

from pydantic import BaseModel, Field
from typing import Any, Literal

from pydantic import BaseModel, Field

class RequestEvent(BaseModel):
    request_id: str
    method: str
    path: str
    status_code: int
    started_at: datetime
    duration_ms: float = Field(ge=0)

ExecutionEventType = Literal[

    "HTTP_IN",

    "HTTP_OUT",

    "SQL",

    "EXCEPTION",

]

class ExecutionEvent(BaseModel):

    event_id: str

    request_id: str

    event_type: ExecutionEventType

    started_at: datetime

    duration_ms: float

    metadata: dict[str, Any] = Field(default_factory=dict)
