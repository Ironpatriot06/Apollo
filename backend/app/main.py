from fastapi import FastAPI, status

from app.schemas.events import RequestEvent

app = FastAPI(title="Apollo Backend")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/v1/events", status_code=status.HTTP_202_ACCEPTED)
async def ingest_event(event: RequestEvent) -> dict[str, str]:
    print(f"[Apollo Backend] Received event: {event.model_dump_json()}")

    return {"status": "accepted"}
