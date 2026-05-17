# Feature 6: Enhanced Node RPC

**Status: TODO**

## Overview
A JSON-RPC proxy layer that passes standard methods through to PulseChain while adding custom methods for simulation, tracing, and event subscriptions. Includes API key management, rate limiting, and request analytics.

## Custom RPC Methods
- `valve_simulateTransaction` — simulate a tx (calls our simulator service)
- `valve_simulateBundle` — simulate a sequence of txs
- `valve_traceTransaction` — get execution trace (calls our debug service)
- `valve_getAssetChanges` — preview asset changes for a tx
- `valve_decodeTransaction` — decode calldata with auto-fetched ABI
- `valve_subscribe` — subscribe to custom event filters with webhook delivery

## Standard Passthrough Methods
All standard `eth_*` methods are proxied directly to the upstream PulseChain RPC:
- `eth_call`, `eth_sendRawTransaction`, `eth_getTransactionByHash`, etc.
- `eth_subscribe` / `eth_unsubscribe` via WebSocket

## Endpoints
- `POST /rpc` — JSON-RPC endpoint (handles both standard and custom methods)
- `WebSocket /ws` — WebSocket RPC endpoint with subscription support
- `POST /api/rpc/keys` — Create API key
- `GET /api/rpc/keys` — List API keys
- `DELETE /api/rpc/keys/:id` — Revoke API key
- `GET /api/rpc/analytics` — Request analytics (counts, latency, errors)

## Features
- **API Key Auth**: optional API key in header or query param
- **Rate Limiting**: per-key configurable rate limits
- **Request Logging**: every request logged with method, latency, status
- **Analytics Dashboard**: method breakdown, error rates, p50/p95 latency
- **Caching**: cache `eth_getBlockByNumber` (finalized), `eth_getTransactionByHash`, etc.
- **Failover**: if primary RPC is down, fall back to secondary endpoints
- **WebSocket multiplexing**: single upstream WS connection, fan out to multiple clients

## Backend Architecture
- Express middleware intercepts JSON-RPC requests
- Router dispatches standard methods to upstream, custom methods to internal services
- API key validated from SQLite/PostgreSQL
- Rate limiter (sliding window) backed by in-memory or Redis
- Request logger writes to append-only log / analytics table

## Frontend Components
- **RPC dashboard** — endpoint URL, connection status, usage stats
- **API key manager** — create/revoke keys, set rate limits
- **Analytics view** — charts for request volume, latency, error rate by method
- **Method explorer** — interactive docs for custom methods with try-it-out
