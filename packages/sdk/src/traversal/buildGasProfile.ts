import type {
  CallType,
  GasProfile,
  GasProfileEntry,
  TraceFrame,
} from "../types.js";

interface MirrorNode {
  frame: TraceFrame;
  depth: number;
  children: MirrorNode[];
}

/**
 * Compute a gas profile from a call tree. The output mirrors the tree shape:
 * each entry attributes the frame's gas usage and computes `selfGas` (gas
 * spent in this frame, excluding nested calls). Percentages are relative to
 * the root frame's `gasUsed`.
 *
 * Uses an explicit stack for both tree construction and bottom-up reduction
 * — safe for arbitrarily deep trees.
 */
export function buildGasProfile(root: TraceFrame): GasProfile {
  // Pass 1 — build a parallel tree of MirrorNodes via explicit pre-order DFS.
  const rootMirror: MirrorNode = { frame: root, depth: 0, children: [] };
  const buildStack: { node: MirrorNode; childIndex: number }[] = [
    { node: rootMirror, childIndex: 0 },
  ];
  while (buildStack.length > 0) {
    const top = buildStack[buildStack.length - 1]!;
    if (top.childIndex < top.node.frame.children.length) {
      const childFrame = top.node.frame.children[top.childIndex]!;
      top.childIndex++;
      const childNode: MirrorNode = {
        frame: childFrame,
        depth: top.node.depth + 1,
        children: [],
      };
      top.node.children.push(childNode);
      buildStack.push({ node: childNode, childIndex: 0 });
    } else {
      buildStack.pop();
    }
  }

  // Pass 2 — collect all nodes in post-order so we can reduce bottom-up.
  const postOrder: MirrorNode[] = [];
  const collectStack: MirrorNode[] = [rootMirror];
  while (collectStack.length > 0) {
    const node = collectStack.pop()!;
    postOrder.push(node);
    for (const c of node.children) collectStack.push(c);
  }
  // collectStack pops in reverse-postorder; reverse to get true post-order.
  postOrder.reverse();

  // Pass 3 — reduce. Each iteration uses already-computed child entries to
  // derive selfGas for the current node.
  const totalGas = root.gasUsed;
  const entryFor = new Map<MirrorNode, GasProfileEntry>();
  const byCallType: Record<CallType, bigint> = {
    CALL: 0n,
    STATICCALL: 0n,
    DELEGATECALL: 0n,
    CALLCODE: 0n,
    CREATE: 0n,
    CREATE2: 0n,
    SELFDESTRUCT: 0n,
  };

  for (const node of postOrder) {
    const childEntries = node.children.map((c) => entryFor.get(c)!);
    const childrenGasTotal = childEntries.reduce(
      (acc, c) => acc + c.gasUsed,
      0n,
    );
    const selfGas =
      node.frame.gasUsed > childrenGasTotal
        ? node.frame.gasUsed - childrenGasTotal
        : 0n;
    const percentage =
      totalGas > 0n
        ? Number((node.frame.gasUsed * 10_000n) / totalGas) / 100
        : 0;

    entryFor.set(node, {
      address: node.frame.to ?? node.frame.from,
      functionName: node.frame.functionName ?? "",
      callType: node.frame.type,
      gasUsed: node.frame.gasUsed,
      selfGas,
      depth: node.depth,
      percentage,
      children: childEntries,
    });

    byCallType[node.frame.type] += selfGas;
  }

  return {
    totalGas,
    entries: [entryFor.get(rootMirror)!],
    byCallType,
  };
}
