import { describe, it, expect } from "vitest";
import { buildFunctionIndex, classifyFn } from "../components/debugger/StepDebugger/functionIndex";

// A flattened-style source: a library followed by a contract, both with bodies.
const FILE = `// SPDX
pragma solidity ^0.8.0;

library SafeMath {
    function mul(uint a, uint b) internal pure returns (uint) {
        if (a == 0) return 0;
        uint c = a * b;
        require(c / a == b);
        return c;
    }
}

contract Token {
    using SafeMath for uint;
    function transferFrom(address s, address r, uint amt) external returns (bool) {
        return _transferFrom(s, r, amt);
    }
    function _transferFrom(address s, address r, uint amt) internal returns (bool) {
        uint x = amt.mul(2);
        return true;
    }
    receive() external payable {}
}`;

const index = buildFunctionIndex([{ name: "Token.sol", content: FILE }]);

describe("classifyFn", () => {
  it("names the enclosing function from an inner line (the SafeMath case)", () => {
    // line 8 is `require(c / a == b)` — inside mul, which is in a library.
    expect(classifyFn(index, "Token.sol", 8)).toEqual({ name: "mul", isLibrary: true });
  });

  it("marks a contract's own functions as non-library", () => {
    expect(classifyFn(index, "Token.sol", 16)).toEqual({ name: "transferFrom", isLibrary: false });
    expect(classifyFn(index, "Token.sol", 20)).toEqual({ name: "_transferFrom", isLibrary: false });
  });

  it("recognizes receive() with no name", () => {
    expect(classifyFn(index, "Token.sol", 23)).toEqual({ name: "receive", isLibrary: false });
  });

  it("returns null for an unknown file or missing index", () => {
    expect(classifyFn(index, "Other.sol", 5)).toBeNull();
    expect(classifyFn(undefined, "Token.sol", 5)).toBeNull();
  });
});
