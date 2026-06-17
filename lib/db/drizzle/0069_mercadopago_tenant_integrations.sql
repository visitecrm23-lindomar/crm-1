-- Migrate MercadoPago credentials from system_configs to tenant_integrations.
--
-- system_configs stored both publicKey and accessToken in a plain-text JSON
-- blob under key='mercadopago'. This migration:
--   1. Creates a tenant_integrations row for each affected tenant, placing
--      publicKey in the non-secret `config` column and the raw accessToken
--      in a temporary migration field `_mig_accessToken` (also in config).
--   2. Deletes the old system_configs rows.
--
-- The api-server startup backfill (credential-backfill.ts) runs immediately
-- after migrations and encrypts `_mig_accessToken` into `secrets_encrypted`,
-- then clears the temp field. This keeps secrets out of plain-text storage
-- as quickly as possible while avoiding the impossible task of doing AES-GCM
-- encryption inside SQL.

DO $$
DECLARE
  r RECORD;
  v_public_key  TEXT;
  v_access_token TEXT;
  v_new_id       TEXT;
BEGIN
  FOR r IN
    SELECT id, tenant_id, value
    FROM system_configs
    WHERE key = 'mercadopago'
      AND value IS NOT NULL
  LOOP
    v_public_key   := r.value->>'publicKey';
    v_access_token := r.value->>'accessToken';

    -- Generate a short unique ID using gen_random_uuid().
    v_new_id := replace(gen_random_uuid()::text, '-', '');

    INSERT INTO tenant_integrations (
      id,
      tenant_id,
      type,
      config,
      secrets_encrypted,
      environment,
      enabled,
      status,
      created_at,
      updated_at
    )
    VALUES (
      v_new_id,
      r.tenant_id,
      'mercadopago',
      jsonb_build_object(
        'publicKey',         COALESCE(v_public_key, ''),
        '_mig_accessToken',  COALESCE(v_access_token, '')
      ),
      NULL,
      'production',
      CASE WHEN v_access_token IS NOT NULL AND v_access_token <> '' THEN true ELSE false END,
      'disconnected',
      NOW(),
      NOW()
    )
    ON CONFLICT ON CONSTRAINT tenant_integrations_tenant_type_uq DO NOTHING;

    DELETE FROM system_configs WHERE id = r.id;
  END LOOP;
END $$;
