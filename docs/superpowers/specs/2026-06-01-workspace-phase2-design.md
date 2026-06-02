# Design: Workspaces Phase 2 — Notifications, Encrypted Sync, IPFS Frontend

## Status

Design — not yet implemented. Workspaces v0 (heterogeneous bookmark buckets,
local IDB, four add-UX flows) shipped 2026-05-31 / 2026-06-01. This doc
captures the three Phase 2 threads the user raised together:

1. Per-item **notifications** — "alert me when X happens to this address"
2. **Encrypted opt-in cloud sync** — workspaces follow the user across
   devices/browsers, but the backend only ever sees ciphertext
3. **IPFS-pinned frontend** — the SPA loads from IPFS with a configurable
   backend, so users can self-serve the UI

Each can ship independently. They share one architectural choice (where the
"user identity" comes from) that's called out separately at the bottom.

---

## 1. Per-item Notifications

### Goal
Let a user attach simple rules to any Workspace item: "tell me when this
address gets its next inbound tx", "tell me when this contract emits event
X", "tell me when this block's miner changes" (… not really useful — see
recommended rule shapes below).

### Rule model (proposed)

```ts
type AlertTrigger =
  | { kind: "any-tx"; address: string }
  | { kind: "outbound-tx"; address: string }
  | { kind: "inbound-tx"; address: string }
  | { kind: "event-emitted"; address: string; topic0: string }
  | { kind: "balance-change"; address: string; deltaWei: string }; // signed
type AlertChannel = "in-app" | "email" | "webhook";
interface Alert {
  id: string;
  workspaceItemId: string; // foreign key into Workspace.items
  trigger: AlertTrigger;
  channel: AlertChannel;
  createdAt: number;
  /** ms epoch of last fire — used for rate-limit + UI display. */
  lastFired?: number;
  /** Cron-style window OR null for "fire immediately every match". */
  rateLimit?: { minIntervalMs: number };
}
```

Notes on the rule kinds:

* **`balance-change`** is the highest-leverage trigger (covers "drain", "ape
  in", "unknown counterparty"). Needs a signed delta so user can spec
  `< -10 ETH` or `> 0`.
* **`event-emitted`** is more powerful than `any-tx` for contracts —
  pre-filter at the indexer rather than firing on every tx through a busy
  proxy. Decoded event payloads should be available in the alert (so a
  Transfer alert shows "0xA → 0xB, 1000 USDC", not "event 0xddf252ad…").
* **`block-mined`** intentionally omitted — workspaces include blocks but
  alerting on a static block doesn't make sense (blocks don't change).

### Trigger strategy — three options

**A. Frontend polling.** Each open tab polls the backend on a timer (`/api/
alerts/poll?since={ts}`) and renders in-app banners. *Pro:* zero backend
state, no email infra. *Con:* alerts silently miss if the user isn't on the
site; useless for "drain" alerts the user actually needs.

**B. Backend cron + push.** Backend has a worker that reads the indexer +
emits webhook/email/SSE-to-open-tabs. *Pro:* alerts fire whether or not the
user is online. *Con:* needs a real subscription store + an indexer that
exposes the events we care about — we have most of these (Blockscout + RPC
trace + log) but they're spread across services.

**C. Per-tab WebSocket subscription.** Backend pushes to open WS
connections; rules registered server-side per session. *Pro:* alerts fire
instantly while user is online. *Con:* still misses offline events unless
combined with B.

**Recommendation:** B + C in two phases. Phase 2a is server-side worker
with in-app banners only (channel: `"in-app"`), reusing the existing
`/api/alerts/poll` shape from the alerting feature. Phase 2b adds
email/webhook channels.

### Storage

Alerts live alongside the workspace they're attached to. Local-first
behaviour matches workspaces themselves: rules persist to IDB; on cloud-
sync opt-in (see § 2), the encrypted blob carries them too.

The backend mirror (when sync is on) is a server-side projection: when a
new ciphertext blob is uploaded, the backend can't read it but DOES need
to know the rule's trigger criteria. So rules are stored TWICE:
* In the encrypted blob (full rule including any user labels)
* As trigger-only "subscriptions" in plaintext on the backend, scoped to
  a `subscriptionKey` derived from the user's identity (see § 4)

