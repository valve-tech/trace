# PulseChain Dev Platform

## Codebase Overview

A Tenderly-equivalent developer toolchain for PulseChain (chain ID 369). Seven features — transaction simulation, block explorer, monitoring/alerting, virtual testnets (Anvil forks), smart contract debugger, enhanced JSON-RPC proxy, and serverless Web3 Actions — delivered as a TypeScript monorepo.

**Stack:** React 19 + Vite + Tailwind v4 (frontend), Express 4 + viem + better-sqlite3 (backend), Zod (validation), Anvil/Foundry (forks)

**Structure:**
- `packages/api/` — Express backend (port 3001), routes + services architecture
- `packages/web/` — React SPA, tab-based navigation, dark theme
- `shared/` — PulseChain network constants
- `docs/` — Product spec and per-feature specs

For detailed architecture, service dependencies, data flows, and gotchas, see [docs/CODEBASE_MAP.md](docs/CODEBASE_MAP.md).

## Quick Start

```bash
npm install
npm run dev        # Starts API (port 3001) + Web (Vite) concurrently
npm run dev:api    # API only
npm run dev:web    # Frontend only
```

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `3001` | API server port |
| `PULSECHAIN_RPC_URL` | `https://rpc.pulsechain.com` | PulseChain RPC endpoint |
| `DEBUG_RPC_URL` | (falls back to RPC_URL) | Debug-enabled node for traces |
| `BLOCKSCOUT_API_URL` | `https://api.scan.pulsechain.com/api` | ABI + explorer data |

## Testing

```bash
# Requires live server on :3001
npm run test --workspace=packages/api
```

Tests use Node.js built-in test runner (`node:test`) with real PulseChain data.
