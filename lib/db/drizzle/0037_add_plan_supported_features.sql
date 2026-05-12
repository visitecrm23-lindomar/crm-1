ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "supported_features" json DEFAULT '[]'::json NOT NULL;
