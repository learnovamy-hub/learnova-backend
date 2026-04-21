-- LEARNOVA FORM 4 MATH - DATABASE SCHEMA
-- Run this in Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- 1. USERS TABLE (Auth + Base User Info)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255),
  role VARCHAR(50) NOT NULL CHECK (role IN ('student', 'parent', 'teacher', 'admin')),
  phone VARCHAR(20),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for faster lookups
CREATE INDEX idx_users_email ON public.users(email);
CREATE INDEX idx_users_role ON public.users(role);

-- ============================================================================
-- 2. STUDENTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  form_level INTEGER NOT NULL DEFAULT 4,
  school_name VARCHAR(255),
  enrollment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_students_user_id ON public.students(user_id);
CREATE INDEX idx_students_parent_id ON public.students(parent_id);

-- ============================================================================
-- 3. TEACHERS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.teachers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  subject VARCHAR(100) NOT NULL DEFAULT 'Mathematics',
  form_level INTEGER NOT NULL DEFAULT 4,
  bio TEXT,
  years_experience INTEGER,
  qualifications TEXT[],
  total_lessons_uploaded INTEGER DEFAULT 0,
  total_questions_created INTEGER DEFAULT 0,
  total_students_taught INTEGER DEFAULT 0,
  contribution_score DECIMAL(10,2) DEFAULT 0,
  equity_group VARCHAR(50),
  equity_percentage DECIMAL(5,2),
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_teachers_user_id ON public.teachers(user_id);

-- ============================================================================
-- 4. SUBJECTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO public.subjects (name, description) VALUES 
  ('Mathematics', 'Form 4-5 Mathematics') ON CONFLICT DO NOTHING;

-- ============================================================================
-- 5. TOPICS TABLE (Curriculum Topics)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id UUID REFERENCES public.subjects(id),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  difficulty_level VARCHAR(50) DEFAULT 'medium',
  order_index INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_topics_subject_id ON public.topics(subject_id);

-- Pre-populate Form 4 Math topics
INSERT INTO public.topics (subject_id, name, order_index) 
SELECT id, 'Quadratic Equations', 1 FROM public.subjects WHERE name = 'Mathematics' ON CONFLICT DO NOTHING;
INSERT INTO public.topics (subject_id, name, order_index)
SELECT id, 'Systems of Equations', 2 FROM public.subjects WHERE name = 'Mathematics' ON CONFLICT DO NOTHING;
INSERT INTO public.topics (subject_id, name, order_index)
SELECT id, 'Indices and Logarithms', 3 FROM public.subjects WHERE name = 'Mathematics' ON CONFLICT DO NOTHING;
INSERT INTO public.topics (subject_id, name, order_index)
SELECT id, 'Polynomials', 4 FROM public.subjects WHERE name = 'Mathematics' ON CONFLICT DO NOTHING;
INSERT INTO public.topics (subject_id, name, order_index)
SELECT id, 'Partial Fractions', 5 FROM public.subjects WHERE name = 'Mathematics' ON CONFLICT DO NOTHING;
INSERT INTO public.topics (subject_id, name, order_index)
SELECT id, 'Trigonometric Functions', 6 FROM public.subjects WHERE name = 'Mathematics' ON CONFLICT DO NOTHING;
INSERT INTO public.topics (subject_id, name, order_index)
SELECT id, 'Trigonometric Identities', 7 FROM public.subjects WHERE name = 'Mathematics' ON CONFLICT DO NOTHING;
INSERT INTO public.topics (subject_id, name, order_index)
SELECT id, 'Calculus - Differentiation', 8 FROM public.subjects WHERE name = 'Mathematics' ON CONFLICT DO NOTHING;
INSERT INTO public.topics (subject_id, name, order_index)
SELECT id, 'Calculus - Integration', 9 FROM public.subjects WHERE name = 'Mathematics' ON CONFLICT DO NOTHING;
INSERT INTO public.topics (subject_id, name, order_index)
SELECT id, 'Vectors', 10 FROM public.subjects WHERE name = 'Mathematics' ON CONFLICT DO NOTHING;
INSERT INTO public.topics (subject_id, name, order_index)
SELECT id, '3D Geometry', 11 FROM public.subjects WHERE name = 'Mathematics' ON CONFLICT DO NOTHING;
INSERT INTO public.topics (subject_id, name, order_index)
SELECT id, 'Probability and Statistics', 12 FROM public.subjects WHERE name = 'Mathematics' ON CONFLICT DO NOTHING;

-- ============================================================================
-- 6. TEACHER PEDAGOGIES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.teacher_pedagogies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID REFERENCES public.teachers(id) ON DELETE CASCADE,
  topic_id UUID REFERENCES public.topics(id) ON DELETE CASCADE,
  teaching_approach TEXT,
  key_concepts TEXT[],
  common_misconceptions TEXT[],
  teaching_examples TEXT[],
  assessment_strategy TEXT,
  status VARCHAR(50) DEFAULT 'draft',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(teacher_id, topic_id)
);

CREATE INDEX idx_teacher_pedagogies_teacher_id ON public.teacher_pedagogies(teacher_id);
CREATE INDEX idx_teacher_pedagogies_topic_id ON public.teacher_pedagogies(topic_id);

-- ============================================================================
-- 7. LESSONS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID REFERENCES public.topics(id) ON DELETE CASCADE,
  teacher_pedagogy_id UUID REFERENCES public.teacher_pedagogies(id) ON DELETE SET NULL,
  title VARCHAR(255) NOT NULL,
  content TEXT,
  duration_minutes INTEGER,
  difficulty_level VARCHAR(50),
  generated_by VARCHAR(50) DEFAULT 'manual',
  status VARCHAR(50) DEFAULT 'draft',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_lessons_topic_id ON public.lessons(topic_id);

