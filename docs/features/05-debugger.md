# Feature 5: Smart Contract Debugger & Gas Profiler

**Status: TODO**

## Overview
Step-by-step EVM execution debugger for any transaction. Inspect every opcode, stack state, memory, storage changes. Gas profiler shows per-function cost breakdown with flamegraph visualization.

## Endpoints
- `GET /api/debug/tx/:hash` — Full execution trace for a transaction
- `POST /api/debug/trace` — Trace a simulated transaction (not on-chain)
- `GET /api/debug/tx/:hash/gas-profile` — Gas profiler breakdown
- `GET /api/debug/tx/:hash/state-diff` — Pre/post state diff
- `GET /api/debug/tx/:hash/call-tree` — Call tree visualization data

## Debugger Capabilities
- Full opcode-level execution trace
- Step forward/backward through execution
- Step into/over/out of internal calls
- Inspect at each step: program counter, opcode, gas remaining, stack, memory, storage
- Source code mapping (if verified Solidity source available)
- Highlight current line in source code
- Breakpoints on opcodes, function calls, or source lines
- Watch expressions for storage slots and variables

## Gas Profiler Capabilities
- Per-function gas breakdown (which functions cost the most)
- Per-opcode gas costs
- Flamegraph visualization of gas by call depth
- Compare gas across simulation variants
- Identify expensive operations (SSTORE, CREATE, external calls)

## Trace Data Structure
```json
{
  "txHash": "0x...",
  "gasUsed": 145000,
  "callTree": {
    "type": "CALL",
    "from": "0x...",
    "to": "0x...",
    "function": "swap(uint256,uint256,address,bytes)",
    "gasUsed": 120000,
    "children": [
      {
        "type": "CALL",
        "to": "0x...",
        "function": "transfer(address,uint256)",
        "gasUsed": 35000,
        "children": []
      }
    ]
  },
  "steps": [
    {
      "pc": 0,
      "op": "PUSH1",
      "gas": 8000000,
      "gasCost": 3,
      "depth": 1,
      "stack": [],
      "memory": "0x",
      "storage": {}
    }
  ]
}
```

## Backend Architecture
- Uses `debug_traceTransaction` with `{ tracer: "callTracer" }` for call tree
- Uses `debug_traceTransaction` with default struct tracer for opcode-level steps
- Requires Reth node with `--http.api debug` enabled
- Trace results cached (they're immutable for mined txs)
- For simulated txs, uses `debug_traceCall`
- Source mapping service matches opcodes to Solidity lines using compiler output

## Frontend Components
- **Debugger view** — split pane:
  - Left: source code with line highlighting
  - Right: step controls (play/pause/step/step-into/step-out)
  - Bottom panels: stack, memory, storage, call stack
- **Gas profiler** — flamegraph (SVG/Canvas) showing gas by function
- **Call tree view** — collapsible tree of internal calls with gas per node
- **State diff tab** — before/after values for changed storage slots
- **Opcode table** — scrollable list of every opcode with gas costs

## Dependencies
- Reth node with debug namespace enabled (NOT available via public RPC)
- Verified contract source code (from BlockScout) for source mapping
- Solidity compiler metadata for source maps
