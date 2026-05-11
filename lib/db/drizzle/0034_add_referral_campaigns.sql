CREATE TABLE IF NOT EXISTS "referral_campaigns" (
  "id" text PRIMARY KEY NOT NULL,
  "tenant_id" text NOT NULL,
  "name" text NOT NULL,
  "starts_at" timestamptz NOT NULL,
  "ends_at" timestamptz NOT NULL,
  "bonus_type" text NOT NULL DEFAULT 'multiplier',
  "bonus_value" numeric(10, 4) NOT NULL DEFAULT 2,
  "banner_text" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
