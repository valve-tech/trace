import { type CSSProperties } from "react";
import type { TokenApproval } from "../types.js";
import { truncateAddress } from "./formatters.js";

const UINT256_MAX = 2n ** 256n - 1n;

export interface ApprovalsPanelClassNames {
  root?: string;
  header?: string;
  empty?: string;
  row?: string;
  badge?: string;
  unlimitedBadge?: string;
}

export interface ApprovalsPanelProps {
  approvals: TokenApproval[];
  /**
   * Threshold at or above which to show the "UNLIMITED" badge. Defaults to
   * `2n ** 256n - 1n` (literal max). Pass `2n ** 128n` to also badge the
   * common "fake unlimited" phishing values.
   */
  unlimitedThreshold?: bigint;
  hideHeader?: boolean;
  title?: string;
  classNames?: ApprovalsPanelClassNames;
  style?: CSSProperties;
  className?: string;
}

/**
 * Visualization for `TokenApproval[]` from `parseApprovals`. Each row shows
 * the token, owner, spender, and approved value, with a prominent
 * "UNLIMITED" badge when the value crosses the configured threshold.
 *
 * The threshold is shared with the `largeApproval` risk rule's default — by
 * keeping the same default (`2n ** 256n - 1n`), a UI that wires both
 * `<ApprovalsPanel>` and `<FindingsPanel analyzeRisks(...)>` will show
 * consistent flagging.
 */
export function ApprovalsPanel({
  approvals,
  unlimitedThreshold = UINT256_MAX,
  hideHeader = false,
  title = "Approvals",
  classNames = {},
  style,
  className,
}: ApprovalsPanelProps): React.JSX.Element {
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
            {approvals.length.toLocaleString()}{" "}
            {approvals.length === 1 ? "approval" : "approvals"}
          </span>
        </div>
      )}

      {approvals.length === 0 ? (
        <div
          className={classNames.empty}
          style={{
            padding: 16,
            fontSize: 12,
            color: "#6e7681",
            textAlign: "center",
          }}
        >
          No approvals in this trace.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {approvals.map((approval, i) => (
            <ApprovalRow
              key={`${approval.logIndex}-${i}`}
              approval={approval}
              unlimitedThreshold={unlimitedThreshold}
              className={classNames.row}
              unlimitedBadgeClassName={classNames.unlimitedBadge}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ApprovalRow({
  approval,
  unlimitedThreshold,
  className,
  unlimitedBadgeClassName,
}: {
  approval: TokenApproval;
  unlimitedThreshold: bigint;
  className?: string;
  unlimitedBadgeClassName?: string;
}) {
  const isUnlimited = approval.value >= unlimitedThreshold;
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
        {isUnlimited && (
          <UnlimitedBadge className={unlimitedBadgeClassName} />
        )}
        <span style={{ color: "#8b949e" }}>token</span>
        <span style={{ color: "#c9d1d9" }}>
          {truncateAddress(approval.token)}
        </span>
        <span style={{ color: "#6e7681", marginLeft: "auto" }}>
          log #{approval.logIndex}
        </span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px" }}>
        <Field label="owner" value={truncateAddress(approval.owner)} />
        <Field label="spender" value={truncateAddress(approval.spender)} />
        <Field
          label="value"
          value={isUnlimited ? "∞" : approval.value.toString()}
          valueColor={isUnlimited ? "#f59e0b" : "#c9d1d9"}
        />
      </div>
    </div>
  );
}

function UnlimitedBadge({ className }: { className?: string }) {
  return (
    <span
      className={className}
      title="Approval at or above the unlimited threshold"
      style={{
        padding: "1px 6px",
        borderRadius: 3,
        fontSize: 10,
        fontWeight: 600,
        color: "#f59e0b",
        backgroundColor: "rgba(245, 158, 11, 0.13)",
        border: "1px solid rgba(245, 158, 11, 0.5)",
      }}
    >
      UNLIMITED
    </span>
  );
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
