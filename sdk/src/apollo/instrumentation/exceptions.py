import re
import traceback
import uuid
from datetime import datetime, timezone
from typing import Any

from apollo.context import get_request_id
from apollo.models import ExecutionEvent
from apollo.queue import EventQueue


SENSITIVE_MESSAGE_PATTERNS = [
    re.compile(
        r"(?i)\b(access_token|api_key|apikey|authorization|password|"
        r"secret|token)=([^&\s]+)"
    ),
    re.compile(r"(?i)\bBearer\s+[A-Za-z0-9._~+/=-]+"),
]


class ApolloExceptionInstrumentation:
    def __init__(self, queue: EventQueue) -> None:
        self.queue = queue

    def capture_exception(self, error: BaseException) -> None:
        request_id = get_request_id()
        if request_id is None:
            return

        metadata: dict[str, Any] = {
            "exception_type": error.__class__.__name__,
            "message": _safe_message(error),
        }

        frames = _safe_traceback(error)
        if frames:
            metadata["traceback"] = frames

        self.queue.put(
            ExecutionEvent(
                event_id=str(uuid.uuid4()),
                request_id=request_id,
                event_type="EXCEPTION",
                started_at=datetime.now(timezone.utc),
                duration_ms=0.0,
                metadata=metadata,
            )
        )


def _safe_message(error: BaseException) -> str:
    message = str(error)

    for pattern in SENSITIVE_MESSAGE_PATTERNS:
        message = pattern.sub(_redact_match, message)

    return message[:500]


def _redact_match(match: re.Match[str]) -> str:
    if match.group(0).lower().startswith("bearer "):
        return "Bearer REDACTED"

    return f"{match.group(1)}=REDACTED"


def _safe_traceback(error: BaseException) -> list[dict[str, Any]]:
    extracted = traceback.extract_tb(error.__traceback__)

    return [
        {
            "filename": frame.filename,
            "function": frame.name,
            "line_number": frame.lineno,
        }
        for frame in extracted[-20:]
    ]
