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
