# Apollo

Apollo is a Python observability SDK and backend designed to monitor application execution and correlate events within individual requests.

The long-term goal is to make Apollo capable of answering:

> **What happened inside my application when something went wrong?**

Apollo captures application activity in the background and associates internal execution events with the HTTP request that triggered them.

---

## Current Status

### Implemented

- HTTP request instrumentation
- Request ID generation and propagation
- Asynchronous event queue
- Background event worker
- Pluggable event transports
- HTTP transport to Apollo Backend
- PostgreSQL persistent storage
- SQLAlchemy async database support
- Execution event model
- Automatic SQLAlchemy query instrumentation
- Request → SQL event correlation
- FastAPI integration example
- Automated SDK tests

### Currently Captured

| Event | Status |
|---|---|
| HTTP Request | ✅ |
| SQL Query | ✅ |
| External HTTP Request | 🚧 |
| Exception | 🚧 |
| Background Jobs | 🚧 |
| Frontend Events | 🚧 |
| AI-powered Analysis | 🚧 |

---

# Architecture

```text
                    Application
                         │
                         ▼
                ┌─────────────────┐
                │ ApolloMiddleware│
                └────────┬────────┘
                         │
                    request_id
                         │
              ┌──────────┴──────────┐
              │                     │
              ▼                     ▼
        RequestEvent          SQLAlchemy
              │                     │
              │               SQL Instrumentation
              │                     │
              │               ExecutionEvent
              │                     │
              └──────────┬──────────┘
                         ▼
                    EventQueue
                         │
                         ▼
                    EventWorker
                         │
                         ▼
                   EventTransport
                         │
                         ▼
                   HTTPTransport
                         │
                         ▼
                Apollo Backend
                         │
                         ▼
                    PostgreSQL
```

The important design principle is that all events use the same asynchronous event pipeline.

Instrumentation does **not** communicate directly with the backend.

---

# Request Correlation

Every HTTP request receives a unique `request_id`.

For example:

```text
Request ID: d70a755f-e78e-4837-be1f-44d273c58371

HTTP
└── GET /users/42
    └── 200

SQL
└── SELECT id, name FROM users WHERE id = ?
```

Both events contain the same request ID.

This allows Apollo to reconstruct what happened inside an individual request.

---

# SDK

The SDK is located in:

```text
sdk/
├── src/
│   └── apollo/
│       ├── context/
│       ├── instrumentation/
│       ├── middleware/
│       ├── models/
│       ├── queue/
│       └── transport/
└── tests/
```

## Request Middleware

`ApolloMiddleware`:

- generates a request ID
- records request start time
- captures HTTP method and path
- captures response status code
- measures request duration
- creates a `RequestEvent`
- places the event into the shared `EventQueue`

---

# Context Propagation

Apollo uses Python `ContextVar` to propagate the current request ID.

```text
HTTP Request
     │
     ▼
set_request_id()
     │
     ▼
Application execution
     │
     ├── SQLAlchemy
     │
     ├── External HTTP
     │
     └── Exception
     │
     ▼
get_request_id()
```

This allows events generated deep inside an application's execution stack to remain associated with the original request.

---

# Event Queue

The SDK uses an asynchronous queue so application instrumentation does not need to wait for backend network requests.

```text
Application
    │
    ▼
EventQueue
    │
    ▼
EventWorker
    │
    ▼
Transport
```

This separates event generation from event delivery.

---

# Event Worker

The `EventWorker` runs in the background and continuously processes events from the queue.

Its responsibilities are:

1. Retrieve an event.
2. Send it through the configured transport.
3. Mark the event as processed.
4. Prevent event delivery from blocking the application request path.

---

# Transports

Apollo uses a transport abstraction:

```text
EventTransport
     │
     ├── ConsoleTransport
     │
     └── HTTPTransport
```

### ConsoleTransport

Used during development and testing.

```text
[Apollo Transport] {...}
```

### HTTPTransport

Sends events to the Apollo backend.

Request events are sent to:

```text
POST /api/v1/events
```

Execution events are sent to:

```text
POST /api/v1/execution-events
```

---

# SQLAlchemy Instrumentation

Apollo can automatically instrument SQLAlchemy engines.

The instrumentation uses SQLAlchemy's official:

```text
before_cursor_execute
after_cursor_execute
```

events.

Example:

```python
ApolloSQLAlchemy(
    engine=engine,
    queue=queue,
)
```

When the application executes:

```python
await session.execute(
    text("SELECT * FROM users WHERE id = :id"),
    {"id": 42},
)
```

Apollo generates an execution event:

```json
{
  "event_type": "SQL",
  "request_id": "...",
  "duration_ms": 0.48,
  "metadata": {
    "query": "SELECT * FROM users WHERE id = ?"
  }
}
```

Bound parameter values are intentionally not captured.

---

# Backend

The backend is located in:

```text
backend/
├── app/
│   ├── db/
│   ├── models/
│   ├── schemas/
│   ├── services/
│   └── main.py
└── tests/
```

