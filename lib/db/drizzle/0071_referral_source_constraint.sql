ALTER TABLE "referrals" ADD COLUMN "source" text;

ALTER TABLE "referrals" ADD CONSTRAINT "referrals_crm_requires_reservation_id"
  CHECK (source IS DISTINCT FROM 'crm' OR reservation_id IS NOT NULL);
