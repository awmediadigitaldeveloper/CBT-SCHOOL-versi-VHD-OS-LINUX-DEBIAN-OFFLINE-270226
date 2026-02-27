-- =================================================================
-- MODULE 09: LICENSE SYSTEM PATCH
-- Description: Tables and Functions for License Synchronization
-- =================================================================

-- 1. Create License Storage Table
CREATE TABLE IF NOT EXISTS public.app_license_storage (
  license_key text PRIMARY KEY,
  school_name text NOT NULL,
  npsn text,
  hardware_id text NOT NULL,
  json_data jsonb,
  last_synced_at timestamptz DEFAULT now()
);

-- 2. Add NPSN to App Config if missing
ALTER TABLE public.app_config ADD COLUMN IF NOT EXISTS npsn text;

-- 3. Sync License Data Function (Security Definer to allow Anon access via RPC)
CREATE OR REPLACE FUNCTION public.sync_license_data(
  p_license_key text,
  p_school_name text,
  p_npsn text,
  p_hwid text,
  p_json_data jsonb
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- 1. Upsert License Storage
  INSERT INTO public.app_license_storage (license_key, school_name, npsn, hardware_id, json_data, last_synced_at)
  VALUES (p_license_key, p_school_name, p_npsn, p_hwid, p_json_data, now())
  ON CONFLICT (license_key) DO UPDATE SET
    school_name = EXCLUDED.school_name,
    npsn = EXCLUDED.npsn,
    hardware_id = EXCLUDED.hardware_id,
    json_data = EXCLUDED.json_data,
    last_synced_at = now();

  -- 2. Update App Config
  UPDATE public.app_config
  SET school_name = p_school_name,
      npsn = p_npsn
  WHERE id = 1;
END;
$$;

-- 4. Enable RLS for License Storage (Admin Only)
ALTER TABLE public.app_license_storage ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin Manage License" ON public.app_license_storage;
CREATE POLICY "Admin Manage License" ON public.app_license_storage FOR ALL USING (is_admin());
