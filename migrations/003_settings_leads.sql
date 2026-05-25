CREATE TABLE IF NOT EXISTS platform_settings (
  key VARCHAR(100) PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lead_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(50),
  source VARCHAR(100),
  extra_data JSONB DEFAULT '{}',
  captured_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_events_email ON lead_events(email);
CREATE INDEX IF NOT EXISTS idx_lead_events_captured_at ON lead_events(captured_at);
CREATE INDEX IF NOT EXISTS idx_platform_settings_key ON platform_settings(key);