The backend is built with:

- FastAPI
- SQLAlchemy
- PostgreSQL
- asyncpg

---

# Database

PostgreSQL runs through Docker Compose.

Current tables:

```text
requests
execution_events
```

### requests

Stores top-level HTTP request information.

```text
id
request_id
method
path
status_code
started_at
duration_ms
```

### execution_events

Stores internal execution events.

```text
id
event_id
request_id
event_type
started_at
duration_ms
metadata
```

The `request_id` connects execution events to their parent request.

---

# Example

A real FastAPI request:

```text
GET /users/42
```

can produce:

```text
RequestEvent
├── request_id: abc123
├── method: GET
├── path: /users/42
├── status: 200
└── duration: 2.1ms

ExecutionEvent
├── request_id: abc123
├── event_type: SQL
├── duration: 0.48ms
└── query: SELECT id, name FROM users WHERE id = ?
```

The shared request ID allows Apollo to associate these events.

---

# Running Apollo Locally

## 1. Start PostgreSQL

From the repository root:

```bash
docker compose up -d postgres
```

Check:

```bash
docker compose ps
```

---

## 2. Start Apollo Backend

```bash
cd backend
uv run uvicorn app.main:app --reload --port 8001
```

Backend:

```text
http://127.0.0.1:8001
```

Health check:

```bash
curl http://127.0.0.1:8001/health
```

Expected:

```json
{
  "status": "ok"
}
```

---

## 3. Run the FastAPI Demo

```bash
cd examples/fastapi-demo
uv run uvicorn app.main:app --reload --port 8000
```

Then:

```bash
curl http://127.0.0.1:8000/users/42
```

Expected:

```json
{
  "user_id": 42,
  "name": "Ratish"
}
```

The request will automatically generate:

```text
RequestEvent
+
SQL ExecutionEvent
```

---

# Inspecting PostgreSQL

Open PostgreSQL:

```bash
docker exec -it apollo-postgres psql -U apollo -d apollo
```

Inspect requests:

```sql
SELECT request_id, method, path, status_code
FROM requests
ORDER BY started_at DESC
LIMIT 5;
```

Inspect execution events:

```sql
SELECT request_id, event_type, duration_ms, metadata
FROM execution_events
ORDER BY started_at DESC
LIMIT 5;
```

A request and its SQL event should have the same `request_id`.

---

# Testing

Run the SDK tests:

```bash
cd sdk
uv run pytest tests -q
```

SQLAlchemy instrumentation can also be tested independently:

```bash
uv run pytest tests/test_sqlalchemy_instrumentation.py -q
```

The current implementation has tests covering:

- SQLAlchemy instrumentation initialization
- SQL execution event generation
- request ID propagation
- event queue integration
- transport isolation
- execution event handling

---

# Design Principles

Apollo is being built around several principles:

### 1. Non-blocking instrumentation

Application execution should not wait for Apollo's backend.

```text
Application
    │
    ├── normal execution
    │
    └── event → queue
                 │
                 └── background worker
```

### 2. Correlation

Every internal event should be traceable back to the request that caused it.

### 3. Pluggable transports

Instrumentation should not know how events are delivered.

```text
Instrumentation
      ↓
EventQueue
      ↓
EventWorker
      ↓
EventTransport
```

### 4. Modular instrumentation

Different event types should be independently instrumented:

```text
HTTP
SQL
HTTP_OUT
EXCEPTION
BACKGROUND_JOB
...
```

### 5. Privacy by default

Sensitive information such as SQL bound parameter values should not be captured by default.

---

# Roadmap

The planned architecture will progressively expand from basic request monitoring into full execution tracing.

```text
Phase 1
└── SDK foundation

Phase 2
└── Event pipeline
    ├── Queue
    ├── Worker
    └── Transport

Phase 3
└── Backend persistence
    ├── FastAPI
    ├── PostgreSQL
    └── SQLAlchemy

Phase 4
└── Automatic instrumentation
    ├── HTTP
    ├── SQL
    ├── External HTTP
    └── Exceptions

Phase 5
└── Execution correlation
    ├── Request timelines
    ├── Event relationships
    └── Failure reconstruction

Phase 6
└── Analysis layer
    ├── Error detection
    ├── Root-cause analysis
    └── AI-assisted explanations

Phase 7
└── Developer interface
    ├── Dashboard
    ├── Request traces
    └── Debugging insights
```

The roadmap may evolve as the system is developed.

---

# Current Milestone

Apollo currently supports:

```text
FastAPI Request
      ↓
Request ID
      ↓
SQLAlchemy Query
      ↓
ExecutionEvent
      ↓
Shared Event Queue
      ↓
Background Worker
      ↓
HTTP Transport
      ↓
Apollo Backend
      ↓
PostgreSQL
```

This establishes the foundation required for Apollo to eventually move from **observability** toward **automated debugging and root-cause analysis**.
