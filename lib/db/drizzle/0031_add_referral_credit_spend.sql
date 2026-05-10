ALTER TABLE "referrals" ADD COLUMN IF NOT EXISTS "bonus_credit_used_at" timestamp with time zone;
ALTER TABLE "referrals" ADD COLUMN IF NOT EXISTS "bonus_credit_order_id" text;
