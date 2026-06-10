/**
 * Pure decoding for the token-transfer service: receipt logs in, transfer
 * rows out. No third-party explorer involved — ERC-20/721/1155 transfer
 * events are decoded straight from the standard topics, and token metadata
 * (name/symbol/decimals) is hydrated separately by the service via RPC.
 */

export interface TokenTransferView {
  from: string;
  to: string;
  value: string;
  tokenName: string;
  tokenSymbol: string;
  tokenDecimal: string;
  contractAddress: string;
  hash: string;
}

/** A decoded transfer before token metadata is attached. */
export interface RawTransfer {
  from: string;
  to: string;
  /** ERC-20: amount (base units). ERC-721: "1". ERC-1155: amount. */
  value: string;
  /** "erc20" | "erc721" | "erc1155" — drives the decimals default. */
  standard: "erc20" | "erc721" | "erc1155";
  contractAddress: string;
  hash: string;
}

/** The minimal log shape the decoder needs (subset of viem's Log). */
export interface ReceiptLog {
  address: string;
  topics: readonly string[];
  data: string;
}

/** keccak256("Transfer(address,address,uint256)") — ERC-20 and ERC-721. */
export const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
/** keccak256("TransferSingle(address,address,address,uint256,uint256)") */
export const TRANSFER_SINGLE_TOPIC =
  "0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62";
/** keccak256("TransferBatch(address,address,address,uint256[],uint256[])") */
export const TRANSFER_BATCH_TOPIC =
  "0x4a39dc06d4c0dbc64b70af90fd698a233a518aa5d07e595d983b8c0526c8f7fb";

/** Last 20 bytes of a 32-byte topic, 0x-prefixed lowercase address. */
function topicToAddress(topic: string): string {
  return `0x${topic.slice(-40)}`.toLowerCase();
}

/** Parse one 32-byte word at `index` of `data` into a decimal string. */
function dataWord(data: string, index: number): string {
  const hex = data.slice(2 + index * 64, 2 + (index + 1) * 64);
  if (hex.length < 64) return "0";
  return BigInt(`0x${hex}`).toString();
}

/**
 * Decode every token transfer in a receipt's logs.
 *
 * - `Transfer` with 3 topics (from/to indexed, value in data) → ERC-20.
 * - `Transfer` with 4 topics (from/to/tokenId indexed, empty data) →
 *   ERC-721; `value` is "1" (one token moved).
 * - `TransferSingle` → ERC-1155; `value` is the amount word.
 * - `TransferBatch` → ERC-1155; one row per (id, amount) pair.
 *
 * Anything else — including non-standard Transfer topologies — is skipped
 * rather than guessed at.
 */
export function decodeTransferLogs(
  logs: ReceiptLog[],
  hash: string,
): RawTransfer[] {
  const out: RawTransfer[] = [];
  for (const log of logs) {
    const sig = log.topics[0]?.toLowerCase();
    const contractAddress = log.address.toLowerCase();

    if (sig === TRANSFER_TOPIC) {
      if (log.topics.length === 3) {
        out.push({
          from: topicToAddress(log.topics[1]!),
          to: topicToAddress(log.topics[2]!),
          value: dataWord(log.data, 0),
          standard: "erc20",
          contractAddress,
          hash,
        });
      } else if (log.topics.length === 4) {
        out.push({
          from: topicToAddress(log.topics[1]!),
          to: topicToAddress(log.topics[2]!),
          value: "1",
          standard: "erc721",
          contractAddress,
          hash,
        });
      }
      continue;
    }

    if (sig === TRANSFER_SINGLE_TOPIC && log.topics.length === 4) {
      out.push({
        from: topicToAddress(log.topics[2]!),
        to: topicToAddress(log.topics[3]!),
        value: dataWord(log.data, 1),
        standard: "erc1155",
        contractAddress,
        hash,
      });
      continue;
    }

    if (sig === TRANSFER_BATCH_TOPIC && log.topics.length === 4) {
      // data: offset(ids), offset(amounts), then two length-prefixed arrays.
      const idsOffset = Number(BigInt(`0x${log.data.slice(2, 66) || "0"}`)) / 32;
      const amountsOffset =
        Number(BigInt(`0x${log.data.slice(66, 130) || "0"}`)) / 32;
      const count = Number(BigInt(`0x${log.data.slice(2 + idsOffset * 64, 2 + (idsOffset + 1) * 64) || "0"}`));
      const amountsLen = Number(BigInt(`0x${log.data.slice(2 + amountsOffset * 64, 2 + (amountsOffset + 1) * 64) || "0"}`));
      const n = Math.min(count, amountsLen, 1_000);
      for (let i = 0; i < n; i++) {
        out.push({
          from: topicToAddress(log.topics[2]!),
          to: topicToAddress(log.topics[3]!),
          value: dataWord(log.data, amountsOffset + 1 + i),
          standard: "erc1155",
          contractAddress,
          hash,
        });
      }
    }
  }
  return out;
}

export interface TokenMeta {
  name: string;
  symbol: string;
  decimals: string;
}

/**
 * Attach token metadata to a decoded transfer. A missing or empty decimals
 * read falls back per standard: 18 for ERC-20 (the overwhelming default),
 * 0 for ERC-721/1155 (amounts are whole tokens).
 */
export function toTransferView(
  raw: RawTransfer,
  meta: TokenMeta | null,
): TokenTransferView {
  return {
    from: raw.from,
    to: raw.to,
    value: raw.value,
    tokenName: meta?.name ?? "",
    tokenSymbol: meta?.symbol ?? "",
    tokenDecimal: meta?.decimals || (raw.standard === "erc20" ? "18" : "0"),
    contractAddress: raw.contractAddress,
    hash: raw.hash,
  };
}
