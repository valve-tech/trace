/**
 * Inline action group rendered next to an address anywhere in the explorer.
 * Mirrors TxRowActions: two primary icons + an overflow popover. Stops
 * propagation so clicking an action doesn't trigger the row's own navigation.
 *
 * Addresses get a different action set than tx hashes — "view transactions"
 * (the address view IS the history), simulate a call, storage layout, etc.
 */

import { useState, useEffect, useRef } from "react";
import { Icon } from "@iconify/react";

interface Props {
  address: string;
  /** Compact mode for tight rows: shrinks padding. Default false. */
  compact?: boolean;
}

export default function AddressRowActions({ address, compact = false }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);

  const handle = (e: React.MouseEvent, fn: () => void) => {
    e.stopPropagation();
    e.preventDefault();
    fn();
  };

  return (
    <div
      className="relative inline-flex items-center gap-tight"
      onClick={(e) => e.stopPropagation()}
    >
      <ActionIcon
        title="View transactions for this address"
        icon="heroicons:queue-list"
        compact={compact}
        onClick={(e) => handle(e, () => goto(`/#/explorer?address=${address}`))}
      />
      <ActionIcon
        title="Simulate a call to this address"
        icon="heroicons:play-circle"
        compact={compact}
        onClick={(e) => handle(e, () => goto(`/#/simulate?to=${address}`))}
      />
      <ActionIcon
        title="More actions"
        icon="heroicons:ellipsis-horizontal"
        compact={compact}
        onClick={(e) => handle(e, () => setMenuOpen((v) => !v))}
      />

      {menuOpen && (
        <ActionMenu address={address} onClose={() => setMenuOpen(false)} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pieces                                                             */
/* ------------------------------------------------------------------ */

function ActionIcon({
  title,
  icon,
  compact,
  onClick,
}: {
  title: string;
  icon: string;
  compact: boolean;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className="flex items-center justify-center transition-opacity hover:opacity-100"
      style={{
        width: compact ? 22 : 26,
        height: compact ? 22 : 26,
        color: "var(--color-text-muted)",
        backgroundColor: "transparent",
        opacity: 0.7,
      }}
    >
      <Icon icon={icon} className={compact ? "w-3.5 h-3.5" : "w-4 h-4"} />
    </button>
  );
}

function ActionMenu({
  address,
  onClose,
}: {
  address: string;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const items: Array<{ label: string; icon: string; onClick: () => void }> = [
    {
      label: "Copy address",
      icon: "heroicons:clipboard-document",
      onClick: () => {
        void navigator.clipboard.writeText(address);
        onClose();
      },
    },
    {
      label: "View transactions",
      icon: "heroicons:queue-list",
      onClick: () => {
        goto(`/#/explorer?address=${address}`);
        onClose();
      },
    },
    {
      label: "Storage layout",
      icon: "heroicons:rectangle-stack",
      onClick: () => {
        goto(`/#/storage?address=${address}`);
        onClose();
      },
    },
    {
      label: "Simulate a call",
      icon: "heroicons:play-circle",
      onClick: () => {
        goto(`/#/simulate?to=${address}`);
        onClose();
      },
    },
  ];

  return (
    <div
      ref={ref}
      className="card absolute z-30 mt-1"
      style={{ backgroundColor: "var(--color-bg-card)", minWidth: 200, right: 0, top: "100%" }}
    >
      <ul>
        {items.map((it) => (
          <li key={it.label}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                it.onClick();
              }}
              className="w-full flex items-center gap-inline px-3 py-2 text-xs text-left"
              style={{ color: "var(--color-text-primary)", backgroundColor: "transparent" }}
            >
              <Icon icon={it.icon} className="w-3.5 h-3.5 shrink-0" />
              {it.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Navigate within the SPA via the hash router (see TxRowActions for why). */
function goto(href: string): void {
  if (href.startsWith("/#/")) {
    window.location.hash = href.slice(2);
  } else {
    window.location.href = href;
  }
}
