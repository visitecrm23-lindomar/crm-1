-- Migration 0062: Add file_key column to documents for UploadThing deletion support
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "file_key" text;
