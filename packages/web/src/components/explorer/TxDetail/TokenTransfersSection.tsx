import type { TransactionDetails } from "../../../api/explorer";
import { AddressLink, SectionCard, type AddressNavigate } from "./primitives";

export function TokenTransfersSection({
  tokenTransfers,
  onNavigate,
}: {
  tokenTransfers: TransactionDetails["tokenTransfers"];
  onNavigate: AddressNavigate;
}) {
  return (
    <SectionCard
      title="Token Transfers"
      count={tokenTransfers.length}
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
                  Token
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
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {tokenTransfers.map((tt, i) => (
                <tr
                  key={i}
                  className="bs-t-muted hover:opacity-80"
                  style={{}}
                >
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <span style={{ color: "var(--color-text-primary)" }}>
                        {tt.tokenName || "Unknown"}
                      </span>
                      <span
                        className="text-[10px] font-medium"
                        style={{ color: "var(--color-text-muted)" }}
                      >
                        {tt.tokenSymbol}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <AddressLink address={tt.from} onNavigate={onNavigate} />
                  </td>
                  <td className="px-3 py-2">
                    <AddressLink address={tt.to} onNavigate={onNavigate} />
                  </td>
                  <td
                    className="px-3 py-2 font-mono"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    {tt.formattedValue} {tt.tokenSymbol}
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
