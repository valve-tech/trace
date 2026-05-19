# Examples

Standalone demos showing how to embed `@valve-tech/trace-sdk` in your own site.

## widgets-demo

A Vite + React app that renders every widget against a synthetic trace.
Useful as both a visual reference and a copy-paste starting point.

```bash
cd examples/widgets-demo
npm install
npm run dev
# http://localhost:5180
```

The interesting files:

- `src/App.tsx` — every widget rendered with its minimum-viable JSX.
- `src/sampleTrace.ts` — a hand-built `TraceFrame` exercising every parser
  (Approval, Transfer, UniV2 Swap, and a DELEGATECALL that the risk
  analyzer will flag). Replace with `loadTraceFromHash({ txHash, rpcUrl })`
  for real data.

## Copy-paste snippets

Drop any widget into an existing React app. They need React 19+ and
`@valve-tech/trace-sdk` installed; no provider, no CSS bundle.

```tsx
import { EmbedDashboard } from "@valve-tech/trace-sdk/widgets";
import { loadTraceFromHash } from "@valve-tech/trace-sdk";
import { useEffect, useState } from "react";

function TxSummary({ txHash, rpcUrl }: { txHash: `0x${string}`; rpcUrl: string }) {
  const [trace, setTrace] = useState(null);
  useEffect(() => {
    loadTraceFromHash({ txHash, rpcUrl }).then((r) => setTrace(r.trace));
  }, [txHash, rpcUrl]);
  if (!trace) return null;
  return <EmbedDashboard frame={trace} />;
}
```

For per-feature widgets, the import shape is the same:

```tsx
import {
  RisksWidget,        // analyzeRisks + <FindingsPanel>
  SwapsWidget,        // parseSwaps + <SwapsPanel>
  ApprovalsWidget,    // parseApprovals + <ApprovalsPanel>
  TokenFlowsWidget,   // parseTokenDeltas + <TokenDeltasPanel>
  EmbedDashboard,     // tabbed view across the four above
} from "@valve-tech/trace-sdk/widgets";
```

Every widget supports the same theming surface as the underlying panel:
`classNames`, `style`, `className`. The widgets internally `useMemo` the
parser/analyzer pass on the `frame` reference, so passing a stable trace
(or one wrapped in `useMemo` upstream) keeps re-renders cheap.
