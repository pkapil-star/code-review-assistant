# Setup

## 1. Install and run locally

```bash
python -m venv venv
venv\Scripts\activate          # Windows
source venv/bin/activate       # macOS and Linux

pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload
```

Check it is alive:

```bash
curl http://127.0.0.1:8000/health
curl http://127.0.0.1:8000/stats
```

At this point the service runs with no GitHub App and no API key. It accepts
signed webhooks and reviews with static analysis only.

## 2. Register the GitHub App

1. Go to **Settings > Developer settings > GitHub Apps > New GitHub App**.
2. **Webhook URL**: the public URL from step 3 below, ending in
   `/webhooks/github`.
3. **Webhook secret**: generate a long random value and put the same value in
   `.env` as `GITHUB_WEBHOOK_SECRET`.
4. **Repository permissions**:
   - Contents: Read-only (to fetch file contents for the AST rules)
   - Pull requests: Read and write (to post the review)
   - Metadata: Read-only (required)
5. **Subscribe to events**: Pull request.
6. Create the app, then **Generate a private key**. Save the downloaded `.pem`
   into `secrets/private-key.pem` (that folder is gitignored).
7. Copy the **App ID** into `.env` as `GITHUB_APP_ID`.
8. **Install App** on the repository you want reviewed.

## 3. Expose the local service

GitHub has to reach your machine. Either tool works:

```bash
# ngrok
ngrok http 8000

# or the GitHub CLI webhook forwarder
gh webhook forward --repo=OWNER/REPO --events=pull_request \
  --url=http://localhost:8000/webhooks/github
```

Put the public HTTPS URL, plus `/webhooks/github`, into the app settings.

## 4. Turn on the AI layer

```
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-sonnet-5
```

Leave `ANTHROPIC_API_KEY` empty to run static analysis only. Set
`AI_PROVIDER=mock` to force that explicitly, which is what the tests do.

## 5. Optional: Redis queue

```bash
pip install redis
```

```
QUEUE_BACKEND=redis
REDIS_URL=redis://localhost:6379/0
```

With Redis unreachable the service logs a warning and uses the in-process queue.

## 6. Verify end to end

1. Open a pull request on the installed repository.
2. Watch the service log: it shows the delivery, the queued job, and the posted
   review.
3. The review appears on the pull request within a few seconds.

`GET /stats` shows how many jobs were queued, completed, retried and failed.

## Troubleshooting

| Symptom | Cause |
|---|---|
| 401 from the webhook | `GITHUB_WEBHOOK_SECRET` differs from the app settings |
| `private key not found` | `GITHUB_PRIVATE_KEY_PATH` points at the wrong file |
| Review posts as one comment, not inline | GitHub rejected the line anchors, so the fallback ran |
| No AI findings | `ANTHROPIC_API_KEY` is empty, so the mock provider is in use |
| Nothing happens on a draft PR | Drafts are skipped on purpose until marked ready |

## Security notes

- Never commit `.env` or `secrets/`. Both are gitignored.
- If a webhook secret or private key is ever committed, rotate it. Git history
  keeps the old value even after the file is deleted.
