# 🔭 Apollo

### Application Observability & Debugging Platform

Apollo is a developer-focused observability platform for understanding **what happened during an application request**.

Instead of treating logs, SQL queries, HTTP calls, and exceptions as isolated records, Apollo correlates execution events to their parent request and reconstructs the request lifecycle into a single investigation surface.

The goal is simple:

> **When a request fails or becomes slow, Apollo should make it obvious what happened and why.**

---

## ✨ What Apollo Does

Apollo currently provides:

- 📥 HTTP request ingestion
- 🔗 Request-to-execution-event correlation
- 🗄️ SQL execution tracking
- 🌐 Outbound HTTP tracking
- ❌ Exception tracking
- 🧵 Request execution timelines
- 📊 Request summaries
- 🔎 Request filtering and pagination
- 🐌 Slow-request detection
- 🚨 Failed-request detection
- 💥 Exception-based request detection
- 🖥️ Web-based observability console
- 🧪 Backend, SDK, and frontend automated testing
- 🔄 Regression-safe development through a growing test suite

---

# 🏗️ Architecture

Apollo is currently divided into three major components:

```text
┌──────────────────────────────────────────────────────────┐
│                     Apollo Console                       │
│                  Next.js + TypeScript                    │
│                                                          │
│  Overview → Requests → Request Detail → Timeline         │
└──────────────────────────┬───────────────────────────────┘
                           │
                     Next.js Rewrite
                           │
                           ▼
┌──────────────────────────────────────────────────────────┐
│                    Apollo Backend                         │
│                     FastAPI + Python                      │
│                                                          │
│  Request APIs                                            │
│  Execution Event APIs                                    │
│  Timeline APIs                                           │
│  Summary APIs                                            │
│  Observability Queries                                   │
└──────────────────────────┬───────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────┐
│                    Persistence Layer                      │
│                 SQLAlchemy + Database                     │
│                                                          │
│  Requests                                                │
│  Execution Events                                        │
└──────────────────────────────────────────────────────────┘
                           ▲
                           │
┌──────────────────────────┴───────────────────────────────┐
│                         Apollo SDK                        │
│                         Python                            │
│                                                          │
│  Captures application execution information              │
│  and sends observability events to the backend            │
└──────────────────────────────────────────────────────────┘
```

The frontend communicates with the backend through a **Next.js rewrite proxy**, keeping browser requests same-origin without requiring CORS configuration.

---

# 🔍 Observability Model

Apollo currently models observability around two primary entities.

## Request

A request represents an incoming application request.

```text
Request
├── request_id
├── method
├── path
├── status_code
├── started_at
└── duration_ms
```

A request is the primary unit of investigation in Apollo.

For example:

```text
GET /users/42
Status: 200
Duration: 47.78 ms
Request ID: b4517de7-6aa8-4e45-a586-5d42277b6226
```

---

## Execution Event

An execution event represents work that happened while processing a request.

```text
ExecutionEvent
├── event_id
├── request_id
├── event_type
├── started_at
├── duration_ms
└── metadata
```

Apollo currently understands these execution-event types:

```text
HTTP_IN
HTTP_OUT
SQL
EXCEPTION
```

Each execution event is correlated to its parent request through `request_id`.

This allows Apollo to reconstruct what happened during a specific request instead of treating every log or event as an isolated record.

---

# 🧵 Request Correlation

Every captured request receives a unique `request_id`.

Execution events reference that same ID:

```text
Request
request_id = abc-123
│
├── SQL
│
├── HTTP_OUT
│
└── EXCEPTION
```

This correlation model is the foundation of Apollo.

Instead of asking:

> "What logs were generated around this time?"

Apollo can ask:

> "What exactly happened while processing this request?"

---

# 📡 Backend API

The backend is implemented using **FastAPI** and exposes versioned REST endpoints.

## Request Ingestion

```http
POST /api/v1/events
```

Records an incoming request.

---

## Execution Event Ingestion

```http
POST /api/v1/execution-events
```

Records an execution event associated with a request.

---

## Request Listing

```http
GET /api/v1/requests
```

Supports:

- pagination
- HTTP method filtering
- exact path filtering
- status-code filtering

Example:

```http
GET /api/v1/requests?limit=20&offset=0
```

---

## Execution Event Listing

```http
GET /api/v1/execution-events
```

Supports:

- pagination
- event-type filtering
- request-ID filtering

Example:

