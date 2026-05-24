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

export async function fetchAddressInfo(address: string): Promise<AddressInfo> {
  return apiFetch<AddressInfo>(`${API_BASE}/address/${address}`);
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
