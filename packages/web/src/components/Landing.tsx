/**
 * Landing hub at `/`. A bento hero — brand + search over a live, flowing pulse
 * line — sits beside ticking chain stats (latest block, base fee, mempool),
 * with the feature catalogue grouped by intent below and the recent rail last.
 * The search recognizes a pasted tx / address / block / selector and jumps
 * straight to it.
 */

import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Icon } from "@iconify/react";
import { NAV_GROUPS, type NavItem } from "../lib/navGroups";
import { routeForInput } from "../lib/entityInput";
import { fetchLatestSummary } from "../api/latest";
import { fetchPending } from "../api/mempool";
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
    <div className="max-w-6xl mx-auto space-y-section py-2">
      {/* Bento hero: brand + search beside live chain stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-row">
        <HeroTile
          query={query}
          setQuery={(v) => {
            setQuery(v);
            if (hint) setHint(false);
          }}
          onSubmit={submit}
          hint={hint}
        />
        <LiveStats />
      </div>

      {/* Feature catalogue, grouped by intent */}
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

/* ------------------------------------------------------------------ */
/* Hero                                                               */
/* ------------------------------------------------------------------ */

function HeroTile({
  query,
  setQuery,
  onSubmit,
  hint,
}: {
  query: string;
  setQuery: (v: string) => void;
  onSubmit: () => void;
  hint: boolean;
}) {
  return (
    <div
      className="lg:col-span-2 card relative overflow-hidden flex flex-col justify-between p-4"
      style={{ minHeight: 240 }}
    >
      {/* breathing accent glow, top-right */}
      <div
        className="glow-pulse pointer-events-none absolute"
        style={{
          top: -90,
          right: -90,
          width: 260,
          height: 260,
          background:
            "radial-gradient(circle, var(--color-accent) 0%, transparent 70%)",
        }}
      />
      {/* flowing pulse line, bottom edge */}
      <PulseLine />

      <div className="relative space-y-tight">
        <div className="flex items-center gap-inline">
          <PulseLogo />
          <span
            className="text-[10px] uppercase tracking-widest font-semibold px-2 py-0.5"
            style={{ backgroundColor: "var(--color-accent-muted)", color: "var(--color-accent)" }}
          >
            Devnet · Chain 369
          </span>
        </div>
        <h1 className="text-3xl font-semibold" style={{ color: "var(--color-text-primary)" }}>
          PulseChain Dev Platform
        </h1>
        <p className="text-sm max-w-xl" style={{ color: "var(--color-text-secondary)" }}>
          Simulate before you broadcast, explore the chain and debug traces
          opcode-by-opcode, and automate on-chain workflows — one toolchain.
        </p>
      </div>

      <div className="relative space-y-tight pt-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
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
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Paste a tx hash, address, block, or 4byte selector…"
              className="bare-input flex-1 bg-transparent outline-none text-sm font-mono"
              style={{ color: "var(--color-text-primary)" }}
            />
            <kbd
              className="hidden sm:block text-[10px] px-1.5 py-0.5 font-mono shrink-0"
              style={{ backgroundColor: "var(--color-bg-tertiary)", color: "var(--color-text-secondary)" }}
            >
              ⌘K
            </kbd>
          </div>
          <button
            type="submit"
            className="px-5 text-sm font-medium shrink-0"
            style={{ backgroundColor: "var(--color-accent)", color: "#fff" }}
          >
            Go
          </button>
        </form>
        {hint && (
          <p className="text-xs" style={{ color: "var(--color-warning)" }}>
            Unrecognized — paste a tx hash (66 chars), address (42), block
            number, or 4byte selector.
          </p>
        )}
      </div>
    </div>
  );
}

