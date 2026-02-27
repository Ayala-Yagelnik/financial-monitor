# Financial Monitor

Real-Time Financial Transaction Monitor — .NET 9 backend, React + TypeScript frontend.

---

## Quick Start

```bash
# Development (SQLite + no Redis)
cd backend; dotnet run --project FinancialMonitor.API

# Frontend
cd frontend; npm install; npm run dev

# Production (PostgreSQL + Redis, all containerized)
cp .env.example .env   # fill in POSTGRES_PASSWORD
docker compose up -d

# Kubernetes deployment
kubectl apply -f k8s/
```

---

## Architecture Overview

```
┌─────────────────┐     HTTP POST      ┌──────────────────────────┐
│  /add  (React)  │ ─────────────────► │  POST /api/transactions  │
└─────────────────┘                    │                          │
                                       │   EfTransactionService   │
┌─────────────────┐    WebSocket       │   (PostgreSQL / SQLite)  │
│/monitor (React) │ ◄───────────────── │                          │
│  Redux Store    │    SignalR Hub     │   SignalR + Redis        │
└─────────────────┘                    │   Backplane              │
                                       └──────────────────────────┘
```

---

## ADR — Architecture Decision Records

### ADR-001: SignalR Redis Backplane for Distributed Real-Time

**Status:** Implemented

**Context:**
When deployed to multiple pods (K8S replicas), a SignalR Hub only knows about clients
connected to its own pod. A transaction arriving at Pod B is invisible to clients on Pod A.

**Decision:**
Use SignalR's built-in Redis Backplane (`AddStackExchangeRedis`).

When any pod calls `hubContext.Clients.All.SendAsync(...)`, SignalR internally:
1. Publishes the message to a Redis channel
2. All other pods receive it via their Redis subscription
3. Each pod forwards the message to its own WebSocket clients

```
POST → Pod B
  Pod B → hubContext.Clients.All.SendAsync(tx)
    → SignalR publishes to Redis channel
      → Pod A receives from Redis → sends to its clients ✓
      → Pod C receives from Redis → sends to its clients ✓
      → Pod B sends to its own clients ✓
```

**Why not manual Pub/Sub?**
A previous version implemented Redis Pub/Sub manually (RedisSubscriberService).
This was removed in favor of the built-in backplane — less code, no custom
reconnection logic, same result, maintained by Microsoft.

**Fallback:**
If Redis is unavailable or not configured, the system falls back to
LocalBroadcastService (single-pod mode via in-process Channel).

---

### ADR-002: EF Core Provider Abstraction

**Status:** Implemented

**Context:**
Development needs zero-setup (SQLite). Production needs a shared, scalable DB (PostgreSQL).

**Decision:**
EfTransactionService depends on IDbContextFactory<AppDbContext> — it has no
knowledge of which DB engine is used. The provider is configured once in Program.cs
based on the DATABASE_PROVIDER environment variable.

This avoids a separate PostgresTransactionService, which would be code duplication.

---

### ADR-003: Minimal API over MVC Controllers

**Status:** Implemented

**Context:**
Classic [ApiController] produces less accurate OpenAPI schemas (IActionResult
doesn't describe response types) and adds MVC middleware overhead.

**Decision:**
Use ASP.NET Minimal API with strongly-typed return types:

  Task<Results<Created<Transaction>, Ok<Transaction>, BadRequest<object>>>

OpenAPI automatically generates accurate schemas per response code.
Handlers are plain functions — easier to test without the MVC pipeline.

---

### ADR-004: Redux Toolkit for Frontend State

**Status:** Implemented

**Context:**
The original implementation mixed SignalR lifecycle, HTTP calls, and UI state
inside a single useTransactionHub hook.

**Decision:**
- TransactionHubService — owns SignalR lifecycle + HTTP, dispatches Redux actions
- Redux transactionSlice — single source of truth for all state
- Components — read via useSelector, never touch the network directly

---

## Project Structure

```
backend/
  FinancialMonitor.API/
    Apis/           Minimal API endpoint registration
    DTOs/           Request/Response records (immutable)
    Data/           EF Core DbContext
    Hubs/           SignalR Hub
    Interfaces/     ITransactionService, ITransactionPublisher, ITransactionCacheUpdater
    Messaging/      RedisPublisher, NoOpPublisher, LocalBroadcastService (fallback)
    Models/         Transaction entity
    Services/       EfTransactionService (prod), InMemoryTransactionService (tests)
  FinancialMonitor.Tests/
    TransactionServiceTests.cs   Unit tests (no DB required)

frontend/
  src/
    components/     ConnectionBadge, TransactionRow, StatsBar, Pagination
    hooks/          useTransactionHub (service lifecycle)
    pages/          Monitor, AddTransaction
    services/       TransactionHubService (SignalR + HTTP)
    store/          Redux slice + selectors
    types/          Transaction, TransactionStatus

k8s/               Kubernetes manifests
docker-compose.yml Production compose (PostgreSQL + Redis + Nginx)
```

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| DATABASE_PROVIDER | sqlite | Set to postgres for PostgreSQL |
| ConnectionStrings__PostgreSQL | — | PostgreSQL connection string |
| Redis__ConnectionString | — | Redis host e.g. redis:6379 |
| ASPNETCORE_ENVIRONMENT | Development | Set to Production in containers |
