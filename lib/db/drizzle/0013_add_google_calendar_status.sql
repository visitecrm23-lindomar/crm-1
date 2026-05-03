-- Track Google Calendar connection health so the UI can prompt users to reconnect.
-- Default 'disconnected'; set to 'connected' on successful OAuth callback/refresh,
-- and to 'invalid' when Google returns invalid_grant / 401 / invalid_token.
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_calendar_status text NOT NULL DEFAULT 'disconnected';
-- Backfill: users that already have the calendar enabled should be marked connected.
UPDATE users SET google_calendar_status = 'connected' WHERE google_calendar_enabled = true AND google_calendar_status = 'disconnected';
