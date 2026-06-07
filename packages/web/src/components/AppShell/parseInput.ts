import { HEX_TX, HEX_ADDR, HEX_SELECTOR, DIGITS } from "../../lib/entityInput";
import { scanPath } from "../../lib/scanRoutes";

export type PaletteAction = {
  label: string;
  detail: string;
  icon: string;
  to: string;
};

export type Parsed =
  | { kind: "tx"; value: string; actions: PaletteAction[] }
  | { kind: "address"; value: string; actions: PaletteAction[] }
  | { kind: "block"; value: string; actions: PaletteAction[] }
  | { kind: "selector"; value: string; actions: PaletteAction[] }
  | { kind: "unknown" };

export function parseInput(raw: string): Parsed {
  const v = raw.trim();
  if (v === "") return { kind: "unknown" };

  if (HEX_TX.test(v)) {
    return {
      kind: "tx",
      value: v,
      actions: [
        {
          label: "Open in Debugger",
          detail: "Step through opcodes, view call tree and gas profile",
          icon: "heroicons:bug-ant",
          to: `/debugger/${v}`,
        },
        {
          label: "Open in Explorer",
          detail: "Decoded inputs, events, internal txs, token transfers",
          icon: "heroicons:magnifying-glass",
          to: scanPath("tx", v),
        },
      ],
    };
  }

  if (HEX_ADDR.test(v)) {
    return {
      kind: "address",
      value: v,
      actions: [
        {
          label: "Open in Explorer",
          detail: "Recent activity, contract source, ABI",
          icon: "heroicons:magnifying-glass",
          to: scanPath("address", v),
        },
        {
          label: "Inspect storage layout",
          detail: "Pre-fills the storage viewer with this contract",
          icon: "heroicons:rectangle-stack",
          to: `/storage?address=${v}`,
        },
      ],
    };
  }

  if (HEX_SELECTOR.test(v)) {
    // No real destination yet — show the selector intent so we can wire it later.
    return {
      kind: "selector",
      value: v,
      actions: [
        {
          label: "Decode selector",
          detail: "Look up the function signature in the 4byte registry",
          icon: "heroicons:code-bracket",
          to: `/explorer?selector=${v}`,
        },
      ],
    };
  }

  if (DIGITS.test(v)) {
    return {
      kind: "block",
      value: v,
      actions: [
        {
          label: "Open block in Explorer",
          detail: "Transactions, gas usage, miner",
          icon: "heroicons:cube",
          to: scanPath("block", v),
        },
      ],
    };
  }

  return { kind: "unknown" };
}

export const KIND_LABELS: Record<Exclude<Parsed["kind"], "unknown">, string> = {
  tx: "Transaction hash",
  address: "Address",
  block: "Block number",
  selector: "Function selector",
};
