PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS sales (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  season TEXT NOT NULL,
  kilo REAL NOT NULL CHECK (kilo > 0),
  unit_price REAL NOT NULL CHECK (unit_price >= 0),
  gross REAL NOT NULL CHECK (gross >= 0),
  commission_rate REAL NOT NULL DEFAULT 8 CHECK (commission_rate >= 0 AND commission_rate <= 30),
  net REAL NOT NULL CHECK (net >= 0),
  received REAL NOT NULL DEFAULT 0 CHECK (received >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_sales_active_date ON sales(deleted_at, date DESC);
CREATE INDEX IF NOT EXISTS idx_sales_season ON sales(season, deleted_at);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  amount REAL NOT NULL CHECK (amount > 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payment_allocations (
  payment_id TEXT NOT NULL,
  sale_id TEXT NOT NULL,
  amount REAL NOT NULL CHECK (amount > 0),
  PRIMARY KEY(payment_id, sale_id),
  FOREIGN KEY(payment_id) REFERENCES payments(id) ON DELETE CASCADE,
  FOREIGN KEY(sale_id) REFERENCES sales(id)
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO settings(key,value) VALUES('commission_rate','8') ON CONFLICT(key) DO NOTHING;
