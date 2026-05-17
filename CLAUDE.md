# PulseChain Dev Platform

## Codebase Overview

A Tenderly-equivalent developer toolchain for PulseChain (chain ID 369). Seven features — transaction simulation, block explorer, monitoring/alerting, virtual testnets (Anvil forks), smart contract debugger, enhanced JSON-RPC proxy, and serverless Web3 Actions — delivered as a TypeScript monorepo.

**Stack:** React 19 + Vite + Tailwind v4 (frontend), Express 4 + viem + Postgres (`pg`) (backend), Zod (validation), Anvil/Foundry (forks)

**Structure:**
- `packages/api/` — Express backend (port 10100), routes + services architecture
- `packages/web/` — React SPA, tab-based navigation, dark theme
- `shared/` — PulseChain network constants
- `docs/` — Product spec and per-feature specs

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
# Requires live server on :10100
npm run test --workspace=packages/api
```

Tests use Node.js built-in test runner (`node:test`) with real PulseChain data.
