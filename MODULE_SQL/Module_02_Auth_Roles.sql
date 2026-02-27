-- =================================================================
-- MODULE 02: AUTHENTICATION & ROLES
-- Description: User Management, Triggers, and Security Policies
-- =================================================================

-- 1. AUTH TRIGGER (Sync auth.users -> public.users)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.users (id, username, email, full_name, nisn, class, major, gender, religion, photo_url, role, password_text, qr_login_password)
  VALUES (
    new.id,
    new.email,
    new.email,
    COALESCE(new.raw_user_meta_data ->> 'full_name', 'Nama Belum Diatur'),
    COALESCE(new.raw_user_meta_data ->> 'nisn', split_part(new.email, '@', 1)),
    COALESCE(new.raw_user_meta_data ->> 'class', 'Belum diatur'),
    COALESCE(new.raw_user_meta_data ->> 'major', 'Belum diatur'),
    COALESCE(new.raw_user_meta_data ->> 'gender', 'Laki-laki'),
    COALESCE(new.raw_user_meta_data ->> 'religion', 'Islam'),
    COALESCE(new.raw_user_meta_data ->> 'photo_url', 'https://ui-avatars.com/api/?name=' || COALESCE(new.raw_user_meta_data ->> 'full_name', 'User')),
    COALESCE(new.raw_user_meta_data ->> 'role', 'student'),
    COALESCE(new.raw_user_meta_data ->> 'password_text', split_part(new.email, '@', 1)),
    COALESCE(new.raw_user_meta_data ->> 'password_text', split_part(new.email, '@', 1)) -- Default QR password same as text password
  )
  ON CONFLICT (id) DO UPDATE SET
    username = EXCLUDED.username,
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2. ROLE CHECK FUNCTION
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
  SELECT (COALESCE(current_setting('request.jwt.claims', true), '{}')::jsonb ->> 'email') = 'admin@cbtschool.com' 
  OR EXISTS (
    SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_teacher()
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'teacher'
  );
$$;

-- 3. RLS POLICIES (CORE)
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_majors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

-- Clean up old policies
DROP POLICY IF EXISTS "Public Read Access" ON public.app_config;
DROP POLICY IF EXISTS "Public Read Access" ON public.users;
DROP POLICY IF EXISTS "Public Read Access" ON public.master_classes;
DROP POLICY IF EXISTS "Public Read Access" ON public.master_majors;
DROP POLICY IF EXISTS "Public Read Access" ON public.announcements;
DROP POLICY IF EXISTS "Admin Full Access" ON public.app_config;
DROP POLICY IF EXISTS "Admin Full Access" ON public.users;
DROP POLICY IF EXISTS "Admin Full Access" ON public.master_classes;
DROP POLICY IF EXISTS "Admin Full Access" ON public.master_majors;
DROP POLICY IF EXISTS "Admin Full Access" ON public.announcements;

-- Public Read Policies
CREATE POLICY "Public Read Access" ON public.app_config FOR SELECT USING (true);
CREATE POLICY "Public Read Access" ON public.users FOR SELECT USING (true);
CREATE POLICY "Public Read Access" ON public.master_classes FOR SELECT USING (true);
CREATE POLICY "Public Read Access" ON public.master_majors FOR SELECT USING (true);
CREATE POLICY "Public Read Access" ON public.announcements FOR SELECT USING (true);

-- Admin Full Access Policies
CREATE POLICY "Admin Full Access" ON public.app_config FOR ALL USING (is_admin());
CREATE POLICY "Admin Full Access" ON public.users FOR ALL USING (is_admin());
CREATE POLICY "Admin Full Access" ON public.master_classes FOR ALL USING (is_admin());
CREATE POLICY "Admin Full Access" ON public.master_majors FOR ALL USING (is_admin());
CREATE POLICY "Admin Full Access" ON public.announcements FOR ALL USING (is_admin());

-- Teacher Specific Access (Can view users, classes, majors)
CREATE POLICY "Teacher View Users" ON public.users FOR SELECT USING (is_teacher());
CREATE POLICY "Teacher View Classes" ON public.master_classes FOR SELECT USING (is_teacher());

-- 4. STORAGE POLICIES
DO $$ 
BEGIN
    DROP POLICY IF EXISTS "Admin Manage Assets" ON storage.objects;
    DROP POLICY IF EXISTS "Public View Assets" ON storage.objects;
END $$;

CREATE POLICY "Admin Manage Assets" ON storage.objects FOR ALL TO authenticated USING (bucket_id IN ('question_assets', 'config_assets') AND is_admin());
CREATE POLICY "Public View Assets" ON storage.objects FOR SELECT TO anon USING (bucket_id IN ('question_assets', 'config_assets'));
