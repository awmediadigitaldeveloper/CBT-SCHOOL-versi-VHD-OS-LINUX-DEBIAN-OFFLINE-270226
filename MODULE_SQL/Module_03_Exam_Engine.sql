-- =================================================================
-- MODULE 03: EXAM ENGINE & QUESTION BANK
-- Description: Tests, Questions, Schedules, and Exam Configuration
-- =================================================================

-- 1. TESTS TABLE
CREATE TABLE IF NOT EXISTS public.tests (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  token text NOT NULL UNIQUE,
  name text NOT NULL,
  subject text NOT NULL,
  duration_minutes int NOT NULL,
  questions_to_display int,
  randomize_questions boolean DEFAULT true,
  randomize_answers boolean DEFAULT true,
  exam_type text DEFAULT 'Umum', -- 'Umum', 'UTS', 'UAS', 'Tryout'
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. QUESTIONS TABLE (With 2026 Support)
CREATE TABLE IF NOT EXISTS public.questions (
  id bigserial PRIMARY KEY,
  test_id uuid NOT NULL REFERENCES public.tests(id) ON DELETE CASCADE,
  question text NOT NULL,
  image_url text,
  audio_url text,
  video_url text,
  options text[] NOT NULL,
  option_images text[],
  correct_answer_index smallint NOT NULL,
  
  -- Advanced Types
  type text NOT NULL DEFAULT 'multiple_choice' CHECK (type IN ('multiple_choice', 'complex_multiple_choice', 'matching', 'essay', 'true_false')),
  matching_right_options text[], -- For matching questions
  answer_key jsonb, -- Flexible answer key for complex types
  metadata jsonb, -- Extra metadata (e.g. cognitive level)
  
  difficulty text NOT NULL CHECK (difficulty IN ('Easy', 'Medium', 'Hard')),
  weight numeric DEFAULT 1,
  topic text
);

-- 3. SCHEDULES TABLE
CREATE TABLE IF NOT EXISTS public.schedules (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  test_id uuid NOT NULL REFERENCES public.tests(id) ON DELETE CASCADE,
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  assigned_to text[] -- Array of class names or majors
);

-- 4. RLS POLICIES
ALTER TABLE public.tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;

-- Clean up old policies
DROP POLICY IF EXISTS "Public Read Access" ON public.tests;
DROP POLICY IF EXISTS "Public Read Access" ON public.questions;
DROP POLICY IF EXISTS "Public Read Access" ON public.schedules;
DROP POLICY IF EXISTS "Admin Full Access" ON public.tests;
DROP POLICY IF EXISTS "Admin Full Access" ON public.questions;
DROP POLICY IF EXISTS "Admin Full Access" ON public.schedules;

-- Public Read (Students need to see tests/questions during exam)
CREATE POLICY "Public Read Access" ON public.tests FOR SELECT USING (true);
CREATE POLICY "Public Read Access" ON public.questions FOR SELECT USING (true);
CREATE POLICY "Public Read Access" ON public.schedules FOR SELECT USING (true);

-- Admin Full Access
CREATE POLICY "Admin Full Access" ON public.tests FOR ALL USING (is_admin());
CREATE POLICY "Admin Full Access" ON public.questions FOR ALL USING (is_admin());
CREATE POLICY "Admin Full Access" ON public.schedules FOR ALL USING (is_admin());

-- Teacher Access (Can manage their own tests - simplified to full access for now)
CREATE POLICY "Teacher Manage Tests" ON public.tests FOR ALL USING (is_teacher());
CREATE POLICY "Teacher Manage Questions" ON public.questions FOR ALL USING (is_teacher());
CREATE POLICY "Teacher Manage Schedules" ON public.schedules FOR ALL USING (is_teacher());
