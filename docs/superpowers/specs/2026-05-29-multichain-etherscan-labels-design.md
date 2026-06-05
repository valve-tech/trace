# Design: Multichain Etherscan Parity + Signature-Attested Labels

## Overview

Three coordinated workstreams that reshape the platform from a single-chain
Tenderly-equivalent into a chain-agnostic Etherscan-parity dev platform with
a community labels layer:

1. **Etherscan v2 API parity** — implement Etherscan's full v2 surface
   (`?chainid=N&module=X&action=Y`) so any tool built against Etherscan
   works against us without changes.
2. **Multichain** — promote the `shared/` package from PulseChain constants
   to a chain registry; each chain gets its own RPC, Blockscout, and
   verification routing. Launch set: chains 1 (Ethereum), 369 (PulseChain),
   943 (PulseChain testnet) — anchored by the existing Reth snapshot fleet.
3. **Signature-attested labels** — wallets connect via Sign-In With Ethereum,
   sign EIP-712-typed label payloads, and store labels in a two-tier system:
   personal (Postgres, private to the signer) and public (an on-chain
   event-only registry per supported chain).

This spec covers all three. Implementation phases at the bottom.

## Goals & Non-Goals

### Goals
- 1:1 surface compatibility with Etherscan v2 for tools that do
  `?chainid={N}&module={X}&action={Y}`.
- One dispatcher, one URL, all chains. No per-chain subdomains.
- Personal labels work without writing to chain; users get a private
  address book that follows their wallet.
- Public labels are on-chain and **read by us** through an indexer, so the
  public label dataset has a verifiable origin even though we serve it.
- The labels layer is multichain by default — labels for an address on
  Ethereum live in Ethereum's registry; PulseChain in PulseChain's; etc.

### Non-Goals
- We are not building label *reputation* or *trust-weighting* on top of
  the on-chain pool in v1. Anyone can publish anything. The UI surfaces
  signer identity (ENS, address) and lets users filter; algorithmic
  trust ranking is a future spec.
- We are not implementing all 70+ Etherscan actions on day 1. Phased
  delivery (see Phase plan); v1 ships the actions BlockView, AddressView,
  ContractView, and TxView already consume.
- We are not running our own verification service. We continue to proxy
  Sourcify per the existing flow.
- v1 of the API (current `/api?module=X&action=Y`, no chainid) does not
  get a sunset date. It coexists indefinitely as the chain-default form,
  pinned to chain 369 for backward compatibility.

## Phase 1: Etherscan v2 surface

### URL shape change

Current:
```
GET /api?module=account&action=balance&address=0x...
```

v2:
```
GET /api?chainid=369&module=account&action=balance&address=0x...
```

`chainid` is optional. When omitted, the dispatcher defaults to a configured
`DEFAULT_CHAIN_ID` env var (initially 369, for compatibility with existing
tooling). When present, the dispatcher resolves the chain via the registry
(see Phase 2) and routes the action's RPC/Blockscout calls to that chain's
endpoints.

### Dispatcher refactor

`packages/api/src/routes/etherscan/dispatcher.ts` currently looks up
`handlers[module][action]` and calls the handler with a flat `params` map.
Each handler reads PulseChain config implicitly via singleton clients in
`tracer/` and `blockscout/`.

Refactor:

1. Extract a `ChainContext` interface — `{ chainId, rpcClient, blockscoutBase, nativeSymbol, hasVerification }`.
2. Build the `ChainContext` once per request in a dispatcher middleware,
   resolving from `chainid` query param → chain registry.
3. Pass `ChainContext` as the second argument to every handler. Handlers
   become pure `(params, ctx) => Promise<EtherscanResponse | JsonRpcResponse>`.
4. The singleton RPC client and Blockscout client get replaced with
   factories (`getRpcClient(chainId)`, `getBlockscoutBase(chainId)`) that
   return per-chain instances.

This is the biggest concrete refactor in the spec. ~25 handler files touch
this; each loses a hardcoded import and gains a `ctx` param.

### Coverage roadmap

Ordered by leverage (BlockView/AddressView/TxView are the highest-traffic UI):

| Module.action | Phase | Notes |
|---|---|---|
| account.* (txlistinternal, getminedblocks, balancehistory) | 1a | extend existing |
| contract.getcontractcreation | 1a | RPC: needs custom Reth call or Blockscout |
| contract.verifyproxycontract, checkproxyverification | 1b | extend Sourcify proxy |
| logs.getLogs | 1b | viem.getLogs with topic/address filters |
| proxy.eth_getUncleByBlockNumberAndIndex | 1b | one-line addition |
| token.tokensupply, tokenbalance, tokenholderlist | 1c | ERC-20 reads + Blockscout |
| gastracker.gasoracle, gasestimate | 1c | viem.estimateFeesPerGas |
| stats.* | 2 | depends on per-chain indexers we don't own yet |

