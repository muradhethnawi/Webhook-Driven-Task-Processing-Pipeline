# Webhook Pipeline

A lightweight webhook processing service — receive events, process them through configurable actions, and deliver results to registered subscribers.

## Quick Start

```bash
git clone <repo-url>
cd webhook-pipeline
docker compose up
```

The API will be available at `http://localhost:3000`.

---

## Architecture

```
External caller
     │
     ▼
POST /webhook/:sourceId        ← accepts webhook, queues job, returns 202 immediately
     │
     ▼
jobs table (PostgreSQL)        ← acts as the job queue
     │
     ▼
Worker (background process)    ← polls every 2s, claims jobs atomically
     │
     ├─ processAction()        ← transform / filter / enrich / delay
     │
     ▼
deliverToSubscribers()         ← HTTP POST to each subscriber URL
     │
     ▼
delivery_attempts table        ← logs every attempt (success or failure)
```

### Key Design Decisions

**PostgreSQL as job queue** — No Redis or external queue needed. Using `SELECT FOR UPDATE SKIP LOCKED` makes job claiming atomic and safe for concurrent workers. Simple, one fewer dependency.

**202 Accepted on ingestion** — The webhook endpoint never blocks. It saves the job and immediately returns 202. This keeps the API fast regardless of how complex the processing action is.

**Exponential backoff on delivery** — Failed deliveries retry with 1s, 2s, 4s, 8s... gaps. Each attempt is logged in `delivery_attempts` so you have full audit history.

**Filter action = early exit** — If a filter action's condition is not met, the job is marked complete without delivering to subscribers. No wasted HTTP calls.

**Separate worker process** — The API and worker are separate Docker containers. They scale independently, and a worker crash doesn't affect the API.

---

## Services

| Service  | Port | Purpose                        |
|----------|------|--------------------------------|
| api      | 3000 | REST API                       |
| worker   | —    | Background job processor       |
| postgres | 5432 | Database + job queue           |
| migrate  | —    | Runs DB migrations at startup  |

---

## API Reference

### Pipelines

#### `POST /pipelines` — Create a pipeline

```json
{
  "name": "My pipeline",
  "action_type": "enrich",
  "action_config": {
    "fields": { "env": "production", "version": "1.0" }
  },
  "subscribers": [
    "https://webhook.site/your-url"
  ]
}
```

Response:
```json
{
  "data": {
    "id": "uuid",
    "source_id": "uuid",   ← use this as your webhook URL
    ...
  }
}
```

#### `GET /pipelines` — List all pipelines
#### `GET /pipelines/:id` — Get single pipeline
#### `PATCH /pipelines/:id` — Update pipeline (partial)
#### `DELETE /pipelines/:id` — Delete pipeline

---

### Webhooks

#### `POST /webhook/:sourceId` — Trigger a pipeline

Send any JSON body to the pipeline's `source_id` URL:

```bash
curl -X POST http://localhost:3000/webhook/<source_id> \
  -H "Content-Type: application/json" \
  -d '{"event": "purchase", "amount": 99.99, "userId": "u_123"}'
```

Response `202 Accepted`:
```json
{
  "message": "Webhook received and queued for processing",
  "job_id": "uuid"
}
```

---

### Jobs

#### `GET /jobs` — List jobs

Query params: `status`, `pipeline_id`, `limit`, `offset`

```bash
GET /jobs?status=failed&limit=10
```

#### `GET /jobs/:id` — Job details + delivery attempts

```json
{
  "data": {
    "id": "uuid",
    "status": "completed",
    "attempts": 1,
    "result": { ... },
    "delivery_attempts": [
      {
        "subscriber_url": "https://...",
        "status": "success",
        "http_status": 200,
        "duration_ms": 342
      }
    ]
  }
}
```

#### `GET /jobs/:id/deliveries` — Only delivery attempts for a job

---

## Processing Action Types

### `transform`
Rename, delete, or set fields on the payload.

```json
{
  "action_type": "transform",
  "action_config": {
    "operations": [
      { "op": "rename", "field": "userId", "newField": "user_id" },
      { "op": "delete", "field": "internalSecret" },
      { "op": "set",    "field": "source", "value": "webhook" }
    ]
  }
}
```

### `filter`
Only deliver if a condition is met. Supported operators: `eq`, `neq`, `contains`, `exists`.

```json
{
  "action_type": "filter",
  "action_config": {
    "field": "event",
    "operator": "eq",
    "value": "purchase"
  }
}
```

### `enrich`
Merge static fields into the payload before delivery.

```json
{
  "action_type": "enrich",
  "action_config": {
    "fields": {
      "environment": "production",
      "service": "payments"
    }
  }
}
```

### `delay`
Wait N milliseconds before processing. Useful for rate limiting or scheduled delivery.

```json
{
  "action_type": "delay",
  "action_config": {
    "delayMs": 30000
  }
}
```

---

## Database Schema

```
pipelines               jobs                    delivery_attempts
─────────               ────                    ─────────────────
id (PK)                 id (PK)                 id (PK)
name                    pipeline_id (FK)        job_id (FK)
source_id (unique)      payload (JSONB)         subscriber_url
action_type             status                  status
action_config (JSONB)   attempts                http_status
subscribers (JSONB)     max_attempts            response_body
created_at              result (JSONB)          duration_ms
updated_at              error                   attempted_at
                        scheduled_at
                        created_at
                        processed_at
```

---

## Local Development

```bash
# Install dependencies
npm install

# Copy env file
cp .env.example .env

# Run migrations (requires local postgres)
npm run migrate:dev

# Start API
npm run dev

# Start worker (separate terminal)
npm run dev:worker

# Run tests
npm test

# Type check
npm run typecheck

# Lint
npm run lint
```

---

## CI/CD

GitHub Actions runs on every push to `main` and `dev`:

1. Install dependencies
2. Type check (`tsc --noEmit`)
3. Lint (`eslint`)
4. Build (`tsc`)
5. Run migrations
6. Run tests (`jest`)
