-- Track Google Calendar connection health so the UI can prompt users to reconnect.
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_calendar_status text NOT NULL DEFAULT 'connected';
