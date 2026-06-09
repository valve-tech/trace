# Session checkpoint — 2026-06-09 (self-host & portability)

One coherent arc this session: **make Explore portable and self-hostable** — the
frontend loads from anywhere and points at any backend; the backend runs for any
EVM chain on the operator's own infra. Plus the chain-aware backend tail and a
multi-agent frontend coverage pass. All shipped to `main`, every gate green.

## Headline

Explore went from "valve's 3-chain hosted explorer" to "run-your-own for any
EVM chain":

- **Frontend is gateway-portable** — an IPFS dual-build (HashRouter + relative
  assets + baked backend origin) and a configurable backend origin, so the SPA
  can be served from IPFS and talk to any backend.
- **Reads can run on the user's infra** — bring-your-own-RPC per chain; raw
  JSON-RPC resolves to the user's node when set.
- **Backend serves any chain** — the chain registry is config-driven (YAML/JSON),
  no recompile. One container serves UI + API + docs.
- **No hardcoded "valve" identity** — OpenAPI/docs branding is env-driven.

The user steered AWAY from a server-side notification monitor (which exists and
is efficient) TOWARD client-side watching + BYO-RPC, so watching costs the user,
not us. Captured as memory `project_self_host_portability`.

## What shipped (commits)

| Commit | What |
|---|---|
| `ed8ae0c` | chain-aware virtual testnets — Anvil forks honor `?chainid` (the tail of 157ca75; forkManager resolves upstream per-request) |
| `4d6f5af` | pre-existing `lint:spacing` break in TopBar (gap-1/2 → semantic tokens) |
| `6751258` | IPFS-portable frontend — `apiBase` resolver (localStorage override → `VITE_API_BASE` → same-origin), `VITE_IPFS` dual-build (base `./` + HashRouter), ~76 fetches routed through `apiUrl()` |
| `4b699f5` | `scripts/deploy-ipfs.sh` + `npm run deploy:ipfs` — build → pin to a kubo node → print CID + DNSLink |
| `34d52bb` `fe729d8` `ae99cd4` | **3-agent parallel fan-out** (disjoint files): chain-aware testnet UI; Settings backend-origin override; chain-aware mempool/gas/RPC-playground |
| `d324eb1` | bring-your-own-RPC — `lib/rpcEndpoint.ts` `resolveRpcUrl(chainId)`; `sendRpcRequest` routes through it (one seam → every raw read honors BYO) |
| `e48c98d` | **config-driven chain registry** — `CHAINS_JSON`/`CHAINS_CONFIG_PATH` build the registry; viem chains synthesized for custom ids; valve set is the default. `docs/SELF_HOSTING.md` |
| `4465af0` | YAML config (yaml dep; JSON ⊂ YAML), `compose.selfhost.yml` + `chains.example.yml`, env-driven OpenAPI branding (`PUBLIC_BASE_URL`/`OPENAPI_TITLE`/`OPENAPI_CONTACT_EMAIL`) |
| `b99f728` | read-through fix: self-host is ONE container (API serves the SPA); dropped the redundant nginx `web` service |

## Verification (current)

- API: **486 unit tests** pass; tsc + OpenAPI build clean. Forking verified live
  (anvil 1.6.0): `?chainid=943`→`0x3af`, `369`→`0x171`. Config-driven registry
  smoke: a Base+Optimism `CHAINS_JSON` serves `[10, 8453]` with synthesized viem
  chains, 8453 default.
- Web: **569 tests** pass; tsc/eslint/lint:spacing clean; cold canonical build
  (absolute `/assets` + BrowserRouter) AND `build:ipfs` (relative `./assets` +
  HashRouter + baked origin) both green.
- SIWE-lite auth + encrypted workspace sync (built in a prior session) was
  **verified** end-to-end this session: 12/12 backend assertions (real
  viem-signed challenge) + 36/36 client tests. Nothing to build — it was done.

## The "run your own" surface (all live)

| Layer | Knob |
|---|---|
| Which chains the backend serves | `CHAINS_CONFIG_PATH` / `CHAINS_JSON` (YAML or JSON) |
| Per-chain RPC (server) | `ETH_RPC_URL` / `PULSECHAIN_RPC_URL` / `PULSECHAIN_V4_RPC_URL` or config `rpcUrl` |
| Raw RPC (client/browser) | Settings → Chain RPC endpoints (`lib/rpcEndpoint.ts`) |
| Which backend (frontend) | Settings → Backend API origin (`lib/apiBase.ts`) |
| Where the SPA lives | `build:ipfs` + `deploy:ipfs` (kubo pin + DNSLink) |
| API/docs identity | `PUBLIC_BASE_URL` / `OPENAPI_TITLE` / `OPENAPI_CONTACT_EMAIL` |

One-command self-host: `cp chains.example.yml chains.yml && docker compose -f
compose.selfhost.yml up -d` → everything on `:10100`.

## Handoffs / not-ours

- **IPFS pin is operator/monorepo work** (can't reach the fleet). Wrote
  `monorepo/docs/superpowers/specs/2026-06-09-explore-ipfs-frontend-deploy-handoff.md`
  (UNCOMMITTED on monorepo `master`) — targets the indexer box's existing kubo
  (`95.217.41.159:5001`, where chifra pins) + the `ipfs.valve.city` gateway.
  Deterministic CID for `4b699f5`: `bafybeia6qbcrlc2laklwj3ec7fq4neb7hczkyc2evtomrriw4gfytbrege`.
- **API-side changes go live on a container rebuild** of `explore.valve.city`
  (chain-aware forking, SIWE). Independent of IPFS; operator step.

## Still open / candidates

- **Client-side watcher** (the actual notification feature) — greenfield, sits
  on the BYO-RPC foundation now in place: viem `watchEvent`/`watchBlocks` per
  workspace rule, in-app notification UX, tab-open only. Needs a viem client
  factory (`getPublicClient(chainId)`) + the rule model.
- **"All raw reads direct"** — the `sendRpcRequest` seam covers JSON-RPC-shaped
  reads; the explorer's *enriched* reads (Etherscan dispatcher / ABI / source /
  traces) stay on the backend by design. Migrating the raw-able explorer
  surfaces (block/tx/balance/code) is incremental, per-surface.
- **Cross-origin auth from IPFS** — wallet sign-in + encrypted sync need
  `sameSite=none` + a credentialed CORS allowlist to work from a gateway origin
  (read-only explorer works today).
- **Cosmetic valve refs in OpenAPI prose** — the federation/`one.valve.city`
  description text is still hardcoded (structured fields are env-driven now).

## Housekeeping

- Memory added: `project_self_host_portability` (+ MEMORY.md pointer).
- `yaml` added as an API dep.
- New env vars: `CHAINS_JSON`, `CHAINS_CONFIG_PATH`, `DEFAULT_CHAIN_ID`,
  `PUBLIC_BASE_URL`, `OPENAPI_TITLE`, `OPENAPI_CONTACT_EMAIL`. Documented in
  `docs/SELF_HOSTING.md`.
