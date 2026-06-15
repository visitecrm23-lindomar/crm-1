ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "travel_interests" text[] NOT NULL DEFAULT '{}';
--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "likes_photos_videos" boolean;
--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "preferred_destination_types" text[] NOT NULL DEFAULT '{}';
