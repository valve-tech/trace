import type { AddressToken } from "../../../api/explorer";
import { truncateAddr } from "../format";
import type { AddressNavTarget } from "./TransactionsTab";

export function TokensTab({
  tokens,
  onNavigate,
}: {
  tokens: AddressToken[];
  onNavigate: (target: AddressNavTarget) => void;
}) {
  return (
    <div
      className="rounded-lg bs overflow-hidden"
      style={{
        backgroundColor: "var(--color-bg-card)",
      }}
    >
      {tokens.length === 0 ? (
        <div
          className="p-4 text-center text-sm"
          style={{ color: "var(--color-text-muted)" }}
        >
          No tokens found
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr style={{ backgroundColor: "var(--color-bg-secondary)" }}>
              {["Token", "Symbol", "Balance", "Contract", "Type"].map((h) => (
                <th
                  key={h}
                  className="text-left px-3 py-2.5 text-xs font-medium"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tokens.map((token, i) => (
              <tr
                key={i}
                className="bs-t-muted hover:opacity-80"
                style={{}}
              >
                <td
                  className="px-3 py-2"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  {token.name || "Unknown"}
                </td>
                <td
                  className="px-3 py-2 font-mono"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  {token.symbol}
                </td>
                <td
                  className="px-3 py-2 font-mono"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  {token.formattedBalance}
                </td>
                <td className="px-3 py-2">
                  <button
                    onClick={() =>
                      onNavigate({
                        type: "address",
                        value: token.contractAddress,
                      })
                    }
                    className="font-mono text-xs hover:underline cursor-pointer"
                    style={{ color: "var(--color-accent)" }}
                    title={token.contractAddress}
                  >
                    {truncateAddr(token.contractAddress)}
                  </button>
                </td>
                <td className="px-3 py-2">
                  <span
                    className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                    style={{
                      backgroundColor: "var(--color-bg-secondary)",
                      color: "var(--color-text-secondary)",
                    }}
                  >
                    {token.type}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
