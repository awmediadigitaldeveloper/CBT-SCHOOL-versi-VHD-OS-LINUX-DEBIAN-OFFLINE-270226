-- =================================================================
-- MODULE 08: OFFLINE & VHD SPECIFIC
-- Description: Offline Admin, Dummy Data, and VHD Optimizations
-- =================================================================

-- 1. OFFLINE ADMIN (Ensures admin exists even if auth fails)
-- This is a fallback for VHD environments where auth might be tricky.
INSERT INTO public.users (id, username, email, full_name, role, password_text, qr_login_password, gender)
VALUES (
  '00000000-0000-0000-0000-000000000000', -- Fixed UUID for offline admin
  'admin@cbtschool.com',
  'admin@cbtschool.com',
  'Offline Administrator',
  'admin',
  '1234567890',
  '1234567890',
  'Laki-laki'
) ON CONFLICT (username) DO NOTHING;

-- 2. DUMMY STUDENTS (Optional - For Testing)
-- Uncomment to seed dummy students
/*
INSERT INTO public.users (id, username, email, full_name, nisn, class, major, gender, role, password_text, qr_login_password)
VALUES 
  (uuid_generate_v4(), 'siswa1@cbtschool.com', 'siswa1@cbtschool.com', 'Siswa Test 1', '1001', 'X TKJ 1', 'TKJ', 'Laki-laki', 'student', '12345', '12345'),
  (uuid_generate_v4(), 'siswa2@cbtschool.com', 'siswa2@cbtschool.com', 'Siswa Test 2', '1002', 'X TKJ 1', 'TKJ', 'Perempuan', 'student', '12345', '12345')
ON CONFLICT DO NOTHING;
*/

-- 3. VHD OPTIMIZATIONS
-- Disable strict SSL checks or other constraints if needed for local VHD
COMMENT ON DATABASE postgres IS 'CBT School VHD Edition';
