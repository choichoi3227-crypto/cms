-- Adds hashed API credentials for hosting/automation integrations.
CREATE TABLE IF NOT EXISTS wp_api_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  token_type TEXT NOT NULL CHECK(token_type IN ('public', 'secret')),
  scopes TEXT NOT NULL,
  created_by INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT,
  last_used_at TEXT,
  revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS wp_api_tokens_active ON wp_api_tokens(token_hash, revoked_at, expires_at);
