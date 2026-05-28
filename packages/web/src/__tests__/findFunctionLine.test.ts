import { describe, it, expect } from "vitest";
import { findFunctionLine } from "../components/debugger/StepDebugger/findFunctionLine";

const TOKEN = `// SPDX
pragma solidity ^0.8.0;

interface IERC20 {
  function transferFrom(address f, address t, uint256 v) external returns (bool);
}

contract Token is IERC20 {
  mapping(address => uint256) public balanceOf;

  function transferFrom(address f, address t, uint256 v) external override returns (bool) {
    return true;
  }

  receive() external payable {}
}`;

const files = [{ name: "Token.sol", content: TOKEN }];

describe("findFunctionLine", () => {
  it("prefers a contract declaration over an interface declaration", () => {
    // interface decl at line 5, contract decl at line 11 — contract wins.
    expect(findFunctionLine(files, "transferFrom")).toEqual({
      file: "Token.sol",
      line: 11,
    });
  });

  it("matches receive() as a special member (no `function` keyword)", () => {
    expect(findFunctionLine(files, "receive")).toEqual({
      file: "Token.sol",
      line: 15,
    });
  });

  it("falls through to a public-mapping getter when no function declaration exists", () => {
    expect(findFunctionLine(files, "balanceOf")).toEqual({
      file: "Token.sol",
      line: 9,
    });
  });

  it("returns null when nothing matches", () => {
    expect(findFunctionLine(files, "noSuchFunction")).toBeNull();
  });

  it("returns null for an empty file list", () => {
    expect(findFunctionLine([], "anything")).toBeNull();
  });

  it("escapes regex metacharacters in the name (defensive — names are identifiers in practice)", () => {
    // A funcName containing '.' should not match arbitrary chars.
    expect(findFunctionLine(files, "trans.erFrom")).toBeNull();
  });
});
