CREATE TABLE IF NOT EXISTS "client_notifications" (
  "id" text PRIMARY KEY NOT NULL,
  "client_id" text NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "tenant_id" text NOT NULL,
  "type" text NOT NULL,
  "payload" jsonb,
  "read_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "client_notifications_client_id_idx"
  ON "client_notifications" ("client_id", "created_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "client_notifications_unread_idx"
  ON "client_notifications" ("client_id", "read_at")
  WHERE "read_at" IS NULL;
