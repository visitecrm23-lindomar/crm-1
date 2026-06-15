CREATE TABLE IF NOT EXISTS "tenant_integrations" (
  "id" text PRIMARY KEY NOT NULL,
  "tenant_id" text NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "type" text NOT NULL,
  "name" text,
  "config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "secrets_encrypted" text,
  "environment" text DEFAULT 'production' NOT NULL,
  "enabled" boolean DEFAULT false NOT NULL,
  "status" text DEFAULT 'disconnected' NOT NULL,
  "last_error" text,
  "last_sync_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "tenant_integrations_tenant_type_uq" UNIQUE("tenant_id","type")
);

CREATE TABLE IF NOT EXISTS "tenant_integration_logs" (
  "id" text PRIMARY KEY NOT NULL,
  "tenant_id" text NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "type" text NOT NULL,
  "event" text NOT NULL,
  "level" text DEFAULT 'info' NOT NULL,
  "message" text NOT NULL,
  "actor_id" text,
  "actor_name" text,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "tenant_integration_logs_tenant_idx"
  ON "tenant_integration_logs" ("tenant_id", "type", "created_at");

ALTER TABLE "ai_integrations" ADD COLUMN IF NOT EXISTS "name" text;
ALTER TABLE "ai_integrations" ADD COLUMN IF NOT EXISTS "access_token_encrypted" text;
ALTER TABLE "ai_integrations" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'production' NOT NULL;
