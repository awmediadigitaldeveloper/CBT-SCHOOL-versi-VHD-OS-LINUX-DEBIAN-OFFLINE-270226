-- =================================================================
-- MODULE 04: EXAM SESSIONS & ANTI-CHEAT
-- Description: Student Sessions, Answers, and Security
-- =================================================================

-- 1. STUDENT EXAM SESSIONS
CREATE TABLE IF NOT EXISTS public.student_exam_sessions (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  schedule_id uuid NOT NULL REFERENCES public.schedules(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'Mengerjakan' CHECK (status IN ('Mengerjakan', 'Selesai', 'Diskualifikasi')),
  progress int NOT NULL DEFAULT 0,
  time_left_seconds int NOT NULL,
  violations int NOT NULL DEFAULT 0,
  score smallint,
  started_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, schedule_id)
);

-- 2. STUDENT ANSWERS
CREATE TABLE IF NOT EXISTS public.student_answers (
  id bigserial PRIMARY KEY,
  session_id bigint NOT NULL REFERENCES public.student_exam_sessions(id) ON DELETE CASCADE,
  question_id bigint NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  selected_answer_index smallint,
  answer_value jsonb, -- For complex types (matching, essay, multiple select)
  is_unsure boolean DEFAULT false,
  answered_at timestamptz DEFAULT now(),
  UNIQUE(session_id, question_id)
);

-- 3. RLS POLICIES
ALTER TABLE public.student_exam_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_answers ENABLE ROW LEVEL SECURITY;

-- Clean up old policies
DROP POLICY IF EXISTS "Public Read Access" ON public.student_exam_sessions;
DROP POLICY IF EXISTS "Public Read Access" ON public.student_answers;
DROP POLICY IF EXISTS "Student Update Own Session" ON public.student_exam_sessions;
DROP POLICY IF EXISTS "Student Manage Own Answers" ON public.student_answers;
DROP POLICY IF EXISTS "Admin Full Access" ON public.student_exam_sessions;
DROP POLICY IF EXISTS "Admin Full Access" ON public.student_answers;

-- Student Policies
CREATE POLICY "Student Read Own Session" ON public.student_exam_sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Student Update Own Session" ON public.student_exam_sessions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Student Insert Own Session" ON public.student_exam_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Student Read Own Answers" ON public.student_answers FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.student_exam_sessions s WHERE s.id = session_id AND s.user_id = auth.uid())
);
CREATE POLICY "Student Manage Own Answers" ON public.student_answers FOR ALL USING (
  EXISTS (SELECT 1 FROM public.student_exam_sessions s WHERE s.id = session_id AND s.user_id = auth.uid())
);

-- Admin Policies
CREATE POLICY "Admin Full Access" ON public.student_exam_sessions FOR ALL USING (is_admin());
CREATE POLICY "Admin Full Access" ON public.student_answers FOR ALL USING (is_admin());

-- Teacher Policies (View Only for Monitoring)
CREATE POLICY "Teacher View Sessions" ON public.student_exam_sessions FOR SELECT USING (is_teacher());
CREATE POLICY "Teacher View Answers" ON public.student_answers FOR SELECT USING (is_teacher());

-- 4. REALTIME ENABLEMENT
ALTER PUBLICATION supabase_realtime ADD TABLE public.student_exam_sessions;
