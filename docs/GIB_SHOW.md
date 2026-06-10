# gib.show — chain & token image service

Reference for the external image service Explore uses for chain logos and
token art. Findings verified live on **2026-06-10** by probing both hosts and
extracting the docs content from the site's app bundle (the `/docs` pages are
client-rendered; the endpoint table below is lifted from that source).

**Where we use it:**

- `packages/web/src/lib/chains.ts` → `chainLogoUrl(chainId)` →
  `https://gib.show/image/<chainId>` (chain/network icon)
- `packages/web/src/components/primitives/TokenImage.tsx` →
  `https://gib.show/image/<chainId>/<address>` (token art)

## API surface (documented)

| Endpoint | Purpose |
|---|---|
| `GET /image/{chainId}` | Network/chain icon. `?only=vector\|raster` filters source format |
| `GET /image/{chainId}/{address}` | Token image, priority-ordered by list ranking. Supports `?as=webp\|png\|jpg\|avif`, `?w=&h=` (1–2048px resize), `?mode=link` (redirect to origin URI), `?providerKey=&listKey=`, `?only=` |
| `GET /image/{chainId}/{address}.{ext}` | Extension-suffix form of `?as=` |
| `GET /image/?i={chainId}/{address}` | Batch lookup — repeated `i=` params, first match wins |
| `GET /image/{order}/{chainId}/{address}` | Token image with explicit provider ordering (e.g. `default`) |
| `GET /image/fallback/{order}/{chainId}/{address}` | Ordered lookup, falls back to unordered |
| `GET /image/direct/{hash}.{ext}` | Content-addressed access by image hash |
| `GET /networks` | All supported networks (`type`, `chainId`, `chainIdentifier`, `imageHash`) |
| `GET /list/` | All token lists. `?key=`, `?provider_key=`, `?chain_id=`, `?chain_type=`, `?default=` |
| `GET /list/{providerKey}/{listKey}[/{version}]` | A specific (optionally versioned) token list. `?chainId=`, `?decimals=`, `?extensions=` |
| `GET /list/merged/{order}` | Merged token list using a named ordering |
| `GET /list/tokens/{chainId}` | Deduplicated ranked tokens for a chain. `?limit=` (default 50k, max 100k) |
| `GET /sprite/{providerKey}/{listKey}[/sheet]` | Sprite-sheet manifest (JSON) / rendered sheet (WebP) |
| `GET /stats` | Per-chain token counts |

## Chain identifier forms

Three shapes were probed for the chain-icon route:

| URL | Result |
|---|---|
| `/image/369` | **200** — the documented form. Use this. |
| `/image/eip155-369` | 200 — unpublished alias. The service's own `chainIdentifier` field uses this dash form (`eip155-<id>`), and the route accepts it. |
| `/image/eip155:369` | **404** — the CAIP-2 colon form is not supported anywhere. |

The prefix in the dash form is parsed but **ignored**: `/image/1`,
`/image/eip155-1`, and even `/image/tvm-1` return byte-identical content
(verified by SHA-1). Resolution is by numeric id only.

## Protocol-type caveat

`/networks` carries a protocol differentiator — `type` ∈ `evm | btc | solana |
tvm` — and numeric `chainId` is **not unique across types**: a `tvm` network
with `chainId: 1` coexists with Ethereum mainnet (`evm`, `chainId: 1`). Both
are stamped `chainIdentifier: eip155-1`, and the tvm network's distinct
`imageHash` is unreachable through any image route (its full content hash
404s on `/image/direct/`; the evm one resolves). So the image layer cannot
disambiguate protocols today, by any published or unpublished shape.

**Our exposure:** none in practice — the Explore chain registry
(`packages/web/src/lib/chains.ts`) is EVM-only (1 / 369 / 943). If gib.show
later fixes type disambiguation, the `eip155-<id>` dash form is the likely
stable key; switching `chainLogoUrl` to it is a one-line change.

## staging.gib.show vs gib.show

Same application, separate deployment and data:

- **Code/API:** identical — same bundle content and identical documented
  endpoint set on both hosts.
- **Infrastructure:** both behind Cloudflare on Railway, but different
  regions (prod `us-east4`, staging `us-west2`) — separate deployments, not
  a CDN alias.
- **Data:** separate databases. Staging runs *ahead* for new networks (at
  the time of writing it had one network prod lacked: `evm` chain `10143`,
  Monad testnet); per-chain token counts diverge slightly in both directions,
  consistent with independent ingest runs. All shared networks had identical
  `imageHash`es.

Use production (`gib.show`) in app code. Staging is useful only for checking
whether an upcoming network's icon has landed before it is promoted.
