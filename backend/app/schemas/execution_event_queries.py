from pydantic import BaseModel

from app.schemas.execution_events import ExecutionEvent


class ExecutionEventListResponse(BaseModel):
    items: list[ExecutionEvent]
    total: int
    limit: int
    offset: int
