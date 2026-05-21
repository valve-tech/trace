import { useState } from "react";
import { Icon } from "@iconify/react";
import { truncateAddr } from "./format";

export type NavTarget = { type: "address" | "block"; value: string };
export type AddressNavigate = (target: { type: "address"; value: string }) => void;

export function AddressLink({
  address,
  onNavigate,
  label,
}: {
  address: string;
  onNavigate: AddressNavigate;
  label?: string;
}) {
  return (
    <button
      onClick={() => onNavigate({ type: "address", value: address })}
      className="font-mono text-sm hover:underline cursor-pointer"
      style={{ color: "var(--color-accent)" }}
      title={address}
    >
      {label || truncateAddr(address)}
    </button>
  );
}

export function InfoRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-4 py-2.5 border-b last:border-b-0"
      style={{ borderColor: "var(--color-border-muted)" }}
    >
      <span
        className="text-xs font-medium shrink-0 sm:w-40"
        style={{ color: "var(--color-text-secondary)" }}
      >
        {label}
      </span>
      <div className="text-sm flex-1 min-w-0">{children}</div>
    </div>
  );
}

export function SectionCard({
  title,
  count,
  children,
  defaultOpen = true,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div
      className="rounded-lg border"
      style={{
        backgroundColor: "var(--color-bg-card)",
        borderColor: "var(--color-border-default)",
      }}
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 text-left cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <h3
            className="text-sm font-semibold"
            style={{ color: "var(--color-text-primary)" }}
          >
            {title}
          </h3>
          {count !== undefined && (
            <span
              className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
              style={{
                backgroundColor: "var(--color-accent-muted)",
                color: "var(--color-accent)",
              }}
            >
              {count}
            </span>
          )}
        </div>
        <Icon
          icon="heroicons:chevron-down"
          className="w-4 h-4 transition-transform"
          style={{
            color: "var(--color-text-muted)",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
          }}
        />
      </button>
      {open && (
        <div
          className="px-4 pb-4 border-t"
          style={{ borderColor: "var(--color-border-muted)" }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
