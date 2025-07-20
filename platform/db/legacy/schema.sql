CREATE TABLE IF NOT EXISTS legacy_citizens (
  legacy_id SERIAL PRIMARY KEY,
  national_id VARCHAR(32) NOT NULL UNIQUE,
  full_name VARCHAR(255) NOT NULL,
  date_of_birth DATE,
  registration_date TIMESTAMP NOT NULL DEFAULT NOW(),
  status VARCHAR(32) NOT NULL DEFAULT 'archived',
  region_code VARCHAR(16),
  metadata JSONB DEFAULT '{}'::jsonb,
  modern_citizen_id INTEGER,
  synced_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS legacy_documents (
  legacy_doc_id SERIAL PRIMARY KEY,
  legacy_citizen_id INTEGER REFERENCES legacy_citizens(legacy_id),
  document_type VARCHAR(64) NOT NULL,
  reference_number VARCHAR(64) NOT NULL UNIQUE,
  issued_date DATE,
  expiry_date DATE,
  status VARCHAR(32) NOT NULL DEFAULT 'archived',
  file_path VARCHAR(512),
  metadata JSONB DEFAULT '{}'::jsonb,
  synced_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS legacy_cases (
  case_id SERIAL PRIMARY KEY,
  case_number VARCHAR(64) NOT NULL UNIQUE,
  legacy_citizen_id INTEGER REFERENCES legacy_citizens(legacy_id),
  case_type VARCHAR(64) NOT NULL,
  opened_date DATE NOT NULL,
  closed_date DATE,
  status VARCHAR(32) NOT NULL DEFAULT 'closed',
  summary TEXT,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS legacy_compliance_reports (
  report_id SERIAL PRIMARY KEY,
  report_code VARCHAR(64) NOT NULL UNIQUE,
  ministry_code VARCHAR(16) NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  generated_date TIMESTAMP NOT NULL DEFAULT NOW(),
  status VARCHAR(32) NOT NULL DEFAULT 'archived',
  summary TEXT,
  record_count INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_legacy_citizens_national_id ON legacy_citizens(national_id);
CREATE INDEX IF NOT EXISTS idx_legacy_citizens_modern ON legacy_citizens(modern_citizen_id);
CREATE INDEX IF NOT EXISTS idx_legacy_documents_citizen ON legacy_documents(legacy_citizen_id);
CREATE INDEX IF NOT EXISTS idx_legacy_cases_citizen ON legacy_cases(legacy_citizen_id);
