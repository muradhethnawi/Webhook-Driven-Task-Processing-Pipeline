# Webhook Pipeline

A webhook processing service — receive events, process them, deliver to subscribers.

## Quick Start

```bash
docker compose up
```

API available at http://localhost:3000

## API

### Pipelines
- POST   /pipelines
- GET    /pipelines
- GET    /pipelines/:id
- PATCH  /pipelines/:id
- DELETE /pipelines/:id

### Webhooks
- POST /webhook/:sourceId

### Jobs
- GET /jobs
- GET /jobs/:id
- GET /jobs/:id/deliveries

## Action Types
- transform — rename, delete, set fields
- filter    — pass only if condition matches
- enrich    — add static fields
- delay     — wait N ms before delivery
