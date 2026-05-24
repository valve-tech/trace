import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Icon } from "@iconify/react";
import { fetchPending, type PendingTx } from "../../api/mempool";
import { ExplorerLink } from "../explorer/ExplorerLink";
import { truncateAddr } from "../explorer/format";
import { Badge } from "../primitives/Badge";
import { EmptyState } from "../primitives/EmptyState";
import { TrackedTxPanel } from "./TrackedTxPanel";
import { useTrackedTxs } from "../../hooks/useTrackedTxs";
import { toggleTrack } from "../../lib/trackedTxs";

type SortKey = "rank" | "tip" | "cap" | "nonce";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "rank", label: "node order" },
  { key: "tip", label: "priority tip ↓" },
  { key: "cap", label: "fee cap ↓" },
  { key: "nonce", label: "nonce ↑" },
];

const TYPE_LABEL: Record<string, string> = {
  legacy: "Legacy",
  eip2930: "EIP-2930",
  eip1559: "EIP-1559",
  eip4844: "Blob (4844)",
  eip7702: "EIP-7702",
};

function bigintOf(wei: string | null): bigint {
  if (wei == null) return 0n;
  try {
    return BigInt(wei);
  } catch {
    return 0n;
  }
}

/** wei decimal string → trimmed gwei, or null for null/non-numeric input. */
function gweiDisp(wei: string | null): string | null {
  if (wei == null) return null;
  try {
    const g = Number(BigInt(wei)) / 1e9;
    if (!isFinite(g)) return null;
    return g.toLocaleString(undefined, { maximumFractionDigits: 3 });
  } catch {
    return null;
  }
}

/** Sort comparator for a pending tx under the chosen key. */
function compareTx(a: PendingTx, b: PendingTx, key: SortKey): number {
  switch (key) {
    case "tip":
      return Number(
        bigintOf(b.maxPriorityFeePerGas ?? b.gasPrice) -
          bigintOf(a.maxPriorityFeePerGas ?? a.gasPrice),
      );
    case "cap":
      return Number(
        bigintOf(b.maxFeePerGas ?? b.gasPrice) -
          bigintOf(a.maxFeePerGas ?? a.gasPrice),
      );
    case "nonce":
      return a.nonce - b.nonce;
    case "rank":
      return 0; // preserve server order (effective priority tip)
  }
}

