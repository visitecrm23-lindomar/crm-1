CREATE TABLE IF NOT EXISTS "client_achievements" (
  "id" text PRIMARY KEY NOT NULL,
  "client_id" text NOT NULL,
  "tenant_id" text NOT NULL,
  "badge_key" text NOT NULL,
  "earned_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "client_achievements_unique_badge" UNIQUE ("client_id", "tenant_id", "badge_key")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "client_achievements_tenant_client_idx" ON "client_achievements" ("tenant_id", "client_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "client_dream_destinations" (
  "id" text PRIMARY KEY NOT NULL,
  "client_id" text NOT NULL,
  "tenant_id" text NOT NULL,
  "destination_name" text NOT NULL,
  "note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "client_dream_destinations_tenant_client_idx" ON "client_dream_destinations" ("tenant_id", "client_id");
