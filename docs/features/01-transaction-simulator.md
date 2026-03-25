# Feature 1: Transaction Simulator

**Status: DONE**

## Overview
Simulate any transaction before sending it on-chain. Preview asset changes, gas costs, success/failure, and decoded outputs. Supports state overrides and account impersonation.

## Endpoints
- `POST /api/simulate` — Single transaction simulation
- `POST /api/simulate-bundle` — Sequential multi-tx bundle simulation

## Capabilities
- Simulate via `eth_call` with full state override support
- Account impersonation (any `from` address without private key)
- State overrides: balance, nonce, code, storage slot diffs
- Gas estimation via `eth_estimateGas`
- Auto-fetch ABI from BlockScout for verified contracts
- Decode function inputs, outputs, and revert reasons
- Bundle simulation with cumulative state propagation

## Files
- `packages/api/src/routes/simulate.ts`
- `packages/api/src/routes/simulateBundle.ts`
- `packages/api/src/services/simulator.ts`
- `packages/api/src/services/decoder.ts`
- `packages/api/src/services/gasEstimator.ts`
- `packages/api/src/services/rpc.ts`
- `packages/web/src/components/SimulationForm.tsx`
- `packages/web/src/components/SimulationResult.tsx`
- `packages/web/src/components/BundleSimulator.tsx`
- `packages/web/src/components/StateOverrides.tsx`
- `packages/web/src/components/AbiInput.tsx`
