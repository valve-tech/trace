-- 4byte function/event signature cache

CREATE TABLE IF NOT EXISTS signature_cache (
  selector TEXT NOT NULL,
  sig_type TEXT NOT NULL DEFAULT 'function',
  text_signature TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_signature_cache_selector_sig
  ON signature_cache(selector, text_signature);

CREATE INDEX IF NOT EXISTS idx_signature_cache_selector
  ON signature_cache(selector);
