# Design: Fork-Based Simulation with State Diffs

## Overview

Enhance the simulation system to use Anvil forks instead of `eth_call`, enabling real state propagation and comprehensive state diff visualization. Users paste a tx hash or raw calldata — the system re-executes on a temporary fork and shows exactly what changed: storage slots, balances, nonces, events, and decoded source-level variable names.

## User Flow

### Flow 1: Re-simulate by tx hash
1. User pastes a tx hash into the simulation form
2. Backend fetches the original tx params (from, to, value, data) and block number
3. Spins up an Anvil fork at `blockNumber - 1` (the block before the tx)
4. Captures pre-state: balances, storage for involved addresses
5. Executes the tx on the fork
6. Captures post-state: balances, storage
7. Computes diffs and returns to frontend
8. User clicks "Debug" to jump into the step debugger with source + Slither

### Flow 2: Simulate raw calldata
1. User fills in from/to/value/data (existing form) and optionally a block number
2. Same fork + state diff flow as above
3. Block number defaults to latest if not specified

## Backend

### New service: `forkSimulator.ts`

```typescript
interface ForkSimulationRequest {
  from: string;
  to: string;
  value?: string;       // wei hex
  data?: string;        // calldata hex
  blockNumber?: number; // fork at this block (or latest)
  gasLimit?: number;
}

interface StateDiff {
  balanceChanges: Array<{
    address: string;
    before: string;  // wei
    after: string;   // wei
    delta: string;   // wei (signed)
  }>;
  storageChanges: Array<{
    address: string;
    contractName?: string;
    slot: string;
    before: string;
    after: string;
    decodedName?: string;  // variable name from storage layout
  }>;
  nonceChanges: Array<{
    address: string;
    before: number;
    after: number;
  }>;
}

interface ForkSimulationResult {
  success: boolean;
  returnData: string;
  gasUsed: string;
  revertReason?: string;
  stateDiff: StateDiff;
  logs: DecodedEvent[];
  trace?: CallFrame;      // call tree from the fork's debug API
  forkRpcUrl: string;     // temporary fork URL for further inspection
  blockNumber: number;
}
```

**Implementation:**
1. Create a temp fork via `forkManager.createFork()` at specified block
2. Use `anvil_impersonateAccount` to impersonate the `from` address
3. Capture pre-state:
   - `eth_getBalance` for from, to, and any addresses in the call tree
   - `eth_getStorageAt` for known slots (from previous simulations or ABI)
4. Send the transaction via `eth_sendTransaction`
5. Capture post-state (same calls)
6. Compute diffs
7. If debug APIs available on the fork (they are — Anvil supports them): run `debug_traceTransaction` to get the call tree and opcode trace
8. Destroy the fork after 60s TTL (or immediately if one-shot)

### New endpoint: `POST /api/simulate/fork`

Body: `ForkSimulationRequest`
Response: `ForkSimulationResult`

### Enhancement to existing: `POST /api/simulate/from-hash`

Body: `{ txHash: string }`
1. Fetch tx by hash from chain
2. Extract from, to, value, data, blockNumber
3. Call the fork simulation with `blockNumber - 1`
4. Return `ForkSimulationResult` plus the original tx metadata

### State diff collection strategy

Anvil forks support `debug_traceTransaction` with `prestateTracer` which returns all accessed storage slots and their pre-state values. Combined with `eth_getStorageAt` calls after execution, we get complete before/after for every touched slot.

For balance changes: trace the `CALL`, `SELFDESTRUCT`, and value transfers, then verify with `eth_getBalance` before/after.

## Frontend

### Enhanced SimulationForm
- Add "Tx Hash" input mode toggle (paste hash OR manual entry)
- When hash is pasted: auto-populate from/to/value/data fields (read-only)
- Add "Fork Simulate" button (uses the fork endpoint instead of eth_call)
- Show block number selector (default: tx's block or latest)

### New component: `StateDiffPanel.tsx`
- Three sections: Balance Changes, Storage Changes, Nonce Changes
- Balance changes: table with address, before, after, delta (green +/red -)
- Storage changes: table with contract, slot, variable name (if decoded), before → after
- Collapsible per-contract grouping
- Link addresses/contracts to the explorer

### Simulation → Debugger bridge
- "Debug this transaction" button on simulation results
- Opens `/debugger` with the fork's trace data pre-loaded
- Source code + Slither findings automatically loaded for the target contract

## Fork lifecycle
- Temp forks auto-destroy after 60s (configurable)
- Use a separate pool from the persistent testnets
- Cap at 5 concurrent simulation forks to prevent resource exhaustion

## Integration with existing features
- Source code viewer: auto-fetches verified source for the `to` address
- Slither: "Analyze" button available on the simulation result
- Step debugger: receives the fork's opcode trace directly
- Storage variable decoding: uses the compiler's storage layout from verified source
