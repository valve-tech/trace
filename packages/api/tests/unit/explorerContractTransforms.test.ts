import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildContractInfo,
  type BlockscoutSourceRow,
} from "../../src/services/explorer/contracts/transforms.js";

/**
 * Unit tests for buildContractInfo. The verification heuristic
 * (ABI-or-name-present) and the "1"/"0" boolean coercion are the
 * load-bearing branches.
 */

function source(overrides: Partial<BlockscoutSourceRow> = {}): BlockscoutSourceRow {
  return {
    ContractName: "Token",
    CompilerVersion: "v0.8.20+commit.a1b79de6",
    OptimizationUsed: "1",
    SourceCode: "pragma solidity ^0.8.0;",
    ConstructorArguments: "0x",
    EVMVersion: "paris",
    Library: "",
    LicenseType: "MIT",
    Proxy: "",
    Implementation: "",
    SwarmSource: "",
    ABI: "[]",
    ...overrides,
  };
}

const ADDR = "0x" + "11".repeat(20);

describe("buildContractInfo", () => {
  describe("isVerified", () => {
    it("is true when ABI is present (even if source row is missing)", () => {
      const out = buildContractInfo(ADDR, [{ type: "function" }], undefined);
      assert.equal(out.isVerified, true);
    });

    it("is true when source row has a non-empty ContractName (even without ABI)", () => {
      const out = buildContractInfo(ADDR, null, source());
      assert.equal(out.isVerified, true);
    });

    it("is false when ABI is null AND ContractName is empty", () => {
      const out = buildContractInfo(ADDR, null, source({ ContractName: "" }));
      assert.equal(out.isVerified, false);
    });

    it("is false when ABI is null AND source row is missing", () => {
      const out = buildContractInfo(ADDR, null, undefined);
      assert.equal(out.isVerified, false);
    });
  });

  describe("optimizationUsed boolean coercion", () => {
    it("maps OptimizationUsed='1' to true", () => {
      const out = buildContractInfo(ADDR, null, source({ OptimizationUsed: "1" }));
      assert.equal(out.optimizationUsed, true);
    });

    it("maps OptimizationUsed='0' to false", () => {
      const out = buildContractInfo(ADDR, null, source({ OptimizationUsed: "0" }));
      assert.equal(out.optimizationUsed, false);
    });

    it("maps an empty OptimizationUsed string to false", () => {
      const out = buildContractInfo(ADDR, null, source({ OptimizationUsed: "" }));
      assert.equal(out.optimizationUsed, false);
    });

    it("defaults to false when source row is missing", () => {
      const out = buildContractInfo(ADDR, null, undefined);
      assert.equal(out.optimizationUsed, false);
    });

    it("does NOT coerce 'true' to true (only the literal '1' counts)", () => {
      // Defensive — Blockscout uses "1"/"0", not "true"/"false".
      const out = buildContractInfo(
        ADDR,
        null,
        source({ OptimizationUsed: "true" }),
      );
      assert.equal(out.optimizationUsed, false);
    });
  });

  describe("string field defaults", () => {
    it("defaults every string field to '' when source row is missing", () => {
      const out = buildContractInfo(ADDR, null, undefined);
      assert.equal(out.contractName, "");
      assert.equal(out.compilerVersion, "");
      assert.equal(out.sourceCode, "");
      assert.equal(out.constructorArguments, "");
      assert.equal(out.evmVersion, "");
      assert.equal(out.library, "");
      assert.equal(out.licenseType, "");
      assert.equal(out.proxy, "");
      assert.equal(out.implementation, "");
      assert.equal(out.swarmSource, "");
    });

    it("passes through every field from a populated source row", () => {
      const out = buildContractInfo(ADDR, null, source());
      assert.equal(out.contractName, "Token");
      assert.equal(out.compilerVersion, "v0.8.20+commit.a1b79de6");
      assert.equal(out.sourceCode, "pragma solidity ^0.8.0;");
      assert.equal(out.evmVersion, "paris");
      assert.equal(out.licenseType, "MIT");
    });
  });

  it("includes the input address verbatim", () => {
    const out = buildContractInfo("0xDEADBEEF", null, undefined);
    assert.equal(out.address, "0xDEADBEEF");
  });

  it("passes through the ABI argument as-is", () => {
    const abi = [{ type: "function", name: "foo" }];
    const out = buildContractInfo(ADDR, abi, undefined);
    assert.equal(out.abi, abi); // identity, not just equality
  });
});
