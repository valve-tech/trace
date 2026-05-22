import type { ContractInfo } from "../../../api/explorer";

export function ContractHeader({
  address,
  info,
  onViewAddress,
}: {
  address: string;
  info: ContractInfo;
  onViewAddress: () => void;
}) {
  return (
    <div
      className="rounded-lg bs p-4"
      style={{
        backgroundColor: "var(--color-bg-card)",
      }}
    >
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h2
              className="text-sm font-semibold"
              style={{ color: "var(--color-text-primary)" }}
            >
              Contract
            </h2>
            {info.isVerified ? (
              <span
                className="text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider"
                style={{
                  backgroundColor: "var(--color-success-muted)",
                  color: "var(--color-success)",
                }}
              >
                Verified
              </span>
            ) : (
              <span
                className="text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider"
                style={{
                  backgroundColor: "var(--color-warning-muted)",
                  color: "var(--color-warning)",
                }}
              >
                Unverified
              </span>
            )}
          </div>
          <span
            className="font-mono text-sm break-all"
            style={{ color: "var(--color-text-primary)" }}
          >
            {address}
          </span>
          {info.contractName && (
            <div className="mt-1">
              <span
                className="text-xs"
                style={{ color: "var(--color-text-secondary)" }}
              >
                {info.contractName}
              </span>
              {info.compilerVersion && (
                <span
                  className="text-xs ml-2"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  ({info.compilerVersion})
                </span>
              )}
            </div>
          )}
        </div>
        <button
          onClick={onViewAddress}
          className="text-xs font-medium hover:underline cursor-pointer shrink-0"
          style={{ color: "var(--color-accent)" }}
        >
          View Address
        </button>
      </div>
    </div>
  );
}
