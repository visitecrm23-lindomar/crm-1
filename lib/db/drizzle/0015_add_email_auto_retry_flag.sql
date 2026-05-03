-- Add is_auto_retry flag to email_logs so the retry job's entries are
-- distinguishable from original sends and manual resends.
ALTER TABLE "email_logs" ADD COLUMN IF NOT EXISTS "is_auto_retry" boolean NOT NULL DEFAULT false;
