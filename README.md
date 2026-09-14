# Automated Code Review Assistant

A GitHub App that reviews every pull request the moment it opens. It combines a
rule-based static analysis layer with an AI review layer, merges both sets of
findings, and posts them as inline comments on the pull request, catching the
routine problems before a human reviewer spends time on them.

## Why

Senior engineers spend hours repeating the same review comments: missing tests,
functions that branch too much, inconsistent naming, unhandled `None`. That work
does not scale with pull request volume. This service pre-screens a pull request
so the human reviewer starts on design, not on the checklist.

## How it works

```
GitHub --webhook--> /webhooks/github --> queue --> worker
                       (verify HMAC)                |
                                                    v
                    +----------- review pipeline ------------+
                    | 1. list changed files and parse diff   |
                    | 2. static analysis (AST + text rules)  |
                    | 3. AI review (Claude, JSON contract)   |
                    | 4. merge, dedupe, sort, cap            |
                    +--------------------+-------------------+
                                         v
                     one review with inline comments on the PR
```

1. **Webhook** - every delivery is verified with HMAC-SHA256 against the shared
   secret before anything else happens. Unsigned requests get a 401.
2. **Queue** - the endpoint answers GitHub immediately and hands the job to a
   background worker pool, so a burst of pull requests cannot time the webhook
   out. Failed jobs retry with backoff.
3. **Static analysis** - AST rules for Python (cyclomatic complexity, function
   length, argument count, bare `except`, silent failures, mutable default
   arguments, PEP 8 naming, missing docstrings) plus language-agnostic text rules
   (long lines, new TODOs, leftover debugger calls, hardcoded secrets) and a
   missing-test heuristic.
4. **AI review** - the diff goes to Claude with a strict JSON contract. Findings
   that name a file or line the model never saw are discarded, so a confused
   model cannot comment on unrelated code.
5. **Posting** - everything merges into one review, deduplicated and sorted
   worst-first, capped so the pull request does not drown in comments. If GitHub
   rejects the inline anchors, the findings still post as a summary comment.

Findings are only ever reported on lines the pull request actually adds.

## Tech stack

| Layer | Choice |
|---|---|
| Service | Python, FastAPI, Uvicorn |
| Static analysis | Python `ast` module, regex rules |
| AI | Anthropic Claude (`AI_PROVIDER=anthropic`), offline mock provider |
| Queue | in-process asyncio queue, optional Redis backend |
| GitHub | REST API, GitHub App JWT and installation tokens |
| Tests | pytest, pytest-asyncio, httpx MockTransport |

## Setup

```bash
python -m venv venv
venv\Scripts\activate          # Windows
source venv/bin/activate       # macOS and Linux

pip install -r requirements.txt
cp .env.example .env           # then fill in the values
uvicorn app.main:app --reload
```

Full GitHub App registration and tunnel instructions: [docs/SETUP.md](docs/SETUP.md).

### Configuration

| Variable | Default | Meaning |
|---|---|---|
| `GITHUB_APP_ID` | none | App id from the GitHub App settings page |
| `GITHUB_WEBHOOK_SECRET` | none | Shared secret used to verify deliveries |
| `GITHUB_PRIVATE_KEY_PATH` | `secrets/private-key.pem` | PEM key for the app |
| `AI_PROVIDER` | `anthropic` | `anthropic` or `mock` |
| `ANTHROPIC_API_KEY` | empty | A missing key falls back to static analysis only |
| `QUEUE_BACKEND` | `memory` | `memory` or `redis` |
| `MAX_COMMENTS_PER_REVIEW` | `20` | Cap on comments per pull request |
| `POST_COMMENTS` | `true` | Set false to compute a review without posting it |

The service runs with no API key and no Redis: it degrades to static analysis on
an in-process queue rather than failing.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/` | Service identity |
| `GET` | `/health` | Liveness probe |
| `GET` | `/stats` | Queue counters and active configuration |
| `POST` | `/webhooks/github` | Signed GitHub webhook receiver |

## Try it without GitHub

Review a local diff straight from the command line:

```bash
python scripts/review_local.py          # working tree against HEAD
python scripts/review_local.py main     # current branch against main
```

## Tests

```bash
pytest
```

The suite covers signature verification, event parsing, diff parsing, every
static rule, the AI response contract (including malformed and hallucinated
output), queue retries and failure handling, the GitHub client against a mock
transport, and the pipeline end to end.

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) - module layout and design decisions
- [docs/SETUP.md](docs/SETUP.md) - GitHub App registration and local tunnel

## Team

| Member | Area |
|---|---|
| Pranshu | Backend service, webhook endpoint, event queue |
| Preetpal | LLM review layer and model integration |
| Sehapal | Webhook secrets, tokens, and API access |
done!!
