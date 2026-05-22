import type { TransactionDetails } from "../../../api/explorer";
import { SectionCard } from "./primitives";
import { renderParamValue } from "./format";

type DecodedInput = NonNullable<TransactionDetails["decodedInput"]>;

export function DecodedInputSection({ decoded }: { decoded: DecodedInput }) {
  return (
    <SectionCard title="Decoded Function Call">
      <div className="pt-3">
        <div
          className="px-3 py-2 rounded-md mb-3 text-sm"
          style={{
            fontFamily: "var(--font-mono)",
            backgroundColor: "var(--color-accent-muted)",
            color: "var(--color-accent)",
          }}
        >
          {decoded.functionName}({decoded.args.map((p) => p.type).join(", ")})
        </div>
        {decoded.args.length > 0 && (
          <div
            className="rounded-md bs-muted overflow-hidden"
            style={{}}
          >
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: "var(--color-bg-secondary)" }}>
                  <th
                    className="text-left px-3 py-2 text-xs font-medium"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    #
                  </th>
                  <th
                    className="text-left px-3 py-2 text-xs font-medium"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    Name
                  </th>
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
                    Value
                  </th>
                </tr>
              </thead>
              <tbody>
                {decoded.args.map((arg, i) => (
                  <tr
                    key={i}
                    className="bs-t-muted hover:opacity-80"
                    style={{}}
                  >
                    <td
                      className="px-3 py-2"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      {i}
                    </td>
                    <td
                      className="px-3 py-2 font-medium"
                      style={{ color: "var(--color-accent)" }}
                    >
                      {arg.name || `param${i}`}
                    </td>
                    <td
                      className="px-3 py-2"
                      style={{ color: "var(--color-text-secondary)" }}
                    >
                      {arg.type}
                    </td>
                    <td
                      className="px-3 py-2 font-mono break-all max-w-[400px]"
                      style={{ color: "var(--color-text-primary)" }}
                    >
                      {renderParamValue(arg.value)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </SectionCard>
  );
}
