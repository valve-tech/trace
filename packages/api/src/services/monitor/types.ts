/**
 * Shared types for the alert monitor. `BlockTransaction` is the
 * normalized form pollBlocks hands to every matcher (lowercase addresses,
 * value as bigint). `AlertConditions` is the union of fields the various
 * alert types can carry in their `conditions` JSONB column — matchers
 * read the subset they need.
 */

export interface BlockTransaction {
  hash: string;
  from: string;
  to: string | null;
  value: bigint;
  input: string;
}

export interface AlertConditions {
  address?: string;
  contractAddress?: string;
  eventSignature?: string;
  functionSelector?: string;
  threshold?: string;
  direction?: "above" | "below";
}
