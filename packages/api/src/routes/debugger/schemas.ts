import { z } from "zod";

const hexString = z.string().regex(/^0x[a-fA-F0-9]*$/, "Must be a 0x-prefixed hex string");
const addressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid address");

/**
 * POST /api/debug/trace — Trace a simulated (unmined) call.
 * Either `to` or `data` must be provided; the handler enforces that.
 */
export const traceCallSchema = z.object({
  from: addressSchema.optional(),
  to: addressSchema.optional(),
  value: hexString.optional(),
  data: hexString.optional(),
  gas: hexString.optional(),
});

/**
 * GET /api/debug/tx/:hash/opcodes/detail — Per-step state window.
 * `from` and `to` arrive as query strings; coerce to non-negative integers.
 * Both are optional — the handler defaults `from` to 0 and `to` to from+1
 * (single-step request), then caps the span. The cap is server policy
 * (preventing a whole-trace fetch), not a client contract.
 */
const nonNegInt = z
  .string()
  .regex(/^\d+$/, "Must be a non-negative integer")
  .transform((s) => parseInt(s, 10));

export const opcodeDetailQuerySchema = z
  .object({
    from: nonNegInt.optional(),
    to: nonNegInt.optional(),
  })
  .refine((q) => q.to === undefined || q.from === undefined || q.to >= q.from, {
    message: "`to` must be >= `from`",
    path: ["to"],
  });
