CREATE TABLE IF NOT EXISTS "ai_integrations" (
  "id" text PRIMARY KEY NOT NULL,
  "tenant_id" text NOT NULL UNIQUE REFERENCES "tenants"("id") ON DELETE cascade,
  "provider" text DEFAULT 'openai' NOT NULL,
  "api_key_encrypted" text,
  "base_url" text,
  "default_model" text,
  "enabled" boolean DEFAULT false NOT NULL,
  "status" text DEFAULT 'disconnected' NOT NULL,
  "last_error" text,
  "last_sync_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "ai_integration_logs" (
  "id" text PRIMARY KEY NOT NULL,
  "tenant_id" text NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "event" text NOT NULL,
  "level" text DEFAULT 'info' NOT NULL,
  "message" text NOT NULL,
  "actor_id" text,
  "actor_name" text,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "ai_integration_logs_tenant_idx"
  ON "ai_integration_logs" ("tenant_id", "created_at");
