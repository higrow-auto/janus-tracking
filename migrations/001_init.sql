CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,
  base_url TEXT NOT NULL,
  utm_parameters JSONB DEFAULT '{}',
  split_urls JSONB DEFAULT '[]',
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_links_slug ON links(slug);
CREATE INDEX IF NOT EXISTS idx_links_active ON links(active);
CREATE INDEX IF NOT EXISTS idx_links_campaign ON links(campaign_id);

CREATE TABLE IF NOT EXISTS click_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id UUID REFERENCES links(id) ON DELETE CASCADE,
  clicked_at TIMESTAMP DEFAULT NOW(),
  ip_address VARCHAR(45),
  user_agent TEXT,
  referer TEXT,
  dynamic_params JSONB DEFAULT '{}',
  is_bot BOOLEAN DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_click_logs_link_id ON click_logs(link_id);
CREATE INDEX IF NOT EXISTS idx_click_logs_clicked_at ON click_logs(clicked_at);
CREATE INDEX IF NOT EXISTS idx_click_logs_is_bot ON click_logs(is_bot);
