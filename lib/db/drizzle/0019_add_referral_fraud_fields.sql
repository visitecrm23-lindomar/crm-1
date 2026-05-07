ALTER TABLE "referrals" ADD COLUMN "fraud_flag" boolean NOT NULL DEFAULT false;
ALTER TABLE "referrals" ADD COLUMN "fraud_reason" text;
