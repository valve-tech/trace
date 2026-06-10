import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildContractInfo,
  flattenSourceFiles,
} from "../../src/services/explorer/contracts/transforms.js";
import type { VerifiedSource } from "../../src/services/sourceCode.js";

/**
 * Unit tests for the contract-info builder over the verified-source shape
 * (Sourcify-first via getVerifiedSource). The defensive defaults are the
 * critical surface: an unverified contract (null source) must render with
 * every string field empty and `isVerified: false`.
 */

const ADDR = "0x" + "ab".repeat(20);

function source(overrides: Partial<VerifiedSource> = {}): VerifiedSource {
  return {
    address: ADDR,
    chainSource: "sourcify",
    contractName: "MyToken",
    compilerVersion: "0.8.20+commit.a1b79de6",
    optimizationUsed: true,
    optimizationRuns: 200,
    sourceFiles: [{ name: "MyToken.sol", content: "contract MyToken {}" }],
    abi: [{ type: "function", name: "name" }],
    sourceMap: null,
    deployedBytecode: null,
    ...overrides,
  };
}

describe("buildContractInfo", () => {
  it("maps a verified source onto the wire shape", () => {
    const out = buildContractInfo(ADDR, source());
    assert.equal(out.isVerified, true);
    assert.equal(out.contractName, "MyToken");
    assert.equal(out.compilerVersion, "0.8.20+commit.a1b79de6");
    assert.equal(out.optimizationUsed, true);
    assert.equal(out.sourceCode, "contract MyToken {}");
    assert.deepEqual(out.abi, [{ type: "function", name: "name" }]);
  });

  it("renders an unverified contract (null source) with empty defaults", () => {
    const out = buildContractInfo(ADDR, null);
    assert.equal(out.isVerified, false);
    assert.equal(out.contractName, "");
    assert.equal(out.compilerVersion, "");
    assert.equal(out.optimizationUsed, false);
    assert.equal(out.sourceCode, "");
    assert.equal(out.abi, null);
    assert.equal(out.address, ADDR);
  });

  it("nulls an empty ABI array (verified-without-ABI edge)", () => {
    const out = buildContractInfo(ADDR, source({ abi: [] }));
    assert.equal(out.abi, null);
    assert.equal(out.isVerified, true);
  });

  it("leaves Etherscan-only metadata empty (not part of the Sourcify shape)", () => {
    const out = buildContractInfo(ADDR, source());
    assert.equal(out.constructorArguments, "");
    assert.equal(out.evmVersion, "");
    assert.equal(out.proxy, "");
    assert.equal(out.implementation, "");
  });
});

describe("flattenSourceFiles", () => {
  it("passes a single file through verbatim", () => {
    assert.equal(
      flattenSourceFiles([{ name: "A.sol", content: "contract A {}" }]),
      "contract A {}",
    );
  });

  it("joins multiple files with // File: separators", () => {
    const out = flattenSourceFiles([
      { name: "A.sol", content: "contract A {}" },
      { name: "B.sol", content: "contract B {}" },
    ]);
    assert.equal(
      out,
      "// File: A.sol\ncontract A {}\n\n// File: B.sol\ncontract B {}",
    );
  });

  it("returns '' for no files", () => {
    assert.equal(flattenSourceFiles([]), "");
  });
});
