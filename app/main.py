from fastapi import FastAPI

from app.config import settings
from app.routers import webhooks

app = FastAPI(title=settings.app_name)

app.include_router(webhooks.router)


@app.get("/")
def root():
    return {"status": "ok", "service": "code-review-assistant", "environment": settings.environment}


@app.get("/health")
def health():
    return {"status": "healthy"}
