import {
  getEnabledPeriodicActions,
  getAction,
  type ActionRow,
} from "./actionsDb.js";
import { executeAction, type TriggerEvent } from "./actionExecutor.js";

// ---------------------------------------------------------------------------
// Types — trigger_config is now a JSONB object from pg
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
export function registerAction(action: ActionRow): void {
  if (action.trigger_type !== "periodic") return;
  if (!action.enabled) return;

  if (scheduledActions.has(action.id)) {
    unregisterAction(action.id);
  }

  const config = action.trigger_config as unknown as TriggerConfig;
  const intervalSeconds = config.intervalSeconds ?? 60;
  const intervalMs = intervalSeconds * 1000;

  console.log(
    `[scheduler] registering periodic action ${action.id} ("${action.name}") every ${intervalSeconds}s`,
  );

  const handle = setInterval(() => {
    void (async () => {
      const current = await getAction(action.id);
      if (!current || !current.enabled) {
        unregisterAction(action.id);
        return;
      }

      const event: TriggerEvent = {
        type: "periodic",
        timestamp: new Date().toISOString(),
        intervalSeconds,
        chainId: current.chain_id,
      };

      try {
        await executeAction(current, event);
      } catch (err) {
        console.error(`[scheduler] error executing periodic action ${action.id}:`, err);
      }
    })();
  }, intervalMs);

  scheduledActions.set(action.id, {
    actionId: action.id,
    intervalHandle: handle,
  });
}

export function unregisterAction(actionId: number): void {
  const scheduled = scheduledActions.get(actionId);
  if (scheduled) {
    clearInterval(scheduled.intervalHandle);
    scheduledActions.delete(actionId);
    console.log(`[scheduler] unregistered action ${actionId}`);
  }
}

export function unregisterAll(): void {
  for (const [id] of scheduledActions) {
    unregisterAction(id);
  }
}

// ---------------------------------------------------------------------------
// Block/event trigger processing
// ---------------------------------------------------------------------------
/**
 * Run a chain's block through its block/event-triggered actions. The
 * monitor already queried the chain's enabled block/event actions (to
 * decide whether to fetch the block at all) and passes the rows in, so
 * this stays a pure fan-out with no extra DB round-trip.
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
  chainId: number,
  actions: ActionRow[],
): Promise<void> {
  for (const action of actions) {
    const config = action.trigger_config as unknown as TriggerConfig;

    if (action.trigger_type === "block") {
      const everyN = config.everyNthBlock ?? 1;
      if (blockNumber % everyN !== 0) continue;

      const event: TriggerEvent = {
        type: "block",
        blockNumber,
        transactionCount: txs.length,
        chainId,
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

      const matchingLogs = logs.filter((log) => {
        if (log.address.toLowerCase() !== contractAddress) return false;
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
          chainId,
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
export async function initScheduler(): Promise<void> {
  console.log("[scheduler] initializing action scheduler...");
  const actions = await getEnabledPeriodicActions();

  for (const action of actions) {
    registerAction(action);
  }

  console.log(
    `[scheduler] initialized with ${actions.length} periodic schedules (all chains)`,
  );
}

export function getSchedulerStatus(): {
  scheduledCount: number;
  actionIds: number[];
} {
  return {
    scheduledCount: scheduledActions.size,
    actionIds: Array.from(scheduledActions.keys()),
  };
}
