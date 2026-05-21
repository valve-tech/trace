import { z } from "zod";

const addressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, "Invalid address");

const positiveInt = z.number().int().positive();

/** POST /api/testnets — Create a fork. */
export const createForkSchema = z.object({
  blockNumber: z.number().int().nonnegative().optional(),
  label: z.string().min(1).max(120).optional(),
});

/** POST /api/testnets/:id/revert */
export const revertSchema = z.object({
  snapshotId: z.string().min(1, "snapshotId is required"),
});

/** POST /api/testnets/:id/fund — `amount` is a decimal PLS string. */
export const fundSchema = z.object({
  address: addressSchema,
  amount: z.string().min(1, "amount is required"),
});

/** POST /api/testnets/:id/mine — `count` capped at 1000 by the handler. */
export const mineSchema = z.object({
  count: positiveInt,
});

/** POST /api/testnets/:id/time-travel */
export const timeTravelSchema = z.object({
  seconds: positiveInt,
});

/** POST /api/testnets/:id/rpc — Proxy arbitrary JSON-RPC to a fork. */
export const proxyRpcSchema = z.object({
  method: z.string().min(1, "method is required"),
  params: z.array(z.unknown()).optional(),
  id: z.union([z.number(), z.string()]).optional(),
});
