/**
 * Pure transforms for transactionDetails. The fetcher orchestrates two
 * viem calls + N ABI lookups + N decodeLogs invocations; the small
 * pure pieces (raw-log shape mapper, dedupe-by-logIndex merge) live
 * here so the dedupe is testable without mocking viem.
 */

/**
 * Raw log shape returned alongside decoded logs. Mirrors a viem
 * receipt log narrowed to the wire types the frontend consumes —
 * topics flattened to string, logIndex coerced to number.
 */
export interface RawLog {
  address: string;
  topics: string[];
  data: string;
  logIndex: number;
}

/**
 * A viem receipt log (we don't import the brand-typed shape — same
 * field set, simpler types so the test fixtures are honest).
 */
export interface ReceiptLog {
  address: string;
  topics: readonly string[];
  data: string;
  logIndex: number | bigint;
}

export interface DecodedLogEntry {
  eventName: string;
  args: { name: string; type: string; value: unknown }[];
  address: string;
  logIndex: number;
}

/**
 * Flatten a viem receipt log into the wire RawLog shape: topics array,
 * `logIndex` as a number. viem returns logIndex as bigint when the RPC
 * sends it as hex; we coerce so the frontend's `tx.rawLogs[N]` reads
 * naturally without BigInt handling on the consumer side.
 */
export function toRawLog(log: ReceiptLog): RawLog {
  return {
    address: log.address,
    topics: log.topics as string[],
    data: log.data,
    logIndex: Number(log.logIndex),
  };
}

/**
 * The set of receipt-log emitter addresses (lowercased) excluding the
 * transaction's `to` address. Used to drive the "second-pass decode"
 * loop in getTransactionDetails — those addresses are where logs the
 * `to` contract's ABI couldn't decode came from (libraries, child
 * contract calls, etc.).
 *
 * `txTo` may be null (contract creation, value transfer), in which case
 * every emitter is "other". Empty input → empty set.
 */
export function otherEmitters(
  logs: readonly ReceiptLog[],
  txTo: string | null,
): string[] {
  const toLc = txTo?.toLowerCase() ?? null;
  return [
    ...new Set(
      logs
        .map((l) => l.address.toLowerCase())
        .filter((a) => a !== toLc),
    ),
  ];
}

/**
 * Merge a new batch of decoded log entries into an existing list,
 * deduplicating by `logIndex`. Existing entries take precedence —
 * once a log has been decoded against one ABI, we don't overwrite it
 * with a different ABI's interpretation. Returns a new array; the
 * input arrays are not mutated.
 *
 * Load-bearing because the second-pass loop in getTransactionDetails
 * fires N decodes (one per non-`to` emitter address) and each one
 * could overlap the first pass.
 */
export function mergeDecodedLogs(
  existing: readonly DecodedLogEntry[],
  incoming: readonly DecodedLogEntry[],
): DecodedLogEntry[] {
  const seenIndexes = new Set(existing.map((e) => e.logIndex));
  const out: DecodedLogEntry[] = [...existing];
  for (const entry of incoming) {
    if (seenIndexes.has(entry.logIndex)) continue;
    seenIndexes.add(entry.logIndex);
    out.push(entry);
  }
  return out;
}
