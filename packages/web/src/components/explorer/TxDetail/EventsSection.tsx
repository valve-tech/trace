import type { TransactionDetails } from "../../../api/explorer";
import { AddressLink, SectionCard, type AddressNavigate } from "./primitives";
import { renderParamValue } from "./format";

export function EventsSection({
  decodedLogs,
  rawLogs,
  onNavigate,
}: {
  decodedLogs: TransactionDetails["decodedLogs"];
  rawLogs: TransactionDetails["rawLogs"];
  onNavigate: AddressNavigate;
}) {
  return (
    <SectionCard title="Events / Logs" count={rawLogs.length}>
      <div className="pt-3 space-y-2">
        {rawLogs.map((rawLog, i) => {
          const decoded = decodedLogs.find(
            (d) => d.logIndex === rawLog.logIndex,
          );
          return (
            <div
              key={i}
              className="rounded-md bs-muted p-3"
              style={{
                backgroundColor: "var(--color-bg-secondary)",
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                <span
                  className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                  style={{
                    backgroundColor: "var(--color-bg-primary)",
                    color: "var(--color-text-muted)",
                  }}
                >
                  #{rawLog.logIndex}
                </span>
                {decoded && (
                  <span
                    className="text-sm font-medium"
                    style={{ color: "var(--color-warning)" }}
                  >
                    {decoded.eventName}
                  </span>
                )}
                <AddressLink
                  address={rawLog.address}
                  onNavigate={onNavigate}
                />
              </div>
              {decoded ? (
                <div className="space-y-1 ml-2">
                  {decoded.args.map((arg, j) => (
                    <div
                      key={j}
                      className="flex items-start gap-2 text-xs"
                    >
                      <span
                        className="font-medium shrink-0"
                        style={{ color: "var(--color-text-secondary)" }}
                      >
                        {arg.name || `arg${j}`}
                      </span>
                      <span style={{ color: "var(--color-text-muted)" }}>
                        ({arg.type})
                      </span>
                      <span
                        className="font-mono break-all"
                        style={{ color: "var(--color-text-primary)" }}
                      >
                        {renderParamValue(arg.value)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-1 ml-2">
                  {rawLog.topics.map((topic, j) => (
                    <div key={j} className="text-xs">
                      <span
                        className="font-medium"
                        style={{ color: "var(--color-text-secondary)" }}
                      >
                        Topic {j}:
                      </span>{" "}
                      <span
                        className="font-mono break-all"
                        style={{ color: "var(--color-text-primary)" }}
                      >
                        {topic}
                      </span>
                    </div>
                  ))}
                  {rawLog.data !== "0x" && (
                    <div className="text-xs">
                      <span
                        className="font-medium"
                        style={{ color: "var(--color-text-secondary)" }}
                      >
                        Data:
                      </span>{" "}
                      <span
                        className="font-mono break-all"
                        style={{ color: "var(--color-text-primary)" }}
                      >
                        {rawLog.data}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}
