CREATE TABLE IF NOT EXISTS referral_programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  group_redirect_url TEXT NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_referral_programs_slug ON referral_programs(slug);

CREATE TABLE IF NOT EXISTS referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID REFERENCES referral_programs(id) ON DELETE CASCADE,
  referrer_name VARCHAR(255) NOT NULL,
  referrer_phone VARCHAR(50) NOT NULL,
  referrer_email VARCHAR(255),
  invited_name VARCHAR(255) NOT NULL,
  invited_phone VARCHAR(50) NOT NULL,
  invite_code VARCHAR(12) UNIQUE NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  claimed_name VARCHAR(255),
  claimed_email VARCHAR(255),
  claimed_phone VARCHAR(50),
  claimed_at TIMESTAMP,
  whatsapp_sent BOOLEAN DEFAULT false,
  utm_data JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_referrals_invite_code ON referrals(invite_code);
CREATE INDEX IF NOT EXISTS idx_referrals_program_id ON referrals(program_id);
CREATE INDEX IF NOT EXISTS idx_referrals_status ON referrals(status);
