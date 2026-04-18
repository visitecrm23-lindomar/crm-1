CREATE UNIQUE INDEX IF NOT EXISTS trips_tenant_manifest_number_unique
  ON trips (tenant_id, manifest_number)
  WHERE manifest_number IS NOT NULL;
