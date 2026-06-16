-- Migration 0058: Backfill confirmed_seats and reserved_seats on trips
-- Fixes trip cost reports for reservations created before seat-counter tracking.
-- confirmed_seats = seats from reservations with status 'confirmed' or 'completed'
-- reserved_seats  = seats from reservations with status 'pending'

UPDATE trips t
SET
  confirmed_seats = COALESCE((
    SELECT SUM(array_length(r.seats, 1))
    FROM reservations r
    WHERE r.trip_id = t.id
      AND r.status IN ('confirmed', 'completed')
      AND array_length(r.seats, 1) IS NOT NULL
  ), 0),
  reserved_seats = COALESCE((
    SELECT SUM(array_length(r.seats, 1))
    FROM reservations r
    WHERE r.trip_id = t.id
      AND r.status = 'pending'
      AND array_length(r.seats, 1) IS NOT NULL
  ), 0);
