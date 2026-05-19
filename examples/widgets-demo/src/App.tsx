import {
  ApprovalsWidget,
  EmbedDashboard,
  RisksWidget,
  SwapsWidget,
  TokenFlowsWidget,
} from "@valve-tech/trace-sdk/widgets";
import { sampleTrace } from "./sampleTrace.js";

export function App() {
  return (
    <>
      <h1>@valve-tech/trace-sdk · widgets demo</h1>
      <p>
        Drop-in React widgets that pair an SDK parser/analyzer with a
        visual component. Pass a <code>TraceFrame</code> in — get a polished
        view out. Each widget is fully self-contained and tree-shakeable.
      </p>

      <h2>One-line dashboard</h2>
      <p>
        Tabs across risks, swaps, approvals, and transfers. Picks the first
        non-empty tab as the default.
      </p>
      <EmbedDashboard frame={sampleTrace} />
      <pre>
        <code>{`import { EmbedDashboard } from "@valve-tech/trace-sdk/widgets";

<EmbedDashboard frame={trace} />`}</code>
      </pre>

      <h2>Risks</h2>
      <RisksWidget frame={sampleTrace} />
      <pre>
        <code>{`<RisksWidget
  frame={trace}
  options={{ whitelist: new Set([myAuditedImpl]) }}
/>`}</code>
      </pre>

      <h2>Swaps</h2>
      <SwapsWidget frame={sampleTrace} />
      <pre>
        <code>{`<SwapsWidget frame={trace} />`}</code>
      </pre>

      <h2>Approvals</h2>
      <ApprovalsWidget frame={sampleTrace} unlimitedThreshold={2n ** 128n} />
      <pre>
        <code>{`<ApprovalsWidget
  frame={trace}
  unlimitedThreshold={2n ** 128n}
/>`}</code>
      </pre>

      <h2>Token transfers</h2>
      <TokenFlowsWidget frame={sampleTrace} />
      <pre>
        <code>{`<TokenFlowsWidget frame={trace} />`}</code>
      </pre>
    </>
  );
}
