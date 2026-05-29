import type { SubTab } from "./types";

const BASE_TABS: SubTab[] = ["read", "write", "abi", "source"];

interface Props {
  active: SubTab;
  onSelect: (tab: SubTab) => void;
  readCount: number;
  writeCount: number;
  /** Show the chart tab — only for token contracts. */
  showChart?: boolean;
}

export function SubTabBar({
  active,
  onSelect,
  readCount,
  writeCount,
  showChart = false,
}: Props) {
  const tabs = showChart ? [...BASE_TABS, "chart" as SubTab] : BASE_TABS;
  const label = (tab: SubTab): string => {
    if (tab === "read") return `Read (${readCount})`;
    if (tab === "write") return `Write (${writeCount})`;
    if (tab === "source") return "Source";
    if (tab === "chart") return "Chart";
    return "ABI";
  };

  return (
    <div className="flex gap-0 bs-b">
      {tabs.map((tab) => (
        <button
          key={tab}
          onClick={() => onSelect(tab)}
          className={`px-4 py-2.5 text-sm font-medium transition-colors capitalize ${
            active === tab ? "theme-text" : "theme-text-secondary"
          }`}
          style={{
            boxShadow:
              active === tab
                ? "0 2px 0 0 var(--color-accent)"
                : "0 2px 0 0 transparent",
            backgroundColor: "transparent",
          }}
        >
          {label(tab)}
        </button>
      ))}
    </div>
  );
}