### Backward compatibility

Existing `?module=X&action=Y` (no chainid) requests get treated as
`chainid={DEFAULT_CHAIN_ID}` so every tool currently pointed at us
continues to work. Internal callers (the web app) move to explicit
chainid in Phase 2.

## Phase 2: Multichain

### Chain registry

`shared/` currently exports flat constants:

```ts
export const PULSECHAIN_CHAIN_ID = 369;
export const PULSECHAIN_RPC_URL = "https://rpc.pulsechain.com";
// ...
```

Replace with a registry keyed by chain ID:

```ts
export interface ChainConfig {
  chainId: number;
  name: string;
  shortName: string;
  nativeSymbol: string;
  nativeDecimals: 18;

  rpcUrl: string;          // public RPC
  debugRpcUrl?: string;    // debug_traceTransaction-capable node
  rethSnapshotUrl?: string; // evm{N}-snapshot-reth.valve.city when available

  blockscoutBase?: string; // Blockscout API base; omit if unavailable
  sourcifyEnabled: boolean;

  viemChain: Chain;        // viem chain definition

  // UX hints
  explorerSlug: string;    // path prefix in URLs
  defaultBlockTimeSeconds: number;
}

export const CHAINS: Record<number, ChainConfig> = {
  1: { ... },
  369: { ... },
  943: { ... },
};

export function getChain(chainId: number): ChainConfig;
export function isSupportedChain(chainId: number): boolean;
```

Launch set:
- **1 (Ethereum mainnet)** — `evm1-snapshot-reth.valve.city`, public Blockscout via Etherscan-compatible mirror or our own
- **369 (PulseChain)** — current config
- **943 (PulseChain testnet)** — current testnet config

Extension is a registry entry; no code changes needed downstream.

### RPC client factory

`packages/api/src/services/rpc/` currently has a singleton `publicClient`
bound to `PULSECHAIN_RPC_URL`. Replace with:

```ts
const clients = new Map<number, PublicClient>();

export function getRpcClient(chainId: number): PublicClient {
  const cached = clients.get(chainId);
  if (cached) return cached;
  const chain = getChain(chainId);
  const client = createPublicClient({
    chain: chain.viemChain,
    transport: http(chain.rpcUrl),
  });
  clients.set(chainId, client);
  return client;
}
```

The debug RPC factory follows the same pattern. Tracers (the most
chain-coupled service) take `chainId` and resolve internally.

### Web routing

React Router currently mounts routes like `/block/:numberOrHash`. To
support multichain in URLs, add chain prefix:

```
/:chainSlug/block/:numberOrHash     // /ethereum/block/12345
/:chainSlug/tx/:hash                // /pulsechain/tx/0xabc
/:chainSlug/address/:address        // /pulsechain-testnet/address/0xdef
```

`chainSlug` resolves to `chainId` via `ChainConfig.explorerSlug`. Legacy
URLs (no chainSlug) redirect to the default chain's slug. The TanStack
Query keys gain `chainId` as a prefix to prevent cross-chain cache
collisions.

A chain picker in the top nav lets users switch chains; the route
updates and queries re-fire under the new chain context.

### Frontend API client changes

Every `fetchX` in `packages/web/src/api/explorer.ts` gains a `chainId`
parameter. They emit `?chainid={N}&module=...` requests. The chainId
comes from a `useChainId()` hook that reads from route params.

Migration cost: ~15 call sites in `explorer.ts` plus a handful in
`contractMeta.ts`, `actions.ts`, etc. Mostly mechanical.

## Phase 3: Personal labels (Postgres-only)

### Schema

```sql
CREATE TABLE personal_labels (
  id BIGSERIAL PRIMARY KEY,
  signer_address TEXT NOT NULL,
  chain_id INTEGER NOT NULL,
  target_address TEXT NOT NULL,
  label TEXT NOT NULL,
  category TEXT,            -- "exchange" | "contract" | "scam" | NULL
  notes TEXT,               -- free-text
  signature TEXT NOT NULL,  -- the EIP-712 sig that produced this label
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (signer_address, chain_id, target_address)
);

CREATE INDEX idx_personal_labels_signer ON personal_labels(signer_address);
CREATE INDEX idx_personal_labels_target ON personal_labels(chain_id, target_address);
```

