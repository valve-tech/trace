import { type CSSProperties } from "react";
import type { TokenDelta } from "../types.js";
import { truncateAddress } from "./formatters.js";

export interface TokenDeltasPanelClassNames {
  root?: string;
  header?: string;
  empty?: string;
  row?: string;
  amount?: string;
}

export interface TokenDeltasPanelProps {
  deltas: TokenDelta[];
  /** Hide the header (title + count). */
  hideHeader?: boolean;
  /** Override the panel title. Default: "Token Transfers". */
  title?: string;
  /** Per-slot class names. */
  classNames?: TokenDeltasPanelClassNames;
  style?: CSSProperties;
  className?: string;
}

/**
 * Visualization for the `TokenDelta[]` output of `parseTokenDeltas`. Each
 * row shows the token, from, to, and raw value as a bigint string. Values
 * are not formatted as decimals because the parser doesn't know token
 * decimals — consumers wanting decimal-formatted amounts should map the
 * `deltas` array through their own token-metadata lookup before passing it
 * to a custom renderer.
 */
export function TokenDeltasPanel({
  deltas,
  hideHeader = false,
  title = "Token Transfers",
  classNames = {},
  style,
  className,
}: TokenDeltasPanelProps): React.JSX.Element {
  return (
    <div
      className={[className, classNames.root].filter(Boolean).join(" ")}
      style={{
        borderRadius: 8,
        border: "1px solid rgba(139, 148, 158, 0.2)",
        backgroundColor: "rgba(139, 148, 158, 0.03)",
        ...style,
      }}
    >
      {!hideHeader && (
        <div
          className={classNames.header}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: 16,
            borderBottom: "1px solid rgba(139, 148, 158, 0.2)",
          }}
        >
          <h3
            style={{
              fontSize: 13,
              fontWeight: 600,
              margin: 0,
              color: "#c9d1d9",
            }}
          >
            {title}
          </h3>
          <span style={{ fontSize: 11, color: "#8b949e" }}>
            {deltas.length.toLocaleString()}{" "}
            {deltas.length === 1 ? "transfer" : "transfers"}
          </span>
        </div>
      )}

      {deltas.length === 0 ? (
        <div
          className={classNames.empty}
          style={{
            padding: 16,
            fontSize: 12,
            color: "#6e7681",
            textAlign: "center",
          }}
        >
          No token transfers in this trace.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {deltas.map((d, i) => (
            <div
              key={`${d.logIndex}-${i}`}
              className={classNames.row}
              style={{
                padding: "10px 16px",
                borderBottom: "1px solid rgba(139, 148, 158, 0.1)",
                display: "flex",
                flexDirection: "column",
                gap: 6,
                fontSize: 11,
                fontFamily: "monospace",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: "#8b949e" }}>token</span>
                <span style={{ color: "#c9d1d9" }}>
                  {truncateAddress(d.token)}
                </span>
                <span style={{ color: "#6e7681", marginLeft: "auto" }}>
                  log #{d.logIndex}
                </span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px" }}>
                <Field label="from" value={truncateAddress(d.from)} />
                <Field label="to" value={truncateAddress(d.to)} />
                <Field
                  label="value"
                  value={d.value.toString()}
                  className={classNames.amount}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <span
      className={className}
      style={{ display: "inline-flex", gap: 4 }}
    >
      <span style={{ color: "#6e7681" }}>{label}</span>
      <span style={{ color: "#c9d1d9" }}>{value}</span>
    </span>
  );
}