```http
GET /api/v1/execution-events?event_type=SQL
```

---

## Request Timeline

```http
GET /api/v1/events/{request_id}/timeline
```

Returns the request together with its correlated execution events ordered chronologically.

Example:

```text
Request
│
├── SQL
│
├── HTTP_OUT
│
└── SQL
```

Requests with no execution events are also handled explicitly.

---

## Request Summary

```http
GET /api/v1/events/{request_id}/summary
```

Returns:

```json
{
  "request": {
    "request_id": "abc-123",
    "method": "GET",
    "path": "/users/42",
    "status_code": 200,
    "started_at": "2026-08-13T18:08:49.608112Z",
    "duration_ms": 47.78
  },
  "total_events": 2,
  "event_counts": {
    "HTTP_IN": 0,
    "HTTP_OUT": 1,
    "SQL": 1,
    "EXCEPTION": 0
  },
  "total_execution_duration_ms": 0.62,
  "has_error": false
}
```

`has_error` becomes true when:

- the request status code is `>= 500`, or
- an associated `EXCEPTION` execution event exists.

---

# 🔎 Observability Queries

Apollo provides specialized request queries for common debugging workflows.

## Slow Requests

```http
GET /api/v1/requests/slow?threshold_ms=100
```

Returns requests whose duration is greater than or equal to the specified threshold.

---

## Failed Requests

```http
GET /api/v1/requests/errors
```

Returns requests with:

```text
status_code >= 400
```

---

## Requests With Exceptions

```http
GET /api/v1/requests/exceptions
```

Returns requests with at least one correlated `EXCEPTION` execution event.

The implementation uses an existence-based query so multiple exception events do not cause duplicate request records.

---

# 🖥️ Apollo Observability Console

Apollo includes a web-based debugging console built with:

- Next.js
- React
- TypeScript
- CSS
- Vitest
- React Testing Library

The console provides three primary areas.

## Overview

The overview displays honest, request-derived metrics such as:

- Total requests
- Failed requests
- Slow requests
- Requests containing exceptions
- Recent requests

The dashboard deliberately avoids fabricated health scores or unsupported aggregate metrics.

---

## Request Explorer

The request explorer provides:

- request listing
- pagination
- HTTP method filtering
- exact path filtering
- status filtering
- slow-request filtering
- error filtering
- exception filtering

Example workflow:

```text
Requests
   │
   ├── All
   ├── Slow
   ├── Errors
   └── Exceptions
```

---

## Request Detail

Selecting a request opens a dedicated investigation view.

The detail page displays:

```text
Request
│
├── Method
├── Path
├── Status
├── Timestamp
├── Duration
├── Request ID
│
├── Event Summary
│   ├── HTTP_IN
│   ├── HTTP_OUT
│   ├── SQL
│   └── EXCEPTION
│
└── Execution Timeline
    ├── SQL
    ├── HTTP_OUT
    └── EXCEPTION
```

Long execution metadata can be expanded through collapsible UI elements.

Exception events expose structured traceback information instead of treating the traceback as an opaque string.

---

# 🧩 Event Metadata

Execution events contain structured metadata depending on their type.

## SQL

```json
{
  "query": "SELECT * FROM users WHERE id = 42"
}
```

## HTTP_OUT

```json
{
  "method": "GET",
  "url": "https://example.com/api",
  "status_code": 200
}
```

Optional fields can include error information.

## EXCEPTION

```json
{
  "exception_type": "RuntimeError",
  "message": "Something went wrong",
  "traceback": [
    {
      "filename": "service.py",
      "function": "process_request",
      "line_number": 42
    }
  ]
}
```

The frontend renders structured traceback frames as a readable debugging stack.

---

# 🧪 Testing Strategy

Apollo is being developed with testing as a first-class part of the architecture.

The project currently contains separate automated test suites for:

```text
Backend
   │
   └── API + service + integration behavior

SDK
   │
   └── Instrumentation behavior

Frontend
   │
   └── Console user behavior
```

## Backend

Current backend suite:

```text
21 tests passing
```

Coverage includes:

- request ingestion
- request listing
- pagination
- request filters
- request timelines
- empty timelines
- request summaries
- error detection
- exception detection
- execution-event ingestion
- execution-event querying
- slow-request queries
- failed-request queries
- exception-request queries
- request isolation
- duplicate exception-event handling

Run:

```bash
cd backend
uv run pytest tests -q
```

