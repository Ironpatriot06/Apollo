from fastapi import FastAPI

from apollo import ApolloMiddleware

app = FastAPI()

app.add_middleware(ApolloMiddleware)


@app.get("/")
async def root():
    return {"message": "Hello from Apollo"}


@app.get("/users/{user_id}")
async def get_user(user_id: int):
    return {
        "user_id": user_id,
        "name": "Ratish",
    }
