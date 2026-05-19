import { toEventSelector, type Hex } from "viem";
import type { Log, TraceFrame } from "../types.js";
import { walkCallTree } from "../traversal/walkCallTree.js";

/**
 * One log matched by `parseEvents`. The `logIndex` is the position in the
 * successful (non-reverted) log stream, matching the convention used by
 * `parseTokenDeltas`, `parseApprovals`, and `parseSwaps` — so consumers can
 * cross-reference indices between parsers operating on the same trace.
 */
export interface MatchedEvent {
  log: Log;
  logIndex: number;
}

const TOPIC_HEX_LENGTH = 66;

function isPrecomputedTopic(value: string): value is Hex {
  if (!value.startsWith("0x")) return false;
  if (value.length !== TOPIC_HEX_LENGTH) return false;
  for (let i = 2; i < value.length; i++) {
    const c = value.charCodeAt(i);
    const isHex =
      (c >= 48 && c <= 57) || (c >= 97 && c <= 102) || (c >= 65 && c <= 70);
    if (!isHex) return false;
  }
  return true;
}

/**
 * Generic by-signature event filter. Returns every log in the trace whose
 * `topics[0]` matches the keccak256 of the given event signature, in
 * pre-order (matching the call-tree walk used by every other parser).
 *
 * Two input forms are accepted, mirroring viem's conventions:
 *   - A Solidity event signature string, e.g. `"Transfer(address,address,uint256)"`.
 *     The keccak256 hash is computed lazily on first call.
 *   - A pre-computed 32-byte topic hash (`"0x"` + 64 hex chars). Use this
 *     when the hash is already known (e.g. from a constant) to skip hashing.
 *
 * Reverted call frames and their subtrees are skipped: their logs are
 * rolled back on-chain and never appear in a receipt. To inspect events
 * inside a reverted path, walk the tree directly with `walkCallTree`.
 *
 * The decoded value of the event is intentionally NOT returned — `MatchedEvent`
 * just hands back the matching `Log` so the consumer can decode with the
 * exact ABI they want (e.g. `viem.decodeEventLog({ abi, ...log })`). This
 * keeps the SDK's runtime surface minimal and avoids needing a full ABI for
 * a simple "is this event present?" check.
 */
export function parseEvents(
  root: TraceFrame,
  signature: string,
): MatchedEvent[] {
  const topic: Hex = isPrecomputedTopic(signature)
    ? (signature.toLowerCase() as Hex)
    : toEventSelector(signature);

  const matches: MatchedEvent[] = [];
  let logIndex = 0;

  walkCallTree(root, {
    enter(frame) {
      if (frame.error) return "skip";
      if (!frame.logs) return;
      for (const log of frame.logs) {
        if (log.topics[0] === topic) {
          matches.push({ log, logIndex });
        }
        logIndex++;
      }
    },
  });

  return matches;
}
