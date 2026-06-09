# Self-hosting Explore

Explore is split so you can run your own instance for **any EVM chain** — not
just the hosted launch set (Ethereum / PulseChain / PulseChain v4).

- **Backend** — a single container (`packages/api/Dockerfile`) serving the API +
  the web SPA. You tell it which chains it serves via config; it talks to your
  RPC nodes.
- **Frontend** — the same SPA can also be served from anywhere (e.g. an IPFS
  gateway) and pointed at *any* backend via Settings → **Backend API origin**.

If you don't provide a chains config, the backend runs the default valve set and
behaves exactly like the hosted deployment.

## 1. Tell the backend which chains to serve

Provide a JSON array of chains via **either**:

| Env | Meaning |
|-----|---------|
| `CHAINS_JSON` | the config inline as a JSON string |
| `CHAINS_CONFIG_PATH` | path to a JSON file with the same array |

When set, this **replaces** the default set — you declare exactly the chains
your instance serves. Only `rpcUrl` is required per chain; everything else has a
default, and viem chain objects are synthesized for ids viem doesn't ship.

### Chain object fields

| Field | Required | Default | Notes |
|-------|----------|---------|-------|
| `chainId` | ✓ | — | EIP-155 id |
| `name` | ✓ | — | display name |
| `rpcUrl` | ✓ | — | your node / provider URL (key in the path is fine) |
| `nativeSymbol` | | `ETH` | native asset ticker |
| `shortName` | | slug of `name` | |
| `debugRpcUrl` | | — | a `debug_traceTransaction`-capable node (enables the debugger/tracer) |
| `blockscoutBase` | | — | Blockscout API base — enables ABI/verified-source enrichment |
| `sourcifyEnabled` | | `true` | use the public Sourcify for verified sources |
| `chifraChain` | | slug of `name` | TrueBlocks daemon slug (address history; needs a reachable `CHIFRA_BASE_URL`) |
| `explorerSlug` | | slug of `name` | URL prefix |
| `defaultBlockTimeSeconds` | | `12` | UI estimates |
| `testnet` | | `false` | dims it in pickers |
| `default` | | — | set `true` on one chain to make it the no-`?chainid` fallback |

### Example

```json
[
  {
    "chainId": 8453,
    "name": "Base",
    "rpcUrl": "https://mainnet.base.org",
    "nativeSymbol": "ETH",
    "blockscoutBase": "https://base.blockscout.com/api",
    "defaultBlockTimeSeconds": 2,
    "default": true
  },
  {
    "chainId": 10,
    "name": "Optimism",
    "rpcUrl": "https://mainnet.optimism.io",
    "nativeSymbol": "ETH",
    "defaultBlockTimeSeconds": 2
  }
]
```

```bash
docker run -p 10100:10100 \
  -e DATABASE_URL=postgres://user:pass@db:5432/explore \
  -e CHAINS_JSON="$(cat my-chains.json)" \
  explore:latest
```

The default chain (for requests without `?chainid`) resolves as:
`DEFAULT_CHAIN_ID` env → a chain flagged `"default": true` → `369` if present →
the lowest configured id.

## 2. Backend environment reference

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `10100` | API/SPA port |
| `DATABASE_URL` | local dev string | Postgres — required (caches, auth nonces, alerts, workspace blobs) |
| `CHAINS_JSON` / `CHAINS_CONFIG_PATH` | (valve set) | the chains this instance serves |
| `DEFAULT_CHAIN_ID` | `369` / lowest | fallback chain for `?chainid`-less requests |
| `CHIFRA_BASE_URL` | `https://chifra.valve.city` | TrueBlocks daemon for address history |
| `ETH_RPC_URL` / `PULSECHAIN_RPC_URL` / `PULSECHAIN_V4_RPC_URL` | valve RPC | per-chain RPC for the **default set only** (a `CHAINS_JSON` chain carries its own `rpcUrl`) |
| `DEBUG_RPC_URL` | falls back to chain RPC | debug-enabled node for traces |
| `BLOCKSCOUT_API_URL` | PulseChain Blockscout | default-set ABI/explorer data |

`.env` is loaded at startup but never baked into the image — pass env at run
time.

## 3. What needs which infra

The core explorer (blocks, txs, addresses, logs, simulate, debugger if you set
`debugRpcUrl`) needs only **your RPC + Postgres**. These features degrade
cleanly when their backing service isn't configured:

- **Verified source / ABI decode** — needs `blockscoutBase` and/or Sourcify.
- **Address transaction history & token transfers** — needs a TrueBlocks
  (`chifra`) daemon at `CHIFRA_BASE_URL` that indexes your chain.
- **Decompilation of unverified contracts** — needs `heimdall-rs` on PATH.
- **Portfolio holdings / prices** — needs the substreams data layer (valve-only
  today); absent, holdings return `indexed:false`.

## 4. Front the SPA elsewhere (optional)

The same container serves the SPA at `/`. To serve it from an IPFS gateway
instead, build the portable bundle (`npm run build:ipfs` → `npm run deploy:ipfs`,
see `DEPLOY.md`) and have users set **Settings → Backend API origin** to your
backend URL. Raw-RPC reads can additionally be pointed at a user's own node via
**Settings → Chain RPC endpoints**.
