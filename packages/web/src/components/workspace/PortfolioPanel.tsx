import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { Icon } from "@iconify/react";
import type { Workspace } from "../../lib/workspace/types";
import { fetchHoldings, type HoldingsResult } from "../../api/portfolio";
import { truncateAddr } from "../explorer/format";

/**
 * Portfolio rollup for a workspace: aggregates token holdings across every
 * address item on the selected chain. Token balances come from the substreams
 * sink (via /api/portfolio/holdings); each address is one query, fanned out
 * with useQueries.
 *
 * No USD in v1 — so this is amounts only: a combined per-token table (summed
 * across addresses) + per-address native balance, NOT a cross-asset
 * allocation chart (that needs prices — the XYK price layer). When the chain's
 * sink isn't live yet, every result is `indexed: false` and we say so plainly.
 */

// Default to PulseChain mainnet — the chain with a curated token set + the
// real holdings target. (943 testnet is the substreams pipeline prototype.)
const CHAIN_ID = 369;

interface AggToken {
  symbol: string;
  name: string;
  decimals: number;
  /** summed raw balance across addresses. */
  total: bigint;
  /** count of addresses holding a nonzero amount. */
  holders: number;
}

export function PortfolioPanel({ workspace }: { workspace: Workspace }) {
  const addresses = useMemo(
    () =>
      workspace.items
        .filter((it) => it.kind === "address")
        .map((it) => it.value.toLowerCase()),
    [workspace.items],
  );

  const results = useQueries({
    queries: addresses.map((address) => ({
      queryKey: ["portfolio-holdings", CHAIN_ID, address],
      queryFn: () => fetchHoldings(address, CHAIN_ID),
      staleTime: 60 * 1000,
    })),
  });

  if (addresses.length === 0) return null;

  const loading = results.some((r) => r.isLoading);
  const loaded = results.filter((r) => r.data).map((r) => r.data as HoldingsResult);
  const anyIndexed = loaded.some((r) => r.indexed);

  const aggregated = aggregate(loaded);

  return (
    <div className="card p-4 mb-4">
      <div className="flex items-center gap-inline mb-3">
        <Icon icon="heroicons:wallet" className="w-4 h-4 theme-accent" />
        <h2 className="text-sm font-semibold theme-text">Portfolio</h2>
        <span className="text-[11px] theme-text-muted">
          {addresses.length} {addresses.length === 1 ? "address" : "addresses"} · PulseChain
        </span>
      </div>

      {loading && loaded.length === 0 ? (
        <div className="text-xs theme-text-muted">Loading holdings…</div>
      ) : !anyIndexed ? (
        <div className="text-xs theme-text-muted leading-relaxed">
          Token holdings aren&apos;t indexed for this chain yet — showing native
          balances only. (Awaiting the substreams sink.)
          <NativeList results={loaded} addresses={addresses} />
        </div>
      ) : aggregated.length === 0 ? (
        <div className="text-xs theme-text-muted">
          No token holdings across these addresses.
          <NativeList results={loaded} addresses={addresses} />
        </div>
      ) : (
        <>
          <HoldingsTable rows={aggregated} />
          <NativeList results={loaded} addresses={addresses} />
        </>
      )}
    </div>
  );
}

function aggregate(results: HoldingsResult[]): AggToken[] {
  const byToken = new Map<string, AggToken>();
  for (const res of results) {
    for (const h of res.holdings) {
      const key = h.tokenAddress.toLowerCase();
      const existing = byToken.get(key);
      const amount = safeBig(h.balance);
      if (existing) {
        existing.total += amount;
        existing.holders += 1;
      } else {
        byToken.set(key, {
          symbol: h.symbol || truncateAddr(h.tokenAddress),
          name: h.name,
          decimals: h.decimals,
          total: amount,
          holders: 1,
        });
      }
    }
  }
  return [...byToken.values()].sort((a, b) =>
    formatAmount(b.total, b.decimals) - formatAmount(a.total, a.decimals) > 0 ? 1 : -1,
  );
}

function HoldingsTable({ rows }: { rows: AggToken[] }) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="theme-text-muted text-left">
          <th className="font-normal pb-1.5">Token</th>
          <th className="font-normal pb-1.5 text-right">Total held</th>
          <th className="font-normal pb-1.5 text-right">Addresses</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((t) => (
          <tr key={t.symbol + t.decimals} className="theme-text">
            <td className="py-1">
              <span className="font-medium">{t.symbol}</span>
              {t.name && <span className="theme-text-muted ml-1.5">{t.name}</span>}
            </td>
            <td className="py-1 text-right font-mono">{displayAmount(t.total, t.decimals)}</td>
            <td className="py-1 text-right theme-text-secondary">{t.holders}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function NativeList({
  results,
  addresses,
}: {
  results: HoldingsResult[];
  addresses: string[];
}) {
  const byAddr = new Map(results.map((r) => [r.address.toLowerCase(), r]));
  return (
    <ul className="mt-3 space-y-1">
      {addresses.map((addr) => {
        const r = byAddr.get(addr);
        const native = r?.native;
        return (
          <li key={addr} className="flex items-center justify-between text-[11px]">
            <span className="font-mono theme-text-secondary">{truncateAddr(addr)}</span>
            <span className="font-mono theme-text-muted">
              {native ? `${trimZeros(native.balanceFormatted)} ${native.symbol}` : "—"}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

// --- pure helpers ---

function safeBig(s: string): bigint {
  try {
    return BigInt(s);
  } catch {
    return 0n;
  }
}

/** Numeric value for sorting (lossy, fine for ordering). */
function formatAmount(raw: bigint, decimals: number): number {
  return Number(raw) / 10 ** decimals;
}

/** Human display with thousands separators + up to 4 fraction digits. */
function displayAmount(raw: bigint, decimals: number): string {
  const v = formatAmount(raw, decimals);
  return v.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function trimZeros(s: string): string {
  const n = Number(s);
  if (Number.isNaN(n)) return s;
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
}
