-- =================================================================
-- MODULE 12: CONFIG FIXES & PERMISSIONS
-- Description: Adds missing email_domain column, related RPC, and fixes global table permissions
-- =================================================================

-- 1. Add email_domain to app_config
ALTER TABLE public.app_config ADD COLUMN IF NOT EXISTS email_domain text DEFAULT 'smkn8sby.sch.id';

-- 2. Fix Global Permissions (Grant access to authenticated & anon users)
-- This resolves the "permission denied for table X" errors across the entire app
-- Supabase relies on RLS for security, so granting table-level access is required
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

-- Ensure future tables also get these permissions automatically
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;

-- 3. RPC: admin_update_email_domain
-- Updates the email domain for all student accounts when the configuration changes
CREATE OR REPLACE FUNCTION public.admin_update_email_domain(new_domain text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Check if the user is an admin
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Update auth.users for students
  -- We construct the new email using the student's NISN and the new domain
  UPDATE auth.users au
  SET email = pu.nisn || '@' || new_domain
  FROM public.users pu
  WHERE au.id = pu.id AND pu.role = 'student' AND pu.nisn IS NOT NULL AND pu.nisn != '';

  -- Update public.users for students
  UPDATE public.users
  SET username = nisn || '@' || new_domain
  WHERE role = 'student' AND nisn IS NOT NULL AND nisn != '';
END;
$$;

-- =================================================================
-- 4. RPC: sync_all_users (FIXED CASE-SENSITIVITY)
-- =================================================================
CREATE OR REPLACE FUNCTION public.sync_all_users(users_data json)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  deleted_count int := 0;
  updated_count int := 0;
  inserted_count int := 0;
  v_domain text;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION '403: Hanya Administrator yang dapat melakukan sinkronisasi.';
  END IF;

  -- Get current domain from config
  SELECT email_domain INTO v_domain FROM public.app_config LIMIT 1;
  IF v_domain IS NULL OR v_domain = '' THEN
    v_domain := 'smkn8sby.sch.id';
  END IF;

  -- FIX: Use double quotes for camelCase JSON keys
  CREATE TEMP TABLE IF NOT EXISTS incoming_users (
    username text, password text, "fullName" text, nisn text, class text, major text, gender text, religion text, "photoUrl" text
  ) ON COMMIT DROP;

  TRUNCATE incoming_users;
  INSERT INTO incoming_users SELECT * FROM json_populate_recordset(null::incoming_users, users_data);

  -- Delete users not in sheet (except admin/teachers)
  WITH deleted_users AS (
    DELETE FROM auth.users
    WHERE email NOT LIKE '%admin%' AND email NOT LIKE '%guru%'
      AND id IN (
        SELECT u.id FROM public.users u
        WHERE u.nisn IS NOT NULL AND NOT EXISTS (SELECT 1 FROM incoming_users i WHERE i.nisn = u.nisn)
      )
    RETURNING *
  ) SELECT count(*) INTO deleted_count FROM deleted_users;

  -- Update existing users
  WITH updated_rows AS (
    UPDATE public.users pu
    SET full_name = i."fullName", class = i.class, major = i.major, gender = i.gender, religion = i.religion, photo_url = i."photoUrl", updated_at = now()
    FROM incoming_users i WHERE pu.nisn = i.nisn
    RETURNING pu.id
  ) SELECT count(*) INTO updated_count FROM updated_rows;

  -- Insert new users
  WITH new_users AS (
    INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_user_meta_data, aud, role)
    SELECT
      uuid_generate_v4(),
      i.nisn || '@' || v_domain,
      crypt(COALESCE(i.password, i.nisn), gen_salt('bf')),
      now(),
      jsonb_build_object('full_name', i."fullName", 'nisn', i.nisn, 'class', i.class, 'major', i.major, 'gender', i.gender, 'religion', i.religion, 'photo_url', i."photoUrl", 'role', 'student'),
      'authenticated', 'authenticated'
    FROM incoming_users i
    WHERE NOT EXISTS (SELECT 1 FROM public.users pu WHERE pu.nisn = i.nisn)
    RETURNING *
  ) SELECT count(*) INTO inserted_count FROM new_users;

  RETURN json_build_object('deleted', deleted_count, 'updated', updated_count, 'inserted', inserted_count);
END;
$$;
