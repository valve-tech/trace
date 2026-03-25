const API_BASE = "/api/signatures";

export interface SignatureMatch {
  selector: string;
  textSignature: string;
  sigType: "function" | "event";
}

export async function lookupSignature(selector: string): Promise<SignatureMatch[]> {
  const res = await fetch(`${API_BASE}/${selector}`);
  const data = (await res.json()) as { ok: boolean; matches?: SignatureMatch[] };
  return data.matches ?? [];
}

export async function batchLookupSignatures(
  selectors: string[],
): Promise<Record<string, SignatureMatch[]>> {
  const res = await fetch(`${API_BASE}/batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ selectors }),
  });
  const data = (await res.json()) as { ok: boolean; results?: Record<string, SignatureMatch[]> };
  return data.results ?? {};
}
