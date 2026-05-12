ALTER TABLE "referral_settings" ADD COLUMN IF NOT EXISTS "bonus_release_email_enabled" boolean NOT NULL DEFAULT true;
