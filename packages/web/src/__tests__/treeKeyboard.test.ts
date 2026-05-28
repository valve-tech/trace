import { describe, it, expect } from "vitest";
import { flattenVisible, resolveTreeKey } from "../components/debugger/StepDebugger/treeKeyboard";
import type { ExecNode } from "../components/debugger/StepDebugger/executionScopes";

// A small tree: call(root) > [ fn(a) > [ log ], fn(b) ]. nodeKeys are derived,
// so we compute them the same way the module does via the rendered structure.
const log: ExecNode = { kind: "log", step: 5, name: "Transfer(address)", topicCount: 1 };
const a: ExecNode = { kind: "fn", name: "a", line: 10, startStep: 1, entryStep: 1, endStep: 9, children: [log] };
const b: ExecNode = { kind: "fn", name: "b", line: 20, startStep: 10, entryStep: 10, endStep: 19, children: [] };
const root: ExecNode = { kind: "call", frame: { to: "0xabc", input: "0xdeadbeef" } as never, startStep: 0, children: [a, b] };

const rootKey = "c:0:0xabc:0xdeadbeef";
const aKey = "f:1:10:a";
const bKey = "f:10:20:b";
const logKey = "l:5:Transfer(address)";

describe("flattenVisible", () => {
  it("lists every row when all are expanded by depth default", () => {
    const rows = flattenVisible(root, {});
    expect(rows.map((r) => r.key)).toEqual([rootKey, aKey, logKey, bKey]);
    expect(rows.find((r) => r.key === aKey)!.parentKey).toBe(rootKey);
    expect(rows.find((r) => r.key === logKey)!.parentKey).toBe(aKey);
  });

  it("hides the children of a collapsed row", () => {
    const rows = flattenVisible(root, { [aKey]: false });
    expect(rows.map((r) => r.key)).toEqual([rootKey, aKey, bKey]); // log hidden under collapsed a
  });
});

describe("resolveTreeKey", () => {
  const rows = flattenVisible(root, {});

  it("moves down and up, clamping at the ends", () => {
    expect(resolveTreeKey("ArrowDown", rows, rootKey)).toEqual({ type: "focus", key: aKey });
    expect(resolveTreeKey("ArrowUp", rows, rootKey)).toEqual({ type: "focus", key: rootKey });
    expect(resolveTreeKey("ArrowDown", rows, bKey)).toEqual({ type: "focus", key: bKey });
  });

  it("right collapses-vs-steps-in; left collapses-vs-goes-to-parent", () => {
    // a is expanded → right steps into its child (the log)
    expect(resolveTreeKey("ArrowRight", rows, aKey)).toEqual({ type: "focus", key: logKey });
    // left on an expanded row collapses it
    expect(resolveTreeKey("ArrowLeft", rows, aKey)).toEqual({ type: "toggle", key: aKey, expanded: false });
    // left on a leaf (the log) jumps to its parent
    expect(resolveTreeKey("ArrowLeft", rows, logKey)).toEqual({ type: "focus", key: aKey });
    // right on a collapsed row expands it
    const collapsed = flattenVisible(root, { [aKey]: false });
    expect(resolveTreeKey("ArrowRight", collapsed, aKey)).toEqual({ type: "toggle", key: aKey, expanded: true });
  });

  it("Enter/Space activate the focused row", () => {
    expect(resolveTreeKey("Enter", rows, bKey)).toEqual({ type: "activate", key: bKey });
    expect(resolveTreeKey(" ", rows, logKey)).toEqual({ type: "activate", key: logKey });
  });

  it("ignores other keys and an empty tree", () => {
    expect(resolveTreeKey("x", rows, rootKey)).toBeNull();
    expect(resolveTreeKey("ArrowDown", [], null)).toBeNull();
  });
});
