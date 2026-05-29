import type { ForkSimulationResult } from "../../api/simulate";
import { DiffSection } from "./primitives";

export function BalanceChangesTable({
  changes,
}: {
  changes: ForkSimulationResult["stateDiff"]["balanceChanges"];
}) {
  return (
    <DiffSection title="Balance Changes" count={changes.length}>
      <table
        className="w-full text-xs theme-mono"
      >
        <thead>
          <tr style={{ color: "var(--color-text-muted)" }}>
            <th className="text-left py-1 px-2">Address</th>
            <th className="text-right py-1 px-2">Before (PLS)</th>
            <th className="text-right py-1 px-2">After (PLS)</th>
            <th className="text-right py-1 px-2">Delta</th>
          </tr>
        </thead>
        <tbody>
          {changes.map((bc, i) => (
            <tr
              key={i}
              style={{ boxShadow: "0 -1px 0 0 var(--color-border-default)" }}
            >
              <td
                className="py-1.5 px-2"
                title={bc.address}
                style={{ color: "var(--color-text-primary)" }}
              >
                {bc.address.slice(0, 8)}...{bc.address.slice(-6)}
              </td>
              <td
                className="text-right py-1.5 px-2 theme-text-muted"
              >
                {parseFloat(bc.before).toFixed(4)}
              </td>
              <td
                className="text-right py-1.5 px-2 theme-text"
              >
                {parseFloat(bc.after).toFixed(4)}
              </td>
              <td
                className="text-right py-1.5 px-2 font-semibold"
                style={{
                  color:
                    bc.delta.startsWith("+") || !bc.delta.startsWith("-")
                      ? "var(--color-success)"
                      : "var(--color-danger)",
                }}
              >
                {bc.delta.startsWith("-") || bc.delta.startsWith("+")
                  ? bc.delta
                  : `+${bc.delta}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </DiffSection>
  );
}

export function StorageChangesTable({
  changes,
}: {
  changes: ForkSimulationResult["stateDiff"]["storageChanges"];
}) {
  return (
    <DiffSection title="Storage Changes" count={changes.length}>
      <table
        className="w-full text-xs theme-mono"
      >
        <thead>
          <tr style={{ color: "var(--color-text-muted)" }}>
            <th className="text-left py-1 px-2">Contract</th>
            <th className="text-left py-1 px-2">Slot</th>
            <th className="text-left py-1 px-2">Before</th>
            <th className="text-left py-1 px-2">After</th>
          </tr>
        </thead>
        <tbody>
          {changes.map((sc, i) => (
            <tr
              key={i}
              style={{ boxShadow: "0 -1px 0 0 var(--color-border-default)" }}
            >
              <td
                className="py-1.5 px-2"
                title={sc.address}
                style={{ color: "var(--color-text-primary)" }}
              >
                {sc.contractName ??
                  `${sc.address.slice(0, 8)}...${sc.address.slice(-4)}`}
              </td>
              <td
                className="py-1.5 px-2"
                title={sc.slot}
                style={{ color: "var(--color-text-muted)" }}
              >
                {sc.decodedName ?? `${sc.slot.slice(0, 10)}...`}
              </td>
              <td
                className="py-1.5 px-2"
                title={sc.before}
                style={{ color: "var(--color-danger)" }}
              >
                {sc.before.slice(0, 14)}...
              </td>
              <td
                className="py-1.5 px-2"
                title={sc.after}
                style={{ color: "var(--color-success)" }}
              >
                {sc.after.slice(0, 14)}...
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </DiffSection>
  );
}

export function EventsList({
  logs,
}: {
  logs: ForkSimulationResult["logs"];
}) {
  return (
    <DiffSection title="Events Emitted" count={logs.length}>
      <div className="space-y-2 p-2">
        {logs.map((log, i) => (
          <div
            key={i}
            className="text-xs theme-mono"
          >
            <span style={{ color: "var(--color-accent)" }}>
              {log.address.slice(0, 10)}...
            </span>
            {log.topics[0] && (
              <span style={{ color: "var(--color-text-muted)" }}>
                {" "}
                topic0: {log.topics[0].slice(0, 14)}...
              </span>
            )}
          </div>
        ))}
      </div>
    </DiffSection>
  );
}
