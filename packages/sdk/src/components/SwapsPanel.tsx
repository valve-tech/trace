import { type CSSProperties } from "react";
import type { Swap, SwapV1, SwapV2, SwapV3 } from "../types.js";
import { truncateAddress } from "./formatters.js";

export interface SwapsPanelClassNames {
  root?: string;
  header?: string;
  empty?: string;
  row?: string;
  badge?: string;
}

export interface SwapsPanelProps {
  swaps: Swap[];
  /** Hide the header (title + count). */
  hideHeader?: boolean;
  /** Override the panel title. Default: "Swaps". */
  title?: string;
  /** Per-slot class names for theming. */
  classNames?: SwapsPanelClassNames;
  style?: CSSProperties;
  className?: string;
}

/**
 * Visualization for the discriminated `Swap[]` output of `parseSwaps`. Each
 * row renders the pool/exchange address, sender, recipient/buyer, and
 * variant-specific amount fields. UniV3 amounts are signed (pool's
 * perspective) — positive means the pool received that token.
 */
export function SwapsPanel({
  swaps,
  hideHeader = false,
  title = "Swaps",
  classNames = {},
  style,
  className,
}: SwapsPanelProps): React.JSX.Element {
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
            {swaps.length.toLocaleString()}{" "}
            {swaps.length === 1 ? "swap" : "swaps"}
          </span>
        </div>
      )}

      {swaps.length === 0 ? (
        <div
          className={classNames.empty}
          style={{
            padding: 16,
            fontSize: 12,
            color: "#6e7681",
            textAlign: "center",
          }}
        >
          No swaps in this trace.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {swaps.map((swap, i) => (
            <SwapRow
              key={`${swap.logIndex}-${i}`}
              swap={swap}
              className={classNames.row}
              badgeClassName={classNames.badge}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-row rendering
// ---------------------------------------------------------------------------

const VARIANT_COLORS: Record<Swap["variant"], string> = {
  univ1: "#06b6d4",
  univ2: "#22c55e",
  univ3: "#a855f7",
};

const VARIANT_LABELS: Record<Swap["variant"], string> = {
  univ1: "V1",
  univ2: "V2",
  univ3: "V3",
};

function SwapRow({
  swap,
  className,
  badgeClassName,
}: {
  swap: Swap;
  className?: string;
  badgeClassName?: string;
}) {
  return (
    <div
      className={className}
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
        <VariantBadge variant={swap.variant} className={badgeClassName} />
        <span style={{ color: "#8b949e" }}>pool</span>
        <span style={{ color: "#c9d1d9" }}>
          {truncateAddress(swap.pool)}
        </span>
        <span style={{ color: "#6e7681", marginLeft: "auto" }}>
          log #{swap.logIndex}
        </span>
      </div>
      <SwapBody swap={swap} />
    </div>
  );
}

function VariantBadge({
  variant,
  className,
}: {
  variant: Swap["variant"];
  className?: string;
}) {
  const color = VARIANT_COLORS[variant];
  return (
    <span
      className={className}
      style={{
        padding: "1px 6px",
        borderRadius: 3,
        fontSize: 10,
        fontWeight: 600,
        color,
        backgroundColor: `${color}22`,
        border: `1px solid ${color}55`,
      }}
    >
      {VARIANT_LABELS[variant]}
    </span>
  );
}

function SwapBody({ swap }: { swap: Swap }): React.JSX.Element {
  switch (swap.variant) {
    case "univ1":
      return <V1Body swap={swap} />;
    case "univ2":
      return <V2Body swap={swap} />;
    case "univ3":
      return <V3Body swap={swap} />;
  }
}

function V1Body({ swap }: { swap: SwapV1 }) {
  const directionLabel =
    swap.direction === "buyToken" ? "ETH → token" : "token → ETH";
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px" }}>
      <Field label="buyer" value={truncateAddress(swap.buyer)} />
      <Field label="direction" value={directionLabel} />
      <Field label="eth" value={swap.ethAmount.toString()} />
      <Field label="token" value={swap.tokenAmount.toString()} />
    </div>
  );
}

function V2Body({ swap }: { swap: SwapV2 }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px" }}>
      <Field label="sender" value={truncateAddress(swap.sender)} />
      <Field label="to" value={truncateAddress(swap.to)} />
      <Field label="amount0In" value={swap.amount0In.toString()} />
      <Field label="amount1In" value={swap.amount1In.toString()} />
      <Field label="amount0Out" value={swap.amount0Out.toString()} />
      <Field label="amount1Out" value={swap.amount1Out.toString()} />
    </div>
  );
}

function V3Body({ swap }: { swap: SwapV3 }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px" }}>
      <Field label="sender" value={truncateAddress(swap.sender)} />
      <Field label="recipient" value={truncateAddress(swap.recipient)} />
      <Field
        label="amount0"
        value={swap.amount0.toString()}
        valueColor={signedColor(swap.amount0)}
      />
      <Field
        label="amount1"
        value={swap.amount1.toString()}
        valueColor={signedColor(swap.amount1)}
      />
      <Field label="tick" value={swap.tick.toString()} />
      <Field label="liquidity" value={swap.liquidity.toString()} />
    </div>
  );
}

function signedColor(n: bigint): string {
  // Negative = pool sent (user received). Positive = pool received.
  if (n < 0n) return "#22c55e";
  if (n > 0n) return "#ef4444";
  return "#c9d1d9";
}

function Field({
  label,
  value,
  valueColor = "#c9d1d9",
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <span style={{ display: "inline-flex", gap: 4 }}>
      <span style={{ color: "#6e7681" }}>{label}</span>
      <span style={{ color: valueColor }}>{value}</span>
    </span>
  );
}
