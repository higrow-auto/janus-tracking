ALTER TABLE referral_programs ALTER COLUMN group_redirect_url DROP NOT NULL;
ALTER TABLE referral_programs ADD COLUMN IF NOT EXISTS webhook_url TEXT;
