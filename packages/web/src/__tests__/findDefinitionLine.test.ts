import { describe, it, expect } from "vitest";
import { findDefinitionLine } from "../components/debugger/StepDebugger/findDefinitionLine";

const SRC = `// SPDX
pragma solidity ^0.8.0;

library SafeMath {
  function mul(uint a, uint b) internal pure returns (uint) { return a * b; }
}

interface IERC20 {
  event Transfer(address indexed from, address indexed to, uint256 value);
  function transferFrom(address f, address t, uint256 v) external returns (bool);
}

abstract contract Ownable {
  modifier onlyOwner() { _; }
  error NotOwner(address caller);
}

contract Token is IERC20, Ownable {
  using SafeMath for uint;

  struct Holder { uint256 balance; bool frozen; }
  enum Status { Active, Paused }

  mapping(address => uint256) public balanceOf;
  Status public status;

  event Approval(address indexed owner, address indexed spender, uint256 value);

  constructor() {}

  function transferFrom(address f, address t, uint256 v) external override returns (bool) {
    return true;
  }

  receive() external payable {}
}`;

const files = [{ name: "Token.sol", content: SRC }];

describe("findDefinitionLine", () => {
  it("finds a function in a contract (preferred over the interface decl)", () => {
    const hit = findDefinitionLine(files, "transferFrom");
    expect(hit?.kind).toBe("function");
    // Contract decl is at line 31 of the test fixture; interface at 11.
    // Contract wins because in-contract beats in-interface.
    expect(hit?.line).toBe(31);
  });

  it("finds a modifier", () => {
    const hit = findDefinitionLine(files, "onlyOwner");
    expect(hit).toEqual({ file: "Token.sol", line: 14, kind: "modifier" });
  });

  it("finds an event", () => {
    const hit = findDefinitionLine(files, "Approval");
    expect(hit?.kind).toBe("event");
  });

  it("finds an event in an interface when no contract decl exists", () => {
    const hit = findDefinitionLine(files, "Transfer");
    expect(hit?.kind).toBe("event");
    expect(hit?.line).toBe(9);
  });

  it("finds an error", () => {
    const hit = findDefinitionLine(files, "NotOwner");
    expect(hit).toEqual({ file: "Token.sol", line: 15, kind: "error" });
  });

  it("finds a struct", () => {
    const hit = findDefinitionLine(files, "Holder");
    expect(hit?.kind).toBe("struct");
  });

  it("finds an enum", () => {
    const hit = findDefinitionLine(files, "Status");
    // Status is both an enum AND a public state var — enum decl wins (higher
    // priority bucket: in-contract function/modifier/etc beats state-var).
    expect(hit?.kind).toBe("enum");
  });

  it("finds a contract / library / interface declaration", () => {
    expect(findDefinitionLine(files, "Token")?.kind).toBe("contract");
    expect(findDefinitionLine(files, "SafeMath")?.kind).toBe("library");
    expect(findDefinitionLine(files, "IERC20")?.kind).toBe("interface");
  });

  it("finds an abstract contract", () => {
    expect(findDefinitionLine(files, "Ownable")?.kind).toBe("contract");
  });

  it("finds the constructor", () => {
    const hit = findDefinitionLine(files, "constructor");
    expect(hit?.kind).toBe("constructor");
  });

  it("finds receive()", () => {
    const hit = findDefinitionLine(files, "receive");
    expect(hit?.kind).toBe("receive");
  });

  it("falls back to the public-state-var auto-getter when no function decl exists", () => {
    const hit = findDefinitionLine(files, "balanceOf");
    expect(hit?.kind).toBe("state-var-getter");
  });

  it("returns null when nothing matches", () => {
    expect(findDefinitionLine(files, "noSuchSymbol")).toBeNull();
  });

  it("returns null for empty file list", () => {
    expect(findDefinitionLine([], "anything")).toBeNull();
  });

  it("escapes regex metacharacters in the search name", () => {
    expect(findDefinitionLine(files, "trans.erFrom")).toBeNull();
  });
});
