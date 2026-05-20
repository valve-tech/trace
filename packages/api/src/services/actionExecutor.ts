// ============================================================================
// Action executor — child-process isolation with Node's permission model
// ============================================================================
// Predecessor used `node:vm` (NOT a security boundary — sandboxed code could
// reach host globals via `Buffer.constructor("return process")()` and friends).
// Current implementation spawns user code in a separate Node process locked
// down with the permission model:
//
//   --permission                    enable the model (default-deny)
//   --allow-fs-read=<repo>          read-only fs (modules must be loadable)
//   --no-warnings                   silence experimental-flag noise
//
// Implicitly denied: fs-write, child_process, worker_threads, addons, wasi.
// Network is always allowed under the permission model (Node design choice),
// which is what we want — user code needs to make RPC calls.
//
// Layout (all under the 200-LOC threshold):
//   actionExecutor/types.ts        public ExecutionResult/TriggerEvent + wire types
//   actionExecutor/childEnv.ts     REPO_ROOT, TIMEOUT_MS, env allow-list
//   actionExecutor/childScript.ts  the embedded user-code runner
//   actionExecutor/runInChild.ts   spawn + drive request/response with timeout
//   actionExecutor/executeAction.ts public entry point with logging + storage
//
// Limitations:
//   - Fs-read is granted to the whole repo so Node can resolve modules. User
//     code can read source files but cannot read .env (filtered out of the
//     child env block in childEnv.ts).
//   - Spawning costs ~50-100ms. Fine for scheduled actions; tight for
//     sub-100ms hot paths.
// ============================================================================

export type {
  ExecutionResult,
  TriggerEvent,
} from "./actionExecutor/types.js";
export { executeAction } from "./actionExecutor/executeAction.js";
