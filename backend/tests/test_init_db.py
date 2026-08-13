import asyncio

from app.db.init_db import init_db


async def main() -> None:
    await init_db()
    print("Database tables initialized")


if __name__ == "__main__":
    asyncio.run(main())
