# @valve-tech/trace-sdk

Standalone EVM trace loading, traversal, and rendering toolkit. No platform dependencies — works against any JSON-RPC node that supports `debug_traceTransaction` / `debug_traceCall`.

> Originally extracted from the [Explore by Valve City](https://github.com/valve-tech/reth) debugger. Works for any EVM chain, not just PulseChain.

## Install

```bash
npm install @valve-tech/trace-sdk viem
# React components are optional — only install if you'll render them
npm install react
```

**Peer dependencies:**

| Package | Required | Why |
|---------|----------|-----|
| `viem` | yes | RPC calls in `loadTraceFromHash`, address utilities |
| `react` (>=18) | optional | Only for `CallTree`, `GasFlamegraph`, `OpcodeViewer` components |

## Quickstart

<!-- TODO(user): replace this with a 5–10 line snippet showing the most useful entry point.
     The choice you make here positions the SDK in users' minds.

     Option A — Data-first (toolkit feel):
       Show `loadTraceFromHash` → `walkCallTree` → print revert frame.
       Users see: "this is a data library, components are a bonus."

     Option B — UI-first (component library feel):
       Show importing <CallTree> and rendering a trace.
       Users see: "this drops a debugger into my React app."

     Option C — Both, in that order.
       More README real estate, but covers consumer + contributor cases.

     Pick one and write the code block below. Real imports from src/index.ts:

       parseCallTrace, walkCallTree, findRevertFrame, buildGasProfile,
       loadTraceFromHash, CallTree, GasFlamegraph, OpcodeViewer
-->

```ts
// TODO: your quickstart snippet here
```

## Subpath exports

Tree-shake friendly — import only what you need:

```ts
import { parseCallTrace } from "@valve-tech/trace-sdk/loaders";
import { walkCallTree, buildGasProfile } from "@valve-tech/trace-sdk/traversal";
import { parseTokenDeltas, parsePrestateDiff } from "@valve-tech/trace-sdk/parsers";
import { analyzeRisks } from "@valve-tech/trace-sdk/risks";
import { CallTree, GasFlamegraph, OpcodeViewer, FindingsPanel } from "@valve-tech/trace-sdk/components";
import { FullDebuggerLayout, RevertExplainer, CompactCallSummary } from "@valve-tech/trace-sdk/templates";
import type { CallNode, TraceFrame, GasProfile } from "@valve-tech/trace-sdk/types";
```

## API

### Loaders (`/loaders`)
- `loadTraceFromHash(rpcUrl, txHash, options?)` — fetch + normalize a trace from a live node
- `loadTraceFromFile(path)` — read a JSON trace dump
- `loadTraceFromObject(obj)` — normalize an already-parsed trace
- `parseCallTrace` / `normalizeCallFrame` — normalize a raw call frame
- `normalizeStructLogs` — normalize step-level opcode logs

### Traversal (`/traversal`)
- `walkCallTree(root, visitor)` — depth-first traversal with enter/exit hooks
- `flattenCallTree(root)` — array of `FlatFrame` with depth metadata
- `filterByAddress(root, addr)` / `filterBySelector(root, sel)` — subtree filters
- `findRevertFrame(root)` — first frame whose call reverted
- `buildGasProfile(root)` — aggregated gas per contract / selector

### Parsers (`/parsers`)
- `parseTokenDeltas(frame)` — extract ERC-20 Transfer events as `TokenDelta[]`.
  Skips reverted call frames (and their subtrees) so output matches the
  on-chain receipt. Requires the trace to have been captured with the
  callTracer `withLog: true` option.
- `parsePrestateDiff(raw)` — compute signed ETH balance changes per address
  from a prestateTracer `diffMode: true` payload, sorted by address.

### Risks (`/risks`)
- `analyzeRisks(frame, options?)` — walk the call tree and emit `RiskFlag[]`
  findings. Continues into reverted subtrees, tagging findings from there
  with `reverted: true` so consumers can filter or visually distinguish.
- Built-in rule: `DELEGATECALL_UNRECOGNIZED` flags any DELEGATECALL whose
  target isn't in the optional `whitelist` set. Pass known-good
  implementation contracts in the whitelist to suppress noise.
- `BUILTIN_RULES` / `RiskRule` are exported for composing custom analyses.

### Components (`/components`, React peer dep)
- `<CallTree>` — interactive call tree with expand/collapse
- `<GasFlamegraph>` — proportional gas-cost flamegraph
- `<OpcodeViewer>` — step-by-step opcode trace with category coloring
- `<FindingsPanel>` — renders `analyzeRisks` output, grouped by severity
- `<StateDiffPanel>` — renders `StateDiff[]` with balance/nonce/storage changes per address
- `<FrameDetailPanel>` — renders metadata for a single `TraceFrame` (call type, gas, value, error, decoded I/O)

All components accept a `classNames` prop for full style override.

### Templates (`/templates`, React peer dep)

Higher-order compositions of the components — drop-in views for common
trace consumers:

- `<FullDebuggerLayout trace? opcodes? stateDiffs? risks? />` — tabbed
  view (Call Tree / Opcodes / State / Risks). Each tab independently
  renders its empty state when data is missing; the Call Tree tab
  shows a `<FrameDetailPanel>` underneath after a frame is selected.
- `<RevertExplainer frame />` — locates the innermost reverting frame,
  surfaces its `revertReason` prominently, and shows the breadcrumb
  chain from root to the reverter. Renders a success message when the
  transaction did not revert.
- `<CompactCallSummary frame maxDepth? />` — one-line-per-call terse
  summary with status badge + total-gas chip; suitable for embedding
  in logs, alerts, or chat messages.

## License

MIT © Valve Tech
