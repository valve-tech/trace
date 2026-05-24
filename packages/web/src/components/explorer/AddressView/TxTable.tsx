import type { AddressTransaction } from "../../../api/explorer";
import { formatPLS, truncateAddr } from "../format";
import { formatRelativeTimestamp } from "./formatRelative";
import type { AddressNavTarget } from "./TransactionsTab";
import TxRowActions from "../TxRowActions";
import { ExplorerLink } from "../ExplorerLink";
import { TxGasInfo } from "../TxGasInfo";

const HEADERS = ["Tx Hash", "Block", "Age", "From", "To", "Value", "Gas / Type", "Status", ""];

interface Props {
  txs: AddressTransaction[];
  ownerAddress: string;
  onNavigate: (target: AddressNavTarget) => void;
}

export function TxTable({ txs, ownerAddress, onNavigate }: Props) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr style={{ backgroundColor: "var(--color-bg-secondary)" }}>
          {HEADERS.map((h) => (
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
        {txs.map((tx, i) => (
          <TxRow
            key={i}
            tx={tx}
            ownerAddress={ownerAddress}
            onNavigate={onNavigate}
          />
        ))}
      </tbody>
    </table>
  );
}

function TxRow({
  tx,
  ownerAddress,
  onNavigate,
}: {
  tx: AddressTransaction;
  ownerAddress: string;
  onNavigate: (target: AddressNavTarget) => void;
}) {
  const isContractCreation = !tx.to || tx.to === "0x";
  const isIn =
    !isContractCreation && tx.to.toLowerCase() === ownerAddress.toLowerCase();

  return (
    <tr
      className="bs-t-muted hover:opacity-80"
      style={{}}
    >
      <td className="px-3 py-2">
        <LinkButton
          target={{ type: "tx", value: tx.hash }}
          onNavigate={onNavigate}
          title={tx.hash}
        >
          {truncateAddr(tx.hash)}
        </LinkButton>
      </td>
      <td className="px-3 py-2">
        <LinkButton
          target={{ type: "block", value: tx.blockNumber }}
          onNavigate={onNavigate}
        >
          {Number(tx.blockNumber).toLocaleString()}
        </LinkButton>
      </td>
      <td
        className="px-3 py-2 text-xs whitespace-nowrap"
        style={{ color: "var(--color-text-secondary)" }}
      >
        {formatRelativeTimestamp(tx.timeStamp)}
      </td>
      <td className="px-3 py-2">
        <LinkButton
          target={{ type: "address", value: tx.from }}
          onNavigate={onNavigate}
          title={tx.from}
        >
          {truncateAddr(tx.from)}
        </LinkButton>
      </td>
      <td className="px-3 py-2">
        {isContractCreation ? (
          <span
            className="text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wider"
            style={{
              backgroundColor: "var(--color-accent-muted)",
              color: "var(--color-accent)",
            }}
          >
            Contract Creation
          </span>
        ) : (
          <div className="flex items-center gap-1.5">
            <DirectionBadge isIn={isIn} />
            <LinkButton
              target={{ type: "address", value: tx.to }}
              onNavigate={onNavigate}
              title={tx.to}
            >
              {truncateAddr(tx.to)}
            </LinkButton>
          </div>
        )}
      </td>
      <td
        className="px-3 py-2 font-mono text-xs whitespace-nowrap"
        style={{ color: "var(--color-text-primary)" }}
      >
        {formatPLS(tx.valuePLS)}
      </td>
      <td className="px-3 py-2 whitespace-nowrap">
        <TxGasInfo
          type={tx.type}
          gasPrice={tx.gasPrice}
          maxFeePerGas={tx.maxFeePerGas}
          maxPriorityFeePerGas={tx.maxPriorityFeePerGas}
        />
      </td>
      <td className="px-3 py-2">
        <span
          className="inline-block w-2 h-2 rounded-full"
          style={{
            backgroundColor:
              tx.isError === "0"
                ? "var(--color-success)"
                : "var(--color-danger)",
          }}
          title={tx.isError === "0" ? "Success" : "Error"}
        />
      </td>
      <td className="px-3 py-2 text-right relative">
        <TxRowActions
          hash={tx.hash}
          contractAddress={isContractCreation ? null : tx.to}
          compact
        />
      </td>
    </tr>
  );
}

function LinkButton({
  target,
  onNavigate,
  title,
  children,
}: {
  target: AddressNavTarget;
  onNavigate: (target: AddressNavTarget) => void;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <ExplorerLink
      target={target}
      onNavigate={onNavigate}
      title={title}
      className="font-mono text-xs hover:underline cursor-pointer"
      style={{ color: "var(--color-accent)" }}
    >
      {children}
    </ExplorerLink>
  );
}

function DirectionBadge({ isIn }: { isIn: boolean }) {
  return (
    <span
      className="text-[9px] font-bold px-1 py-0.5 rounded"
      style={{
        backgroundColor: isIn
          ? "var(--color-success-muted)"
          : "var(--color-warning-muted)",
        color: isIn ? "var(--color-success)" : "var(--color-warning)",
      }}
    >
      {isIn ? "IN" : "OUT"}
    </span>
  );
}
