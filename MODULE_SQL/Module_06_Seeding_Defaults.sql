-- =================================================================
-- MODULE 06: SEEDING & DEFAULTS
-- Description: Default Admin, Teacher, and Config Data
-- =================================================================

-- 1. SEED ADMIN USER (OFFLINE FALLBACK)
-- Note: This creates an auth user if it doesn't exist.
DO $$
DECLARE
  v_admin_uid uuid;
  v_query text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'admin@cbtschool.com') THEN
    v_admin_uid := uuid_generate_v4();
    
    -- Check for email_confirmed_at column
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'email_confirmed_at') THEN
        v_query := 'INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at) VALUES ($1, ''00000000-0000-0000-0000-000000000000'', ''admin@cbtschool.com'', crypt(''1234567890'', gen_salt(''bf'')), now(), ''{"provider": "email", "providers": ["email"]}''::jsonb, ''{"full_name": "Administrator", "role": "admin"}''::jsonb, ''authenticated'', ''authenticated'', now(), now())';
    ELSE
        v_query := 'INSERT INTO auth.users (id, instance_id, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at) VALUES ($1, ''00000000-0000-0000-0000-000000000000'', ''admin@cbtschool.com'', crypt(''1234567890'', gen_salt(''bf'')), ''{"provider": "email", "providers": ["email"]}''::jsonb, ''{"full_name": "Administrator", "role": "admin"}''::jsonb, ''authenticated'', ''authenticated'', now(), now())';
    END IF;

    EXECUTE v_query USING v_admin_uid;

    -- Public user entry is handled by trigger, but we ensure role is admin
    UPDATE public.users SET role = 'admin' WHERE id = v_admin_uid;
  END IF;
END $$;

-- 2. SEED TEACHER USER (OFFLINE FALLBACK)
DO $$
DECLARE
  v_teacher_uid uuid;
  v_query text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'guru@cbtschool.com') THEN
    v_teacher_uid := uuid_generate_v4();
    
    -- Check for email_confirmed_at column
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'email_confirmed_at') THEN
        v_query := 'INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at) VALUES ($1, ''00000000-0000-0000-0000-000000000000'', ''guru@cbtschool.com'', crypt(''1234567890'', gen_salt(''bf'')), now(), ''{"provider": "email", "providers": ["email"]}''::jsonb, ''{"full_name": "Guru Default", "role": "teacher"}''::jsonb, ''authenticated'', ''authenticated'', now(), now())';
    ELSE
        v_query := 'INSERT INTO auth.users (id, instance_id, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at) VALUES ($1, ''00000000-0000-0000-0000-000000000000'', ''guru@cbtschool.com'', crypt(''1234567890'', gen_salt(''bf'')), ''{"provider": "email", "providers": ["email"]}''::jsonb, ''{"full_name": "Guru Default", "role": "teacher"}''::jsonb, ''authenticated'', ''authenticated'', now(), now())';
    END IF;

    EXECUTE v_query USING v_teacher_uid;

    UPDATE public.users SET role = 'teacher' WHERE id = v_teacher_uid;
  END IF;
END $$;

-- 3. ENSURE APP CONFIG DEFAULTS
INSERT INTO public.app_config (id, school_name, primary_color) 
VALUES (1, 'CBT School Default', '#2563eb') 
ON CONFLICT (id) DO NOTHING;