function PulseLine() {
  // A heartbeat path tiled every 120px; the SVG is wider than the tile and
  // translates by exactly one tile, so .ekg-flow loops seamlessly.
  const seg = 120;
  const reps = 18;
  let d = "M0 28";
  for (let i = 0; i < reps; i++) {
    const x = i * seg;
    d += ` H${x + 36} l7 -18 l6 32 l7 -14 H${x + seg}`;
  }
  return (
    <div className="pointer-events-none absolute left-0 right-0 bottom-0 h-14 overflow-hidden">
      <svg
        className="ekg-flow"
        width={reps * seg}
        height={56}
        viewBox={`0 0 ${reps * seg} 56`}
        fill="none"
        style={{ opacity: 0.18 }}
      >
        <path d={d} stroke="var(--color-accent)" strokeWidth={2} fill="none" />
      </svg>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Live stats                                                         */
/* ------------------------------------------------------------------ */

function LiveStats() {
  const summary = useQuery({
    queryKey: ["landing", "summary"],
    queryFn: fetchLatestSummary,
    refetchInterval: 5_000,
    staleTime: 0,
  });
  const mempool = useQuery({
    queryKey: ["landing", "mempool"],
    queryFn: fetchPending,
    refetchInterval: 5_000,
    staleTime: 0,
  });

  const block = summary.data?.latestBlock;
  const baseFee = summary.data?.gasPrice.baseFeePerGas;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 gap-row">
      <StatTile
        icon="heroicons:cube"
        label="Latest block"
        value={block ? `#${commas(block.number)}` : "—"}
        sub={block ? `${block.transactionCount} txs` : "loading…"}
        live
        to="/explorer"
      />
      <StatTile
        icon="heroicons:fire"
        label="Base fee"
        value={baseFee ? gwei(baseFee) : "—"}
        sub="gwei"
        to="/explorer"
      />
      <StatTile
        icon="heroicons:queue-list"
        label="Mempool"
        value={mempool.data ? commasNum(mempool.data.pendingCount) : "—"}
        sub="pending"
        live
        to="/mempool"
      />
    </div>
  );
}

function StatTile({
  icon,
  label,
  value,
  sub,
  to,
  live = false,
}: {
  icon: string;
  label: string;
  value: string;
  sub: string;
  to: string;
  live?: boolean;
}) {
  return (
    <Link
      to={to}
      className="card p-4 flex flex-col justify-between transition-opacity hover:opacity-90"
      style={{ textDecoration: "none", minHeight: 72 }}
    >
      <div
        className="flex items-center gap-tight text-[10px] uppercase tracking-widest"
        style={{ color: "var(--color-text-muted)" }}
      >
        <Icon icon={icon} className="w-3 h-3" />
        {label}
        {live && (
          <span
            className="glow-pulse ml-auto w-1.5 h-1.5"
            style={{ backgroundColor: "var(--color-success)" }}
          />
        )}
      </div>
      <div
        className="font-mono text-2xl font-semibold tabular-nums mt-1"
        style={{ color: "var(--color-text-primary)" }}
      >
        {value}
      </div>
      <div className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
        {sub}
      </div>
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/* Feature card                                                       */
/* ------------------------------------------------------------------ */

function FeatureCard({ item }: { item: NavItem }) {
  return (
    <Link
      to={item.to}
      className="group card p-4 flex items-start gap-row transition-all hover:-translate-y-px"
      style={{ textDecoration: "none" }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow =
          "0 0 0 1px var(--color-border-default), inset 2px 0 0 0 var(--color-accent)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = "";
      }}
    >
      <span
        className="shrink-0 flex items-center justify-center w-9 h-9"
        style={{ backgroundColor: "var(--color-accent-muted)", color: "var(--color-accent)" }}
      >
        <Icon icon={item.icon} className="w-5 h-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-tight">
          <span className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
            {item.label}
          </span>
          <Icon
            icon="heroicons:arrow-right"
            className="w-3.5 h-3.5 opacity-0 -translate-x-1 transition-all group-hover:opacity-100 group-hover:translate-x-0"
            style={{ color: "var(--color-accent)" }}
          />
        </div>
        <div className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
          {item.desc}
        </div>
      </div>
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/* Bits                                                               */
/* ------------------------------------------------------------------ */

function commas(decimal: string): string {
  return decimal.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function commasNum(n: number): string {
  return n.toLocaleString();
}

function gwei(wei: string): string {
  try {
    return (Number(BigInt(wei)) / 1e9).toLocaleString(undefined, {
      maximumFractionDigits: 2,
    });
  } catch {
    return "—";
  }
}

function PulseLogo() {
  return (
    <div className="relative pulse-icon flex items-center justify-center w-8 h-8">
      <svg viewBox="0 0 32 32" className="w-8 h-8" fill="none">
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
