CREATE INDEX IF NOT EXISTS email_logs_retries_exhausted_idx
  ON email_logs (tenant_id, reservation_id)
  WHERE retries_exhausted_at IS NOT NULL;
