import { z } from "zod";

const triggerTypeEnum = z.enum(["block", "event", "periodic", "webhook"]);

/**
 * Cap user-controlled action code at 64 KB. The executor runs whatever
 * lands here; even with proper sandbox isolation a multi-MB script would
 * balloon memory and serialization cost. 64 KB is far more than any
 * reasonable snippet needs.
 */
const MAX_CODE_LENGTH = 64 * 1024;

/**
 * Per-key cap on secret values. Keeps a hostile or buggy client from
 * trying to dump GB-scale blobs into Postgres via the secrets JSONB column.
 * 32-key ceiling on the map for similar reasons.
 */
const MAX_SECRET_LENGTH = 4 * 1024;

const secretsSchema = z
  .record(
    z
      .string()
      .max(MAX_SECRET_LENGTH, `Secret value exceeds ${MAX_SECRET_LENGTH} chars`),
  )
  .refine((obj) => Object.keys(obj).length <= 32, {
    message: "At most 32 secret keys",
  });

export const createActionSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  code: z.string().max(MAX_CODE_LENGTH).optional().default(""),
  triggerType: triggerTypeEnum,
  triggerConfig: z.record(z.unknown()).optional().default({}),
  secrets: secretsSchema.optional().default({}),
});

export const updateActionSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  code: z.string().max(MAX_CODE_LENGTH).optional(),
  triggerType: triggerTypeEnum.optional(),
  triggerConfig: z.record(z.unknown()).optional(),
  secrets: secretsSchema.optional(),
  enabled: z.boolean().optional(),
});

export const testActionSchema = z.object({
  event: z.record(z.unknown()).optional(),
});

export const idParamSchema = z.coerce
  .number()
  .int()
  .positive("Invalid action ID");

export const logsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});
