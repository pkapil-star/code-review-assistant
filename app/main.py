from fastapi import FastAPI
from app.config import settings

app = FastAPI(title=settings.app_name)


@app.get("/")
def root():
    return {"status": "ok", "service": "code-review-assistant", "environment": settings.environment}


@app.get("/health")
def health():
    return {"status": "healthy"}
