ALTER TABLE "referrals" ADD COLUMN IF NOT EXISTS "expiry_warning_7_sent_at" timestamp with time zone;
ALTER TABLE "referrals" ADD COLUMN IF NOT EXISTS "expiry_warning_1_sent_at" timestamp with time zone;
