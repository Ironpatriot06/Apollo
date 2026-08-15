# Apollo

### Lightweight Application Observability & Debugging Platform

Apollo is an application observability platform designed to provide developers with a clear view of what happens inside their applications at runtime.

It instruments application requests, captures execution events such as SQL queries, outbound HTTP calls, and exceptions, persists telemetry in PostgreSQL, exposes request-scoped observability APIs, and provides a web-based debugging console.

The goal is not simply to collect logs.

Apollo is designed to answer:

> **"What actually happened during this request?"**

---

## ✨ What Apollo Does

Apollo currently provides:

- HTTP request instrumentation
- Request correlation using unique request IDs
- Execution-event instrumentation
- Exception capture with structured traceback information
- SQL execution tracking
- Outbound HTTP tracking
- PostgreSQL-backed telemetry storage
- Request timeline reconstruction
- Request summaries
- Request filtering and pagination
- Slow request detection
- Failed request detection
- Requests containing exceptions
- Execution-event querying
- Interactive observability console
- Request-level debugging UI
- Structured execution timelines
- Automated backend, SDK, and frontend tests

---

## 🏗️ Architecture

```text
┌──────────────────────────────┐
│        Instrumented App      │
│                              │
│   FastAPI / Python App       │
└──────────────┬───────────────┘
               │
               │ Apollo SDK
               ▼
┌──────────────────────────────┐
│      Apollo SDK / Middleware │
│                              │
│  • Request instrumentation   │
│  • Execution events          │
│  • Exception instrumentation │
│  • Request correlation       │
└──────────────┬───────────────┘
               │
               │ HTTP event ingestion
               ▼
┌──────────────────────────────┐
│        Apollo Backend        │
│                              │
│  FastAPI                     │
│  SQLAlchemy                  │
│  Async PostgreSQL            │
│                              │
│  • Ingestion APIs            │
│  • Query APIs                │
│  • Timeline reconstruction   │
│  • Request summaries         │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│          PostgreSQL          │
│                              │
│  requests                    │
│  execution_events            │
└──────────────┬───────────────┘
               │
               │ REST APIs
               ▼
┌──────────────────────────────┐
│      Apollo Web Console      │
│                              │
│  Next.js + TypeScript        │
│                              │
│  • Overview                  │
│  • Request Explorer          │
│  • Request Details           │
│  • Execution Timeline        │
│  • Error investigation       │
└──────────────────────────────
