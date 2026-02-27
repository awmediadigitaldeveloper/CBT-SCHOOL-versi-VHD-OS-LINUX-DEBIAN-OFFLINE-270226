-- =================================================================
-- MODULE 01: CORE SCHEMA & SETUP
-- Description: Extensions, Basic Tables, and Initial Configuration
-- =================================================================

-- 1. INITIAL SETUP
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. APP CONFIGURATION
CREATE TABLE IF NOT EXISTS public.app_config (
  id smallint PRIMARY KEY DEFAULT 1,
  school_name text NOT NULL DEFAULT 'CBT School SMK',
  npsn text, -- Added for License System
  school_domain text, -- Added for Dynamic Domain
  logo_url text,
  left_logo_url text, -- Added for Dual Logo
  primary_color char(7) DEFAULT '#2563eb',
  enable_anti_cheat boolean DEFAULT true,
  anti_cheat_violation_limit smallint DEFAULT 3,
  allow_student_manual_login boolean DEFAULT true,
  allow_student_qr_login boolean DEFAULT true,
  allow_admin_manual_login boolean DEFAULT true,
  allow_admin_qr_login boolean DEFAULT true,
  headmaster_name text,
  headmaster_nip text,
  card_issue_date text,
  signature_url text,
  stamp_url text,
  student_data_sheet_url text,
  
  -- Letterhead Configuration
  school_address text,
  school_district text DEFAULT 'KABUPATEN',
  school_code text,
  region_code text,
  school_phone text,
  school_email text,
  school_website text,
  kop_header1 text DEFAULT 'PEMERINTAH PROVINSI',
  kop_header2 text DEFAULT 'DINAS PENDIDIKAN',
  
  -- Exam Configuration
  current_exam_event text DEFAULT 'UJIAN SEKOLAH BERBASIS KOMPUTER',
  academic_year text DEFAULT '2023/2024',
  default_paper_size text DEFAULT 'A4',
  
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT pk_app_config CHECK (id = 1)
);

-- 2b. LICENSE STORAGE
CREATE TABLE IF NOT EXISTS public.app_license_storage (
  license_key text PRIMARY KEY,
  school_name text NOT NULL,
  npsn text,
  hardware_id text NOT NULL,
  json_data jsonb,
  last_synced_at timestamptz DEFAULT now()
);

-- 3. USER PROFILES (PUBLIC)
CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text NOT NULL UNIQUE,
  email text, -- Redundant but useful for quick lookup
  password_text text, -- Stored for QR generation (Encrypted in auth.users)
  qr_login_password text, -- Explicit QR password
  full_name text NOT NULL,
  nisn text, -- Can be null for teachers/admins
  class text,
  major text,
  religion text DEFAULT 'Islam',
  gender text NOT NULL CHECK (gender IN ('Laki-laki', 'Perempuan')),
  photo_url text,
  role text DEFAULT 'student' CHECK (role IN ('student', 'teacher', 'admin')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 4. MASTER DATA TABLES
CREATE TABLE IF NOT EXISTS public.master_classes (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), 
  name text NOT NULL UNIQUE, 
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.master_majors (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), 
  name text NOT NULL UNIQUE, 
  created_at timestamptz DEFAULT now()
);

-- 5. ANNOUNCEMENTS
CREATE TABLE IF NOT EXISTS public.announcements (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), 
  title text NOT NULL UNIQUE, 
  content text NOT NULL, 
  created_at timestamptz DEFAULT now()
);

-- 6. STORAGE BUCKETS SETUP
-- Safe insert for buckets (works on versions without 'public' column)
INSERT INTO storage.buckets (id, name) VALUES ('question_assets', 'question_assets') ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name) VALUES ('config_assets', 'config_assets') ON CONFLICT DO NOTHING;

-- Attempt to set public access if the column exists (for newer Supabase versions)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'storage' AND table_name = 'buckets' AND column_name = 'public') THEN
        UPDATE storage.buckets SET public = true WHERE id IN ('question_assets', 'config_assets');
    END IF;
END $$;

-- 7. INITIAL SEED FOR CONFIG
INSERT INTO public.app_config (id, school_name) VALUES (1, 'SMPN 2 DEPOK') ON CONFLICT (id) DO NOTHING;
