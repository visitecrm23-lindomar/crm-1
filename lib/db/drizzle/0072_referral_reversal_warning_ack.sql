ALTER TABLE "referrals" ADD COLUMN IF NOT EXISTS "reversal_warning_acknowledged_at" timestamp with time zone;
