/**
 * Input-validation tests for the etherscan `account` module handlers.
 *
 * We deliberately don't mock BlockScout — these tests cover only the
 * synchronous validation gates that fire before any network call. A
 * separate integration test exercises the upstream path.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  balanceAction,
  balanceMultiAction,
  tokenTxAction,
  txListAction,
} from "../../src/routes/etherscan/handlers/account.js";

const INVALID_ADDRESSES = [
  "",
  "not-an-address",
  "0x123", // too short
  "0xZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ", // non-hex
  "1234567890123456789012345678901234567890", // missing 0x prefix
];

const VALID_ADDRESS = "0x0000000000000000000000000000000000000001";
const VALID_ADDRESS_2 = "0x0000000000000000000000000000000000000002";

describe("etherscan account.balance — input validation", () => {
  for (const bad of INVALID_ADDRESSES) {
    it(`rejects ${JSON.stringify(bad)}`, async () => {
      const res = await balanceAction({ address: bad });
      assert.equal(res.status, "0");
      assert.equal(res.result, "Invalid Address format");
    });
  }

  it("rejects a missing address param", async () => {
    const res = await balanceAction({});
    assert.equal(res.status, "0");
    assert.equal(res.result, "Invalid Address format");
  });
});

describe("etherscan account.balancemulti — input validation", () => {
  it("rejects an empty list", async () => {
    const res = await balanceMultiAction({ address: "" });
    assert.equal(res.status, "0");
    assert.equal(res.result, "Invalid Address format");
  });

  it("rejects an all-whitespace list", async () => {
    const res = await balanceMultiAction({ address: " , , " });
    assert.equal(res.status, "0");
    assert.equal(res.result, "Invalid Address format");
  });

  it("rejects when any address in the list is malformed", async () => {
    const res = await balanceMultiAction({
      address: `${VALID_ADDRESS},not-an-address,${VALID_ADDRESS_2}`,
    });
    assert.equal(res.status, "0");
    assert.equal(res.result, "Invalid Address format");
  });

  it("rejects more than 20 addresses", async () => {
    const list = Array.from({ length: 21 }, () => VALID_ADDRESS).join(",");
    const res = await balanceMultiAction({ address: list });
    assert.equal(res.status, "0");
    assert.match(res.result, /20 addresses/);
  });
});

describe("etherscan account.txlist — input validation", () => {
  for (const bad of INVALID_ADDRESSES) {
    it(`rejects ${JSON.stringify(bad)}`, async () => {
      const res = await txListAction({ address: bad });
      assert.equal(res.status, "0");
      assert.equal(res.result, "Invalid Address format");
    });
  }
});

describe("etherscan account.tokentx — input validation + not-supported", () => {
  for (const bad of INVALID_ADDRESSES) {
    it(`rejects ${JSON.stringify(bad)}`, async () => {
      const res = await tokenTxAction({ address: bad });
      assert.equal(res.status, "0");
      assert.equal(res.result, "Invalid Address format");
    });
  }

  it("returns a 'not supported' error for a valid address", async () => {
    const res = await tokenTxAction({ address: VALID_ADDRESS });
    assert.equal(res.status, "0");
    assert.match(res.result, /Not supported/);
  });
});
