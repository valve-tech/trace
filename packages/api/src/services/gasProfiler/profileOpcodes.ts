import type { OpcodeStep } from "../tracer.js";
import type {
  ExpensiveOp,
  OpcodeCategory,
  OpcodeProfile,
} from "./types.js";
import { categorizeOpcode } from "./opcodeCategories.js";

/**
 * Produce a category + top-N breakdown from an opcode-level trace.
 *
 * The categories list is sorted by total gas descending; `topExpensive`
 * is the 10 single operations that cost the most. Together they answer
 * "where did the gas go" (categories) and "are there specific
 * pathological opcodes" (topExpensive).
 */
export function profileOpcodes(steps: OpcodeStep[]): OpcodeProfile {
  const categoryMap: Record<string, { gas: number; count: number }> = {};
  let totalGas = 0;

  const expensive: ExpensiveOp[] = [];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]!;
    const cost = step.gasCost;
    totalGas += cost;

    const cat = categorizeOpcode(step.op);
    if (!categoryMap[cat]) {
      categoryMap[cat] = { gas: 0, count: 0 };
    }
    categoryMap[cat]!.gas += cost;
    categoryMap[cat]!.count += 1;

    expensive.push({ step: i, pc: step.pc, op: step.op, gasCost: cost });
  }

  expensive.sort((a, b) => b.gasCost - a.gasCost);
  const topExpensive = expensive.slice(0, 10);

  const categories: OpcodeCategory[] = Object.entries(categoryMap)
    .map(([category, data]) => ({
      category,
      gas: data.gas,
      count: data.count,
      percentage: totalGas > 0 ? (data.gas / totalGas) * 100 : 0,
    }))
    .sort((a, b) => b.gas - a.gas);

  return { totalGas, categories, topExpensive };
}
