import type { TransactionDetails } from "../../../api/explorer";
import {
  AddressLink,
  InfoRow,
  SectionCard,
  type NavTarget,
} from "./primitives";
import { StatusBadge } from "../../primitives/StatusBadge";
import { ExplorerLink } from "../ExplorerLink";
import { formatGwei, formatPLS, formatTimestamp } from "./format";

export function OverviewSection({
  tx,
  onNavigate,
}: {
  tx: TransactionDetails;
  onNavigate: (target: NavTarget) => void;
}) {
  const gasPercent =
    tx.gas !== "0"
      ? ((Number(tx.gasUsed) / Number(tx.gas)) * 100).toFixed(1)
      : "0";

  return (
    <SectionCard title="Transaction Overview">
      <div className="pt-2">
        <InfoRow label="Transaction Hash">
          <span
            className="font-mono break-all theme-text"
          >
            {tx.hash}
          </span>
        </InfoRow>
        <InfoRow label="Status">
          <StatusBadge success={tx.status === "success"} />
        </InfoRow>
        <InfoRow label="Block">
          <ExplorerLink
            target={{ type: "block", value: tx.blockNumber }}
            onNavigate={onNavigate}
            className="font-mono text-sm hover:underline cursor-pointer theme-accent"
          >
            {Number(tx.blockNumber).toLocaleString()}
          </ExplorerLink>
        </InfoRow>
        <InfoRow label="Timestamp">
          <span style={{ color: "var(--color-text-primary)" }}>
            {formatTimestamp(tx.timestamp)}
          </span>
        </InfoRow>
        <InfoRow label="From">
          <AddressLink address={tx.from} onNavigate={onNavigate} />
        </InfoRow>
        <InfoRow label="To">
          {tx.to ? (
            <div className="flex items-center gap-inline">
              <AddressLink address={tx.to} onNavigate={onNavigate} />
              {tx.contractAddress && (
                <span
                  className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                  style={{
                    backgroundColor: "var(--color-success-muted)",
                    color: "var(--color-success)",
                  }}
                >
                  Contract Creation
                </span>
              )}
            </div>
          ) : (
            <span
              className="text-sm theme-text-muted"
            >
              Contract Creation
              {tx.contractAddress && (
                <>
                  {" "}
                  <AddressLink
                    address={tx.contractAddress}
                    onNavigate={onNavigate}
                  />
                </>
              )}
            </span>
          )}
        </InfoRow>
        <InfoRow label="Value">
          <span
            className="font-mono theme-text"
          >
            {formatPLS(tx.valuePLS)}
          </span>
        </InfoRow>
        <InfoRow label="Gas Used / Limit">
          <span style={{ color: "var(--color-text-primary)" }}>
            <span className="font-mono">
              {Number(tx.gasUsed).toLocaleString()}
            </span>
            <span style={{ color: "var(--color-text-muted)" }}> / </span>
            <span className="font-mono">
              {Number(tx.gas).toLocaleString()}
            </span>
            <span
              className="ml-2 text-xs theme-text-secondary"
            >
              ({gasPercent}%)
            </span>
          </span>
        </InfoRow>
        <InfoRow label="Gas Price">
          <span
            className="font-mono theme-text"
          >
            {formatGwei(tx.gasPrice)}
          </span>
        </InfoRow>
        <InfoRow label="Nonce">
          <span
            className="font-mono theme-text"
          >
            {tx.nonce}
          </span>
        </InfoRow>
        <InfoRow label="Type">
          <span style={{ color: "var(--color-text-primary)" }}>{tx.type}</span>
        </InfoRow>
      </div>
    </SectionCard>
  );
}
