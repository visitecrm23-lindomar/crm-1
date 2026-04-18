-- Add crew details and manifest number to trips table
ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS driver1_cpf text,
  ADD COLUMN IF NOT EXISTS driver1_cnh text,
  ADD COLUMN IF NOT EXISTS driver1_cnh_category text,
  ADD COLUMN IF NOT EXISTS driver1_cnh_expiry text,
  ADD COLUMN IF NOT EXISTS driver2_name text,
  ADD COLUMN IF NOT EXISTS driver2_cpf text,
  ADD COLUMN IF NOT EXISTS driver2_cnh text,
  ADD COLUMN IF NOT EXISTS driver2_cnh_category text,
  ADD COLUMN IF NOT EXISTS driver2_cnh_expiry text,
  ADD COLUMN IF NOT EXISTS tour_guide_cpf text,
  ADD COLUMN IF NOT EXISTS tour_guide_registration text,
  ADD COLUMN IF NOT EXISTS manifest_number text;
