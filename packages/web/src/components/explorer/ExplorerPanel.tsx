import { useState, useCallback, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Icon } from "@iconify/react";
import TxDetail from "./TxDetail";
import AddressView from "./AddressView";
import BlockView from "./BlockView";
import ContractView from "./ContractView";
import ExplorerHome from "./ExplorerHome";
import { recordVisit } from "../../lib/recentEntities";
import { truncateAddr } from "./format";

type ExplorerView =
  | { type: "none" }
  | { type: "tx"; hash: string }
  | { type: "address"; address: string }
  | { type: "block"; numberOrHash: string }
  | { type: "contract"; address: string };

export default function ExplorerPanel() {
  const [view, setView] = useState<ExplorerView>({ type: "none" });
  const [history, setHistory] = useState<ExplorerView[]>([]);
  const [searchParams] = useSearchParams();

  const navigateTo = useCallback(
    (newView: ExplorerView) => {
      if (view.type !== "none") {
        setHistory((prev) => [...prev, view]);
      }
      setView(newView);
    },
    [view],
  );

  // URL → view: lets the ⌘K palette (and any future deep link) drop a user
  // straight into the right explorer view. Re-runs when search params change.
  useEffect(() => {
    const tx = searchParams.get("tx");
    const address = searchParams.get("address");
    const block = searchParams.get("block");
    if (tx) {
      setView({ type: "tx", hash: tx });
      recordVisit({ kind: "tx", value: tx });
    } else if (address) {
      setView({ type: "address", address });
      recordVisit({ kind: "address", value: address });
    } else if (block) {
      setView({ type: "block", numberOrHash: block });
      recordVisit({ kind: "block", value: block });
    }
  }, [searchParams]);

  const goBack = useCallback(() => {
    if (history.length === 0) {
      setView({ type: "none" });
      return;
    }
    const prev = history[history.length - 1]!;
    setHistory((h) => h.slice(0, -1));
    setView(prev);
  }, [history]);

  // Jump to any node in the trail. `index` indexes into `history`; the special
  // value -1 means Home (clear the view), and `history.length` is the current
  // view (no-op). Selecting a history node truncates everything after it.
  const jumpTo = useCallback(
    (index: number) => {
      if (index >= history.length) return;
      if (index < 0) {
        setView({ type: "none" });
        setHistory([]);
        return;
      }
      const target = history[index]!;
      setHistory((h) => h.slice(0, index));
      setView(target);
    },
    [history],
  );

  const handleNavigate = (target: {
    type: "tx" | "address" | "block" | "contract";
    value: string;
  }) => {
    switch (target.type) {
      case "tx":
        navigateTo({ type: "tx", hash: target.value });
        recordVisit({ kind: "tx", value: target.value });
        break;
      case "address":
        navigateTo({ type: "address", address: target.value });
        recordVisit({ kind: "address", value: target.value });
        break;
      case "block":
        navigateTo({ type: "block", numberOrHash: target.value });
        recordVisit({ kind: "block", value: target.value });
        break;
      case "contract":
        navigateTo({ type: "contract", address: target.value });
        recordVisit({ kind: "contract", value: target.value });
        break;
    }
  };

  return (
    <div className="space-y-stack">
      {/* Breadcrumb trail — every node is a one-click jump. */}
      {view.type !== "none" && (
        <Breadcrumb
          view={view}
          history={history}
          onJump={jumpTo}
          onBack={goBack}
        />
      )}

      {/* Home view — latest summary, recent blocks, recent txs */}
      {view.type === "none" && <ExplorerHome onNavigate={handleNavigate} />}

      {view.type === "tx" && (
        <TxDetail hash={view.hash} onNavigate={handleNavigate} />
      )}

      {view.type === "address" && (
        <AddressView address={view.address} onNavigate={handleNavigate} />
      )}

      {view.type === "block" && (
        <BlockView
          numberOrHash={view.numberOrHash}
          onNavigate={handleNavigate}
        />
      )}

      {view.type === "contract" && (
        <ContractView address={view.address} onNavigate={handleNavigate} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Breadcrumb                                                         */
/* ------------------------------------------------------------------ */

function viewLabel(v: ExplorerView): string {
  switch (v.type) {
    case "tx":
      return truncateAddr(v.hash);
    case "address":
    case "contract":
      return truncateAddr(v.address);
    case "block":
      return v.numberOrHash.startsWith("0x")
        ? truncateAddr(v.numberOrHash)
        : `#${v.numberOrHash}`;
    case "none":
      return "Home";
  }
}

/** Number of nodes (incl. Home + current) shown before the middle collapses. */
const CRUMB_VISIBLE = 4;

/**
 * Clickable trail over the explorer's internal history stack. `history` holds
 * the views behind the current one; the breadcrumb renders Home → …history →
 * current, collapsing the middle when the trail grows long.
 */
function Breadcrumb({
  view,
  history,
  onJump,
  onBack,
}: {
  view: ExplorerView;
  history: ExplorerView[];
  onJump: (index: number) => void;
  onBack: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  // Build the full node list: Home (index -1), each history view (its index),
  // then the current view (index history.length, non-clickable).
  const nodes = [
    { key: "home", label: "Home", kind: null as string | null, index: -1, current: false },
    ...history.map((v, i) => ({
      key: `h${i}`,
      label: viewLabel(v),
      kind: v.type,
      index: i,
      current: false,
    })),
    {
      key: "cur",
      label: viewLabel(view),
      kind: view.type,
      index: history.length,
      current: true,
    },
  ];

  // Collapse the middle when long: keep Home + last (CRUMB_VISIBLE-1) nodes.
  const collapsed =
    !expanded && nodes.length > CRUMB_VISIBLE + 1
      ? [nodes[0]!, ...nodes.slice(nodes.length - CRUMB_VISIBLE)]
      : nodes;
  const hasGap = collapsed.length < nodes.length;

  return (
    <nav
      className="flex items-center gap-tight flex-wrap text-xs"
      aria-label="Explorer trail"
    >
      {history.length > 0 && (
        <button
          onClick={onBack}
          title="Back"
          aria-label="Back"
          className="flex items-center justify-center w-6 h-6 mr-1 transition-colors hover:opacity-100"
          style={{ color: "var(--color-text-muted)", backgroundColor: "transparent" }}
        >
          <Icon icon="heroicons:chevron-left" className="w-4 h-4" />
        </button>
      )}

      {collapsed.map((node, i) => (
        <span key={node.key} className="flex items-center gap-tight">
          {i > 0 && (
            <span style={{ color: "var(--color-text-muted)" }}>›</span>
          )}
          {/* Insert the "…" expander right after Home when collapsed. */}
          {hasGap && i === 1 && (
            <>
              <button
                onClick={() => setExpanded(true)}
                title="Show full trail"
                className="px-1.5 py-1 font-mono transition-colors hover:opacity-100"
                style={{ color: "var(--color-text-muted)", backgroundColor: "transparent" }}
              >
                …
              </button>
              <span style={{ color: "var(--color-text-muted)" }}>›</span>
            </>
          )}
          <CrumbNode node={node} onJump={onJump} />
        </span>
      ))}
    </nav>
  );
}

function CrumbNode({
  node,
  onJump,
}: {
  node: { label: string; kind: string | null; index: number; current: boolean };
  onJump: (index: number) => void;
}) {
  const content = (
    <span className="flex items-center gap-tight font-mono px-2 py-1">
      {node.kind && node.kind !== "none" && (
        <span
          className="text-[9px] uppercase tracking-wider not-italic"
          style={{ color: "var(--color-text-muted)" }}
        >
          {node.kind}
        </span>
      )}
      {node.label}
    </span>
  );

  if (node.current) {
    return (
      <span
        aria-current="page"
        style={{
          color: "var(--color-text-primary)",
          backgroundColor: "var(--color-bg-tertiary)",
          boxShadow: "inset 0 0 0 1px var(--color-border-muted)",
        }}
      >
        {content}
      </span>
    );
  }

  return (
    <button
      onClick={() => onJump(node.index)}
      className="transition-colors hover:opacity-100 cursor-pointer"
      style={{ color: "var(--color-text-secondary)", backgroundColor: "transparent" }}
    >
      {content}
    </button>
  );
}
