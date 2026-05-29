export type AddressSubTab = "transactions" | "tokens";

interface Props {
  active: AddressSubTab;
  onSelect: (tab: AddressSubTab) => void;
  txCount: number;
  tokenCount: number;
}

function TabButton({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      onClick={onClick}
      className="px-4 py-2.5 text-sm font-medium transition-colors"
      style={{
        boxShadow: active
          ? "0 2px 0 0 var(--color-accent)"
          : "0 2px 0 0 transparent",
        color: active
          ? "var(--color-text-primary)"
          : "var(--color-text-secondary)",
        backgroundColor: "transparent",
      }}
    >
      {label}
      {count > 0 && (
        <span
          className="ml-1.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full theme-accent-bg theme-accent"
        >
          {count}
        </span>
      )}
    </button>
  );
}

export function SubTabBar({ active, onSelect, txCount, tokenCount }: Props) {
  return (
    <div
      className="flex gap-0"
      style={{ boxShadow: "0 1px 0 0 var(--color-border-default)" }}
    >
      <TabButton
        active={active === "transactions"}
        onClick={() => onSelect("transactions")}
        label="Transactions"
        count={txCount}
      />
      <TabButton
        active={active === "tokens"}
        onClick={() => onSelect("tokens")}
        label="Token Balances"
        count={tokenCount}
      />
    </div>
  );
}
