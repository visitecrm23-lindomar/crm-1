CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "referral_campaigns"
  ADD CONSTRAINT "referral_campaigns_no_overlap"
  EXCLUDE USING gist (
    "tenant_id" WITH =,
    tstzrange("starts_at", "ends_at", '[)') WITH &&
  );