-- ============================================================================
-- 8. QUIZZES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.quizzes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID REFERENCES public.topics(id) ON DELETE CASCADE,
  lesson_id UUID REFERENCES public.lessons(id) ON DELETE SET NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  difficulty_level VARCHAR(50),
  passing_score_percentage INTEGER DEFAULT 70,
  time_limit_minutes INTEGER,
  status VARCHAR(50) DEFAULT 'draft',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_quizzes_topic_id ON public.quizzes(topic_id);

-- ============================================================================
-- 9. QUESTIONS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id UUID REFERENCES public.quizzes(id) ON DELETE CASCADE,
  topic_id UUID REFERENCES public.topics(id),
  question_number INTEGER,
  question_text TEXT NOT NULL,
  question_type VARCHAR(50) DEFAULT 'multiple_choice',
  difficulty_level VARCHAR(50),
  learning_objective VARCHAR(255),
  option_a TEXT,
  option_b TEXT,
  option_c TEXT,
  option_d TEXT,
  correct_answer VARCHAR(1),
  explanation TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_questions_quiz_id ON public.questions(quiz_id);

-- ============================================================================
-- 10. QUIZ ATTEMPTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.quiz_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES public.students(id) ON DELETE CASCADE,
  quiz_id UUID REFERENCES public.quizzes(id) ON DELETE CASCADE,
  topic_id UUID REFERENCES public.topics(id),
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,
  total_time_seconds INTEGER,
  total_questions INTEGER,
  correct_answers INTEGER,
  score_percentage DECIMAL(5,2),
  status VARCHAR(50) DEFAULT 'in_progress',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_quiz_attempts_student_id ON public.quiz_attempts(student_id);
CREATE INDEX idx_quiz_attempts_quiz_id ON public.quiz_attempts(quiz_id);

-- ============================================================================
-- 11. QUESTION RESPONSES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.question_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_attempt_id UUID REFERENCES public.quiz_attempts(id) ON DELETE CASCADE,
  question_id UUID REFERENCES public.questions(id),
  student_answer TEXT,
  is_correct BOOLEAN,
  time_spent_seconds INTEGER,
  answered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_question_responses_attempt_id ON public.question_responses(quiz_attempt_id);

-- ============================================================================
-- 12. TOPIC PROGRESS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.topic_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES public.students(id) ON DELETE CASCADE,
  topic_id UUID REFERENCES public.topics(id) ON DELETE CASCADE,
  status VARCHAR(50) DEFAULT 'not_started',
  first_attempted TIMESTAMP,
  last_attempted TIMESTAMP,
  times_attempted INTEGER DEFAULT 0,
  best_score_percentage DECIMAL(5,2),
  average_score_percentage DECIMAL(5,2),
  total_time_minutes INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(student_id, topic_id)
);

CREATE INDEX idx_topic_progress_student_id ON public.topic_progress(student_id);

-- ============================================================================
-- 13. APP SESSIONS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.app_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES public.students(id) ON DELETE CASCADE,
  topic_id UUID REFERENCES public.topics(id),
  activity_type VARCHAR(50) DEFAULT 'viewing_lesson',
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ended_at TIMESTAMP,
  duration_seconds INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_app_sessions_student_id ON public.app_sessions(student_id);

-- ============================================================================
-- 14. PARENT DASHBOARD DATA TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.parent_dashboard_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES public.students(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  total_time_minutes INTEGER DEFAULT 0,
  total_quizzes_taken INTEGER DEFAULT 0,
  average_score_percentage DECIMAL(5,2),
  topics_completed INTEGER DEFAULT 0,
  topics_in_progress INTEGER DEFAULT 0,
  strengths TEXT[],
  improvements_needed TEXT[],
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(student_id, parent_id)
);

CREATE INDEX idx_parent_dashboard_student_id ON public.parent_dashboard_data(student_id);

-- ============================================================================
-- 15. TEACHER MATERIALS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.teacher_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID REFERENCES public.teachers(id) ON DELETE CASCADE,
  topic_id UUID REFERENCES public.topics(id),
  markdown_content TEXT,
  status VARCHAR(50) DEFAULT 'draft',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_teacher_materials_teacher_id ON public.teacher_materials(teacher_id);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.topic_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_materials ENABLE ROW LEVEL SECURITY;

-- Students can only see their own data
CREATE POLICY "Students view own data"
  ON public.students FOR SELECT
  USING (auth.uid() = user_id OR auth.role() = 'admin');

CREATE POLICY "Students view own quiz attempts"
  ON public.quiz_attempts FOR SELECT
  USING (student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid()));

CREATE POLICY "Students view own progress"
  ON public.topic_progress FOR SELECT
  USING (student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid()));

-- Parents can see their children's data
CREATE POLICY "Parents view children data"
  ON public.students FOR SELECT
  USING (parent_id = auth.uid() OR auth.role() = 'admin');

-- Teachers can see their own materials
CREATE POLICY "Teachers view own materials"
  ON public.teacher_materials FOR SELECT
  USING (teacher_id IN (SELECT id FROM public.teachers WHERE user_id = auth.uid()) OR auth.role() = 'admin');

-- Public access to lessons and quizzes (once published)
CREATE POLICY "Public lessons"
  ON public.lessons FOR SELECT
  USING (status = 'published');

CREATE POLICY "Public quizzes"
  ON public.quizzes FOR SELECT
  USING (status = 'published');

-- ============================================================================
-- DONE
-- ============================================================================
-- All tables created. RLS policies configured.
-- Next: Run migrations in your database and verify connection.
