-- =================================================================
-- MODULE 11: ENTERPRISE FEATURES (AUTO-GRADING & ANALYTICS)
-- Description: RPCs for Dashboard Stats and Server-Side Auto Grading
-- =================================================================

-- 1. RPC: get_dashboard_stats
-- Digunakan untuk memuat data dashboard secara efisien dalam 1 kali query
CREATE OR REPLACE FUNCTION public.get_dashboard_stats()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_total_students int;
  v_total_teachers int;
  v_total_tests int;
  v_active_sessions int;
  v_completed_sessions int;
BEGIN
  SELECT count(*) INTO v_total_students FROM public.users WHERE role = 'student';
  SELECT count(*) INTO v_total_teachers FROM public.users WHERE role = 'teacher';
  SELECT count(*) INTO v_total_tests FROM public.tests;
  SELECT count(*) INTO v_active_sessions FROM public.student_exam_sessions WHERE status = 'Mengerjakan';
  SELECT count(*) INTO v_completed_sessions FROM public.student_exam_sessions WHERE status = 'Selesai';

  RETURN jsonb_build_object(
    'totalStudents', v_total_students,
    'totalTeachers', v_total_teachers,
    'totalTests', v_total_tests,
    'activeSessions', v_active_sessions,
    'completedSessions', v_completed_sessions
  );
END;
$$;

-- 2. RPC: calculate_exam_score (AUTO-GRADING ENGINE)
-- Digunakan di menu "Rekapitulasi Nilai" untuk menghitung nilai secara server-side
CREATE OR REPLACE FUNCTION public.calculate_exam_score(p_session_id bigint)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_total_weight numeric := 0;
  v_earned_weight numeric := 0;
  v_final_score numeric := 0;
  q_record record;
  a_record record;
  v_is_correct boolean;
BEGIN
  -- Loop melalui semua soal yang ada di test ini
  FOR q_record IN 
    SELECT q.id, q.type, q.answer_key, q.weight, q.correct_answer_index 
    FROM public.questions q
    JOIN public.schedules s ON q.test_id = s.test_id
    JOIN public.student_exam_sessions ses ON ses.schedule_id = s.id
    WHERE ses.id = p_session_id
  LOOP
    v_total_weight := v_total_weight + COALESCE(q_record.weight, 1);
    v_is_correct := false;

    -- Ambil jawaban siswa untuk soal ini
    SELECT * INTO a_record FROM public.student_answers 
    WHERE session_id = p_session_id AND question_id = q_record.id;

    IF FOUND THEN
      -- Logika Penilaian Berdasarkan Tipe Soal
      IF q_record.type = 'multiple_choice' THEN
        -- Cek dari answer_key JSONB atau fallback ke correct_answer_index
        IF (q_record.answer_key->>'index')::int = a_record.selected_answer_index OR q_record.correct_answer_index = a_record.selected_answer_index THEN
          v_is_correct := true;
        END IF;

      ELSIF q_record.type = 'complex_multiple_choice' THEN
        -- Bandingkan array JSONB secara presisi
        IF q_record.answer_key->'indices' @> a_record.answer_value AND q_record.answer_key->'indices' <@ a_record.answer_value THEN
          v_is_correct := true;
        END IF;

      ELSIF q_record.type = 'true_false' THEN
        -- Bandingkan JSONB object (Benar/Salah)
        IF q_record.answer_key = a_record.answer_value THEN
          v_is_correct := true;
        END IF;

      ELSIF q_record.type = 'matching' THEN
        -- Bandingkan JSONB object pasangan (Pairs)
        IF q_record.answer_key->'pairs' = a_record.answer_value THEN
          v_is_correct := true;
        END IF;

      ELSIF q_record.type = 'essay' THEN
        -- Auto-grade sederhana untuk essay (Case Insensitive)
        IF lower(trim(q_record.answer_key->>'text')) = lower(trim(a_record.answer_value->>'text')) THEN
          v_is_correct := true;
        END IF;
      END IF;

      -- Tambahkan bobot jika benar
      IF v_is_correct THEN
        v_earned_weight := v_earned_weight + COALESCE(q_record.weight, 1);
      END IF;
    END IF;
  END LOOP;

  -- Hitung nilai akhir (Skala 100)
  IF v_total_weight > 0 THEN
    v_final_score := round((v_earned_weight / v_total_weight) * 100, 2);
  ELSE
    v_final_score := 0;
  END IF;

  -- Update session dengan nilai akhir
  UPDATE public.student_exam_sessions 
  SET score = v_final_score 
  WHERE id = p_session_id;

  RETURN v_final_score;
END;
$$;

-- 3. RPC: force_submit_all_expired_sessions
-- Digunakan oleh Cron Job atau Admin untuk menutup ujian yang waktunya sudah habis
CREATE OR REPLACE FUNCTION public.force_submit_all_expired_sessions()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_count int := 0;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  WITH updated AS (
    UPDATE public.student_exam_sessions
    SET status = 'Selesai', time_left_seconds = 0, updated_at = now()
    WHERE status = 'Mengerjakan' AND time_left_seconds <= 0
    RETURNING id
  )
  SELECT count(*) INTO v_count FROM updated;

  RETURN v_count;
END;
$$;
