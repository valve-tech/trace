import type { AbiItem } from "./types";

export type CallReadResult =
  | { ok: true; result: string }
  | { ok: false; error: string };

function coerceArg(value: string, type: string): unknown {
  if (type === "bool") return value.toLowerCase() === "true";
  return value;
}

function formatDecoded(decoded: {
  values?: Array<{ name: string; type: string; value: unknown }>;
}): string {
  const values = decoded.values || [];
  return values
    .map((v) => {
      const rendered =
        typeof v.value === "object" ? JSON.stringify(v.value) : String(v.value);
      return `${v.name || "result"} (${v.type}): ${rendered}`;
    })
    .join("\n");
}

export async function callReadFunction(
  fn: AbiItem,
  address: string,
  argsByName: Record<string, string>,
): Promise<CallReadResult> {
  try {
    const inputs = fn.inputs || [];
    const argValues = inputs.map((inp) =>
      coerceArg(argsByName[inp.name] || "", inp.type),
    );

    const { encodeFunctionData } = await import("viem");
    const data = encodeFunctionData({
      abi: [fn] as any,
      functionName: fn.name!,
      args: argValues as any,
    });

    const response = await fetch("/api/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "0x0000000000000000000000000000000000000000",
        to: address,
        data,
        abi: [fn],
      }),
    });

    const json = await response.json();
    if (!json.ok || !json.result) {
      return {
        ok: false,
        error: json.result?.revertReason || json.error || "Call failed",
      };
    }

    const decoded = json.result.decodedReturn ?? json.result.decodedOutput;
    if (decoded) return { ok: true, result: formatDecoded(decoded) };
    if (json.result.returnData)
      return { ok: true, result: json.result.returnData };
    return { ok: true, result: "(empty result)" };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Call failed",
    };
  }
}
