# Feature 2: Transaction Explorer / Decoder

**Status: TODO**

## Overview
Look up any transaction by hash and see a fully decoded, human-readable breakdown: function called, parameters, events emitted, internal transactions, token transfers, balance changes, and gas usage.

## Endpoints
- `GET /api/tx/:hash` — Full decoded transaction details
- `GET /api/tx/:hash/internal` — Internal transactions
- `GET /api/tx/:hash/logs` — Decoded event logs
- `GET /api/tx/:hash/transfers` — Token transfers (ERC-20, ERC-721, ERC-1155)
- `GET /api/address/:address/txs` — Transaction history for an address
- `GET /api/contract/:address` — Contract info, ABI, source code
- `GET /api/block/:number` — Block details with transaction list

## Backend Capabilities
- Fetch transaction receipt + trace from RPC
- Fetch internal transactions from BlockScout (`txlistinternal`)
- Fetch token transfers from BlockScout (`tokentx`)
- Auto-fetch ABI from BlockScout for all involved contracts
- Decode input calldata → function name + typed parameters
- Decode event logs → event name + typed parameters
- Calculate balance changes (PLS + tokens) per address
- Parse revert reasons from failed transactions
- Cache decoded transactions and ABIs

## Frontend Components
- **Transaction search bar** — paste tx hash, navigate to detail view
- **Transaction detail page** — tabbed view:
  - Overview: status, block, gas, value, from/to with labels
  - Function call: decoded input with parameter names/types/values
  - Events: decoded logs in a table
  - Internal txs: tree view of internal calls
  - Token transfers: table of ERC-20/721/1155 movements
  - State changes: storage slot diffs (if trace available)
  - Raw data: hex input, output, logs
- **Address page** — transaction history, token balances, contract info
- **Block page** — block details, transaction list
- **Contract page** — ABI, source code viewer, read/write interface

## Data Sources
- `eth_getTransactionByHash` — tx details
- `eth_getTransactionReceipt` — receipt, logs, status
- `eth_getBlockByNumber` — block info
- BlockScout `txlistinternal` — internal transactions
- BlockScout `tokentx` — token transfers
- BlockScout `getabi` / `getsourcecode` — contract ABIs
- BlockScout `tokenlist` — tokens held by address
- `debug_traceTransaction` (Reth node) — full execution trace (optional)
