import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  decodeTransferLogs,
  toTransferView,
  TRANSFER_TOPIC,
  TRANSFER_SINGLE_TOPIC,
  TRANSFER_BATCH_TOPIC,
  type ReceiptLog,
} from "../../src/services/explorer/tokenTransfers/transforms.js";

/**
 * Unit tests for the receipt-log transfer decoder. The view carries the RAW
 * integer `value` + `tokenDecimal` — no pre-scaled `formattedValue` (scaling
 * is a render-edge concern). Standard topic topologies decode; anything
 * non-standard is skipped, never guessed at.
 */

const FROM = "0x1111111111111111111111111111111111111111";
const TO = "0x2222222222222222222222222222222222222222";
const TOKEN = "0xToKeN000000000000000000000000000000AbCd";
const HASH = "0x" + "ab".repeat(32);

function pad(addr: string): string {
  return "0x" + addr.slice(2).toLowerCase().padStart(64, "0");
}

function word(n: bigint): string {
  return n.toString(16).padStart(64, "0");
}

describe("decodeTransferLogs — ERC-20", () => {
  function erc20Log(value: bigint): ReceiptLog {
    return {
      address: TOKEN,
      topics: [TRANSFER_TOPIC, pad(FROM), pad(TO)],
      data: "0x" + word(value),
    };
  }

  it("decodes a 3-topic Transfer into an erc20 row with the data value", () => {
    const out = decodeTransferLogs([erc20Log(10n ** 18n)], HASH);
    assert.equal(out.length, 1);
    assert.deepEqual(out[0], {
      from: FROM,
      to: TO,
      value: "1000000000000000000",
      standard: "erc20",
      contractAddress: TOKEN.toLowerCase(),
      hash: HASH,
    });
  });

  it("decodes a zero-value transfer (data of all zeros)", () => {
    const out = decodeTransferLogs([erc20Log(0n)], HASH);
    assert.equal(out[0]!.value, "0");
  });

  it("treats truncated data as zero rather than throwing", () => {
    const out = decodeTransferLogs(
      [{ address: TOKEN, topics: [TRANSFER_TOPIC, pad(FROM), pad(TO)], data: "0x12" }],
      HASH,
    );
    assert.equal(out[0]!.value, "0");
  });
});

describe("decodeTransferLogs — ERC-721", () => {
  it("decodes a 4-topic Transfer as one token moved (value '1')", () => {
    const out = decodeTransferLogs(
      [
        {
          address: TOKEN,
          topics: [TRANSFER_TOPIC, pad(FROM), pad(TO), "0x" + word(42n)],
          data: "0x",
        },
      ],
      HASH,
    );
    assert.equal(out.length, 1);
    assert.equal(out[0]!.standard, "erc721");
    assert.equal(out[0]!.value, "1");
  });
});

describe("decodeTransferLogs — ERC-1155", () => {
  it("decodes TransferSingle with the amount word", () => {
    const out = decodeTransferLogs(
      [
        {
          address: TOKEN,
          // topics: sig, operator, from, to
          topics: [TRANSFER_SINGLE_TOPIC, pad(FROM), pad(FROM), pad(TO)],
          // data: id, amount
          data: "0x" + word(7n) + word(5n),
        },
      ],
      HASH,
    );
    assert.equal(out.length, 1);
    assert.equal(out[0]!.standard, "erc1155");
    assert.equal(out[0]!.value, "5");
    assert.equal(out[0]!.from, FROM);
    assert.equal(out[0]!.to, TO);
  });

  it("decodes TransferBatch into one row per (id, amount) pair", () => {
    // data: offset(ids)=0x40, offset(amounts)=0xa0, ids=[1,2], amounts=[10,20]
    const data =
      "0x" +
      word(0x40n) +
      word(0xa0n) +
      word(2n) + // ids length
      word(1n) +
      word(2n) +
      word(2n) + // amounts length
      word(10n) +
      word(20n);
    const out = decodeTransferLogs(
      [
        {
          address: TOKEN,
          topics: [TRANSFER_BATCH_TOPIC, pad(FROM), pad(FROM), pad(TO)],
          data,
        },
      ],
      HASH,
    );
    assert.equal(out.length, 2);
    assert.deepEqual(
      out.map((t) => t.value),
      ["10", "20"],
    );
  });
});

describe("decodeTransferLogs — skips", () => {
  it("skips non-transfer topics and 2-topic Transfer topologies", () => {
    const out = decodeTransferLogs(
      [
        { address: TOKEN, topics: ["0x" + "00".repeat(32)], data: "0x" },
        { address: TOKEN, topics: [TRANSFER_TOPIC, pad(FROM)], data: "0x" },
      ],
      HASH,
    );
    assert.equal(out.length, 0);
  });

  it("returns [] for an empty log set", () => {
    assert.deepEqual(decodeTransferLogs([], HASH), []);
  });
});

describe("toTransferView", () => {
  const raw = {
    from: FROM,
    to: TO,
    value: "1000",
    standard: "erc20" as const,
    contractAddress: TOKEN.toLowerCase(),
    hash: HASH,
  };

  it("attaches metadata verbatim when present", () => {
    const out = toTransferView(raw, { name: "Tok", symbol: "TOK", decimals: "6" });
    assert.equal(out.tokenName, "Tok");
    assert.equal(out.tokenSymbol, "TOK");
    assert.equal(out.tokenDecimal, "6");
    assert.equal(out.value, "1000"); // raw preserved
  });

  it("defaults erc20 decimals to 18 when metadata is missing", () => {
    const out = toTransferView(raw, null);
    assert.equal(out.tokenDecimal, "18");
    assert.equal(out.tokenName, "");
  });

  it("defaults erc721 decimals to 0, including on empty-string decimals", () => {
    const nft = { ...raw, standard: "erc721" as const };
    assert.equal(toTransferView(nft, null).tokenDecimal, "0");
    assert.equal(
      toTransferView(nft, { name: "N", symbol: "N", decimals: "" }).tokenDecimal,
      "0",
    );
  });
});
