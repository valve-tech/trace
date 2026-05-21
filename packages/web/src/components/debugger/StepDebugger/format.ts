// Hex word and memory formatting helpers for the step debugger.

export function formatWord(hex: string): string {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  return "0x" + clean.padStart(64, "0");
}

export function truncateWord(hex: string): string {
  return formatWord(hex);
}

export function memoryToBytes(memoryArray: string[]): string {
  return memoryArray.join("");
}

export function formatMemoryRow(hex: string, offset: number): { hex: string; ascii: string } {
  const bytes: string[] = [];
  const ascii: string[] = [];
  for (let i = 0; i < 32 && offset * 2 + i * 2 < hex.length; i++) {
    const byteHex = hex.slice(offset * 2 + i * 2, offset * 2 + i * 2 + 2);
    bytes.push(byteHex);
    const code = parseInt(byteHex, 16);
    ascii.push(code >= 0x20 && code < 0x7f ? String.fromCharCode(code) : ".");
  }
  return { hex: bytes.join(" "), ascii: ascii.join("") };
}
