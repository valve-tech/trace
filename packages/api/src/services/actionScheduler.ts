import {
  getEnabledActions,
  getAction,
  type ActionRow,
} from "./actionsDb.js";
import { executeAction, type TriggerEvent } from "./actionExecutor.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface TriggerConfig {
  intervalSeconds?: number;
  everyNthBlock?: number;
  contractAddress?: string;
  eventSignature?: string;
}

interface ScheduledAction {
  actionId: number;
  intervalHandle: ReturnType<typeof setInterval>;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const scheduledActions = new Map<number, ScheduledAction>();

// ---------------------------------------------------------------------------
// Register/unregister periodic actions
// ---------------------------------------------------------------------------

/**
 * Register a periodic action. If the action's trigger_type is "periodic",
 * it will be scheduled to run at the configured interval.
 */
export function registerAction(action: ActionRow): void {
  // Only schedule periodic triggers here
  if (action.trigger_type !== "periodic") return;
  if (!action.enabled) return;

  // Don't double-register
  if (scheduledActions.has(action.id)) {
    unregisterAction(action.id);
  }

  let config: TriggerConfig;
  try {
    config = JSON.parse(action.trigger_config) as TriggerConfig;
  } catch {
    console.error(`[scheduler] failed to parse trigger_config for action ${action.id}`);
    return;
  }

  const intervalSeconds = config.intervalSeconds ?? 60;
  const intervalMs = intervalSeconds * 1000;

  console.log(
    `[scheduler] registering periodic action ${action.id} ("${action.name}") every ${intervalSeconds}s`,
  );

  const handle = setInterval(() => {
    // Re-fetch action to check if still enabled
    const current = getAction(action.id);
    if (!current || !current.enabled) {
      unregisterAction(action.id);
      return;
    }

    const event: TriggerEvent = {
      type: "periodic",
      timestamp: new Date().toISOString(),
      intervalSeconds,
    };

    executeAction(current, event).catch((err) => {
      console.error(`[scheduler] error executing periodic action ${action.id}:`, err);
    });
  }, intervalMs);

  scheduledActions.set(action.id, {
    actionId: action.id,
    intervalHandle: handle,
  });
}

/**
 * Unregister a scheduled action (clear its interval).
 */
export function unregisterAction(actionId: number): void {
  const scheduled = scheduledActions.get(actionId);
  if (scheduled) {
    clearInterval(scheduled.intervalHandle);
    scheduledActions.delete(actionId);
    console.log(`[scheduler] unregistered action ${actionId}`);
  }
}

/**
 * Unregister all scheduled actions.
 */
export function unregisterAll(): void {
  for (const [id] of scheduledActions) {
    unregisterAction(id);
  }
}

// ---------------------------------------------------------------------------
// Block/event trigger processing
// ---------------------------------------------------------------------------

/**
 * Process a new block. Checks if any enabled actions have block or event triggers
 * that match, and executes them if so.
 *
 * @param blockNumber - The new block number
 * @param txs - Transactions in the block
 * @param logs - Logs emitted in the block
 */
export async function processBlock(
  blockNumber: number,
  txs: Array<{
    hash: string;
    from: string;
    to: string | null;
    value: string;
    input: string;
  }>,
  logs: Array<{
    address: string;
    topics: string[];
    data: string;
    transactionHash: string | null;
  }>,
): Promise<void> {
  const actions = getEnabledActions();

  for (const action of actions) {
    let config: TriggerConfig;
    try {
      config = JSON.parse(action.trigger_config) as TriggerConfig;
    } catch {
      continue;
    }

    if (action.trigger_type === "block") {
      const everyN = config.everyNthBlock ?? 1;
      if (blockNumber % everyN !== 0) continue;

      const event: TriggerEvent = {
        type: "block",
        blockNumber,
        transactionCount: txs.length,
      };

      try {
        await executeAction(action, event);
      } catch (err) {
        console.error(`[scheduler] error executing block action ${action.id}:`, err);
      }
    }

    if (action.trigger_type === "event") {
      const contractAddress = config.contractAddress?.toLowerCase();
      const eventSignature = config.eventSignature;
      if (!contractAddress || !eventSignature) continue;

      // Compute topic0 from event signature using a simple keccak256
      // We match any log where address matches and first topic matches the signature hash
      const matchingLogs = logs.filter((log) => {
        if (log.address.toLowerCase() !== contractAddress) return false;
        // For event matching, we compare the event signature directly
        // The trigger config stores the topic0 hash or the signature itself
        if (log.topics[0]?.toLowerCase() === eventSignature.toLowerCase()) {
          return true;
        }
        return false;
      });

      if (matchingLogs.length > 0) {
        const event: TriggerEvent = {
          type: "event",
          blockNumber,
          contractAddress,
          eventSignature,
          matchedLogs: matchingLogs,
          matchCount: matchingLogs.length,
        };

        try {
          await executeAction(action, event);
        } catch (err) {
          console.error(`[scheduler] error executing event action ${action.id}:`, err);
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

/**
 * Load all enabled actions from DB and register their schedules.
 * Called on server startup.
 */
export function initScheduler(): void {
  console.log("[scheduler] initializing action scheduler...");
  const actions = getEnabledActions();
  let registered = 0;

  for (const action of actions) {
    if (action.trigger_type === "periodic") {
      registerAction(action);
      registered++;
    }
  }

  console.log(
    `[scheduler] initialized with ${actions.length} enabled actions, ${registered} periodic schedules`,
  );
}

/**
 * Get info about currently scheduled actions.
 */
export function getSchedulerStatus(): {
  scheduledCount: number;
  actionIds: number[];
} {
  return {
    scheduledCount: scheduledActions.size,
    actionIds: Array.from(scheduledActions.keys()),
  };
}
