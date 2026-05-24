/**
 * Landing hub at `/`. Explains what the platform is and routes people to the
 * right feature, grouped by intent (Inspect / Simulate / Automate — the same
 * groups as the sidebar). The search box recognizes a pasted tx / address /
 * block / selector and jumps straight to it; the Recent rail offers a way back
 * into whatever you were last looking at.
 */

import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Icon } from "@iconify/react";
import { NAV_GROUPS, type NavItem } from "../lib/navGroups";
import { routeForInput } from "../lib/entityInput";
import { RecentRail } from "./RecentRail";

export default function Landing() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [hint, setHint] = useState(false);

  const submit = () => {
    const route = routeForInput(query);
    if (route) {
      setHint(false);
      navigate(route);
    } else if (query.trim() !== "") {
      setHint(true);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-section py-4">
      {/* Hero */}
      <div className="space-y-tight">
        <div className="flex items-center gap-row">
          <PulseLogo />
          <h1
            className="text-2xl font-semibold"
            style={{ color: "var(--color-text-primary)" }}
          >
            PulseChain Dev Platform
          </h1>
        </div>
        <p className="text-sm max-w-2xl" style={{ color: "var(--color-text-secondary)" }}>
          A Tenderly-style developer toolchain for PulseChain (chain 369).
          Simulate transactions before you broadcast, explore the chain and
          debug traces opcode-by-opcode, and automate on-chain workflows.
        </p>
      </div>

      {/* Search */}
      <div className="space-y-tight max-w-2xl">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="flex items-stretch gap-inline"
        >
          <div
            className="flex-1 flex items-center gap-inline px-3 h-11"
            style={{
              backgroundColor: "var(--color-bg-input)",
              boxShadow: "inset 0 0 0 1px var(--color-border-default)",
            }}
          >
            <Icon
              icon="heroicons:magnifying-glass"
              className="w-4 h-4 shrink-0"
              style={{ color: "var(--color-text-muted)" }}
            />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (hint) setHint(false);
              }}
              placeholder="Paste a tx hash, address, block number, or 4byte selector…"
              className="bare-input flex-1 bg-transparent outline-none text-sm font-mono"
              style={{ color: "var(--color-text-primary)" }}
            />
            <kbd
              className="hidden sm:block text-[10px] px-1.5 py-0.5 font-mono shrink-0"
              style={{
                backgroundColor: "var(--color-bg-tertiary)",
                color: "var(--color-text-secondary)",
              }}
            >
              ⌘K
            </kbd>
          </div>
          <button
            type="submit"
            className="px-4 text-sm font-medium shrink-0"
            style={{ backgroundColor: "var(--color-accent)", color: "#fff" }}
          >
            Go
          </button>
        </form>
        {hint && (
          <p className="text-xs" style={{ color: "var(--color-warning)" }}>
            Unrecognized — paste a tx hash (66 chars), address (42), block
            number, or 4byte selector. Press ⌘K to search recent &amp; contracts.
          </p>
        )}
      </div>

      {/* Feature groups */}
      {NAV_GROUPS.map((group) => (
        <section key={group.label} className="space-y-row">
          <div className="flex items-baseline gap-row">
            <h2
              className="text-sm font-semibold uppercase tracking-widest"
              style={{ color: "var(--color-text-primary)" }}
            >
              {group.label}
            </h2>
            <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
              {group.hint}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-row">
            {group.items.map((item) => (
              <FeatureCard key={item.to} item={item} />
            ))}
          </div>
        </section>
      ))}

      {/* Recent */}
      <section className="space-y-row max-w-md">
        <h2
          className="text-sm font-semibold uppercase tracking-widest"
          style={{ color: "var(--color-text-primary)" }}
        >
          Jump back in
        </h2>
        <RecentRail />
      </section>
    </div>
  );
}

function FeatureCard({ item }: { item: NavItem }) {
  return (
    <Link
      to={item.to}
      className="card p-4 flex items-start gap-row transition-opacity hover:opacity-90"
      style={{ textDecoration: "none" }}
    >
      <span
        className="shrink-0 flex items-center justify-center w-9 h-9"
        style={{ backgroundColor: "var(--color-accent-muted)", color: "var(--color-accent)" }}
      >
        <Icon icon={item.icon} className="w-5 h-5" />
      </span>
      <div className="min-w-0">
        <div
          className="text-sm font-semibold"
          style={{ color: "var(--color-text-primary)" }}
        >
          {item.label}
        </div>
        <div className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
          {item.desc}
        </div>
      </div>
    </Link>
  );
}

function PulseLogo() {
  return (
    <div className="relative pulse-icon flex items-center justify-center w-9 h-9">
      <svg viewBox="0 0 32 32" className="w-9 h-9" fill="none">
        <circle cx="16" cy="16" r="14" fill="#8B5CF6" />
        <path
          d="M8 18 L12 10 L16 20 L20 8 L24 18"
          stroke="white"
          strokeWidth="2.5"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
