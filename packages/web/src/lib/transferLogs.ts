/**
 * Client-side Transfer-log fetching via eth_getLogs through the /rpc proxy.
 *
 * Reth answers block-ranged log queries from its receipt index in
 * milliseconds — the right tool for "recent activity of a known token".
 * (chifra's appearance index is genesis-forward ordered and times out on
 * recent slices of high-activity tokens like HEX; it stays reserved for
 * all-time history.) All filtering and bucketing happens client-side on the
 * raw logs this returns.
 */

import { sendRpcRequest } from "../api/rpc";

/** keccak256("Transfer(address,address,uint256)") */
const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

export interface TransferRecord {
  blockNumber: number;
  txHash: string;
  logIndex: number;
  from: string;
  to: string;
  /** Decimal string. ERC-20 amount, or "1" per ERC-721 unit. */
  value: string;
  variant: "erc20" | "erc721";
  tokenId?: string;
}

interface RawLog {
  topics: string[];
  data: string;
  blockNumber: string;
  transactionHash: string;
  logIndex: string;
  address: string;
}

/** A 32-byte indexed topic carries an address in its low 20 bytes. */
function topicToAddress(topic: string): string {
  return "0x" + topic.slice(-40);
}

function decodeTransfer(log: RawLog): TransferRecord {
  const isErc721 = log.topics.length === 4;
  return {
    blockNumber: parseInt(log.blockNumber, 16),
    txHash: log.transactionHash,
    logIndex: parseInt(log.logIndex, 16),
    from: log.topics[1] ? topicToAddress(log.topics[1]) : "",
    to: log.topics[2] ? topicToAddress(log.topics[2]) : "",
    value: isErc721 ? "1" : BigInt(log.data || "0x0").toString(),
    variant: isErc721 ? "erc721" : "erc20",
    ...(isErc721 && log.topics[3]
      ? { tokenId: BigInt(log.topics[3]).toString() }
      : {}),
  };
}

/** Current chain head block number. */
export async function getHeadBlock(): Promise<number> {
  const res = (await sendRpcRequest({
    jsonrpc: "2.0",
    id: 1,
    method: "eth_blockNumber",
    params: [],
  })) as { result?: string; error?: { message: string } };
  if (res.error) throw new Error(res.error.message);
  return parseInt(res.result ?? "0x0", 16);
}

/**
 * Fetch + decode the token's Transfer logs in [fromBlock, toBlock] inclusive.
 * The topic filter means the RPC only returns Transfer events for this token,
 * so no client-side address/topic filtering is needed here — but callers
 * still own time-bucketing and any from/to filtering.
 */
export async function fetchTransferLogs(
  token: string,
  fromBlock: number,
  toBlock: number,
): Promise<TransferRecord[]> {
  const res = (await sendRpcRequest({
    jsonrpc: "2.0",
    id: 1,
    method: "eth_getLogs",
    params: [
      {
        address: token,
        topics: [TRANSFER_TOPIC],
        fromBlock: "0x" + fromBlock.toString(16),
        toBlock: "0x" + toBlock.toString(16),
      },
    ],
  })) as { result?: RawLog[]; error?: { message: string } };
  if (res.error) throw new Error(res.error.message);
  return (res.result ?? []).map(decodeTransfer);
}
