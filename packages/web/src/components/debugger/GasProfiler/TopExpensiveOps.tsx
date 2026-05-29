import type { OpcodeProfile } from "../../../api/debugger";
import { getOpcodeColor } from "@valve-tech/trace-sdk";
import { formatGas } from "./colors";

export function TopExpensiveOps({
  ops,
}: {
  ops: OpcodeProfile["topExpensive"];
}) {
  return (
    <div className="mt-4">
      <h4 className="text-xs font-medium mb-2 theme-text-secondary">
        Top 10 Most Expensive Operations
      </h4>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bs-b">
              {["Step", "Offset", "Opcode", "Gas Cost"].map((h, i) => (
                <th
                  key={h}
                  className={`py-1.5 px-2 font-medium theme-text-secondary ${
                    i === 3 ? "text-right" : "text-left"
                  }`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ops.map((op, i) => (
              <tr key={i} className="bs-b-muted">
                <td className="py-1.5 px-2 font-mono theme-text-muted">
                  #{op.step}
                </td>
                <td className="py-1.5 px-2 font-mono theme-text-secondary">
                  {op.pc}
                </td>
                <td className="py-1.5 px-2 font-mono font-semibold">
                  <span style={{ color: getOpcodeColor(op.op) }}>{op.op}</span>
                </td>
                <td className="py-1.5 px-2 text-right font-mono font-semibold theme-warning">
                  {formatGas(op.gasCost)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