The unique constraint means each wallet has one label per
`(chain_id, target_address)` — replacing prior labels overwrites them.
The full history is the signer's responsibility (their wallet has the
prior signatures); we don't audit-log on the server.

### Auth: Sign-In With Ethereum (SIWE)

Standard SIWE flow:

1. Client requests `GET /api/auth/nonce` → returns a 16-byte random nonce.
2. Client constructs SIWE message including domain, address, nonce,
   issued-at, chain-id, expiration.
3. User signs via wallet.
4. Client posts `{ message, signature }` to `POST /api/auth/login`.
5. Server validates with viem's `verifyMessage`, stores `{ address,
   session_id, expires_at }` in `sessions` table, returns HttpOnly cookie.
6. All subsequent label mutations require the session cookie; reads do
   not.

Session TTL: 7 days. Renewable by re-signing.

### Label payload — aligned with EAS schema

The EIP-712 payload users sign is **the EAS delegated-attestation request
itself**, not a custom domain. This is deliberate: a payload signed for a
personal label can be submitted to EAS *without re-signing* when the user
chooses to publish. Personal and public are the same signed object,
stored in different places.

Schema (registered once on the EAS Schema Registry on PulseChain — see
Phase 4):

```
uint256 chainId, string label, string category, string notes
```

The signed payload is EAS's standard `DelegatedAttestationRequest`:

```ts
const domain = {
  name: "EAS",
  version: "1.2.0",  // pin to the EAS contract version at registration
  chainId: 369,      // canonical chain — see Phase 4
  verifyingContract: EAS_PULSECHAIN_ADDRESS,
};

const types = {
  Attest: [
    { name: "attester", type: "address" },     // the labeler
    { name: "schema", type: "bytes32" },       // our schema UID
    { name: "recipient", type: "address" },    // the labeled target
    { name: "expirationTime", type: "uint64" },
    { name: "revocable", type: "bool" },
    { name: "refUID", type: "bytes32" },       // 0x0 (unused)
    { name: "data", type: "bytes" },           // abi.encode(chainId, label, category, notes)
    { name: "value", type: "uint256" },        // 0
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint64" },
  ],
};
```

API:

| Method | Path | Behavior |
|---|---|---|
| `POST /api/labels` | create or update personal label; requires session + signed payload |
| `GET /api/labels/me` | list my personal labels |
| `GET /api/labels?chainid=N&address=0x...` | union of my personal label (if any) + all public labels for this target |
| `DELETE /api/labels/:id` | delete one of my personal labels |
| `POST /api/labels/:id/publish` | promote a personal label to the on-chain public registry (see Phase 4) |

Note: GET `/api/labels?chainid=N&address=...` is the one new
read-side endpoint the rest of the app consumes. AddressView and
ContractView call it on every render; the response is cached via
TanStack Query keyed by `(chainId, address, signerAddress?)`.

### UI surfaces

- Wallet connect button in top nav (wagmi + viem). When connected,
  shows the signer's ENS + truncated address.
- AddressView gains a "Labels" section:
  - My label (if any) — editable inline.
  - Public labels — list, each with signer ENS/address, "View on chain"
    deep link to the publish-event tx.
- Settings page: "My labels" — full CRUD on personal labels.

## Phase 4: Public labels via EAS on PulseChain

No contract deployment. PulseChain already hosts a deployment of
**Ethereum Attestation Service** (the user has the addresses; pin them
in `shared/src/labels.ts` once provided). We publish public labels as
EAS attestations against a single schema registered once at launch,
and we read them back via an indexer that watches the EAS contract's
`Attested` event.

### Why PulseChain as the canonical labels chain

- ~$0.0001 per publish — practically free, so users actually publish.
- We already operate Reth infrastructure for chain 369; the indexer
  reuses the existing RPC fleet.
- The `chainId` field is in the *payload*, not the contract address —
  so PulseChain holds labels *for every chain we support*. A label of an
  Ethereum address is a PulseChain attestation whose data contains
  `chainId=1`. The registry chain and the labeled chain are decoupled.

The trade-off is that the labels system has a PulseChain dependency at
the storage layer. That's an explicit accepted cost, made worthwhile by
the gas economics.

### Schema registration (one-time, at launch)

Register a schema on the EAS Schema Registry contract on PulseChain:

```
schema: "uint256 chainId, string label, string category, string notes"
resolver: 0x0  // no resolver — we do all validation in the indexer
revocable: true
```

The returned `bytes32` schema UID is hard-coded into the codebase
(`shared/src/labels.ts` — `EAS_LABEL_SCHEMA_UID`). All subsequent
attestations reference this UID.

### Authority model — relayer pattern via `attestByDelegation`

The on-chain authority is the **EIP-712 signer**, not the transaction
sender. Flow:

1. User signs the EAS delegated-attestation EIP-712 payload (see Phase 3
   schema). The signed object names the user as `attester`. **No gas, no
   transaction.**
2. Client posts the signed payload to `POST /api/labels/publish`.
3. Our backend acts as relayer: calls
   `EAS.attestByDelegation({...payload, signature})` on PulseChain,
   paying gas.
4. EAS verifies the EIP-712 signature, recovers the attester address,
   and emits:

   ```
   event Attested(
     address indexed recipient,    // the labeled target
     address indexed attester,     // recovered from the signature, NOT msg.sender
     bytes32 uid,                  // unique attestation id
     bytes32 indexed schemaUID     // our schema UID
   )
   ```

5. Indexer (next section) picks up the event and indexes the
   attestation.

Properties this gives us:
- **Zero user gas.** Users only sign; we pay PulseChain gas.
- **True authority is in the event.** `Attested.attester` is the EIP-712
  signer regardless of who relayed.
- **Backend abuse is rate-limited at the relayer**, not the chain. Users
  who sign too many attestations get their session throttled before we
  submit on their behalf.
- **Anyone can also bypass our relayer** and call EAS directly with
  their own signed payload. The on-chain record is identical; our
  indexer picks it up the same way. This is the property that keeps
  labels independent of us — we are infrastructure, not gatekeeper.

### Indexer

New service `packages/api/src/services/labelsIndexer/`:

- Single viem `watchContractEvent` loop on the EAS contract on chain
  369, filtered by `schemaUID === EAS_LABEL_SCHEMA_UID`.
- On `Attested`: fetch the attestation by UID (EAS's `getAttestation`),
  decode the data field as `(uint256 chainId, string label, string
  category, string notes)`, upsert into `public_labels`.
- On `Revoked`: mark the corresponding row as revoked (soft-delete with
  `revoked_at` timestamp so we can audit if needed).
- On startup: replay events from `last_indexed_block` cursor in
  Postgres. EAS's `Attested` event has been emitted since deployment;
  pin a `START_BLOCK` constant for our schema's first attestation to
  skip pre-schema scanning.
- Reorgs: PulseChain finality is fast (~10s); re-index the last 24
  blocks on each poll cycle. Idempotent upserts make this safe.

```sql
CREATE TABLE public_labels (
  uid BYTEA PRIMARY KEY,           -- EAS attestation UID
  chain_id INTEGER NOT NULL,        -- chain the label targets
  target_address TEXT NOT NULL,
  attester_address TEXT NOT NULL,   -- recovered EIP-712 signer
  label TEXT NOT NULL,
  category TEXT,
  notes TEXT,
  issued_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  block_number BIGINT NOT NULL,
  tx_hash TEXT NOT NULL,
  log_index INTEGER NOT NULL
);

