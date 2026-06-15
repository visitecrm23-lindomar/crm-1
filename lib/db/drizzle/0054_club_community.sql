ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "ambassador_opt_in" boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "club_config" (
  "id" text PRIMARY KEY NOT NULL,
  "tenant_id" text NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "club_name" text NOT NULL DEFAULT 'Clube Visite',
  "description" text,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "club_config_tenant_unique" ON "club_config"("tenant_id");

CREATE TABLE IF NOT EXISTS "club_benefits" (
  "id" text PRIMARY KEY NOT NULL,
  "tenant_id" text NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "tier" text NOT NULL,
  "benefit_key" text NOT NULL,
  "label" text NOT NULL,
  "description" text,
  "value" text,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "club_benefits_tenant_tier_idx" ON "club_benefits"("tenant_id", "tier");
