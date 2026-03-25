# Design: Source Code Debugger, Slither Analysis, and Infrastructure

## Overview

Three parallel workstreams to evolve the PulseChain dev platform:

1. **Source Code View + Opcode-to-Source Mapping** — Fetch verified Solidity source from BlockScout/Sourcify, decode compiler source maps, and sync-highlight source lines as the user steps through opcodes
2. **Slither Static Analysis** — Run Slither on fetched contract source in a Docker container, display findings as inline annotations with diffs
3. **Infrastructure** — API key auth + rate limiting, WebSocket for real-time alerts

## Phase 1: Source Code View

### Backend

**New service: `sourceCode.ts`**
- `fetchVerifiedSource(address)` — tries BlockScout `getsourcecode`, falls back to Sourcify
- Returns: source files, compiler version, optimization settings, ABI, source map (runtime), constructor source map
- Caches results in PostgreSQL (`verified_sources` table) since verified source is immutable

**New service: `sourceMap.ts`**
- Decodes Solidity compiler source maps (format: `s:l:f:j:m` semicolon-separated)
- `decodeSourceMap(encodedMap)` → array of `{ offset, length, fileIndex, jumpType }`
- `mapPcToSource(pc, deployedBytecode, sourceMap, sources)` → `{ file, line, column, endLine, endColumn, source }`
- Handles the compressed format (empty fields inherit from previous entry)

**New endpoint: `GET /api/source/:address`**
- Returns verified source code, source map, and compiler metadata
- Response: `{ ok, source: { files: [{name, content}], compilerVersion, sourceMap, abi } }`

**New migration: `002-verified-sources.sql`**
- `verified_sources` table: address, source files (JSONB), compiler version, source map, ABI, fetched_at

### Frontend

**New component: `SourceViewer.tsx`**
- Renders Solidity source with line numbers and syntax highlighting (token-based, no external lib)
- Current execution line highlighted with accent background
- Gutter shows line numbers with breakpoint-style markers for Slither findings (Phase 2)
- Scroll-follows the highlighted line

**StepDebugger enhancement**
- Add a "Source" toggle button in the controls bar
- When enabled, left panel splits: top half shows source code, bottom half shows opcode trace
- As user steps through opcodes, source viewer highlights the corresponding line
- When execution crosses contract boundaries (CALL/DELEGATECALL), source switches to the called contract
- Source fetching is lazy — only fetched when the source toggle is enabled

### Source Map Decoding Algorithm

```
1. Parse the runtime source map string into entries (split by ";")
2. Each entry is "s:l:f:j:m" — empty fields inherit from previous entry
3. Build a bytecodeOffset → sourceMapEntry mapping by walking the deployed bytecode:
   - For each opcode, record its byte offset
   - Map the opcode index to its source map entry
4. Given a PC from the trace, look up the source map entry
5. Convert the byte offset+length in the source to line:column using line break positions
```

## Phase 2: Slither Static Analysis

### Backend

**New service: `slither.ts`**
- `analyzeContract(address)` — fetches source, writes to temp dir, runs Slither in Docker
- Docker image: `trailofbits/eth-security-toolbox` (includes Slither + multiple solc versions)
- Writes source files, creates a `foundry.toml` with the correct solc version
- Runs: `slither . --json /dev/stdout --solc-select <version>`
- Parses JSON output into `SlitherFinding[]`
- Caches results in PostgreSQL (`slither_results` table)

**New endpoint: `POST /api/source/:address/analyze`**
- Triggers Slither analysis (async, can take 10-30s)
- Returns: `{ ok, findings: SlitherFinding[] }`

**Types:**
```typescript
interface SlitherFinding {
  check: string;           // e.g., "reentrancy-eth"
  impact: "High" | "Medium" | "Low" | "Informational";
  confidence: "High" | "Medium" | "Low";
  description: string;
  elements: Array<{
    type: string;          // "function", "variable", "contract"
    name: string;
    sourceMapping: { start: number; length: number; filename: string; lines: number[] };
  }>;
  recommendation: string;
  diff?: string;           // Fix suggestion as unified diff (when available)
}
```

### Frontend

**SourceViewer enhancement**
- Gutter markers: colored dots for Slither findings (red=High, orange=Medium, yellow=Low, blue=Info)
- Click a marker to see the finding detail panel
- Finding panel shows: check name, impact, confidence, description, recommendation
- If `diff` is available, render it as a syntax-highlighted unified diff with copy button

**New component: `FindingsPanel.tsx`**
- Sidebar panel listing all Slither findings grouped by severity
- Click a finding to jump to the relevant source line
- Summary stats: X high, Y medium, Z low, W informational

## Phase 3: Infrastructure

### API Key Auth + Rate Limiting

**New service: `apiKeys.ts`**
- `createApiKey(name)` → generates a random 32-byte hex key, stores hash in PostgreSQL
- `validateApiKey(key)` → looks up by hash, returns key metadata
- Keys table: id, name, key_hash, created_at, last_used_at, rate_limit

**New middleware: `authMiddleware.ts`**
- Checks `X-API-Key` header or `?apiKey=` query param
- If no key: allow (unauthenticated access, lower rate limit)
- If key: validate, attach to `req.apiKey`
- Rate limiting: sliding window counter in PostgreSQL (or in-memory Map for now)

**New migration: `003-api-keys.sql`**
- `api_keys` table
- `rate_limit_log` table

### WebSocket for Real-Time Alerts

**New service: `wsServer.ts`**
- WebSocket server on `/ws/alerts`
- Clients subscribe with optional alert ID filter
- When `monitor.ts` triggers an alert, broadcast to connected clients
- Message format: `{ type: "alert_triggered", alert: {...}, matchData: {...} }`

**Integration with monitor.ts**
- After `dispatch()`, also call `wsServer.broadcast(alert, matchData)`
- Clients can subscribe/unsubscribe to specific alert IDs

### Frontend

**AlertDashboard enhancement**
- WebSocket connection for live alert notifications
- Toast/notification when an alert triggers
- Real-time update of alert history without polling

## Implementation Order

1. Source code fetch + source map decoder (backend) — foundation for everything
2. Source viewer component (frontend) — wired into step debugger
3. Slither runner service (backend) — Docker-based analysis
4. Slither findings UI (frontend) — annotations + findings panel
5. API key auth + rate limiting (backend)
6. WebSocket alerts (backend + frontend)

## Dependencies

- Phase 2 requires Phase 1 (Slither needs the source fetch infrastructure)
- Phase 3 is independent of Phases 1-2
- Docker required for Slither (already in docker-compose.yml)
