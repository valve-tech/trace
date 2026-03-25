# Feature 08 — Transaction Step Debugger

## Problem

The existing debugger (Feature 05) shows opcode traces in a paginated table, but developers need a **Tenderly-style step-through debugger** where they can navigate opcode-by-opcode and see the EVM state (stack, memory, storage) at each execution step.

## Design References

- [Tenderly Debugger](https://docs.tenderly.co/debugger) — gold standard, opcode-level with SLOAD/SSTORE toggles
- [Remix IDE Debugger](https://remix-ide.readthedocs.io/en/latest/debugger.html) — slider + panels for stack/memory/storage
- [Dbgereum](https://0x0abd.github.io/Dbgereum/) — minimal EVM debugger with disassembly/stack/memory/storage boxes

## Layout

Four-panel layout (inspired by Tenderly + traditional debuggers):

```
┌──────────────────────────────────────────────────────────┐
│  [tx hash input] [Load] [Step Controls: |< < > >| ⏭ ]  │
├────────────────────────┬─────────────────────────────────┤
│                        │  STACK                          │
│  EXECUTION TRACE       │  [word 0] [word 1] ...          │
│  (opcode list with     ├─────────────────────────────────┤
│   current step         │  MEMORY                         │
│   highlighted,         │  0x00: aa bb cc dd ...  | ASCII │
│   auto-scrolling)      ├─────────────────────────────────┤
│                        │  STORAGE                        │
│                        │  slot → value (changed slots    │
│                        │  highlighted)                   │
├────────────────────────┴─────────────────────────────────┤
│  CALL CONTEXT: Main → Router.swap() → Pair.swap()       │
└──────────────────────────────────────────────────────────┘
```

## Features

### Step Controls
- **Step Forward** (→ or Space): advance one opcode
- **Step Backward** (←): go back one opcode
- **Jump to Start** (Home): go to first opcode
- **Jump to End** (End): go to last opcode
- **Next CALL** (C): jump to next CALL/DELEGATECALL/STATICCALL/CREATE
- **Next SSTORE** (S): jump to next storage write
- **Next LOG** (L): jump to next event emission
- **Slider**: drag to any position in the trace
- **Step counter**: "Step 1,234 / 50,000"

### Execution Trace Panel (left)
- Vertical list of opcodes: `[step] [PC] [opcode] [gas]`
- Current step row highlighted with accent color
- Auto-scrolls to keep current step visible
- Color-coded by opcode category:
  - Blue: Stack ops (PUSH, POP, DUP, SWAP)
  - Green: Memory ops (MLOAD, MSTORE, MSTORE8)
  - Orange: Storage ops (SLOAD, SSTORE)
  - Red: External calls (CALL, DELEGATECALL, STATICCALL, CREATE)
  - Purple: Log ops (LOG0-LOG4)
  - Gray: Arithmetic, comparison, control flow
- Gas cost shown per opcode (highlight expensive ones)
- Quick filter by opcode category

### Stack Panel (top right)
- Shows full EVM stack at current step
- Each entry is a 32-byte hex word
- Top of stack (TOS) at position 0
- When stepping, highlight entries that changed
- Truncated display with expand-on-click for full 32-byte values

### Memory Panel (middle right)
- Hex dump view: `offset: hex bytes | ASCII`
- 16 bytes per row
- Highlight bytes that changed in this step
- Show memory size in the header
- Collapsible sections for large memory regions

### Storage Panel (bottom right)
- Show storage slots accessed in this step
- SLOAD: show slot → value read
- SSTORE: show slot → old value → new value (with diff highlighting)
- Cumulative storage changes toggle: show all storage writes so far

### Call Context Bar (bottom)
- Breadcrumb showing the current call depth
- e.g., `EOA → 0xRouter.swap(tokenA, tokenB, amount) → 0xPair.swap(amount0, amount1)`
- Click any level to filter trace to that call frame
- Decoded function names when ABI is available

## Data Requirements

The existing `debug_traceTransaction` with struct logger already returns:
- `pc`: program counter
- `op`: opcode name
- `gas`: gas remaining
- `gasCost`: gas cost of this opcode
- `depth`: call depth
- `stack`: array of hex strings (stack contents)
- `memory`: hex string (memory contents)
- `storage`: object mapping slot → value (storage at this point)

No backend changes needed — the struct logger trace already provides everything.

## Technical Approach

1. Fetch the full struct logger trace via `GET /api/debug/tx/:hash/opcodes?limit=50000`
2. Store the entire trace in component state
3. Navigate with a step index (`currentStep`)
4. At each step, display:
   - `steps[currentStep].stack`
   - `steps[currentStep].memory`
   - `steps[currentStep].storage`
   - Diff against `steps[currentStep - 1]` for change highlighting
5. Keyboard shortcuts for navigation
6. Virtual scrolling for the opcode list (only render visible rows)

## Performance Considerations

- Traces can be 50,000+ steps. Use virtual scrolling for the opcode list.
- Stack/memory/storage diffs should be computed lazily (only for current step).
- Memory display should be paginated (show first 1KB, expand on demand).
- Consider Web Workers for heavy diff computation on very large traces.
