# PulseChain Dev Platform

## Codebase Overview

A Tenderly-equivalent developer toolchain for PulseChain (chain ID 369). Seven features — transaction simulation, block explorer, monitoring/alerting, virtual testnets (Anvil forks), smart contract debugger, enhanced JSON-RPC proxy, and serverless Web3 Actions — delivered as a TypeScript monorepo.

**Stack:** React 19 + React Router 7 + Vite + Tailwind v4 + TanStack Query 5 (frontend), Express 4 + viem + Postgres (`pg`) (backend), Zod (validation), Anvil/Foundry (forks)

**Structure:**
- `packages/api/` — Express backend (port 10100), routes + services architecture (most services split into per-responsibility subdirectories)
- `packages/sdk/` — `@valve-tech/trace-sdk` published npm package (React components, hooks, parsers, risks); ESM-only, 100% coverage gate
- `packages/web/` — React SPA (router-based, 12 routes), dark theme, TanStack Query persisted to IndexedDB
- `shared/` — PulseChain network constants (no build step)
- `docs/` — Product spec, per-feature specs, and [CODEBASE_MAP.md](docs/CODEBASE_MAP.md)

For detailed architecture, service dependencies, data flows, and gotchas, see [docs/CODEBASE_MAP.md](docs/CODEBASE_MAP.md).

## Quick Start

```bash
npm install
docker compose up -d postgres  # backing store
npm run dev                    # Starts API (port 10100) + Web (Vite) concurrently
npm run dev:api                # API only
npm run dev:web                # Frontend only
```

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `10100` | API server port |
| `DATABASE_URL` | `postgres://valvetech:valvetech@localhost:5432/valvetech` | Postgres connection |
| `PULSECHAIN_RPC_URL` | `https://rpc.pulsechain.com` | PulseChain RPC endpoint |
| `DEBUG_RPC_URL` | (falls back to `PULSECHAIN_RPC_URL`) | Debug-enabled node for traces |
| `BLOCKSCOUT_API_URL` | `https://api.scan.pulsechain.com/api` | ABI + explorer data |

Local `.env` is auto-loaded by `dotenv/config` in `packages/api/src/index.ts`. `.env` is gitignored — never commit private RPC URLs or tokens.

## Testing

```bash
# API integration tests — require live server on :10100 + live PulseChain RPC
npm run test --workspace=packages/api

# SDK unit tests — vitest, 100% coverage gate
npm run test --workspace=packages/sdk

# Web unit tests — vitest + jsdom
npm run test --workspace=packages/web
```

API tests use Node's `node:test` against a live server. SDK and web tests use Vitest + Testing Library.