export default function MempoolView() {
  const navigate = useNavigate();
  const onNavigate = (t: { type: string; value: string }) => {
    const key = t.type === "tx" ? "tx" : t.type === "block" ? "block" : "address";
    navigate(`/explorer?${key}=${t.value}`);
  };

  const { data, status, error } = useQuery({
    queryKey: ["mempool-pending"],
    queryFn: fetchPending,
    refetchInterval: 5_000,
    staleTime: 4_000,
  });

  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [typeFilter, setTypeFilter] = useState<Set<string>>(new Set());

  // Distinct tx-types present, for the filter chips.
  const presentTypes = useMemo(() => {
    const set = new Set<string>();
    for (const tx of data?.transactions ?? []) set.add(tx.type);
    return [...set].sort();
  }, [data]);

  const filtered = useMemo(() => {
    let rows = data?.transactions ?? [];
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (tx) =>
          tx.hash.toLowerCase().includes(q) ||
          tx.from.toLowerCase().includes(q),
      );
    }
    if (typeFilter.size > 0) {
      rows = rows.filter((tx) => typeFilter.has(tx.type));
    }
    if (sortKey !== "rank") {
      rows = [...rows].sort((a, b) => compareTx(a, b, sortKey));
    }
    return rows;
  }, [data, search, sortKey, typeFilter]);

  const toggleType = (t: string) => {
    setTypeFilter((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  };

  // Tracked-tx wiring: a lookup for the pin toggle state, plus the live pending
  // set + completeness flag the tracker uses to tell pending from dropped.
  const tracked = useTrackedTxs();
  const trackedSet = useMemo(
    () => new Set(tracked.map((t) => t.hash.toLowerCase())),
    [tracked],
  );
  const pendingHashes = useMemo(
    () => new Set((data?.transactions ?? []).map((t) => t.hash.toLowerCase())),
    [data],
  );

  return (
    <div className="space-y-stack">
      <TrackedTxPanel
        pendingHashes={pendingHashes}
        mempoolComplete={data ? !data.truncated : false}
        onNavigate={onNavigate}
      />

      {/* Header */}
      <div className="card p-4 flex items-center justify-between">
        <div className="flex items-center gap-inline">
          <Icon
            icon="heroicons:queue-list"
            className="w-4 h-4"
            style={{ color: "var(--color-accent)" }}
          />
          <h2
            className="text-sm font-semibold"
            style={{ color: "var(--color-text-primary)" }}
          >
            Mempool
          </h2>
          <span className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
            pending, ordered by effective priority tip
          </span>
        </div>
        {data && (
          <div
            className="flex items-center gap-row text-xs font-mono"
            style={{ color: "var(--color-text-secondary)" }}
          >
            <span>{data.pendingCount.toLocaleString()} pending</span>
            <span style={{ color: "var(--color-text-muted)" }}>
              {data.queuedCount.toLocaleString()} queued
            </span>
          </div>
        )}
      </div>

      <div className="card overflow-hidden">
        {/* Toolbar — only meaningful once we have rows to slice. */}
        {status === "success" && data.transactions.length > 0 && (
          <Toolbar
            search={search}
            onSearch={setSearch}
            sortKey={sortKey}
            onSort={setSortKey}
            presentTypes={presentTypes}
            typeFilter={typeFilter}
            onToggleType={toggleType}
            showing={filtered.length}
            total={data.transactions.length}
          />
        )}

        {status === "pending" && (
          <div className="p-8 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>
            Loading pending transactions…
          </div>
        )}
        {status === "error" && (
          <div className="p-8 text-center text-sm" style={{ color: "var(--color-danger)" }}>
            {error instanceof Error ? error.message : "Failed to load mempool"}
          </div>
        )}
        {status === "success" && data.transactions.length === 0 && (
          <EmptyState
            icon="heroicons:check-circle"
            title="No pending transactions"
            subtitle="The mempool is clear right now. New pending txs appear here within a few seconds."
          />
        )}
        {status === "success" &&
          data.transactions.length > 0 &&
          filtered.length === 0 && (
            <EmptyState
              icon="heroicons:funnel"
              title="No transactions match your filters"
              subtitle="Try clearing the search or type filters."
            />
          )}
        {status === "success" && filtered.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: "var(--color-bg-secondary)" }}>
                {["", "#", "Tx Hash", "From", "Nonce", "Type", "Gas (tip / cap)"].map(
                  (h, idx) => (
                    <th
                      key={h || `col-${idx}`}
                      className="text-left px-3 py-2.5 text-xs font-medium"
                      style={{ color: "var(--color-text-secondary)" }}
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {filtered.map((tx, i) => (
                <tr key={tx.hash} className="bs-t-muted hover:opacity-80">
                  <td className="pl-3 pr-0 py-2 w-7">
                    <PinButton
                      hash={tx.hash}
                      tracked={trackedSet.has(tx.hash.toLowerCase())}
                    />
                  </td>
                  <td
                    className="px-3 py-2 text-xs font-mono tabular-nums"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    {i + 1}
                  </td>
                  <td className="px-3 py-2">
                    <ExplorerLink
                      target={{ type: "tx", value: tx.hash }}
                      onNavigate={onNavigate}
                      className="font-mono text-xs hover:underline cursor-pointer"
                      style={{ color: "var(--color-accent)" }}
                      title={tx.hash}
                    >
                      {truncateAddr(tx.hash)}
                    </ExplorerLink>
                  </td>
                  <td className="px-3 py-2">
                    <ExplorerLink
                      target={{ type: "address", value: tx.from }}
                      onNavigate={onNavigate}
                      className="font-mono text-xs hover:underline cursor-pointer"
                      style={{ color: "var(--color-accent)" }}
                      title={tx.from}
                    >
                      {truncateAddr(tx.from)}
                    </ExplorerLink>
                  </td>
                  <td
                    className="px-3 py-2 font-mono text-xs tabular-nums"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    {tx.nonce.toLocaleString()}
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant={tx.type === "eip1559" ? "info" : "neutral"}>
                      {TYPE_LABEL[tx.type] ?? tx.type}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <GasCell tx={tx} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Toolbar                                                            */
/* ------------------------------------------------------------------ */

/** Pin/unpin a tx for lifecycle tracking. Filled icon when tracked. */
function PinButton({ hash, tracked }: { hash: string; tracked: boolean }) {
  return (
    <button
      onClick={() => toggleTrack(hash)}
      title={tracked ? "Stop tracking" : "Track this transaction"}
      aria-label={tracked ? "Stop tracking" : "Track this transaction"}
      aria-pressed={tracked}
      className="flex items-center justify-center w-6 h-6 transition-opacity hover:opacity-100"
      style={{
        color: tracked ? "var(--color-accent)" : "var(--color-text-muted)",
        opacity: tracked ? 1 : 0.6,
        backgroundColor: "transparent",
      }}
    >
      <Icon
        icon={tracked ? "heroicons:map-pin-solid" : "heroicons:map-pin"}
        className="w-3.5 h-3.5"
      />
    </button>
  );
}

/** Gas readout split out from the type column: tip / cap, or legacy price. */
function GasCell({ tx }: { tx: PendingTx }) {
  const tip = gweiDisp(tx.maxPriorityFeePerGas);
  const cap = gweiDisp(tx.maxFeePerGas);
  const legacy = gweiDisp(tx.gasPrice);

  if (tip != null || cap != null) {
    return (
      <span className="font-mono text-xs tabular-nums" style={{ color: "var(--color-text-secondary)" }}>
        <span style={{ color: "var(--color-text-muted)" }}>tip </span>
        {tip ?? "—"}
        <span style={{ color: "var(--color-text-muted)" }}> / cap </span>
        {cap ?? "—"}
        <span style={{ color: "var(--color-text-muted)" }}> gwei</span>
      </span>
    );
  }
  if (legacy != null) {
    return (
      <span className="font-mono text-xs tabular-nums" style={{ color: "var(--color-text-secondary)" }}>
        {legacy}
        <span style={{ color: "var(--color-text-muted)" }}> gwei</span>
      </span>
    );
  }
  return <span style={{ color: "var(--color-text-muted)" }}>—</span>;
}

function Toolbar({
  search,
  onSearch,
  sortKey,
  onSort,
  presentTypes,
  typeFilter,
  onToggleType,
  showing,
  total,
}: {
  search: string;
  onSearch: (v: string) => void;
  sortKey: SortKey;
  onSort: (k: SortKey) => void;
  presentTypes: string[];
  typeFilter: Set<string>;
  onToggleType: (t: string) => void;
  showing: number;
  total: number;
}) {
  return (
    <div className="bs-b-muted">
      <div className="flex items-center gap-row px-3 py-2.5 flex-wrap">
        <div
          className="flex items-center gap-inline flex-1 min-w-[180px] px-2.5 py-1.5"
          style={{
            backgroundColor: "var(--color-bg-input)",
            boxShadow: "inset 0 0 0 1px var(--color-border-muted)",
          }}
        >
          <Icon
            icon="heroicons:magnifying-glass"
            className="w-3.5 h-3.5"
            style={{ color: "var(--color-text-muted)" }}
          />
          <input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="from address or tx hash…"
            className="bare-input flex-1 bg-transparent outline-none text-xs font-mono"
            style={{ color: "var(--color-text-primary)" }}
          />
        </div>

        <label
          className="flex items-center gap-inline text-[11px]"
          style={{ color: "var(--color-text-muted)" }}
        >
          sort
          <select
            value={sortKey}
            onChange={(e) => onSort(e.target.value as SortKey)}
            className="text-[11px] font-mono px-2 py-1"
            style={{
              backgroundColor: "var(--color-bg-input)",
              color: "var(--color-text-secondary)",
              boxShadow: "inset 0 0 0 1px var(--color-border-muted)",
            }}
          >
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {presentTypes.length > 1 && (
        <div className="flex items-center gap-inline px-3 pb-2.5 flex-wrap">
          <span className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
            type
          </span>
          {presentTypes.map((t) => {
            const active = typeFilter.has(t);
            return (
              <button
                key={t}
                onClick={() => onToggleType(t)}
                className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 transition-colors"
                style={{
                  backgroundColor: active
                    ? "var(--color-accent-muted)"
                    : "var(--color-bg-tertiary)",
                  color: active
                    ? "var(--color-accent)"
                    : "var(--color-text-muted)",
                }}
              >
                {TYPE_LABEL[t] ?? t}
              </button>
            );
          })}
          <span
            className="ml-auto text-[11px] font-mono"
            style={{ color: "var(--color-text-muted)" }}
          >
            showing {showing.toLocaleString()} of {total.toLocaleString()}
          </span>
        </div>
      )}
    </div>
  );
}
