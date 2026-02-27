-- =================================================================
-- MODULE 05: FUNCTIONS & RPC
-- Description: Business Logic for Exam Submission, User Sync, etc.
-- =================================================================

-- 1. CREATE EXAM SESSION (ATOMIC)
CREATE OR REPLACE FUNCTION public.create_exam_session(
  p_user_uuid uuid,
  p_schedule_uuid uuid,
  p_duration_seconds integer
) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_session_id bigint;
BEGIN
  -- Check if session already exists
  SELECT id INTO v_session_id FROM public.student_exam_sessions
  WHERE user_id = p_user_uuid AND schedule_id = p_schedule_uuid;

  IF v_session_id IS NOT NULL THEN
    RETURN v_session_id;
  ELSE
    INSERT INTO public.student_exam_sessions(user_id, schedule_id, status, time_left_seconds)
    VALUES (p_user_uuid, p_schedule_uuid, 'Mengerjakan', p_duration_seconds)
    RETURNING id INTO v_session_id;
    RETURN v_session_id;
  END IF;
END;
$$;

-- 2. SYNC USERS (ADMIN ONLY)
CREATE OR REPLACE FUNCTION public.sync_all_users(users_data json)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  deleted_count int := 0;
  updated_count int := 0;
  inserted_count int := 0;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION '403: Hanya Administrator yang dapat melakukan sinkronisasi.';
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS incoming_users (
    username text, password text, fullName text, nisn text, class text, major text, gender text, religion text, photoUrl text
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
    SET full_name = i.fullName, class = i.class, major = i.major, gender = i.gender, religion = i.religion, photo_url = i.photoUrl, updated_at = now()
    FROM incoming_users i WHERE pu.nisn = i.nisn
    RETURNING pu.id
  ) SELECT count(*) INTO updated_count FROM updated_rows;

  -- Insert new users
  WITH new_users AS (
    INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_user_meta_data, aud, role)
    SELECT
      uuid_generate_v4(),
      i.nisn || '@smpn2depok.sch.id', -- Default domain
      crypt(COALESCE(i.password, i.nisn), gen_salt('bf')),
      now(),
      jsonb_build_object('full_name', i.fullName, 'nisn', i.nisn, 'class', i.class, 'major', i.major, 'gender', i.gender, 'religion', i.religion, 'photo_url', i.photoUrl),
      'authenticated', 'authenticated'
    FROM incoming_users i
    WHERE NOT EXISTS (SELECT 1 FROM public.users pu WHERE pu.nisn = i.nisn)
    RETURNING *
  ) SELECT count(*) INTO inserted_count FROM new_users;

  RETURN json_build_object('deleted', deleted_count, 'updated', updated_count, 'inserted', inserted_count);
END;
$$;

-- 3. SUBMIT EXAM (FINISH)
CREATE OR REPLACE FUNCTION public.submit_exam(p_session_id bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.student_exam_sessions
  SET status = 'Selesai', time_left_seconds = 0, updated_at = now()
  WHERE id = p_session_id AND user_id = auth.uid();
END;
$$;

-- 4. SYNC LICENSE DATA (SECURITY DEFINER)
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
