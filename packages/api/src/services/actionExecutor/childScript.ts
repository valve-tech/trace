/**
 * The script run inside the locked-down child process. Reads one JSON
 * line from stdin (the parent's `ChildInput`), executes the user code
 * with a curated set of helpers, and writes one JSON line back to
 * stdout (the parent's `ChildOutput` shape).
 *
 * Kept as an inline string template — no separate file — so dev (tsx)
 * and prod (compiled dist) have the exact same wire behaviour without
 * needing to ship a runner file alongside the package.
 *
 * Console output is captured per-stream (stdout/stderr) rather than
 * letting the child's process.stdout interleave with the JSON payload;
 * the parent's `runInChild` parses the **last** line of stdout to
 * recover the wire result.
 */
export const CHILD_SCRIPT = String.raw`
import { createPublicClient, http, formatEther } from "viem";

// --- read full stdin -------------------------------------------------------
let raw = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) raw += chunk;
const input = JSON.parse(raw);

// --- captured streams ------------------------------------------------------
const stdoutLines = [];
const stderrLines = [];
const capturedConsole = {
  log:  (...a) => stdoutLines.push(a.map(String).join(" ")),
  warn: (...a) => stderrLines.push("[warn] " + a.map(String).join(" ")),
  error:(...a) => stderrLines.push("[error] " + a.map(String).join(" ")),
  info: (...a) => stdoutLines.push("[info] " + a.map(String).join(" ")),
};

// --- viem client (read-only) ----------------------------------------------
const publicClient = createPublicClient({ transport: http(input.rpcUrl) });

const rpc = {
  async call(to, data) {
    const r = await publicClient.call({ to, data });
    return r.data ?? "0x";
  },
  async getBalance(address) {
    return formatEther(await publicClient.getBalance({ address }));
  },
  async getBlock(number) {
    const b = await publicClient.getBlock(
      number !== undefined ? { blockNumber: BigInt(number) } : {},
    );
    return {
      number: Number(b.number),
      hash: b.hash,
      timestamp: Number(b.timestamp),
      gasUsed: b.gasUsed.toString(),
      gasLimit: b.gasLimit.toString(),
      baseFeePerGas: b.baseFeePerGas?.toString(),
      transactionCount: b.transactions.length,
    };
  },
  async getTransaction(hash) {
    const tx = await publicClient.getTransaction({ hash });
    return {
      hash: tx.hash, from: tx.from, to: tx.to,
      value: formatEther(tx.value), nonce: tx.nonce,
      gas: tx.gas.toString(),
      blockNumber: tx.blockNumber ? Number(tx.blockNumber) : null,
      input: tx.input,
    };
  },
  async getTransactionReceipt(hash) {
    const r = await publicClient.getTransactionReceipt({ hash });
    return {
      status: r.status, gasUsed: r.gasUsed.toString(),
      blockNumber: Number(r.blockNumber),
      logs: r.logs.map((l) => ({ address: l.address, topics: l.topics, data: l.data })),
    };
  },
  async getLogs(params) {
    const logs = await publicClient.getLogs({
      address: params.address,
      fromBlock: params.fromBlock !== undefined ? BigInt(params.fromBlock) : undefined,
      toBlock:   params.toBlock   !== undefined ? BigInt(params.toBlock)   : undefined,
    });
    return logs.map((l) => ({
      address: l.address, topics: [...l.topics], data: l.data,
      blockNumber: l.blockNumber ? Number(l.blockNumber) : null,
      transactionHash: l.transactionHash,
    }));
  },
};

// --- storage proxy ---------------------------------------------------------
const storageData = { ...(input.storage ?? {}) };
const storage = {
  get(k)    { return storageData[k]; },
  set(k, v) { storageData[k] = v; },
  getAll()  { return { ...storageData }; },
  delete(k) { delete storageData[k]; },
};

// --- compile + run user code ----------------------------------------------
let error;
try {
  const userFn = new (Object.getPrototypeOf(async function () {}).constructor)(
    "console", "event", "rpc", "secrets", "storage",
    input.code + "\nif (typeof handler === 'function') { return await handler({ event, rpc, secrets, storage }); }",
  );
  await userFn(capturedConsole, input.event, rpc, input.secrets ?? {}, storage);
} catch (e) {
  error = e instanceof Error ? e.message : String(e);
  stderrLines.push("[fatal] " + error);
}

// --- emit one JSON line on stdout -----------------------------------------
process.stdout.write(JSON.stringify({
  stdout: stdoutLines, stderr: stderrLines, storage: storageData, error,
}) + "\n");
`;
