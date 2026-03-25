import { type Hex, type Address, formatEther, formatUnits } from "viem";
import { publicClient } from "./rpc.js";
import { fetchAbi, decodeInput, decodeLogs } from "./decoder.js";

// ---------------------------------------------------------------------------
// BlockScout API base
// ---------------------------------------------------------------------------

const BLOCKSCOUT_API =
  process.env.BLOCKSCOUT_API_URL || "https://api.scan.pulsechain.com/api";

/**
 * Helper: call BlockScout API and return parsed JSON.
 */
async function blockscoutFetch<T = unknown>(
  params: Record<string, string>,
): Promise<T | null> {
  try {
    const qs = new URLSearchParams(params).toString();
    const url = `${BLOCKSCOUT_API}?${qs}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return null;
    const json = await res.json();
    return json as T;
  } catch {
    return null;
  }
}

/**
 * Convert BigInt values to strings recursively for JSON serialization.
 */
function serialize(val: unknown): unknown {
  if (typeof val === "bigint") return val.toString();
  if (val === null || val === undefined) return val;
  if (Array.isArray(val)) return val.map(serialize);
  if (typeof val === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      out[k] = serialize(v);
    }
    return out;
  }
  return val;
}

// ---------------------------------------------------------------------------
// Transaction details
// ---------------------------------------------------------------------------

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
    args: { name: string; type: string; value: unknown }[];
  } | null;
  decodedLogs: {
    eventName: string;
    args: { name: string; type: string; value: unknown }[];
    address: string;
    logIndex: number;
  }[];
  rawLogs: {
    address: string;
    topics: string[];
    data: string;
    logIndex: number;
  }[];
  contractAddress: string | null;
  cumulativeGasUsed: string;
  type: string;
}

export async function getTransactionDetails(
  hash: string,
  options: { skipDecode?: boolean } = {},
): Promise<TransactionDetails> {
  const [tx, receipt] = await Promise.all([
    publicClient.getTransaction({ hash: hash as Hex }),
    publicClient.getTransactionReceipt({ hash: hash as Hex }),
  ]);

  if (!tx) throw new Error("Transaction not found");

  // Attempt to get block timestamp
  let timestamp: number | null = null;
  try {
    const block = await publicClient.getBlock({
      blockNumber: tx.blockNumber!,
    });
    timestamp = Number(block.timestamp);
  } catch {
    // ignore
  }

  // Attempt to decode input (skip if caller just needs basic tx data)
  let decodedInput: TransactionDetails["decodedInput"] = null;
  let decodedLogEntries: TransactionDetails["decodedLogs"] = [];

  if (tx.to && !options.skipDecode) {
    const abi = await fetchAbi(tx.to);
    if (abi && tx.input && tx.input !== "0x") {
      const decoded = decodeInput(tx.input as Hex, abi);
      if (decoded) {
        decodedInput = {
          functionName: decoded.functionName,
          args: decoded.args,
        };
      }
    }

    // Decode logs
    if (abi && receipt.logs.length > 0) {
      const decoded = decodeLogs(receipt.logs as any, abi);
      decodedLogEntries = decoded.map((d, i) => ({
        eventName: d.eventName,
        args: d.args,
        address: receipt.logs[i]?.address ?? "",
        logIndex: Number(receipt.logs[i]?.logIndex ?? i),
      }));
    }
  }

  // Also try to decode logs from different contracts (skip for fast mode)
  if (!options.skipDecode && decodedLogEntries.length < receipt.logs.length) {
    const uniqueAddresses = [
      ...new Set(
        receipt.logs
          .map((l) => l.address.toLowerCase())
          .filter((a) => a !== tx.to?.toLowerCase()),
      ),
    ];

    for (const addr of uniqueAddresses) {
      const abi = await fetchAbi(addr);
      if (!abi) continue;

      const logsForAddr = receipt.logs.filter(
        (l) => l.address.toLowerCase() === addr,
      );
      const decoded = decodeLogs(logsForAddr as any, abi);
      for (let i = 0; i < decoded.length; i++) {
        const decodedEntry = decoded[i];
        const originalLog = logsForAddr[i];
        if (!decodedEntry) continue;
        const logIndex = Number(originalLog?.logIndex ?? 0);
        // Only add if not already decoded
        if (!decodedLogEntries.find((e) => e.logIndex === logIndex)) {
          decodedLogEntries.push({
            eventName: decodedEntry.eventName,
            args: decodedEntry.args,
            address: originalLog?.address ?? addr,
            logIndex,
          });
        }
      }
    }
  }

  const rawLogs = receipt.logs.map((l) => ({
    address: l.address,
    topics: l.topics as string[],
    data: l.data,
    logIndex: Number(l.logIndex),
  }));

  return serialize({
    hash: tx.hash,
    blockNumber: tx.blockNumber?.toString() ?? "pending",
    blockHash: tx.blockHash ?? "",
    transactionIndex: Number(tx.transactionIndex),
    from: tx.from,
    to: tx.to,
    value: tx.value.toString(),
    valuePLS: formatEther(tx.value),
    gas: tx.gas.toString(),
    gasPrice: tx.gasPrice?.toString() ?? "0",
    gasUsed: receipt.gasUsed.toString(),
    effectiveGasPrice: receipt.effectiveGasPrice?.toString() ?? "0",
    nonce: Number(tx.nonce),
    input: tx.input,
    status: receipt.status === "success" ? "success" : "reverted",
    timestamp,
    decodedInput,
    decodedLogs: decodedLogEntries,
    rawLogs,
    contractAddress: receipt.contractAddress ?? null,
    cumulativeGasUsed: receipt.cumulativeGasUsed.toString(),
    type: tx.type ?? "legacy",
  }) as TransactionDetails;
}

// ---------------------------------------------------------------------------
// Internal transactions
// ---------------------------------------------------------------------------

export interface InternalTransaction {
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
}

export async function getInternalTransactions(
  hash: string,
): Promise<InternalTransaction[]> {
  const data = await blockscoutFetch<{
    status: string;
    result: Array<{
      from: string;
      to: string;
      value: string;
      type: string;
      gas: string;
      gasUsed: string;
      input: string;
      errCode: string;
      isError: string;
    }>;
  }>({
    module: "account",
    action: "txlistinternal",
    txhash: hash,
  });

  if (!data || data.status !== "1" || !Array.isArray(data.result)) {
    return [];
  }

  return data.result.map((itx) => ({
    from: itx.from,
    to: itx.to,
    value: itx.value,
    valuePLS: formatEther(BigInt(itx.value || "0")),
    type: itx.type || "CALL",
    gas: itx.gas,
    gasUsed: itx.gasUsed,
    input: itx.input,
    errCode: itx.errCode || "",
    isError: itx.isError || "0",
  }));
}

// ---------------------------------------------------------------------------
// Token transfers
// ---------------------------------------------------------------------------

export interface TokenTransfer {
  from: string;
  to: string;
  value: string;
  formattedValue: string;
  tokenName: string;
  tokenSymbol: string;
  tokenDecimal: string;
  contractAddress: string;
  hash: string;
}

export async function getTokenTransfers(
  hash: string,
): Promise<TokenTransfer[]> {
  // Use BlockScout v2 API to get token transfers for a specific tx hash directly
  // This avoids the expensive full-address scan from the v1 API
  const BLOCKSCOUT_V2 = BLOCKSCOUT_API.replace("/api", "");
  try {
    const res = await fetch(`${BLOCKSCOUT_V2}/api/v2/transactions/${hash}/token-transfers`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) {
      const data = (await res.json()) as {
        items?: Array<{
          from: { hash: string };
          to: { hash: string };
          total: { value: string; decimals: string };
          token: { name: string; symbol: string; address: string; decimals: string };
        }>;
      };
      if (data.items && data.items.length > 0) {
        return data.items.map((t) => {
          const decimals = parseInt(t.token.decimals || "18", 10);
          let formattedValue = t.total.value;
          try {
            formattedValue = formatUnits(BigInt(t.total.value || "0"), decimals);
          } catch {
            // keep raw
          }
          return {
            from: t.from.hash,
            to: t.to.hash,
            value: t.total.value,
            formattedValue,
            tokenName: t.token.name,
            tokenSymbol: t.token.symbol,
            tokenDecimal: t.token.decimals,
            contractAddress: t.token.address,
            hash,
          };
        });
      }
    }
  } catch {
    // v2 API not available, fall back to v1
  }

  // Fallback: v1 API with address-based lookup (slower but more compatible)
  let tx: { from: string } | null = null;
  try {
    tx = await publicClient.getTransaction({ hash: hash as Hex });
  } catch {
    return [];
  }
  if (!tx) return [];

  const data = await blockscoutFetch<{
    status: string;
    result: Array<{
      from: string;
      to: string;
      value: string;
      tokenName: string;
      tokenSymbol: string;
      tokenDecimal: string;
      contractAddress: string;
      hash: string;
    }>;
  }>({
    module: "account",
    action: "tokentx",
    address: tx.from,
  });

  if (!data || data.status !== "1" || !Array.isArray(data.result)) {
    return [];
  }

  const filtered = data.result.filter(
    (t) => t.hash.toLowerCase() === hash.toLowerCase(),
  );

  return filtered.map((t) => {
    const decimals = parseInt(t.tokenDecimal || "18", 10);
    let formattedValue = t.value;
    try {
      formattedValue = formatUnits(BigInt(t.value || "0"), decimals);
    } catch {
      // keep raw
    }
    return {
      from: t.from,
      to: t.to,
      value: t.value,
      formattedValue,
      tokenName: t.tokenName,
      tokenSymbol: t.tokenSymbol,
      tokenDecimal: t.tokenDecimal,
      contractAddress: t.contractAddress,
      hash: t.hash,
    };
  });
}

// ---------------------------------------------------------------------------
// Address transactions
// ---------------------------------------------------------------------------

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

export async function getAddressTransactions(
  address: string,
  page: number = 1,
  limit: number = 25,
): Promise<{ transactions: AddressTransaction[]; total: number }> {
  const data = await blockscoutFetch<{
    status: string;
    result: Array<{
      hash: string;
      blockNumber: string;
      timeStamp: string;
      from: string;
      to: string;
      value: string;
      gas: string;
      gasUsed: string;
      gasPrice: string;
      isError: string;
      functionName: string;
      methodId: string;
      input: string;
    }>;
  }>({
    module: "account",
    action: "txlist",
    address,
    page: page.toString(),
    offset: limit.toString(),
    sort: "desc",
  });

  if (!data || data.status !== "1" || !Array.isArray(data.result)) {
    return { transactions: [], total: 0 };
  }

  const transactions = data.result.map((tx) => ({
    hash: tx.hash,
    blockNumber: tx.blockNumber,
    timeStamp: tx.timeStamp,
    from: tx.from,
    to: tx.to,
    value: tx.value,
    valuePLS: formatEther(BigInt(tx.value || "0")),
    gas: tx.gas,
    gasUsed: tx.gasUsed,
    gasPrice: tx.gasPrice,
    isError: tx.isError,
    functionName: tx.functionName || "",
    methodId: tx.methodId || "",
    input: tx.input,
  }));

  return { transactions, total: transactions.length };
}

// ---------------------------------------------------------------------------
// Address tokens
// ---------------------------------------------------------------------------

export interface AddressToken {
  balance: string;
  formattedBalance: string;
  contractAddress: string;
  name: string;
  symbol: string;
  decimals: string;
  type: string;
}

export async function getAddressTokens(
  address: string,
): Promise<AddressToken[]> {
  const data = await blockscoutFetch<{
    status: string;
    result: Array<{
      balance: string;
      contractAddress: string;
      name: string;
      symbol: string;
      decimals: string;
      type: string;
    }>;
  }>({
    module: "account",
    action: "tokenlist",
    address,
  });

  if (!data || data.status !== "1" || !Array.isArray(data.result)) {
    return [];
  }

  return data.result.map((t) => {
    const decimals = parseInt(t.decimals || "18", 10);
    let formattedBalance = t.balance;
    try {
      formattedBalance = formatUnits(BigInt(t.balance || "0"), decimals);
    } catch {
      // keep raw
    }
    return {
      balance: t.balance,
      formattedBalance,
      contractAddress: t.contractAddress,
      name: t.name,
      symbol: t.symbol,
      decimals: t.decimals,
      type: t.type || "ERC-20",
    };
  });
}

// ---------------------------------------------------------------------------
// Contract info
// ---------------------------------------------------------------------------

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

export async function getContractInfo(
  address: string,
): Promise<ContractInfo> {
  // Fetch ABI
  const abi = await fetchAbi(address);

  // Fetch source code
  const data = await blockscoutFetch<{
    status: string;
    result: Array<{
      ContractName: string;
      CompilerVersion: string;
      OptimizationUsed: string;
      SourceCode: string;
      ConstructorArguments: string;
      EVMVersion: string;
      Library: string;
      LicenseType: string;
      Proxy: string;
      Implementation: string;
      SwarmSource: string;
      ABI: string;
    }>;
  }>({
    module: "contract",
    action: "getsourcecode",
    address,
  });

  const source = data?.result?.[0];

  return {
    address,
    isVerified: !!abi || (!!source && source.ContractName !== ""),
    contractName: source?.ContractName ?? "",
    compilerVersion: source?.CompilerVersion ?? "",
    optimizationUsed: source?.OptimizationUsed === "1",
    sourceCode: source?.SourceCode ?? "",
    abi: abi as unknown[] | null,
    constructorArguments: source?.ConstructorArguments ?? "",
    evmVersion: source?.EVMVersion ?? "",
    library: source?.Library ?? "",
    licenseType: source?.LicenseType ?? "",
    proxy: source?.Proxy ?? "",
    implementation: source?.Implementation ?? "",
    swarmSource: source?.SwarmSource ?? "",
  };
}

// ---------------------------------------------------------------------------
// Block details
// ---------------------------------------------------------------------------

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
    methodId: string;
  }>;
}

export async function getBlockDetails(
  numberOrHash: string,
): Promise<BlockDetails> {
  let block: any;

  if (numberOrHash.startsWith("0x") && numberOrHash.length === 66) {
    // It's a block hash
    block = await publicClient.getBlock({
      blockHash: numberOrHash as Hex,
      includeTransactions: true,
    });
  } else {
    // It's a block number
    const blockNum = BigInt(numberOrHash);
    block = await publicClient.getBlock({
      blockNumber: blockNum,
      includeTransactions: true,
    });
  }

  if (!block) throw new Error("Block not found");

  const transactions = (block.transactions || []).map((tx: any) => {
    if (typeof tx === "string") {
      return {
        hash: tx,
        from: "",
        to: null,
        value: "0",
        valuePLS: "0",
        gasUsed: null,
        type: "unknown",
        methodId: "",
      };
    }
    return {
      hash: tx.hash,
      from: tx.from,
      to: tx.to,
      value: tx.value?.toString() ?? "0",
      valuePLS: formatEther(tx.value ?? BigInt(0)),
      gasUsed: tx.gas?.toString() ?? null,
      type: tx.type ?? "legacy",
      methodId: tx.input ? tx.input.slice(0, 10) : "",
    };
  });

  return serialize({
    number: block.number?.toString() ?? "0",
    hash: block.hash,
    parentHash: block.parentHash,
    timestamp: Number(block.timestamp),
    miner: block.miner,
    gasUsed: block.gasUsed?.toString() ?? "0",
    gasLimit: block.gasLimit?.toString() ?? "0",
    baseFeePerGas: block.baseFeePerGas?.toString() ?? null,
    transactionCount: transactions.length,
    size: block.size?.toString() ?? "0",
    transactions,
  }) as BlockDetails;
}

// ---------------------------------------------------------------------------
// Address balance
// ---------------------------------------------------------------------------

export async function getAddressBalance(
  address: string,
): Promise<{ balance: string; balancePLS: string }> {
  const balance = await publicClient.getBalance({
    address: address as Address,
  });
  return {
    balance: balance.toString(),
    balancePLS: formatEther(balance),
  };
}

// ---------------------------------------------------------------------------
// Check if address is contract
// ---------------------------------------------------------------------------

export async function isContract(address: string): Promise<boolean> {
  try {
    const code = await publicClient.getCode({
      address: address as Address,
    });
    return !!code && code !== "0x";
  } catch {
    return false;
  }
}
