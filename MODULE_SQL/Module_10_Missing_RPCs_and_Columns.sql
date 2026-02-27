-- =================================================================
-- MODULE 10: MISSING RPCs & COLUMNS
-- Description: Adds missing columns and RPCs required by the frontend
-- =================================================================

-- 1. Add active_device_id to users (Required by UbkMonitor)
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS active_device_id text;

-- 2. RPC: admin_reset_device_login
CREATE OR REPLACE FUNCTION public.admin_reset_device_login(p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT is_admin() AND NOT is_teacher() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  UPDATE public.users SET active_device_id = NULL WHERE id = p_user_id;
END;
$$;

-- 3. RPC: admin_upsert_user
CREATE OR REPLACE FUNCTION public.admin_upsert_user(
  p_id uuid,
  p_username text,
  p_password text,
  p_full_name text,
  p_nisn text,
  p_class text,
  p_major text,
  p_gender text,
  p_religion text,
  p_photo_url text,
  p_role text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id uuid;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_id IS NULL THEN
    -- Insert new user
    v_user_id := uuid_generate_v4();
    INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_user_meta_data, aud, role)
    VALUES (
      v_user_id,
      p_username,
      crypt(COALESCE(p_password, p_nisn), gen_salt('bf')),
      now(),
      jsonb_build_object('full_name', p_full_name, 'nisn', p_nisn, 'class', p_class, 'major', p_major, 'gender', p_gender, 'religion', p_religion, 'photo_url', p_photo_url, 'role', p_role),
      'authenticated', 'authenticated'
    );
  ELSE
    -- Update existing user
    UPDATE auth.users SET
      email = p_username,
      encrypted_password = CASE WHEN p_password IS NOT NULL THEN crypt(p_password, gen_salt('bf')) ELSE encrypted_password END,
      raw_user_meta_data = jsonb_build_object('full_name', p_full_name, 'nisn', p_nisn, 'class', p_class, 'major', p_major, 'gender', p_gender, 'religion', p_religion, 'photo_url', p_photo_url, 'role', p_role)
    WHERE id = p_id;
    
    UPDATE public.users SET
      username = p_username,
      full_name = p_full_name,
      nisn = p_nisn,
      class = p_class,
      major = p_major,
      gender = p_gender,
      religion = p_religion,
      photo_url = p_photo_url,
      role = p_role,
      password_text = CASE WHEN p_password IS NOT NULL THEN p_password ELSE password_text END,
      qr_login_password = CASE WHEN p_password IS NOT NULL THEN p_password ELSE qr_login_password END
    WHERE id = p_id;
  END IF;
END;
$$;

-- 4. RPC: admin_delete_user
CREATE OR REPLACE FUNCTION public.admin_delete_user(p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  DELETE FROM auth.users WHERE id = p_user_id;
END;
$$;

-- 5. RPC: admin_reset_student_password
CREATE OR REPLACE FUNCTION public.admin_reset_student_password(p_user_id uuid, p_new_password text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  UPDATE auth.users SET encrypted_password = crypt(p_new_password, gen_salt('bf')) WHERE id = p_user_id;
  UPDATE public.users SET password_text = p_new_password, qr_login_password = p_new_password WHERE id = p_user_id;
END;
$$;

-- 6. RPC: repair_teacher_logins
CREATE OR REPLACE FUNCTION public.repair_teacher_logins()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_count int := 0;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  
  UPDATE auth.users 
  SET raw_user_meta_data = jsonb_set(COALESCE(raw_user_meta_data, '{}'::jsonb), '{role}', '"teacher"')
  WHERE id IN (SELECT id FROM public.users WHERE role = 'teacher');
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('message', 'Berhasil memperbaiki ' || v_count || ' data guru.');
END;
$$;

-- 7. RPC: admin_import_users
CREATE OR REPLACE FUNCTION public.admin_import_users(users_data jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  user_record record;
  v_user_id uuid;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  FOR user_record IN SELECT * FROM jsonb_to_recordset(users_data) AS x(username text, password text, "fullName" text, nisn text, class text, major text, gender text, religion text, "photoUrl" text, role text)
  LOOP
    SELECT id INTO v_user_id FROM public.users WHERE username = user_record.username;
    
    IF v_user_id IS NULL THEN
      v_user_id := uuid_generate_v4();
      INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_user_meta_data, aud, role)
      VALUES (
        v_user_id,
        user_record.username,
        crypt(COALESCE(user_record.password, user_record.nisn), gen_salt('bf')),
        now(),
        jsonb_build_object('full_name', user_record."fullName", 'nisn', user_record.nisn, 'class', user_record.class, 'major', user_record.major, 'gender', user_record.gender, 'religion', user_record.religion, 'photo_url', user_record."photoUrl", 'role', user_record.role),
        'authenticated', 'authenticated'
      );
    ELSE
      UPDATE auth.users SET
        encrypted_password = CASE WHEN user_record.password IS NOT NULL THEN crypt(user_record.password, gen_salt('bf')) ELSE encrypted_password END,
        raw_user_meta_data = jsonb_build_object('full_name', user_record."fullName", 'nisn', user_record.nisn, 'class', user_record.class, 'major', user_record.major, 'gender', user_record.gender, 'religion', user_record.religion, 'photo_url', user_record."photoUrl", 'role', user_record.role)
      WHERE id = v_user_id;
      
      UPDATE public.users SET
        full_name = user_record."fullName",
        nisn = user_record.nisn,
        class = user_record.class,
        major = user_record.major,
        gender = user_record.gender,
        religion = user_record.religion,
        photo_url = user_record."photoUrl",
        role = user_record.role,
        password_text = CASE WHEN user_record.password IS NOT NULL THEN user_record.password ELSE password_text END,
        qr_login_password = CASE WHEN user_record.password IS NOT NULL THEN user_record.password ELSE qr_login_password END
      WHERE id = v_user_id;
    END IF;
  END LOOP;
END;
$$;

-- 8. RPC: admin_import_questions
CREATE OR REPLACE FUNCTION public.admin_import_questions(p_test_token text, p_questions_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_test_id uuid;
  q_record record;
  v_inserted int := 0;
BEGIN
  IF NOT is_admin() AND NOT is_teacher() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT id INTO v_test_id FROM public.tests WHERE token = p_test_token;
  IF v_test_id IS NULL THEN
    RAISE EXCEPTION 'Test token not found';
  END IF;

  FOR q_record IN SELECT * FROM jsonb_to_recordset(p_questions_data) AS x(type text, question text, options text[], matching_right_options text[], answer_key jsonb, cognitive_level text, difficulty text, weight numeric, topic text)
  LOOP
    INSERT INTO public.questions (test_id, type, question, options, matching_right_options, answer_key, metadata, difficulty, weight, topic, correct_answer_index)
    VALUES (
      v_test_id,
      q_record.type,
      q_record.question,
      q_record.options,
      q_record.matching_right_options,
      q_record.answer_key,
      jsonb_build_object('cognitive_level', q_record.cognitive_level),
      q_record.difficulty,
      q_record.weight,
      q_record.topic,
      0
    );
    v_inserted := v_inserted + 1;
  END LOOP;

  RETURN jsonb_build_object('inserted', v_inserted);
END;
$$;
