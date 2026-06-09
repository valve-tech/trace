import { apiUrl } from "../lib/apiBase";
import { formatEther, hexToBigInt, hexToNumber } from "viem";
import { DEFAULT_CHAIN_ID } from "../lib/chains";

const API_BASE = apiUrl("/api");

/**
 * Scope a request to a chain via the `?chainid=N` dispatcher param. The default
 * chain is omitted so existing PulseChain calls stay byte-identical; an explicit
 * non-default chain appends the param, which the backend chainid dispatcher
 * reads once it lands (until then it degrades to the default chain).
 */
function scoped(url: string, chainId: number): string {
  if (chainId === DEFAULT_CHAIN_ID) return url;
  return url + (url.includes("?") ? "&" : "?") + `chainid=${chainId}`;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DecodedParam {
  name: string;
  type: string;
  value: unknown;
}

export interface TransactionDetails {
  hash: string;
  blockNumber: string;
  blockHash: string;
  transactionIndex: number;
  from: string;
  to: string | null;
  value: string;
  valuePLS: string;
  gas: string;
  gasPrice: string;
  gasUsed: string;
  effectiveGasPrice: string;
  nonce: number;
  input: string;
  status: "success" | "reverted";
  timestamp: number | null;
  decodedInput: {
    functionName: string;
    args: DecodedParam[];
  } | null;
  decodedLogs: {
    eventName: string;
    args: DecodedParam[];
    address: string;
    logIndex: number;
  }[];
  rawLogs: {
    address: string;
    topics: string[];
    data: string;
    logIndex: number;
  }[];
  internalTransactions: {
    from: string;
    to: string;
    value: string;
    valuePLS: string;
    type: string;
    gas: string;
    gasUsed: string;
    input: string;
    errCode: string;
    isError: string;
  }[];
  tokenTransfers: {
    from: string;
    to: string;
    value: string;
    formattedValue: string;
    tokenName: string;
    tokenSymbol: string;
    tokenDecimal: string;
    contractAddress: string;
    hash: string;
  }[];
  contractAddress: string | null;
  cumulativeGasUsed: string;
  type: string;
}

export interface AddressInfo {
  address: string;
  balance: string;
  balancePLS: string;
  isContract: boolean;
}

export interface AddressTransaction {
  hash: string;
  blockNumber: string;
  timeStamp: string;
  from: string;
  to: string;
  value: string;
  valuePLS: string;
  gas: string;
  gasUsed: string;
  gasPrice: string;
  isError: string;
  functionName: string;
  methodId: string;
  input: string;
  type: string;
  maxFeePerGas: string | null;
  maxPriorityFeePerGas: string | null;
}

export interface AddressToken {
  balance: string;
  formattedBalance: string;
  contractAddress: string;
  name: string;
  symbol: string;
  decimals: string;
  type: string;
}

export interface ContractInfo {
  address: string;
  isVerified: boolean;
  contractName: string;
  compilerVersion: string;
  optimizationUsed: boolean;
  sourceCode: string;
  abi: unknown[] | null;
  constructorArguments: string;
  evmVersion: string;
  library: string;
  licenseType: string;
  proxy: string;
  implementation: string;
  swarmSource: string;
}

export interface BlockDetails {
  number: string;
  hash: string;
  parentHash: string;
  timestamp: number;
  miner: string;
  gasUsed: string;
  gasLimit: string;
  baseFeePerGas: string | null;
  transactionCount: number;
  size: string;
  transactions: Array<{
    hash: string;
    from: string;
    to: string | null;
    value: string;
    valuePLS: string;
    gasUsed: string | null;
    type: string;
    gasPrice: string | null;
    maxFeePerGas: string | null;
    maxPriorityFeePerGas: string | null;
    methodId: string;
  }>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function apiFetch<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    let message: string;
    try {
      const parsed = JSON.parse(text) as { error?: string };
      message = parsed.error ?? text;
    } catch {
      message = text;
    }
    throw new Error(message);
  }
  const json = (await res.json()) as { ok: boolean; result: T; error?: string };
  if (!json.ok) {
    throw new Error(json.error ?? "Unknown API error");
  }
  return json.result;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

export async function fetchTransaction(
  hash: string,
  chainId: number = DEFAULT_CHAIN_ID,
): Promise<TransactionDetails> {
  return apiFetch<TransactionDetails>(scoped(`${API_BASE}/tx/${hash}`, chainId));
}

/**
 * Address overview — balance (wei + formatted PLS) and whether the
 * address holds code. Uses the Etherscan-shaped surface end-to-end:
 *
 *   - module=account&action=balance  → wei string
 *   - module=proxy&action=eth_getCode → "0x" for EOAs, bytecode for contracts
 *
 * Issued in parallel so the two-action migration costs no extra wall
 * time vs. the previous single REST call (the REST endpoint also fired
 * two underlying RPCs).
 *
 * Trade-off vs. the legacy /api/address/:addr REST route: we format
 * `balancePLS` client-side rather than having the server pre-format
 * it. That's fine — `formatEther` is a viem helper, deterministic, and
 * already a dependency.
 */
export async function fetchAddressInfo(
  address: string,
  chainId: number = DEFAULT_CHAIN_ID,
): Promise<AddressInfo> {
  const [balanceRes, codeRes] = await Promise.all([
    fetch(
      scoped(`${API_BASE}?module=account&action=balance&address=${address}`, chainId),
    ),
    fetch(
      scoped(`${API_BASE}?module=proxy&action=eth_getCode&address=${address}&tag=latest`, chainId),
    ),
  ]);

  if (!balanceRes.ok || !codeRes.ok) {
    throw new Error(`Address lookup failed (HTTP ${balanceRes.status} / ${codeRes.status})`);
  }

  const balanceBody = (await balanceRes.json()) as {
    status?: string;
    result?: string;
  };
  const codeBody = (await codeRes.json()) as {
    jsonrpc?: string;
    result?: string;
    error?: { message?: string };
  };

  if (balanceBody.status !== "1") {
    throw new Error(`balance: ${balanceBody.result ?? "unknown error"}`);
  }
  if (codeBody.error) {
    throw new Error(`eth_getCode: ${codeBody.error.message ?? "unknown error"}`);
  }

  const balance = balanceBody.result ?? "0";
  const code = codeBody.result ?? "0x";
  // An address holds code iff eth_getCode returns more than the empty "0x".
  const isContract = code.length > 2;

  let balancePLS: string;
  try {
    balancePLS = formatEther(BigInt(balance));
  } catch {
    // Non-numeric balance string shouldn't happen via the dispatcher, but
    // a malformed upstream response shouldn't crash the address page.
    balancePLS = "0";
  }

  return {
    address,
    balance,
    balancePLS,
    isContract,
  };
}

export async function fetchAddressTransactions(
  address: string,
  page: number = 1,
  limit: number = 25,
  chainId: number = DEFAULT_CHAIN_ID,
): Promise<{ transactions: AddressTransaction[]; total: number }> {
  return apiFetch<{ transactions: AddressTransaction[]; total: number }>(
    scoped(`${API_BASE}/address/${address}/txs?page=${page}&limit=${limit}`, chainId),
  );
}

export async function fetchAddressTokens(
  address: string,
  chainId: number = DEFAULT_CHAIN_ID,
): Promise<AddressToken[]> {
  return apiFetch<AddressToken[]>(scoped(`${API_BASE}/address/${address}/tokens`, chainId));
}

export async function fetchContractInfo(
  address: string,
  chainId: number = DEFAULT_CHAIN_ID,
): Promise<ContractInfo> {
  return apiFetch<ContractInfo>(scoped(`${API_BASE}/contract/${address}`, chainId));
}

// ---------------------------------------------------------------------------
// Block — Etherscan-shaped proxy module
// ---------------------------------------------------------------------------

/**
 * A block lookup key is either a 32-byte hash, a decimal block number,
 * a hex-encoded block number, or one of the symbolic tags. We dispatch
 * by shape rather than asking the caller which kind it is.
 */
function isHash(input: string): boolean {
  return input.startsWith("0x") && input.length === 66;
}

function toBlockTag(input: string): string {
  if (input.startsWith("0x")) return input;
  if (input === "latest" || input === "earliest" || input === "pending") {
    return input;
  }
  return `0x${BigInt(input).toString(16)}`;
}

/**
 * Raw RPC tx shape we read off the block payload when `boolean=true`.
 * Optional EIP-1559 fields (`maxFeePerGas`, `maxPriorityFeePerGas`) are
 * only present on type-2 transactions.
 */
interface RpcBlockTx {
  hash: string;
  from: string;
  to: string | null;
  value: string;
  gasPrice?: string | null;
  maxFeePerGas?: string | null;
  maxPriorityFeePerGas?: string | null;
  type?: string;
  input?: string;
}

interface RpcBlock {
  number: string;
  hash: string;
  parentHash: string;
  timestamp: string;
  miner: string;
  gasUsed: string;
  gasLimit: string;
  baseFeePerGas?: string | null;
  size: string;
  transactions: RpcBlockTx[];
}

/**
 * Block details over the Etherscan-shaped surface:
 *
 *   - hash input   → module=proxy&action=eth_getBlockByHash&hash=0x..&boolean=true
 *   - number input → module=proxy&action=eth_getBlockByNumber&tag=0x..&boolean=true
 *
 * We hex-encode decimal block numbers client-side because the dispatcher
 * forwards `tag` straight to the RPC node, which only speaks hex/symbolic
 * tags. The block payload arrives with hex everywhere; this function is
 * the *only* place we convert hex → decimal-string for the rest of the
 * app to consume.
 *
 * Trade-off vs. the legacy /api/block/:numberOrHash REST route: that
 * endpoint fired N+1 receipt calls to populate per-tx `gasUsed`. Nothing
 * in BlockView reads that field today, so the migration drops the
 * receipt fan-out entirely. Per-tx `gasUsed` is `null` from now on; if a
 * future consumer needs it, fetch receipts lazily at the row level.
 */
export async function fetchBlock(
  numberOrHash: string,
  chainId: number = DEFAULT_CHAIN_ID,
): Promise<BlockDetails> {
  const url = isHash(numberOrHash)
    ? `${API_BASE}?module=proxy&action=eth_getBlockByHash&hash=${numberOrHash}&boolean=true`
    : `${API_BASE}?module=proxy&action=eth_getBlockByNumber&tag=${toBlockTag(numberOrHash)}&boolean=true`;

  const res = await fetch(scoped(url, chainId));
  if (!res.ok) {
    throw new Error(`Block lookup failed (HTTP ${res.status})`);
  }

  const body = (await res.json()) as {
    jsonrpc?: string;
    result?: RpcBlock | null;
    error?: { message?: string };
  };

  if (body.error) {
    throw new Error(`eth_getBlockBy*: ${body.error.message ?? "unknown error"}`);
  }
  if (!body.result) {
    throw new Error(`Block not found: ${numberOrHash}`);
  }

  const rpc = body.result;

  // Per-tx mapping. methodId is derived from `input` (first 4 bytes), and
  // valuePLS uses viem's formatEther — both moved client-side because the
  // raw RPC payload doesn't include them.
  const transactions: BlockDetails["transactions"] = rpc.transactions.map(
    (tx) => {
      let valuePLS: string;
      try {
        valuePLS = formatEther(hexToBigInt(tx.value as `0x${string}`));
      } catch {
        valuePLS = "0";
      }
      const methodId =
        tx.input && tx.input.length >= 10 ? tx.input.slice(0, 10) : "0x";
      return {
        hash: tx.hash,
        from: tx.from,
        to: tx.to,
        value: hexToBigInt(tx.value as `0x${string}`).toString(),
        valuePLS,
        // gasUsed is receipt-only data; we no longer fan out N+1 receipt
        // calls just to fill this in. See trade-off note above.
        gasUsed: null,
        type: tx.type ?? "0x0",
        gasPrice: tx.gasPrice ?? null,
        maxFeePerGas: tx.maxFeePerGas ?? null,
        maxPriorityFeePerGas: tx.maxPriorityFeePerGas ?? null,
        methodId,
      };
    },
  );

  return {
    number: hexToBigInt(rpc.number as `0x${string}`).toString(),
    hash: rpc.hash,
    parentHash: rpc.parentHash,
    timestamp: hexToNumber(rpc.timestamp as `0x${string}`),
    miner: rpc.miner,
    gasUsed: hexToBigInt(rpc.gasUsed as `0x${string}`).toString(),
    gasLimit: hexToBigInt(rpc.gasLimit as `0x${string}`).toString(),
    baseFeePerGas: rpc.baseFeePerGas
      ? hexToBigInt(rpc.baseFeePerGas as `0x${string}`).toString()
      : null,
    transactionCount: rpc.transactions.length,
    size: hexToBigInt(rpc.size as `0x${string}`).toString(),
    transactions,
  };
}
