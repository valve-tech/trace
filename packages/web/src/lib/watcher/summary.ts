/**
 * Compose a watch match's one-line summary at the render edge.
 *
 * The stored match keeps its amount RAW (`WatchAmount.raw`, base units) — see
 * `types.ts` — so the log is a faithful 1:1 mirror of chain data. This is where
 * the only display transform happens: the raw amount is scaled by its on-chain
 * `decimals` (via the shared `formatTokenAmount`) and slotted between the
 * match's `lead` and `trail`. Pure and trivially testable.
 */

import { formatTokenAmount } from "../format/tokenAmount.js";
import type { WatchMatchContent } from "./types.js";

export function renderWatchSummary(content: WatchMatchContent): string {
  const amount = content.amount
    ? formatTokenAmount(
        content.amount.raw,
        content.amount.decimals,
        content.amount.symbol,
      )
    : "";
  return `${content.lead}${amount}${content.trail}`.trim();
}
