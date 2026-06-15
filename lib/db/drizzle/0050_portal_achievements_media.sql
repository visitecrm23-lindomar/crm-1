CREATE TABLE IF NOT EXISTS "trip_media" (
  "id" text PRIMARY KEY NOT NULL,
  "trip_id" text NOT NULL REFERENCES "trips"("id") ON DELETE CASCADE,
  "tenant_id" text NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "url" text NOT NULL,
  "type" text NOT NULL DEFAULT 'image',
  "caption" text,
  "uploaded_by_user_id" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "trip_media_trip_idx" ON "trip_media" ("trip_id", "created_at");
CREATE INDEX IF NOT EXISTS "trip_media_tenant_idx" ON "trip_media" ("tenant_id");
