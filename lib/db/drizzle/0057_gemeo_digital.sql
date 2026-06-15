-- Migration 0057: Gêmeo Digital do Negócio
-- Tables: gemeo_alerts, gemeo_opportunities

CREATE TABLE IF NOT EXISTS "gemeo_alerts" (
  "id"           text PRIMARY KEY NOT NULL,
  "tenant_id"    text NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "message"      text NOT NULL,
  "category"     text NOT NULL,
  "severity"     text NOT NULL DEFAULT 'medium',
  "action_url"   text,
  "dismissed_at" timestamp with time zone,
  "generated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "created_at"   timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "gemeo_alerts_tenant_idx"
  ON "gemeo_alerts"("tenant_id", "generated_at");

CREATE TABLE IF NOT EXISTS "gemeo_opportunities" (
  "id"           text PRIMARY KEY NOT NULL,
  "tenant_id"    text NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "title"        text NOT NULL,
  "description"  text,
  "action_url"   text,
  "generated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "dismissed_at" timestamp with time zone,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "gemeo_opportunities_tenant_idx"
  ON "gemeo_opportunities"("tenant_id", "generated_at");
