ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "trigger_type" text NOT NULL DEFAULT 'manual';
--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "trigger_config" json;
--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "auto_enabled" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "campaign_sends" (
  "id" text PRIMARY KEY NOT NULL,
  "campaign_id" text NOT NULL REFERENCES "campaigns"("id") ON DELETE CASCADE,
  "client_id" text NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "tenant_id" text NOT NULL,
  "sent_at" timestamp with time zone NOT NULL DEFAULT now(),
  "status" text NOT NULL DEFAULT 'sent',
  "error" text
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "campaign_sends_unique" ON "campaign_sends" ("campaign_id", "client_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "campaign_sends_tenant_idx" ON "campaign_sends" ("tenant_id", "sent_at");
