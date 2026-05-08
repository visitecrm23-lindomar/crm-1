ALTER TABLE "email_logs" ADD COLUMN IF NOT EXISTS "retries_resolved_at" timestamp with time zone;
