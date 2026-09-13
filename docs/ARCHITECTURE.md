# Architecture

## Module layout

```
app/
  main.py                 FastAPI app, lifespan, health and stats endpoints
  config.py               Settings loaded from environment or .env
  pipeline.py             Orchestrates one review, start to finish
  routers/webhooks.py     Webhook endpoint: verify, parse, enqueue
  security/webhook.py     HMAC-SHA256 signature verification
  models/events.py        Webhook payload to PullRequestEvent
  models/review.py        ReviewComment, ReviewResult, Severity
  analysis/diff.py        Unified diff parsing and line mapping
  analysis/python_rules.py    AST rules for Python
  analysis/generic_rules.py   Text rules for any language
  analysis/static.py      Runs the rules, filters, sorts, deduplicates
  ai/providers.py         LLMProvider interface, Claude and mock
  ai/reviewer.py          Prompt, JSON contract, response validation
  github/auth.py          App JWT and installation access tokens
  github/client.py        The GitHub endpoints this project uses
  queue/jobs.py           ReviewJob and queue counters
  queue/worker.py         Async queue, workers, retries, Redis variant
  queue/instance.py       The shared queue instance
scripts/review_local.py   Review a local git diff, no GitHub needed
```

## Request path

1. `POST /webhooks/github` reads the raw body, because the signature covers the
   exact bytes GitHub sent. Parsing first and re-serialising would change them.
2. The signature is compared with `hmac.compare_digest`, which takes the same
   time whether the first byte differs or the last, so the comparison leaks
   nothing about the secret.
3. `ping` events are answered, non-pull-request events are acknowledged, draft
   pull requests and actions like `closed` are skipped.
4. A `ReviewJob` goes on the queue and the endpoint returns. GitHub sees a fast
   200 and does not retry the delivery.
5. A worker authenticates as the installation, runs the pipeline, and posts.

## Design decisions

**Two layers, not one.** Rules are deterministic, free, and explain themselves;
they handle complexity, naming, tests and obvious hazards. A model handles what
rules cannot express: whether the logic is right. Each layer covers the other
failure mode, and findings are deduplicated where they overlap.

**Only comment on added lines.** Whole-file analysis sees pre-existing problems.
Reporting them buries the author in comments about code they did not write, so
AST findings are filtered against the added line numbers from the diff.

**Distrust the model output.** `parse_comments` drops any finding naming a file
that was not in the prompt, unanchors any line the diff did not add, and falls
back to `info` for an unknown severity. Malformed JSON drops the AI findings and
keeps the static ones.

**Degrade instead of failing.** No API key falls back to the mock provider. An
unreachable Redis falls back to the in-process queue. A rejected inline review
falls back to a summary comment. A file the contents API will not return is
skipped rather than aborting the review.

**One review, not many comments.** Every finding is posted in a single review,
so the author gets one notification. The list is sorted worst-first and capped,
because a review with fifty comments gets ignored entirely.

## Queue

The default backend is an `asyncio.Queue` with a small worker pool, which needs
no extra service to run. `QUEUE_BACKEND=redis` swaps in a Redis list so jobs
survive a restart and several instances can share the load. Both use the same
retry policy: on an exception the job is re-queued with a backoff proportional
to the attempt number, up to `QUEUE_MAX_RETRIES`, then marked failed. A failing
job never kills its worker.

## Security

- Webhook deliveries are rejected unless the HMAC signature matches.
- The app authenticates with a short-lived JWT exchanged for an installation
  token, scoped to one installation and cached until shortly before it expires.
- The private key and `.env` are gitignored; `.env.example` holds placeholders.
- The static analysis layer flags credentials added in a diff, so the tool warns
  about the class of mistake it is itself built to avoid.

## Testing approach

No test touches the network. `httpx.MockTransport` answers the GitHub endpoints,
and `MockProvider` answers as the model, which makes it possible to test the
awkward cases directly: a model that returns prose instead of JSON, a model that
invents a filename, a GitHub API that rejects the inline anchors, a job that
fails twice and then succeeds.
