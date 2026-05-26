import { describe, it, expect } from "vitest";
import { buildLogsByStep } from "../components/debugger/StepDebugger/logsByStep";

const steps = (ops: string[]) => ops.map((op) => ({ op }));

describe("buildLogsByStep", () => {
  it("decodes events from the emitter's ABI by (address, topic0)", () => {
    const s = steps(["PUSH1", "LOG3", "ADD", "LOG2"]);
    const rawLogs = [
      { address: "0xAAA", topics: ["0xt0a", "0x", "0x"], logIndex: 5 },
      { address: "0xBBB", topics: ["0xt0b", "0x"], logIndex: 9 },
    ];
    const eventsByAddr = {
      "0xaaa": { "0xt0a": "Transfer(address,address,uint256)" },
      "0xbbb": { "0xt0b": "Sync(uint112,uint112)" },
    };
    const map = buildLogsByStep(s, rawLogs, eventsByAddr);
    expect(map.get(1)).toEqual({ name: "Transfer(address,address,uint256)", topicCount: 3 });
    expect(map.get(3)).toEqual({ name: "Sync(uint112,uint112)", topicCount: 2 });
  });

  it("orders receipt logs by logIndex before zipping to LOG opcodes", () => {
    const s = steps(["LOG1", "LOG1"]);
    // out-of-order logIndex must be sorted so the first opcode gets logIndex 2
    const rawLogs = [
      { address: "0xBBB", topics: ["0xt0b"], logIndex: 7 },
      { address: "0xAAA", topics: ["0xt0a"], logIndex: 2 },
    ];
    const events = { "0xaaa": { "0xt0a": "A()" }, "0xbbb": { "0xt0b": "B()" } };
    const map = buildLogsByStep(s, rawLogs, events);
    expect(map.get(0)!.name).toBe("A()");
    expect(map.get(1)!.name).toBe("B()");
  });

  it("falls back to server-decoded names, then the raw opcode arity", () => {
    const s = steps(["LOG2", "LOG0"]);
    const rawLogs = [
      { address: "0xAAA", topics: ["0xt0a", "0x"], logIndex: 0 },
      { address: "0xCCC", topics: [], logIndex: 1 },
    ];
    const decoded = [{ eventName: "Approval", args: [{ type: "address" }, { type: "uint256" }], logIndex: 0 }];
    const map = buildLogsByStep(s, rawLogs, {}, decoded);
    expect(map.get(0)!.name).toBe("Approval(address,uint256)"); // server-decoded
    expect(map.get(1)!.name).toBe("LOG0"); // nothing matched
  });

  it("returns an empty map when LOG-opcode and receipt-log counts disagree", () => {
    // a reverted sub-call emitted a LOG that never reached the receipt
    const s = steps(["LOG1", "LOG1"]);
    const rawLogs = [{ address: "0xAAA", topics: ["0xt0a"], logIndex: 0 }];
    expect(buildLogsByStep(s, rawLogs, { "0xaaa": { "0xt0a": "A()" } }).size).toBe(0);
  });

  it("returns an empty map when there are no receipt logs", () => {
    expect(buildLogsByStep(steps(["LOG1"]), []).size).toBe(0);
  });
});
