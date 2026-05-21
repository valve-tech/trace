import type { SubTab } from "./types";

const TABS: SubTab[] = ["read", "write", "abi", "source"];

interface Props {
  active: SubTab;
  onSelect: (tab: SubTab) => void;
  readCount: number;
  writeCount: number;
}

export function SubTabBar({ active, onSelect, readCount, writeCount }: Props) {
  const label = (tab: SubTab): string => {
    if (tab === "read") return `Read (${readCount})`;
    if (tab === "write") return `Write (${writeCount})`;
    if (tab === "source") return "Source";
    return "ABI";
  };

  return (
    <div
      className="flex gap-0 border-b"
      style={{ borderColor: "var(--color-border-default)" }}
    >
      {TABS.map((tab) => (
        <button
          key={tab}
          onClick={() => onSelect(tab)}
          className="px-4 py-2.5 text-sm font-medium border-b-2 transition-colors capitalize"
          style={{
            borderColor: active === tab ? "var(--color-accent)" : "transparent",
            color:
              active === tab
                ? "var(--color-text-primary)"
                : "var(--color-text-secondary)",
            backgroundColor: "transparent",
          }}
        >
          {label(tab)}
        </button>
      ))}
    </div>
  );
}
