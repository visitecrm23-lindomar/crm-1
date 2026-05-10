-- Allow reservations to remain when a client is deleted (preserve history)
ALTER TABLE "reservations" ALTER COLUMN "client_id" DROP NOT NULL;
