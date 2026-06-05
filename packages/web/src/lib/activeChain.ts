import { useSearchParams } from "react-router-dom";
import { DEFAULT_CHAIN_ID } from "./chains";

/**
 * The chain a route is scoped to, read from the `?chainid=N` URL param and
 * defaulting to PulseChain. The landing search and (future) chain picker write
 * the param; entity views read it via this hook, key their fetches on it, and
 * pass it to the explorer API so requests carry `chainid`. Until the backend
 * dispatcher honors that param, everything resolves against the default chain —
 * so this is forward-compatible plumbing, inert until the dispatcher lands.
 */
export function useActiveChainId(): number {
  const [params] = useSearchParams();
  const raw = params.get("chainid");
  if (!raw) return DEFAULT_CHAIN_ID;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_CHAIN_ID;
}
