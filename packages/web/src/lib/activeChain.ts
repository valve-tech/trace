import { useSearchParams } from "react-router-dom";
import { DEFAULT_CHAIN_ID } from "./chains";

function parseChainId(raw: string | null): number {
  if (!raw) return DEFAULT_CHAIN_ID;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_CHAIN_ID;
}

/**
 * The chain a route is scoped to, read from the `?chainid=N` URL param and
 * defaulting to PulseChain. The landing search and chain picker write the
 * param; entity views read it via this hook, key their fetches on it, and
 * pass it to the explorer API so requests carry `chainid`.
 */
export function useActiveChainId(): number {
  const [params] = useSearchParams();
  return parseChainId(params.get("chainid"));
}

/**
 * Non-reactive read of the same `?chainid=N` URL param, for fetch-layer code
 * that runs outside a component (api/source.ts, contractMeta.ts). Handles both
 * router shapes: BrowserRouter puts the query in `location.search`; the IPFS
 * HashRouter build carries it inside the hash (`/#/tx/0x…?chainid=N`).
 *
 * Components should prefer `useActiveChainId` — it re-renders on navigation
 * and feeds query keys; this getter only reflects the URL at call time.
 */
export function getActiveChainId(): number {
  if (typeof window === "undefined") return DEFAULT_CHAIN_ID;
  const search = window.location.search || window.location.hash.split("?")[1] || "";
  return parseChainId(new URLSearchParams(search).get("chainid"));
}
