# Automated Code Review Assistant

An AI-powered GitHub App that automatically reviews Pull Requests using
static analysis + LLM-based review, and posts inline comments.

## Status
🚧 Phase 1 complete — FastAPI foundation with health check.

## Tech Stack
- Python + FastAPI + Uvicorn
- (Coming soon) GitHub App, Redis + Celery, PostgreSQL, OpenAI API

## Setup

```bash
python -m venv venv
source venv/bin/activate   # or venv\Scripts\activate on Windows
pip install -r requirements.txt
uvicorn app.main:app --reload
```

## Endpoints
- `GET /` — service info
- `GET /health` — health check

## Tests

```bash
pytest
```
