import type { TransactionDetails } from "../../../api/explorer";
import { AddressLink, SectionCard, type AddressNavigate } from "./primitives";
import { formatPLS } from "./format";

export function InternalTxSection({
  internalTransactions,
  onNavigate,
}: {
  internalTransactions: TransactionDetails["internalTransactions"];
  onNavigate: AddressNavigate;
}) {
  return (
    <SectionCard
      title="Internal Transactions"
      count={internalTransactions.length}
      defaultOpen={false}
    >
      <div className="pt-3">
        <div
          className="rounded-md bs-muted overflow-x-auto"
          style={{}}
        >
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: "var(--color-bg-secondary)" }}>
                <th
                  className="text-left px-3 py-2 text-xs font-medium"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  Type
                </th>
                <th
                  className="text-left px-3 py-2 text-xs font-medium"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  From
                </th>
                <th
                  className="text-left px-3 py-2 text-xs font-medium"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  To
                </th>
                <th
                  className="text-left px-3 py-2 text-xs font-medium"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  Value
                </th>
                <th
                  className="text-left px-3 py-2 text-xs font-medium"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  Gas Used
                </th>
              </tr>
            </thead>
            <tbody>
              {internalTransactions.map((itx, i) => (
                <tr
                  key={i}
                  className="bs-t-muted hover:opacity-80"
                  style={{}}
                >
                  <td className="px-3 py-2">
                    <span
                      className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded"
                      style={{
                        backgroundColor: "var(--color-bg-primary)",
                        color: "var(--color-text-secondary)",
                      }}
                    >
                      {itx.type}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <AddressLink address={itx.from} onNavigate={onNavigate} />
                  </td>
                  <td className="px-3 py-2">
                    <AddressLink address={itx.to} onNavigate={onNavigate} />
                  </td>
                  <td
                    className="px-3 py-2 font-mono"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    {formatPLS(itx.valuePLS)}
                  </td>
                  <td
                    className="px-3 py-2 font-mono"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    {Number(itx.gasUsed).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </SectionCard>
  );
}
