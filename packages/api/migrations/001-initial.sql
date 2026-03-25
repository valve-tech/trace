-- Initial schema: alerts + actions (migrated from SQLite)

CREATE TABLE IF NOT EXISTS alerts (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('address_activity', 'contract_event', 'function_call', 'balance_threshold', 'failed_tx')),
  conditions JSONB NOT NULL DEFAULT '{}',
  notifications JSONB NOT NULL DEFAULT '[]',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  cooldown_seconds INTEGER NOT NULL DEFAULT 60,
  last_triggered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS alert_history (
  id SERIAL PRIMARY KEY,
  alert_id INTEGER NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tx_hash TEXT,
  block_number INTEGER,
  matched_data JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_alert_history_alert_id ON alert_history(alert_id);
CREATE INDEX IF NOT EXISTS idx_alert_history_triggered_at ON alert_history(triggered_at);

CREATE TABLE IF NOT EXISTS actions (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL DEFAULT '',
  trigger_type TEXT NOT NULL CHECK(trigger_type IN ('block', 'event', 'periodic', 'webhook')),
  trigger_config JSONB NOT NULL DEFAULT '{}',
  secrets JSONB NOT NULL DEFAULT '{}',
  storage JSONB NOT NULL DEFAULT '{}',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS action_logs (
  id SERIAL PRIMARY KEY,
  action_id INTEGER NOT NULL REFERENCES actions(id) ON DELETE CASCADE,
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  duration_ms INTEGER NOT NULL DEFAULT 0,
  success BOOLEAN NOT NULL DEFAULT FALSE,
  stdout TEXT NOT NULL DEFAULT '',
  stderr TEXT NOT NULL DEFAULT '',
  trigger_data JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_action_logs_action_id ON action_logs(action_id);
CREATE INDEX IF NOT EXISTS idx_action_logs_triggered_at ON action_logs(triggered_at);
