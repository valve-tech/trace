export function Th({
  children,
  width,
  align,
}: {
  children: React.ReactNode;
  width: number;
  align: "left" | "right";
}) {
  return (
    <th
      style={{
        textAlign: align,
        padding: "8px 12px",
        fontWeight: 500,
        width,
        color: "#8b949e",
      }}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  color,
  align = "left",
}: {
  children: React.ReactNode;
  color: string;
  align?: "left" | "right";
}) {
  return (
    <td
      style={{
        padding: "6px 12px",
        fontFamily: "monospace",
        textAlign: align,
        color,
      }}
    >
      {children}
    </td>
  );
}
