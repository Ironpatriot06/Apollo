from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from apollo import ApolloMiddleware
from apollo.instrumentation import ApolloHTTPX, ApolloSQLAlchemy
from apollo.queue import EventQueue


DATABASE_URL = "sqlite+aiosqlite:///./demo.db"

engine = create_async_engine(DATABASE_URL)
SessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

queue = EventQueue()
http_instrumentation = ApolloHTTPX(queue=queue)

# Apollo middleware and SQL instrumentation share the SAME queue.
# This is important: both RequestEvent and ExecutionEvent
# must travel through the same worker/transport pipeline.
app = FastAPI()
profile_app = FastAPI()


@app.on_event("startup")
async def startup() -> None:
    async with engine.begin() as connection:
        await connection.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY,
                    name TEXT NOT NULL
                )
                """
            )
        )

        await connection.execute(
            text(
                """
                INSERT OR IGNORE INTO users (id, name)
                VALUES (42, 'Ratish')
                """
            )
        )

    ApolloSQLAlchemy(engine, queue=queue)


app.add_middleware(ApolloMiddleware, queue=queue)


@profile_app.get("/profiles/{user_id}")
async def get_profile(user_id: int):
    return {
        "user_id": user_id,
        "tier": "founder",
    }


@app.get("/")
async def root():
    return {"message": "Hello from Apollo"}


@app.get("/users/{user_id}")
async def get_user(user_id: int):
    async with SessionLocal() as session:
        result = await session.execute(
            text(
                "SELECT id, name FROM users WHERE id = :user_id"
            ),
            {"user_id": user_id},
        )

        user = result.mappings().first()

    if user is None:
        return {"error": "User not found"}

    async with http_instrumentation.async_client(
        transport=http_instrumentation.async_transport(
            httpx.ASGITransport(app=profile_app)
        ),
        base_url="http://profile-service.local",
    ) as client:
        profile_response = await client.get(f"/profiles/{user_id}")
        profile = profile_response.json()

    return {
        "user_id": user["id"],
        "name": user["name"],
        "profile": profile,
    }