---

## SDK

Current SDK suite:

```text
13 tests passing
```

Run:

```bash
cd sdk
uv run pytest tests -q
```

---

## Frontend

The console currently contains behavioral tests using:

- Vitest
- React Testing Library
- jsdom

Current frontend suite:

```text
11 tests passing
```

Tests cover:

- request rendering
- pagination
- URL-based filters
- quick filters
- empty states
- API error states
- retry behavior
- request-detail navigation
- request summaries
- timelines
- SQL events
- HTTP_OUT events
- EXCEPTION events
- zero-event timelines

Run:

```bash
cd frontend
npm run test
```

---

# 🔄 Regression Testing

Every major implementation phase is expected to preserve previously implemented behavior.

The current regression baseline is:

```text
Backend   → 21 passing
SDK       → 13 passing
Frontend  → 11 passing
```

Total automated tests currently:

```text
45
```

Before committing substantial changes, the project can be validated with:

```bash
cd backend
uv run pytest tests -q

cd ../sdk
uv run pytest tests -q

cd ../frontend
npm run test
npm run typecheck
npm run lint
npm run build
```

---

# 🧬 Mutation Testing

Mutation testing is a planned improvement to Apollo's testing strategy.

The purpose is to verify that the test suite does not merely execute code but actually detects meaningful behavioral changes.

Planned tooling may include mutation-testing frameworks such as:

```text
mutmut
```

Mutation testing is **not currently claimed as completed functionality**.

---

# 🛠️ Frontend Quality Checks

The frontend currently supports:

```bash
npm run test
npm run typecheck
npm run lint
npm run build
```

The production build has been verified successfully.

---

# 📁 Project Structure

```text
Apollo/
│
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── models/
│   │   ├── schemas/
│   │   ├── services/
│   │   └── ...
│   │
│   └── tests/
│
├── sdk/
│   ├── ...
│   └── tests/
│
├── frontend/
│   ├── app/
│   │   ├── page.tsx
│   │   └── requests/
│   │       ├── page.tsx
│   │       └── [requestId]/
│   │
│   ├── components/
│   │   ├── detail/
│   │   ├── layout/
│   │   ├── overview/
│   │   ├── requests/
│   │   ├── timeline/
│   │   └── ui/
│   │
│   ├── lib/
│   │   ├── api/
│   │   ├── format.ts
│   │   └── types.ts
│   │
│   └── __tests__/
│
└── README.md
```

---

# 🚀 Running Apollo Locally

## 1. Start the database

Use the project's configured database environment.

For the local Docker-based setup:

```bash
docker compose up -d postgres
```

---

## 2. Start the backend

```bash
cd backend
uv run uvicorn app.main:app --reload --port 8001
```

The backend is available at:

```text
http://127.0.0.1:8001
```

---

## 3. Start the example application

```bash
cd examples/fastapi-demo
uv run uvicorn app.main:app --reload --port 8000
```

---

## 4. Generate demo traffic

Successful request:

```bash
curl http://127.0.0.1:8000/users/42
```

Failing request:

```bash
curl http://127.0.0.1:8000/explode
```

The second request should produce a `500` response and generate an exception event.

---

## 5. Start the frontend

```bash
cd frontend
npm install
npm run dev
```

The console is available at:

```text
http://127.0.0.1:3000
```

If port `3000` is already occupied, run Next.js on another port:

```bash
npm run dev -- --port 3002
```

---

# 🔬 Manual Investigation Flow

A typical Apollo debugging workflow looks like this:

```text
1. Generate application traffic
          │
          ▼
2. Apollo captures the request
          │
          ▼
3. SDK records execution events
          │
          ▼
4. Backend persists request + events
          │
          ▼
5. Console displays request health
          │
          ▼
6. Developer filters failed/slow requests
          │
          ▼
7. Developer opens a request
          │
          ▼
8. Apollo reconstructs the execution timeline
          │
          ▼
9. Developer investigates SQL / HTTP / Exception events
```

---

# ⚠️ Current Design Notes

### HTTP_IN

`HTTP_IN` currently appears as a supported event type in summaries, but the current middleware architecture records the incoming request as a `RequestEvent` rather than generating a separate `HTTP_IN` execution event.

Therefore:

```text
HTTP_IN = 0
```

can be a legitimate result.

Apollo does not fabricate execution events merely to make the UI look complete.

---

### Path Filtering

