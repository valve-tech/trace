import { useState } from "react";
import { formatEther } from "viem";
import type { StateDiff, BalanceChange, StorageChange, NonceChange } from "../api/simulate";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function truncateHex(value: string, prefixChars = 6, suffixChars = 4): string {
  if (value.length <= prefixChars + suffixChars + 2) return value;
  return `${value.slice(0, prefixChars)}...${value.slice(-suffixChars)}`;
}

function formatPlsValue(wei: string): string {
  try {
    const formatted = formatEther(BigInt(wei));
    // Show up to 6 significant decimals, strip trailing zeros
    const num = parseFloat(formatted);
    if (num === 0) return "0";
    return num.toLocaleString(undefined, { maximumFractionDigits: 6 });
  } catch {
    return wei;
  }
}

function isDeltaPositive(delta: string): boolean {
  if (delta.startsWith("-")) return false;
  const n = BigInt(delta);
  return n > 0n;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SectionHeader({
  title,
  count,
  expanded,
  onToggle,
}: {
  title: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-between px-3 py-2 bs-b text-left hover:opacity-80 theme-secondary-bg"
    >
      <span
        className="text-xs font-semibold uppercase tracking-wider theme-text-secondary"
      >
        {title}
        <span
          className="ml-2 px-1.5 py-0.5 rounded text-xs font-mono"
          style={{
            backgroundColor: "var(--color-accent-muted)",
            color: "var(--color-accent)",
          }}
        >
          {count}
        </span>
      </span>
      <span className="text-xs theme-text-muted">
        {expanded ? "▼" : "▶"}
      </span>
    </button>
  );
}

function TableHeader({ cols }: { cols: string[] }) {
  return (
    <thead>
      <tr
        className="bs-b-muted"
        style={{}}
      >
        {cols.map((col) => (
          <th
            key={col}
            className="px-3 py-1.5 text-left text-xs font-semibold theme-text-muted"
          >
            {col}
          </th>
        ))}
      </tr>
    </thead>
  );
}

// ---------------------------------------------------------------------------
// Balance Changes
// ---------------------------------------------------------------------------

function BalanceChangesSection({ changes }: { changes: BalanceChange[] }) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div>
      <SectionHeader
        title="Balance Changes"
        count={changes.length}
        expanded={expanded}
        onToggle={() => setExpanded((v) => !v)}
      />
      {expanded && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <TableHeader cols={["Address", "Before (PLS)", "After (PLS)", "Delta"]} />
            <tbody>
              {changes.map((change, i) => {
                const positive = isDeltaPositive(change.delta);
                const deltaColor = positive
                  ? "var(--color-success)"
                  : "var(--color-danger)";
                const deltaPrefix = positive ? "+" : "";

                return (
                  <tr
                    key={i}
                    className="bs-b-muted last:shadow-none"
                    style={{}}
                  >
                    <td
                      className="px-3 py-2"
                      title={change.address}
                      style={{
                        fontFamily: "var(--font-mono)",
                        color: "var(--color-text-primary)",
                      }}
                    >
                      {truncateHex(change.address)}
                    </td>
                    <td
                      className="px-3 py-2 theme-text-secondary"
                    >
                      {formatPlsValue(change.before)}
                    </td>
                    <td
                      className="px-3 py-2 theme-text"
                    >
                      {formatPlsValue(change.after)}
                    </td>
                    <td
                      className="px-3 py-2 font-semibold"
                      style={{
                        fontFamily: "var(--font-mono)",
                        color: deltaColor,
                      }}
                    >
                      {deltaPrefix}
                      {formatPlsValue(change.delta.replace(/^-/, ""))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Storage Changes
// ---------------------------------------------------------------------------

function StorageGroup({
  address,
  contractName,
  rows,
}: {
  address: string;
  contractName: string | undefined;
  rows: StorageChange[];
}) {
  const [expanded, setExpanded] = useState(true);

  const label = contractName
    ? `${contractName} (${truncateHex(address)})`
    : truncateHex(address);

  return (
    <div
      className="bs-b-muted last:shadow-none"
      style={{}}
    >
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-left hover:opacity-80 theme-secondary-bg"
      >
        <span
          className="text-xs font-medium"
          style={{
            fontFamily: "var(--font-mono)",
            color: "var(--color-text-primary)",
          }}
          title={address}
        >
          {label}
        </span>
        <div className="flex items-center gap-inline">
          <span
            className="text-xs px-1.5 py-0.5 rounded"
            style={{
              backgroundColor: "var(--color-accent-muted)",
              color: "var(--color-accent)",
            }}
          >
            {rows.length} slot{rows.length !== 1 ? "s" : ""}
          </span>
          <span className="text-xs theme-text-muted">
            {expanded ? "▼" : "▶"}
          </span>
        </div>
      </button>
      {expanded && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <TableHeader cols={["Slot", "Variable", "Before", "After"]} />
            <tbody>
              {rows.map((row, i) => (
                <tr
                  key={i}
                  className="bs-b-muted last:shadow-none"
                  style={{}}
                >
                  <td
                    className="px-3 py-2"
                    title={row.slot}
                    style={{
                      fontFamily: "var(--font-mono)",
                      color: "var(--color-text-muted)",
                    }}
                  >
                    {truncateHex(row.slot)}
                  </td>
                  <td
                    className="px-3 py-2 theme-text-secondary"
                  >
                    {row.decodedName ?? "—"}
                  </td>
                  <td
                    className="px-3 py-2"
                    title={row.before}
                    style={{
                      fontFamily: "var(--font-mono)",
                      color: "var(--color-text-muted)",
                    }}
                  >
                    {truncateHex(row.before)}
                  </td>
                  <td
                    className="px-3 py-2"
                    title={row.after}
                    style={{
                      fontFamily: "var(--font-mono)",
                      color: "var(--color-accent)",
                    }}
                  >
                    {truncateHex(row.after)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StorageChangesSection({ changes }: { changes: StorageChange[] }) {
  const [expanded, setExpanded] = useState(true);

  // Group by contract address
  const groups = changes.reduce(
    (acc, change) => {
      const existing = acc.find((g) => g.address === change.address);
      if (existing) {
        existing.rows.push(change);
      } else {
        acc.push({
          address: change.address,
          contractName: change.contractName,
          rows: [change],
        });
      }
      return acc;
    },
    [] as Array<{ address: string; contractName: string | undefined; rows: StorageChange[] }>,
  );

  return (
    <div>
      <SectionHeader
        title="Storage Changes"
        count={changes.length}
        expanded={expanded}
        onToggle={() => setExpanded((v) => !v)}
      />
      {expanded && (
        <div>
          {groups.map((group) => (
            <StorageGroup
              key={group.address}
              address={group.address}
              contractName={group.contractName}
              rows={group.rows}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Nonce Changes
// ---------------------------------------------------------------------------

function NonceChangesSection({ changes }: { changes: NonceChange[] }) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div>
      <SectionHeader
        title="Nonce Changes"
        count={changes.length}
        expanded={expanded}
        onToggle={() => setExpanded((v) => !v)}
      />
      {expanded && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <TableHeader cols={["Address", "Before", "After"]} />
            <tbody>
              {changes.map((change, i) => (
                <tr
                  key={i}
                  className="bs-b-muted last:shadow-none"
                  style={{}}
                >
                  <td
                    className="px-3 py-2"
                    title={change.address}
                    style={{
                      fontFamily: "var(--font-mono)",
                      color: "var(--color-text-primary)",
                    }}
                  >
                    {truncateHex(change.address)}
                  </td>
                  <td
                    className="px-3 py-2 theme-text-muted"
                  >
                    {change.before}
                  </td>
                  <td
                    className="px-3 py-2 theme-text"
                  >
                    {change.after}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// StateDiffPanel
// ---------------------------------------------------------------------------

interface StateDiffPanelProps {
  stateDiff: StateDiff;
}

export default function StateDiffPanel({ stateDiff }: StateDiffPanelProps) {
  const { balanceChanges, storageChanges, nonceChanges } = stateDiff;
  const hasAnyChanges =
    balanceChanges.length > 0 || storageChanges.length > 0 || nonceChanges.length > 0;

  if (!hasAnyChanges) {
    return (
      <div
        className="rounded-lg bs p-4 text-center text-xs"
        style={{
          backgroundColor: "var(--color-bg-card)",
          color: "var(--color-text-muted)",
        }}
      >
        No state changes detected.
      </div>
    );
  }

  return (
    <div
      className="rounded-lg bs overflow-hidden theme-card-bg"
    >
      {balanceChanges.length > 0 && (
        <BalanceChangesSection changes={balanceChanges} />
      )}
      {storageChanges.length > 0 && (
        <div
          style={
            balanceChanges.length > 0
              ? { boxShadow: "0 -1px 0 0 var(--color-border-default)" }
              : undefined
          }
        >
          <StorageChangesSection changes={storageChanges} />
        </div>
      )}
      {nonceChanges.length > 0 && (
        <div
          style={
            balanceChanges.length > 0 || storageChanges.length > 0
              ? { boxShadow: "0 -1px 0 0 var(--color-border-default)" }
              : undefined
          }
        >
          <NonceChangesSection changes={nonceChanges} />
        </div>
      )}
    </div>
  );
}
