-- Keep exhausted-retry alerts visible indefinitely until staff manually resolves them.
-- The retriesExhaustedAt column is stamped by the retry worker when all auto-retries
-- are exhausted. The alerts query uses this flag instead of a 24-hour time window.
ALTER TABLE "email_logs" ADD COLUMN IF NOT EXISTS "retries_exhausted_at" timestamptz;
