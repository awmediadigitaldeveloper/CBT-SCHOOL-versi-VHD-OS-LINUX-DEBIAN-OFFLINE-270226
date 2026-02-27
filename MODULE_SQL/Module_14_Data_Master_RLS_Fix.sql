-- =================================================================
-- MODULE 14: DATA MASTER RLS FIX (V8 - PROFESSIONAL ENTERPRISE)
-- Description: Memperbaiki RLS dengan fungsi SECURITY DEFINER.
--              Menghindari penggunaan keyword cadangan 'current_role'.
--              Memastikan admin dapat mengelola Data Master.
-- =================================================================

-- 1. Redefinisikan fungsi is_admin dengan variabel yang aman (v_prefix)
--    SECURITY DEFINER memungkinkan fungsi berjalan dengan hak akses pemilik database,
--    sehingga bisa membaca tabel users meskipun ada RLS.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_claims jsonb;
  v_email text;
  v_role text;
BEGIN
  -- Ambil claims dari JWT secara aman
  -- Menggunakan COALESCE untuk memastikan hasil minimal adalah objek JSON kosong
  v_claims := COALESCE(current_setting('request.jwt.claims', true), '{}')::jsonb;
  
  -- Ekstrak data menggunakan fungsi jsonb_extract_path_text
  -- Ini jauh lebih stabil daripada operator panah (->>) di dalam blok PL/pgSQL
  v_email := lower(jsonb_extract_path_text(v_claims, 'email'));
  v_role := jsonb_extract_path_text(v_claims, 'app_metadata', 'role');

  -- STRATEGI PENGECEKAN (Whitelist & Role)
  
  -- 1. Cek Whitelist Email (Akses Darurat/Owner)
  IF v_email = 'admin@cbtschool.com' OR v_email = 'kita.bisa.berkarya2018@gmail.com' THEN
    RETURN true;
  END IF;

  -- 2. Cek Role dari Metadata Auth (Supabase Auth)
  IF v_role = 'admin' THEN
    RETURN true;
  END IF;

  -- 3. Cek Role dari Tabel Database (public.users)
  IF EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin') THEN
    RETURN true;
  END IF;

  RETURN false;
EXCEPTION WHEN OTHERS THEN
  -- Jika terjadi error tak terduga, kembalikan false demi keamanan
  RETURN false;
END;
$$;

-- 2. Pastikan tabel Master Data memiliki kebijakan yang benar
ALTER TABLE public.master_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_majors ENABLE ROW LEVEL SECURITY;

-- Bersihkan kebijakan lama secara dinamis untuk menghindari konflik
DO $$ 
DECLARE pol record; 
BEGIN 
    FOR pol IN SELECT policyname, tablename FROM pg_policies WHERE tablename IN ('master_classes', 'master_majors') AND schemaname = 'public' 
    LOOP 
        EXECUTE format('DROP POLICY "%s" ON public.%I', pol.policyname, pol.tablename); 
    END LOOP; 
END $$;

-- Terapkan kebijakan baru yang menggunakan fungsi is_admin() yang sudah diperbaiki
-- 1. Kebijakan untuk master_classes
CREATE POLICY "Enable read for all" ON public.master_classes FOR SELECT USING (true);
CREATE POLICY "Enable write for admins" ON public.master_classes FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- 2. Kebijakan untuk master_majors
CREATE POLICY "Enable read for all" ON public.master_majors FOR SELECT USING (true);
CREATE POLICY "Enable write for admins" ON public.master_majors FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- Berikan izin akses fisik ke tabel (GRANT)
GRANT ALL ON public.master_classes TO authenticated;
GRANT ALL ON public.master_majors TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;






