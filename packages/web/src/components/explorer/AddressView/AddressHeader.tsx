import type { AddressInfo } from "../../../api/explorer";
import { formatPLS } from "../format";

export function AddressHeader({
  address,
  info,
  onViewContract,
}: {
  address: string;
  info: AddressInfo | null;
  onViewContract: () => void;
}) {
  return (
    <div
      className="rounded-lg bs p-4"
      style={{
        backgroundColor: "var(--color-bg-card)",
      }}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-row">
        <div>
          <div className="flex items-center gap-inline mb-1">
            <h2
              className="text-sm font-semibold"
              style={{ color: "var(--color-text-primary)" }}
            >
              Address
            </h2>
            {info?.isContract && (
              <span
                className="text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider"
                style={{
                  backgroundColor: "var(--color-accent-muted)",
                  color: "var(--color-accent)",
                }}
              >
                Contract
              </span>
            )}
          </div>
          <span
            className="font-mono text-sm break-all"
            style={{ color: "var(--color-text-primary)" }}
          >
            {address}
          </span>
        </div>
        <div className="text-right">
          <span
            className="text-xs block mb-0.5"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Balance
          </span>
          <span
            className="font-mono text-lg font-semibold"
            style={{ color: "var(--color-text-primary)" }}
          >
            {info ? formatPLS(info.balancePLS) : "..."}
          </span>
        </div>
      </div>
      {info?.isContract && (
        <div
          className="mt-3 pt-3 bs-t-muted"
          style={{}}
        >
          <button
            onClick={onViewContract}
            className="text-xs font-medium hover:underline cursor-pointer"
            style={{ color: "var(--color-accent)" }}
          >
            View Contract Details
          </button>
        </div>
      )}
    </div>
  );
}
