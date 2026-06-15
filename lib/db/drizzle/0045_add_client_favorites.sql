CREATE TABLE IF NOT EXISTS "client_favorites" (
  "id" text PRIMARY KEY NOT NULL,
  "tenant_id" text NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "client_id" text NOT NULL REFERENCES "clients"("id") ON DELETE cascade,
  "item_type" text NOT NULL,
  "item_id" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "client_favorites_unique_idx"
  ON "client_favorites" ("client_id", "item_type", "item_id");

CREATE INDEX IF NOT EXISTS "client_favorites_client_idx"
  ON "client_favorites" ("client_id", "created_at");
