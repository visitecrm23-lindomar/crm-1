ALTER TABLE "trips" ADD COLUMN IF NOT EXISTS "free_passengers" json DEFAULT '[]'::json;
