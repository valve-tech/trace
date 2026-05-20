import { z } from "zod";

/**
 * Zod schemas backing /api/alerts. The `conditions` object varies by
 * `type`; the top-level schema runs a `superRefine` after parse to pick
 * the right condition-schema and surface field-level errors under
 * `conditions.<field>` so the UI can highlight the right input.
 */

const alertTypeEnum = z.enum([
  "address_activity",
  "contract_event",
  "function_call",
  "balance_threshold",
  "failed_tx",
]);

const notificationChannelSchema = z.object({
  type: z.enum(["webhook", "discord", "slack", "telegram"]),
  url: z.string().optional(),
  webhookUrl: z.string().optional(),
  botToken: z.string().optional(),
  chatId: z.string().optional(),
});

const addressActivityConditions = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid address"),
});

const contractEventConditions = z.object({
  contractAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid address"),
  eventSignature: z.string().min(1, "Event signature required"),
});

const functionCallConditions = z.object({
  contractAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid address"),
  functionSelector: z.string().min(1, "Function selector required"),
});

const balanceThresholdConditions = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid address"),
  threshold: z.string().min(1, "Threshold required"),
  direction: z.enum(["above", "below"]),
});

const failedTxConditions = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid address"),
});

export const createAlertSchema = z
  .object({
    name: z.string().min(1, "Name is required").max(200),
    type: alertTypeEnum,
    conditions: z.record(z.unknown()),
    notifications: z.array(notificationChannelSchema).default([]),
    enabled: z.boolean().default(true),
    cooldown_seconds: z.number().int().min(0).default(60),
  })
  .superRefine((data, ctx) => {
    let result;
    switch (data.type) {
      case "address_activity":
        result = addressActivityConditions.safeParse(data.conditions);
        break;
      case "contract_event":
        result = contractEventConditions.safeParse(data.conditions);
        break;
      case "function_call":
        result = functionCallConditions.safeParse(data.conditions);
        break;
      case "balance_threshold":
        result = balanceThresholdConditions.safeParse(data.conditions);
        break;
      case "failed_tx":
        result = failedTxConditions.safeParse(data.conditions);
        break;
    }
    if (result && !result.success) {
      for (const issue of result.error.issues) {
        ctx.addIssue({ ...issue, path: ["conditions", ...issue.path] });
      }
    }
  });

export const updateAlertSchema = createAlertSchema;
