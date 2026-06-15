-- Migration 0056: App do Guia e Check-in Digital
-- Tables: trip_checkins, trip_guide_locations, trip_guide_tokens

CREATE TABLE IF NOT EXISTS "trip_checkins" (
  "id"                      text PRIMARY KEY,
  "trip_id"                 text NOT NULL REFERENCES "trips"("id") ON DELETE CASCADE,
  "tenant_id"               text NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "passenger_id"            text NOT NULL,
  "reservation_id"          text,
  "checked_in_by_user_ref"  text,
  "checked_in_at"           timestamp with time zone NOT NULL DEFAULT now(),
  "notes"                   text,
  "status"                  text NOT NULL DEFAULT 'present',
  "created_at"              timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "trip_checkins_trip_tenant_idx" ON "trip_checkins"("trip_id", "tenant_id");
CREATE UNIQUE INDEX IF NOT EXISTS "trip_checkins_passenger_uniq" ON "trip_checkins"("trip_id", "passenger_id");

CREATE TABLE IF NOT EXISTS "trip_guide_locations" (
  "trip_id"        text NOT NULL REFERENCES "trips"("id") ON DELETE CASCADE,
  "tenant_id"      text NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "guide_user_ref" text,
  "guide_name"     text,
  "lat"            numeric(10,6) NOT NULL,
  "lng"            numeric(10,6) NOT NULL,
  "recorded_at"    timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "trip_guide_locations_pkey" PRIMARY KEY ("trip_id", "tenant_id")
);

CREATE TABLE IF NOT EXISTS "trip_guide_tokens" (
  "id"                   text PRIMARY KEY,
  "trip_id"              text NOT NULL REFERENCES "trips"("id") ON DELETE CASCADE,
  "tenant_id"            text NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "guide_name"           text NOT NULL,
  "token"                text NOT NULL,
  "expires_at"           timestamp with time zone NOT NULL,
  "created_by_user_id"   text,
  "created_at"           timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "trip_guide_tokens_token_uniq" ON "trip_guide_tokens"("token");
