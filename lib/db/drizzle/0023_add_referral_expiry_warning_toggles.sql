ALTER TABLE "referral_settings" ADD COLUMN IF NOT EXISTS "expiry_warning_7_days_enabled" boolean NOT NULL DEFAULT true;
ALTER TABLE "referral_settings" ADD COLUMN IF NOT EXISTS "expiry_warning_1_day_enabled" boolean NOT NULL DEFAULT true;
