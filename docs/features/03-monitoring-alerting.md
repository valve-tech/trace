# Feature 3: Monitoring & Alerting

**Status: TODO**

## Overview
Watch addresses, contracts, and events on PulseChain. Get real-time alerts via Slack, Discord, Telegram, email, or webhooks when conditions are met.

## Endpoints
- `POST /api/alerts` — Create a new alert rule
- `GET /api/alerts` — List all alert rules
- `GET /api/alerts/:id` — Get alert details + history
- `PUT /api/alerts/:id` — Update alert rule
- `DELETE /api/alerts/:id` — Delete alert rule
- `GET /api/alerts/:id/history` — Alert trigger history
- `WebSocket /ws/alerts` — Real-time alert stream

## Alert Types
1. **Address Activity** — any tx to/from an address
2. **Contract Event** — specific event signature emitted by a contract
3. **Function Call** — specific function called on a contract
4. **Balance Change** — PLS or token balance crosses threshold
5. **Failed Transaction** — any tx from/to address that reverts
6. **Token Transfer** — ERC-20/721/1155 transfer involving address
7. **New Contract Deploy** — contract created by address
8. **Gas Price** — gas price crosses threshold
9. **Block-based** — custom condition checked every N blocks

## Alert Rule Schema
```json
{
  "name": "Large WPLS Transfer",
  "type": "contract_event",
  "conditions": {
    "address": "0xA1077a294dDE1B09bB078844df40758a5D0f9a27",
    "event": "Transfer(address,address,uint256)",
    "filters": {
      "value": { "gte": "1000000000000000000000000" }
    }
  },
  "notifications": [
    { "channel": "webhook", "url": "https://..." },
    { "channel": "discord", "webhookUrl": "https://..." }
  ],
  "cooldown": 60
}
```

## Notification Channels
- **Webhook** — POST JSON to any URL
- **Discord** — via webhook URL
- **Telegram** — via Bot API
- **Slack** — via webhook URL
- **Email** — via SMTP/SendGrid (future)

## Backend Architecture
- **Poller service**: polls `eth_getBlockByNumber` + `eth_getLogs` every ~2s
- **Matcher engine**: evaluates new blocks/logs against active alert rules
- **Notification dispatcher**: sends to configured channels with rate limiting
- **Storage**: SQLite/PostgreSQL for alert rules, trigger history
- **WebSocket server**: pushes matched alerts to connected clients in real-time

## Frontend Components
- **Alert dashboard** — list of active alerts with status, last triggered
- **Alert builder** — form to create/edit alert rules with condition builder
- **Alert history** — timeline of triggered alerts with tx details
- **Notification settings** — configure channels per alert
- **Live feed** — real-time stream of matched alerts via WebSocket
