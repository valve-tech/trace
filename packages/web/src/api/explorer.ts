import { formatEther } from "viem";

const API_BASE = "/api";

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

export async function fetchTransaction(hash: string): Promise<TransactionDetails> {
  return apiFetch<TransactionDetails>(`${API_BASE}/tx/${hash}`);
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
export async function fetchAddressInfo(address: string): Promise<AddressInfo> {
  const [balanceRes, codeRes] = await Promise.all([
    fetch(
      `${API_BASE}?module=account&action=balance&address=${address}`,
    ),
    fetch(
      `${API_BASE}?module=proxy&action=eth_getCode&address=${address}&tag=latest`,
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
): Promise<{ transactions: AddressTransaction[]; total: number }> {
  return apiFetch<{ transactions: AddressTransaction[]; total: number }>(
    `${API_BASE}/address/${address}/txs?page=${page}&limit=${limit}`,
  );
}

export async function fetchAddressTokens(
  address: string,
): Promise<AddressToken[]> {
  return apiFetch<AddressToken[]>(`${API_BASE}/address/${address}/tokens`);
}

export async function fetchContractInfo(
  address: string,
): Promise<ContractInfo> {
  return apiFetch<ContractInfo>(`${API_BASE}/contract/${address}`);
}

export async function fetchBlock(numberOrHash: string): Promise<BlockDetails> {
  return apiFetch<BlockDetails>(`${API_BASE}/block/${numberOrHash}`);
}
