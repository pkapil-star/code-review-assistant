# ReviewPilot — System Diagrams

Three views of the Automated Code Review Assistant: the components a GitHub
pull request passes through, the core data model each one hands off, and the
exact sequence of calls from webhook delivery to a posted review.

GitHub renders the Mermaid blocks below natively when this file is viewed on
github.com.

## 1. Component architecture

One FastAPI service does three jobs: it answers signed GitHub webhooks, it
runs the review pipeline (static rules + an LLM), and it serves both a JSON
dashboard API and the built React frontend from the same origin.

```mermaid
flowchart TB
    GH["GitHub<br/>pull_request webhook"]

    subgraph SVC["Automated Code Review Assistant · FastAPI"]
        direction TB
        WH["Webhook Router<br/>/webhooks/github"]
        SEC["Signature Verify<br/>HMAC-SHA256"]
        PIPE["Review Pipeline"]
        STAT["Static Analysis<br/>AST rules, generic rules"]
        AI["AI Reviewer<br/>Anthropic / mock"]
        GHC["GitHub Client<br/>App JWT + installation token"]
        STORE["Review Store<br/>in-memory"]
        API["Dashboard API<br/>/api/*"]
        SPA["Built Frontend<br/>served as static files"]
    end

    BROWSER["Browser<br/>ReviewPilot dashboard"]

    GH -->|"POST webhook"| WH
    WH --> SEC
    SEC -->|"valid"| PIPE
    PIPE --> STAT
    PIPE --> AI
    PIPE --> GHC
    GHC -->|"fetch files, post review"| GH
    PIPE -->|"write outcome"| STORE
    STORE --> API
    API --> SPA
    BROWSER -->|"GET /app"| SPA
    BROWSER -->|"fetch"| API

    classDef ext fill:#94a8d6,stroke:#4c6ab8,color:#0d1420,font-weight:600;
    classDef core fill:#e2eaf9,stroke:#2e5cbf,color:#12233f;
    classDef store fill:#d7ecdf,stroke:#1a8058,color:#0e3323;
    class GH,BROWSER ext;
    class WH,SEC,PIPE,STAT,AI,GHC,API,SPA core;
    class STORE store;
```

## 2. Core class model

The shapes that carry one review from webhook payload to dashboard row.
`PullRequestEvent` is parsed once at the door; everything downstream reads
from it.

```mermaid
classDiagram
    class PullRequestEvent {
      +str action
      +str owner
      +str repo
      +int pr_number
      +str head_sha
      +int installation_id
      +str title
      +bool draft
      +str author
      +str author_avatar
      +full_name() str
      +should_review() bool
    }

    class ReviewJob {
      +PullRequestEvent event
      +int attempt
      +description() str
    }

    class ReviewComment {
      +str path
      +int line
      +Severity severity
      +str message
      +str rule_id
      +render() str
    }

    class ReviewResult {
      +str owner
      +str repo
      +int pr_number
      +List~ReviewComment~ comments
      +str summary
      +int files_reviewed
      +bool ai_used
      +bool posted
      +str error
      +counts() dict
    }

    class PullRequestRecord {
      +str id
      +int number
      +str title
      +str author
      +str repository
      +str head_sha
      +ReviewStatus status
      +int score
      +int findings_count
    }

    class GitHubClient {
      +for_installation(id) GitHubClient
      +list_pull_request_files(...)
      +get_file_content(...)
      +create_review(...)
    }

    class LLMProvider {
      <<interface>>
      +review(title, files) tuple
    }

    PullRequestEvent "1" --> "1" ReviewJob : wrapped in
    ReviewJob ..> GitHubClient : authenticates via
    GitHubClient ..> LLMProvider : paired with
    ReviewResult "1" *-- "many" ReviewComment : contains
    PullRequestEvent ..> ReviewResult : produces
    ReviewResult ..> PullRequestRecord : projected into
```

## 3. Webhook-to-review sequence

Runs synchronously inside the request — a deliberate choice for this
deployment (see note below), so the response GitHub sees only returns once
the review is posted.

```mermaid
sequenceDiagram
    participant GH as GitHub
    participant WH as Webhook Router
    participant PL as Pipeline
    participant GC as GitHub Client
    participant SA as Static Analysis
    participant AI as AI Reviewer
    participant ST as Review Store
    participant DB as Dashboard API

    GH->>WH: POST /webhooks/github (signed payload)
    WH->>WH: verify_webhook_signature()
    WH->>WH: parse_pull_request_event()
    alt not reviewable (draft / closed)
        WH-->>GH: 200 ignored
    else reviewable
        WH->>PL: handle_review_job(job)
        PL->>ST: mark_reviewing(event)
        PL->>GC: for_installation(installation_id)
        GC->>GH: exchange JWT for installation token
        PL->>GC: list_pull_request_files()
        GC->>GH: GET changed files
        PL->>GC: get_file_content() per .py file
        PL->>SA: run_static_analysis(files, sources)
        PL->>AI: review_with_ai(title, files)
        PL->>PL: merge + dedupe + cap comments
        PL->>GC: create_review(body, comments)
        GC->>GH: POST review
        PL->>ST: record_outcome(result)
        PL-->>WH: ReviewResult
        WH-->>GH: 200 completed
    end
    DB->>ST: read on next dashboard fetch
```

## Design notes

**Why synchronous** — Deployed on Vercel's serverless Python runtime, which
recycles the process as soon as a handler returns; the original async
background-queue design (`app/queue/`) never got to finish a job. The
webhook now awaits `handle_review_job()` directly instead.

**Auth model** — No personal access token anywhere. The app signs a
9-minute JWT with its private key, exchanges it for a 1-hour installation
token per repository, and caches that token until it's near expiry.

**Dual finding sources** — `ReviewComment` objects come from two
independent producers, AST-based static rules and the LLM reviewer, merged,
deduplicated, and capped at `MAX_COMMENTS_PER_REVIEW` before posting.

---
*Generated from app/models, app/pipeline.py, app/routers/webhooks.py, app/github/auth.py*
