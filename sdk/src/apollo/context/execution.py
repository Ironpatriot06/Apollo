from contextvars import ContextVar


request_id_context: ContextVar[str | None] = ContextVar(
    "apollo_request_id",
    default=None,
)


def set_request_id(request_id: str) -> None:
    request_id_context.set(request_id)


def get_request_id() -> str | None:
    return request_id_context.get()


def clear_request_id() -> None:
    request_id_context.set(None)