The trigger-only subscription leaks the address+kind to the backend. This
is the privacy/feature tradeoff: either the backend can run the matching
(and learn what you're watching) or it can't fire alerts at all. We accept
this leak.

### Decision points
1. Which trigger kinds to ship first? (Recommend: `inbound-tx`,
   `outbound-tx`, `event-emitted`, `balance-change` — the four
   highest-signal.)
2. Which channel to ship first? (Recommend: `"in-app"` banner only;
   add email when SES/Resend integration is decided.)
3. Where does the matcher run? (Recommend: a new worker in `packages/api`
   that subscribes to the indexer's log + trace stream — reuses existing
   `services/explorer/latest.ts` plumbing.)

---

## 2. Encrypted Opt-in Cloud Sync

### Goal
Workspaces follow the user across browsers / devices, but the backend
stores only ciphertext. Decryption key never leaves the client.

### Key derivation — three options

**A. Wallet signature.** "Sign In With Ethereum" → sign a fixed message →
hash the signature → use as the key. *Pro:* no extra password; wallet-based
identity matches our SIWE story for labels (see the 2026-05-29 spec).
*Con:* swapping wallets locks the user out of their data forever; lost
seed = lost workspaces.

**B. Password (Argon2id derivation).** User picks a password → Argon2id
derives the key. *Pro:* no wallet dependency; user can reset by re-
encrypting. *Con:* yet another password to remember; bad ones expose the
ciphertext if leaked.

**C. Hybrid.** Wallet signature is the default; password is an optional
backup. *Pro:* covers both seed-loss and wallet-swap. *Con:* more code,
more confusing UX.

**Recommendation:** A. The labels system is already heading toward SIWE
(per the 2026-05-29 spec). Reusing that identity for workspace encryption
keeps the surface area small. Users who lose their seed already have a
"lose everything" problem — workspaces are not the place to solve it.

### Cipher

* **Symmetric: ChaCha20-Poly1305 via WebCrypto.** Single 32-byte key,
  built into every modern browser. AES-GCM is also fine — pick by
  availability. Both are AEAD, both are constant-time in modern
  implementations.
* **Key derivation:** SHA-256 of the signed SIWE message → use as
  ChaCha20 key. Salt with the workspace owner's address so the same
  signed message produces different keys per chain.

### Backend shape

* `PUT /api/workspaces/sync` — body `{ ciphertext, nonce, version }`,
  auth via SIWE bearer token. Backend stores as-is, scoped to the
  signer's address.
* `GET /api/workspaces/sync` — returns `{ ciphertext, nonce, version,
  updatedAt }` or 404.
* No `LIST` — one blob per identity.

Conflict resolution: client compares its local `updatedAt` to the server's;
if local > server, push; if server > local, pull and prompt user. (No
attempt at CRDT — workspaces are small enough that "two devices edited at
the same time" is rare, and a manual-merge prompt is fine.)

### Decision points
1. SIWE-only identity, password-backup, or both? (Recommend: SIWE-only
   for v0; revisit if user feedback wants password.)
2. One blob per identity or one blob per workspace? (Recommend: one blob
   total — smaller backend surface; workspaces are tiny in practice.)
3. What's the `version` field for? Schema migration (we already have
   `schemaVersion: 1` on the store). Add `formatVersion` for cipher /
   serialization changes.

---

## 3. IPFS-Pinned Frontend

### Goal
The Explore SPA can be loaded from an IPFS gateway (or local IPFS node)
with a configurable backend API URL. Users can self-serve the UI if our
hosting goes down, and we get a censorship-resistance story for free.

### Build-time changes (required)

1. **Relative asset paths.** Vite defaults to absolute (`/assets/foo.js`).
   IPFS needs `./assets/foo.js`. Set `base: "./"` in `vite.config.ts`.
2. **HashRouter, not BrowserRouter.** IPFS gateways don't do server-side
   path rewriting, so `/tx/0xabc…` would 404. We MOVED to BrowserRouter
   in the EIP-3091 push. Two options:
   * **A. Dual-build.** One bundle for `explore.valve.city` (BrowserRouter,
     EIP-3091 canonical URLs); one bundle for IPFS (HashRouter, links use
     `#/tx/0xabc`). Vite mode flag + conditional import.
   * **B. Stick with BrowserRouter on IPFS too.** Requires the gateway to
     do path rewriting (most public gateways don't; Fleek/Pinata custom
     domains can). Loses portability.

   **Recommendation:** A. The dual-build is cheap once and unblocks every
   gateway forever.

### Runtime backend URL

Need a way for the IPFS bundle to point at a chosen backend (default:
`https://explore.valve.city/api`). Three options:

**A. Build-time env var.** `VITE_API_BASE` baked at build. *Pro:* trivial.
*Con:* one bundle per backend; users can't switch without re-pinning.

**B. Runtime config from `localStorage`.** Settings panel input; persists
per-browser. *Pro:* user controls it. *Con:* default needs a sensible
fallback for first-load.

**C. Query string override.** `?api=https://my-node.example.com` → cached.
*Pro:* shareable URLs ("use my node"). *Con:* security issue — phishing
links could point users at a malicious API for the same UI.

**Recommendation:** A for the default, B for override. Drop C — the
phishing risk isn't worth the convenience.

### Pin strategy
* CI builds the IPFS bundle and pins to Fleek (or Pinata + a backup pin
  service). DNS link from `ipfs.explore.valve.city` updates on each
  release.
* Bundle includes a `version.json` so the UI can show "you're on an
  outdated pin" if the canonical pin moves forward.

### Decision points
1. Dual-build vs. single-build? (Recommend: dual.)
2. Which pin service? (Recommend: Fleek for the IPNS DNS link; Pinata as
   backup for raw CID access.)
3. Build-time backend default? (Recommend: `https://explore.valve.city/
   api`; document override via Settings panel.)

---

## 4. Shared question — what is the user's identity?

All three threads independently need to answer "who is the user?":
* Notifications need it to scope alerts to a subscription owner.
* Encrypted sync needs it for the encryption key + backend scoping.
* IPFS frontend doesn't strictly need it, but config persistence does.

We have three candidates:
1. **SIWE (Sign-In With Ethereum)** — already planned for labels.
2. **Local-only UUID** — generated on first visit, persists in IDB. Zero
   friction but per-browser.
3. **OAuth (Google/GitHub)** — familiar but ties us to an external SSO.

**Recommendation:** SIWE everywhere. The labels system is already heading
that way; tying workspaces + alerts + sync to the same identity keeps the
mental model consistent and avoids a second login surface.

For users who don't want to connect a wallet, workspaces stay local-only
(no sync, no alerts) — that's already the current v0 behaviour. The
"connect to enable" affordance gates the cross-device + alert features
behind a deliberate opt-in, which is the right default.

---

## Sequencing

If we ship in order:

* **Phase 2a (notifications)** — Can land independently of SIWE if we
  use a local-only subscription ID for v0. ~3–5 days work for matcher +
  in-app banners + rule editor UI. Adds new tables to backend
  (`alert_subscriptions`, `alert_fires`).

* **Phase 2b (encrypted sync)** — Needs SIWE first (or a stopgap key
  source). ~4–6 days work once identity is solved. Adds two endpoints +
  client crypto + conflict prompt.

* **Phase 2c (IPFS frontend)** — Independent of the others. ~2–3 days
  work for dual-build + Fleek pipeline + Settings panel toggle. Can ship
  any time.

Phase 2a is the lowest-hanging fruit and the most user-visible. Phase 2c
is the most architectural-debt-clearing. Phase 2b is the prerequisite
for the "data follows me" story.

---

## Out of scope

* **Mobile push.** Web Push needs a service worker we don't have. Punt
  to a later phase.
* **CRDT-based merge** for sync conflicts. Workspaces are small; a
  prompt is enough.
* **Encrypted alerts.** Backend needs cleartext triggers to fire — see
  § 1 storage section.
