-- =================================================================
-- MODULE 07: FINAL FIXES & PATCHES
-- Description: Critical Fixes for TKA 2026, Login, and Schema Integrity
-- =================================================================

-- 1. FIX QUESTION TYPES (TKA 2026)
UPDATE public.questions SET type = 'multiple_choice' WHERE type IN ('SINGLE', 'Single', 'single', 'PG');
UPDATE public.questions SET type = 'complex_multiple_choice' WHERE type IN ('MULTIPLE', 'Multiple', 'multiple', 'COMPLEX');
UPDATE public.questions SET type = 'matching' WHERE type IN ('MATCHING', 'Matching', 'JODOHKAN');
UPDATE public.questions SET type = 'essay' WHERE type IN ('ESSAY', 'Essay', 'URAIAN');

-- Set default if null
UPDATE public.questions SET type = 'multiple_choice' 
WHERE type IS NULL OR type NOT IN ('multiple_choice', 'complex_multiple_choice', 'matching', 'essay', 'true_false');

-- 2. FIX LOGIN CREDENTIALS (SYNC QR PASSWORD)
-- Ensures all users have a password_text and qr_login_password set
UPDATE public.users 
SET 
  password_text = COALESCE(password_text, split_part(email, '@', 1)),
  qr_login_password = COALESCE(qr_login_password, split_part(email, '@', 1))
WHERE password_text IS NULL OR qr_login_password IS NULL;

-- 3. FIX TEACHER ROLES
-- Ensure users with 'guru' or 'teacher' in email have 'teacher' role
UPDATE public.users 
SET role = 'teacher' 
WHERE (email LIKE '%guru%' OR email LIKE '%teacher%') AND role != 'teacher';

-- 4. REFRESH SCHEMA CACHE
NOTIFY pgrst, 'reload config';
