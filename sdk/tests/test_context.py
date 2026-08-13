import asyncio

from apollo.context import get_request_id, set_request_id


async def handle_request(request_id: str) -> None:
    set_request_id(request_id)

    # Simulate asynchronous work
    await asyncio.sleep(0.05)

    actual = get_request_id()

    assert actual == request_id

    print(f"{request_id} → {actual}")


async def main() -> None:
    await asyncio.gather(
        handle_request("request-A"),
        handle_request("request-B"),
    )

    print("Concurrent context isolation OK")


asyncio.run(main())