The current backend path filter uses exact matching.

For example:

```text
/users/42
```

matches:

```text
/users/42
```

but does not perform substring or wildcard matching.

---

### Slow Request Threshold

The frontend currently uses:

```text
100 ms
```

as the default slow-request threshold.

The backend accepts a configurable threshold through:

```http
GET /api/v1/requests/slow?threshold_ms=<value>
```

---

# 🎯 Design Principles

Apollo is intentionally being built around a few principles.

### 1. Request-centric observability

A request is the primary unit of investigation.

### 2. Correlation over isolated logs

Events should be connected to the request that caused them.

### 3. Structured debugging data

SQL, HTTP, and exception information should remain structured instead of becoming opaque log strings.

### 4. Honest observability

Apollo should display information that actually exists rather than inventing metrics or health scores.

### 5. Test before expansion

New functionality should come with tests and should preserve existing behavior.

### 6. Small, composable APIs

Backend endpoints remain focused on specific observability operations instead of becoming one large generic analytics endpoint.

---

# 🗺️ Development Roadmap

Apollo is being developed incrementally.

```text
Phase 1
└── Project foundation

Phase 2
└── Core request ingestion

Phase 3
└── SDK instrumentation

Phase 4
└── Request/event persistence and correlation

Phase 5
├── Request listing
├── Pagination and filtering
├── Request timelines
├── Request summaries
├── Execution-event queries
├── Slow-request queries
├── Error queries
└── Exception queries

Phase 6
├── Next.js observability console
├── Overview
├── Request explorer
├── Request detail
├── Execution timeline
├── Filtering
├── Error/empty/loading states
└── Frontend behavioral testing

Phase 7
└── Advanced debugging capabilities
```

Potential future Phase 7 capabilities include:

- live request refresh
- richer search
- span/waterfall visualization
- advanced query exploration
- authentication
- multi-service correlation
- richer exception analysis
- AI-assisted debugging explanations

These are future capabilities and are **not currently represented as completed functionality**.

---

# 📊 Current Project Status

| Area | Status |
|---|---|
| Request ingestion | ✅ Complete |
| Execution-event ingestion | ✅ Complete |
| Request correlation | ✅ Complete |
| Request listing | ✅ Complete |
| Pagination | ✅ Complete |
| Request filtering | ✅ Complete |
| Request timeline | ✅ Complete |
| Request summary | ✅ Complete |
| Execution-event querying | ✅ Complete |
| Slow-request querying | ✅ Complete |
| Error querying | ✅ Complete |
| Exception querying | ✅ Complete |
| Web console | ✅ Complete |
| Frontend testing | ✅ Complete |
| Backend testing | ✅ Complete |
| SDK testing | ✅ Complete |
| Type checking | ✅ Complete |
| Linting | ✅ Complete |
| Production frontend build | ✅ Complete |
| Mutation testing | 🟡 Planned |
| Advanced debugging | 🟡 Future |

---

# 🧰 Technology Stack

## Backend

- Python
- FastAPI
- SQLAlchemy
- Pydantic
- AsyncIO
- Pytest

## SDK

- Python
- Application instrumentation
- HTTP event ingestion

## Frontend

- Next.js
- React
- TypeScript
- CSS
- Vitest
- React Testing Library

## Infrastructure

- PostgreSQL
- Docker
- Docker Compose

---

# 📌 Example Investigation

Consider the following request:

```text
GET /users/42
Status: 200
Duration: 47.78 ms
```

Apollo can reconstruct:

```text
GET /users/42
│
├── SQL
│   └── SELECT ...
│
└── HTTP_OUT
    └── GET https://example.com/...
```

For a failing request:

```text
GET /explode
Status: 500
```

Apollo can show:

```text
GET /explode
│
└── EXCEPTION
    ├── RuntimeError
    ├── message
    └── structured traceback
```

This is the core value of Apollo:

> **Turn a request into an explainable execution story.**

---

# 📜 License

License information will be added as the project approaches its first public release.

---

# 👨‍💻 Project

Apollo is being developed as an engineering project focused on understanding the architecture and implementation of application observability systems.

The emphasis is not simply on collecting logs, but on building the complete pipeline:

```text
Instrumentation
      ↓
Event Capture
      ↓
Correlation
      ↓
Persistence
      ↓
Query APIs
      ↓
Visualization
      ↓
Developer Investigation
```

**Apollo — understand what happened inside your application.**
