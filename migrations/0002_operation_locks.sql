CREATE TABLE IF NOT EXISTS operation_locks (
  name TEXT PRIMARY KEY,
  owner TEXT,
  expires_at TEXT
);

INSERT INTO operation_locks(name, owner, expires_at)
VALUES('payment', NULL, NULL)
ON CONFLICT(name) DO NOTHING;
