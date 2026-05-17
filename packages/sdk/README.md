# @valve-tech/trace-sdk

Standalone EVM trace loading, traversal, and rendering toolkit. No platform dependencies — works against any JSON-RPC node that supports `debug_traceTransaction` / `debug_traceCall`.

> Originally extracted from the [PulseChain Dev Platform](https://github.com/valve-tech/trace) debugger. Works for any EVM chain, not just PulseChain.

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
import { CallTree, GasFlamegraph, OpcodeViewer } from "@valve-tech/trace-sdk/components";
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

### Components (`/components`, React peer dep)
- `<CallTree>` — interactive call tree with expand/collapse
- `<GasFlamegraph>` — proportional gas-cost flamegraph
- `<OpcodeViewer>` — step-by-step opcode trace with category coloring

All components accept a `classNames` prop for full style override.

## License

MIT © Valve Tech
