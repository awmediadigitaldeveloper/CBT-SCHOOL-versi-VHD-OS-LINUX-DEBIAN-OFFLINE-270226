-- =================================================================
-- MODULE 13: MASS DELETE RPC
-- Description: Adds the missing admin_mass_delete function
-- =================================================================

CREATE OR REPLACE FUNCTION public.admin_mass_delete(selected_modules jsonb)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_users boolean;
  v_tests boolean;
  v_masterData boolean;
  v_announcements boolean;
  v_schedules boolean;
  v_message text := 'Penghapusan data berhasil: ';
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION '403: Hanya Administrator yang dapat melakukan penghapusan massal.';
  END IF;

  v_users := COALESCE((selected_modules->>'users')::boolean, false);
  v_tests := COALESCE((selected_modules->>'tests')::boolean, false);
  v_masterData := COALESCE((selected_modules->>'masterData')::boolean, false);
  v_announcements := COALESCE((selected_modules->>'announcements')::boolean, false);
  v_schedules := COALESCE((selected_modules->>'schedules')::boolean, false);

  IF v_users THEN
    -- Delete all students from auth.users (cascade will handle public.users)
    -- Only delete where role = 'student'
    DELETE FROM auth.users WHERE id IN (SELECT id FROM public.users WHERE role = 'student');
    v_message := v_message || 'Siswa, ';
  END IF;

  IF v_tests THEN
    DELETE FROM public.tests;
    v_message := v_message || 'Ujian & Soal, ';
  END IF;

  IF v_masterData THEN
    DELETE FROM public.master_classes;
    DELETE FROM public.master_majors;
    v_message := v_message || 'Data Master, ';
  END IF;

  IF v_announcements THEN
    DELETE FROM public.announcements;
    v_message := v_message || 'Pengumuman, ';
  END IF;

  IF v_schedules THEN
    DELETE FROM public.schedules;
    v_message := v_message || 'Jadwal, ';
  END IF;

  -- Remove trailing comma and space if any
  IF RIGHT(v_message, 2) = ', ' THEN
    v_message := LEFT(v_message, LENGTH(v_message) - 2);
  END IF;

  IF v_message = 'Penghapusan data berhasil: ' THEN
    v_message := 'Tidak ada modul yang dipilih untuk dihapus.';
  END IF;

  RETURN v_message;
END;
$$;
