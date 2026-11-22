-- The Java application also creates these tables automatically on startup.
CREATE TABLE IF NOT EXISTS app_users (
  username VARCHAR(20) PRIMARY KEY,
  role VARCHAR(10) NOT NULL CHECK (role IN ('ADMIN','RESIDENT')),
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  purok TEXT,
  contact VARCHAR(20),
  address TEXT
);
CREATE TABLE IF NOT EXISTS list_items (
  id BIGSERIAL PRIMARY KEY,
  category VARCHAR(40) NOT NULL,
  row_data TEXT[] NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_list_items_category ON list_items(category, id);
CREATE TABLE IF NOT EXISTS document_requests (
  request_id VARCHAR(30) PRIMARY KEY,
  document_type TEXT NOT NULL,
  resident_name TEXT NOT NULL,
  purpose TEXT,
  request_date TEXT,
  status TEXT NOT NULL,
  completed_at TIMESTAMP,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 1)
);
ALTER TABLE document_requests ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 1);
