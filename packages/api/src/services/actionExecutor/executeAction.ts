import {
  type ActionRow,
  addLog,
  getActionStorage,
  setActionStorage,
} from "../actionsDb.js";
import type { ExecutionResult, TriggerEvent } from "./types.js";
import { TIMEOUT_MS } from "./childEnv.js";
import { runInChild } from "./runInChild.js";

/**
 * Execute a user-defined action in a sandboxed child process.
 * Public API kept identical to the previous node:vm-based executor:
 * same input (ActionRow + TriggerEvent), same ExecutionResult shape, same
 * persistence side effects (setActionStorage + addLog).
 *
 * Errors are caught and turned into a failed-but-logged result; the
 * caller (routes/actionScheduler) never sees an unhandled rejection.
 */
export async function executeAction(
  action: ActionRow,
  triggerEvent: TriggerEvent,
): Promise<ExecutionResult> {
  const startTime = Date.now();
  const secrets = (action.secrets ?? {}) as Record<string, string>;
  const storageData = await getActionStorage(action.id);

  const rpcUrl =
    process.env.PULSECHAIN_RPC_URL || "https://rpc.pulsechain.com";

  try {
    const result = await runInChild({
      code: action.code,
      event: triggerEvent,
      secrets,
      storage: storageData,
      rpcUrl,
      timeoutMs: TIMEOUT_MS,
    });

    // Replace storage wholesale — child returned a fresh object that
    // reflects every set/delete the user code performed.
    await setActionStorage(action.id, result.storage);

    const duration = Date.now() - startTime;
    const success = result.error === undefined;
    const final: ExecutionResult = {
      success,
      stdout: result.stdout.join("\n"),
      stderr: result.stderr.join("\n"),
      duration_ms: duration,
      ...(success ? {} : { error: result.error }),
    };

    await addLog({
      action_id: action.id,
      duration_ms: duration,
      success,
      stdout: final.stdout,
      stderr: final.stderr,
      trigger_data: JSON.stringify(triggerEvent),
    });

    return final;
  } catch (err: unknown) {
    const duration = Date.now() - startTime;
    const errorMessage = err instanceof Error ? err.message : String(err);

    const final: ExecutionResult = {
      success: false,
      stdout: "",
      stderr: `[fatal] ${errorMessage}`,
      duration_ms: duration,
      error: errorMessage,
    };

    await addLog({
      action_id: action.id,
      duration_ms: duration,
      success: false,
      stdout: final.stdout,
      stderr: final.stderr,
      trigger_data: JSON.stringify(triggerEvent),
    });

    return final;
  }
}
