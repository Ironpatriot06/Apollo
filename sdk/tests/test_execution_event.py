from datetime import datetime, timezone

from apollo.models import ExecutionEvent


event = ExecutionEvent(
    event_id="event-123",
    request_id="request-123",
    event_type="SQL",
    started_at=datetime.now(timezone.utc),
    duration_ms=2.4,
    metadata={
        "query": "SELECT * FROM users WHERE id = 42",
    },
)

print(event.model_dump_json())