CREATE INDEX idx_public_labels_target ON public_labels(chain_id, target_address) WHERE revoked_at IS NULL;
CREATE INDEX idx_public_labels_attester ON public_labels(attester_address) WHERE revoked_at IS NULL;

CREATE TABLE indexer_cursors (
  id TEXT PRIMARY KEY,              -- e.g. "eas-pulsechain"
  last_indexed_block BIGINT NOT NULL
);
```

Note the primary key is the attestation UID, not `(chain_id, target,
attester)` — a single attester can publish multiple attestations for
the same target over time (e.g., updates). The latest non-revoked
attestation per `(target, attester)` wins for display; older
attestations remain for audit history.

### Publish flow

From the personal-label "Publish" action:

1. Client gathers the personal label and reconstructs the EAS
   delegated-attestation payload (same EIP-712 schema the personal
   label was signed under in Phase 3 — same signature can be reused if
   `nonce`/`deadline` are still valid).
2. If the original signature has expired, re-sign with fresh
   `nonce`/`deadline`.
3. Client posts `{ payload, signature }` to `POST /api/labels/publish`.
4. Backend submits to EAS via `attestByDelegation`. Returns the
   resulting `uid` and `txHash` on success.
5. Indexer picks up the `Attested` event within one PulseChain block.
6. The label appears in `GET /api/labels?chainid=N&address=...` for
   every reader.

The personal record is **not** deleted after publishing; both records
coexist. The user's "Settings → My Labels" page shows publish status
("Personal only" / "Published — view on chain ↗") for each entry.

### Read flow

`GET /api/labels?chainid=N&address=...` returns:

```json
{
  "personal": { "label": "...", "category": "...", "notes": "..." } | null,
  "public": [
    {
      "signer": "0x...",
      "signerEns": "vitalik.eth" | null,
      "label": "...",
      "category": "...",
      "notes": "...",
      "issuedAt": 1717000000,
      "txHash": "0x...",
      "blockNumber": 21000000
    }
  ]
}
```

The UI sorts public labels by signer reputation heuristics that ship
in a future phase. For v1, sort by `issued_at desc`.

## Phased rollout plan

| Phase | Scope | Risk | Ship target |
|---|---|---|---|
| **1a** | v2 dispatcher refactor (chainid param + per-chain `ChainContext`); single-chain (369) only | Medium — touches every handler | 2 weeks |
| **1b** | Etherscan action coverage gaps (logs.getLogs, contract.getcontractcreation, proxy uncles) | Low | 1 week |
| **2a** | Chain registry + Ethereum mainnet (chain 1); web route prefix, chain picker | Medium — frontend route surgery | 2 weeks |
| **2b** | PulseChain testnet (943); per-chain TanStack cache keys | Low | 1 week |
| **3** | Wallet connect + SIWE auth + personal labels (Postgres) | Medium — first wallet integration | 2 weeks |
| **4a** | LabelRegistry contract + Foundry deploy script; deployed to all three chains via CREATE2 | Medium — first onchain artifact in this repo | 1.5 weeks |
| **4b** | Indexer service + public labels read API | Low | 1 week |
| **4c** | Publish UX + cross-flow polish | Low | 1 week |

Total: ~12 weeks if done strictly sequentially. Phases 1a/2a can overlap
once 1a stabilizes.

## Open questions

Decisions deferred from this spec — flag for follow-up before the relevant
phase ships:

1. **CREATE2 deployer choice for LabelRegistry.** Use Safe's CreateX,
   keyless deterministic deployer (Arachnid's), or our own? Affects gas
   cost and trust model. (Phase 4a.)
2. **Native-currency-name display** when no Blockscout exists. Phase 2
   needs a fallback for `valuePLS`-style formatting on chains where we
   don't yet have native price data. Likely render as raw symbol
   ("1.234 ETH") with no USD conversion in v1.
3. **Per-chain rate-limit budgets.** Public RPC for Ethereum mainnet
   has stricter limits than PulseChain's. The per-chain RPC client
   factory should accept a rate-limit policy; design TBD.
4. **Sign-out / session revocation UX.** SIWE doesn't natively express
   revocation. Server-side session deletion works for the cookie path
   but doesn't invalidate the original signature. Probably fine for
   personal labels; surface as a "Sign out" button that clears the
   cookie.
5. **Label moderation surface.** Even a permissionless on-chain registry
   needs some client-side filtering to suppress obviously abusive labels
   (slurs, doxxing). Likely a static deny-list shipped with the client;
   bigger reputation system is a future spec.
6. **Cross-chain label inheritance.** If a user labels an address on
   Ethereum, should the same label automatically apply on every chain
   for the same address? Probably no in v1 (an address can be a router
   on one chain and a scammer on another), but worth revisiting after
   usage data.

## File-by-file change inventory (Phase 1a only, as a sanity check)

| Path | Change |
|---|---|
| `shared/src/chains.ts` | NEW — chain registry |
| `shared/src/index.ts` | export registry instead of PulseChain constants |
| `packages/api/src/routes/etherscan/dispatcher.ts` | parse `chainid`, build `ChainContext`, pass to handlers |
| `packages/api/src/routes/etherscan/handlers/*.ts` | every handler gains `(params, ctx)` signature |
| `packages/api/src/services/rpc/index.ts` | replace singleton with `getRpcClient(chainId)` factory |
| `packages/api/src/services/tracer/*` | resolve RPC client by chainId per call |
| `packages/api/src/services/blockscout/*` | resolve Blockscout base by chainId per call |
| `packages/web/src/api/explorer.ts` | add `chainId` param to every fetch fn |
| `packages/web/src/hooks/useChainId.ts` | NEW — reads chain from route, falls back to default |
| (every component reading from explorer.ts) | thread `chainId` from `useChainId()` |

Phase 1a is the largest single refactor. Phases 2–4 are mostly additive.

## Naming

Per the 2026-05-29 brand discussion, the platform name is still
"Explore" pending revisit. The contract name `LabelRegistry` and the
EIP-712 domain `name: "Explore Labels"` should be aligned with the
final brand before Phase 4 deployment, since contract bytecode is
immutable once deployed via CREATE2.
