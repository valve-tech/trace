import type { OpcodeStep } from "../../types.js";
import { getOpcodeColor, isExpensiveOp } from "../opcodeClassify.js";
import { Td } from "./cells.js";

export function OpcodeRow({
  step,
  index,
  isExpanded,
  rowClassName,
  onClick,
}: {
  step: OpcodeStep;
  index: number;
  isExpanded: boolean;
  rowClassName?: string;
  onClick: () => void;
}) {
  const expensive = isExpensiveOp(step.op);
  return (
    <tr
      className={rowClassName}
      onClick={onClick}
      style={{
        borderBottom: "1px solid rgba(139, 148, 158, 0.1)",
        cursor: "pointer",
        backgroundColor: isExpanded
          ? "rgba(99, 102, 241, 0.08)"
          : expensive
            ? "rgba(248, 81, 73, 0.04)"
            : "transparent",
      }}
    >
      <Td color="#6e7681">{index}</Td>
      <Td color="#8b949e">{step.pc}</Td>
      <td
        style={{
          padding: "6px 12px",
          fontFamily: "monospace",
          fontWeight: 600,
        }}
      >
        <span style={{ color: getOpcodeColor(step.op) }}>{step.op}</span>
        {expensive && (
          <span
            title="Expensive operation"
            style={{
              display: "inline-block",
              marginLeft: 6,
              width: 6,
              height: 6,
              borderRadius: "50%",
              backgroundColor: "#ef4444",
            }}
          />
        )}
      </td>
      <Td align="right" color="#8b949e">
        {step.gas.toLocaleString()}
      </Td>
      <Td align="right" color={expensive ? "#eab308" : "#c9d1d9"}>
        {step.gasCost.toLocaleString()}
      </Td>
      <Td align="right" color="#6e7681">
        {step.depth}
      </Td>
    </tr>
  );
}
