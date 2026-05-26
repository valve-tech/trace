import type { LogsByStep } from "./executionScopes";

const LOG_OPS = new Set(["LOG0", "LOG1", "LOG2", "LOG3", "LOG4"]);

interface DecodedLog {
  eventName: string;
  args: { type: string }[];
  logIndex: number;
}
interface RawLog {
  address: string;
  topics: string[];
  logIndex: number;
}

/**
 * Map each LOG opcode's step index to its decoded event, for the call tree.
 *
 * The k-th LOG opcode in execution order is the k-th receipt log (logs are
 * recorded in emission order). We zip the two sequences by position, then
 * resolve each event's name three ways, best first:
 *   1. the emitter's verified ABI — `eventsByAddr[address][topic0]` — which
 *      gives a full signature with no network round-trip;
 *   2. the server-decoded log (when the explorer matched an ABI itself);
 *   3. the raw opcode arity (`LOG3`) as a last resort.
 *
 * The one hazard is reverted sub-calls: their LOG opcodes run in the trace but
 * their logs roll back, so they never reach the receipt and desync the zip. We
 * can't realign without per-step emitter tracking, so when the counts disagree
 * we return an empty map and the tree falls back to raw opcode names rather
 * than mislabeling. The common case (nothing reverted) decodes fully.
 */
export function buildLogsByStep(
  steps: { op: string }[],
  rawLogs: RawLog[],
  eventsByAddr: Record<string, Record<string, string>> = {},
  decodedLogs: DecodedLog[] = [],
): LogsByStep {
  const map: LogsByStep = new Map();
  if (rawLogs.length === 0) return map;

  const logSteps: number[] = [];
  for (let i = 0; i < steps.length; i++) {
    if (LOG_OPS.has(steps[i]!.op)) logSteps.push(i);
  }
  // Counts must align for the positional zip to be trustworthy.
  if (logSteps.length !== rawLogs.length) return map;

  const sortedRaw = [...rawLogs].sort((a, b) => a.logIndex - b.logIndex);
  const decodedByIndex = new Map(decodedLogs.map((d) => [d.logIndex, d]));

  for (let k = 0; k < logSteps.length; k++) {
    const raw = sortedRaw[k]!;
    const topic0 = raw.topics[0]?.toLowerCase();
    const fromAbi = topic0
      ? eventsByAddr[raw.address?.toLowerCase() ?? ""]?.[topic0]
      : undefined;
    const dec = decodedByIndex.get(raw.logIndex);
    const fromServer = dec
      ? `${dec.eventName}(${dec.args.map((a) => a.type).join(",")})`
      : undefined;
    const name = fromAbi ?? fromServer ?? `LOG${raw.topics.length}`;
    map.set(logSteps[k]!, { name, topicCount: raw.topics.length });
  }
  return map;
}
