import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase credentials in environment variables');
}

// Create Supabase client
export const supabase = createClient(supabaseUrl, supabaseKey);

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Create a new user (student, parent, or teacher)
 */
export async function createUser(email, passwordHash, fullName, role) {
  const { data, error } = await supabase
    .from('users')
    .insert([{
      email,
      password_hash: passwordHash,
      full_name: fullName,
      role
    }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Get user by email
 */
export async function getUserByEmail(email) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', email)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

/**
 * Get user by ID
 */
export async function getUserById(id) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data;
}

/**
 * Create a student profile
 */
export async function createStudent(userId, parentId, formLevel, schoolName) {
  const { data, error } = await supabase
    .from('students')
    .insert([{ user_id: userId, parent_email: parentId }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Get student by user ID
 */
export async function getStudentByUserId(userId) {
  const { data, error } = await supabase
    .from('students')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

/**
 * Create a teacher profile
 */
export async function createTeacher(userId, subject, formLevel, bio) {
  const { data, error } = await supabase
    .from('teachers')
    .insert([{
      user_id: userId,
      subject,
      form_level: formLevel,
      bio
    }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Get teacher by user ID
 */
export async function getTeacherByUserId(userId) {
  const { data, error } = await supabase
    .from('teachers')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

/**
 * Get all topics
 */
export async function getAllTopics() {
  const { data, error } = await supabase
    .from('topics')
    .select('*')
    .order('order_index', { ascending: true });

  if (error) throw error;
  return data;
}

/**
 * Get topic by ID
 */
export async function getTopicById(id) {
  const { data, error } = await supabase
    .from('topics')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data;
}

/**
 * Store lesson
 */
export async function createLesson(topicId, teacherPedagogyId, title, content, durationMinutes, difficultyLevel) {
  const { data, error } = await supabase
    .from('lessons')
    .insert([{
      topic_id: topicId,
      teacher_pedagogy_id: teacherPedagogyId,
      title,
      content,
      duration_minutes: durationMinutes,
      difficulty_level: difficultyLevel,
      status: 'published'
    }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Get lesson by topic
 */
export async function getLessonByTopic(topicId) {
  const { data, error } = await supabase
    .from('lessons')
    .select('*')
    .eq('topic_id', topicId)
    .eq('status', 'published')
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

/**
 * Create teacher pedagogy
 */
export async function createTeacherPedagogy(teacherId, topicId, teachingApproach, keyConcepts, misconceptions, examples, assessmentStrategy) {
  const { data, error } = await supabase
    .from('teacher_pedagogies')
    .insert([{
      teacher_id: teacherId,
      topic_id: topicId,
      teaching_approach: teachingApproach,
      key_concepts: keyConcepts,
      common_misconceptions: misconceptions,
      teaching_examples: examples,
      assessment_strategy: assessmentStrategy,
      status: 'approved'
    }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Get teacher pedagogy
 */
export async function getTeacherPedagogy(teacherId, topicId) {
  const { data, error } = await supabase
    .from('teacher_pedagogies')
    .select('*')
    .eq('teacher_id', teacherId)
    .eq('topic_id', topicId)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

/**
 * Store teacher materials (Markdown)
 */
export async function storeTeacherMaterial(teacherId, topicId, markdownContent) {
  const { data, error } = await supabase
    .from('teacher_materials')
    .upsert([{
      teacher_id: teacherId,
      topic_id: topicId,
      markdown_content: markdownContent,
      status: 'approved'
    }], { onConflict: 'teacher_id,topic_id' })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Get teacher material
 */
export async function getTeacherMaterial(teacherId, topicId) {
  const { data, error } = await supabase
    .from('teacher_materials')
    .select('*')
    .eq('teacher_id', teacherId)
    .eq('topic_id', topicId)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

/**
 * Start app session (track learning time)
 */
export async function startAppSession(studentId, topicId, activityType = 'viewing_lesson') {
  const { data, error } = await supabase
    .from('app_sessions')
    .insert([{
      student_id: studentId,
      topic_id: topicId,
      activity_type: activityType,
      started_at: new Date().toISOString()
    }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * End app session
 */
export async function endAppSession(sessionId, durationSeconds) {
  const { data, error } = await supabase
    .from('app_sessions')
    .update({
      ended_at: new Date().toISOString(),
      duration_seconds: durationSeconds
    })
    .eq('id', sessionId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Update topic progress
 */
export async function updateTopicProgress(studentId, topicId, status, scorePercentage) {
  const now = new Date().toISOString();
  
  const { data: existing } = await supabase
    .from('topic_progress')
    .select('*')
    .eq('student_id', studentId)
    .eq('topic_id', topicId)
    .single();

  if (!existing) {
    // Create new progress
    const { data, error } = await supabase
      .from('topic_progress')
      .insert([{
        student_id: studentId,
        topic_id: topicId,
        status,
        first_attempted: now,
        last_attempted: now,
        times_attempted: 1,
        best_score_percentage: scorePercentage,
        average_score_percentage: scorePercentage
      }])
      .select()
      .single();

    if (error) throw error;
    return data;
  } else {
    // Update existing
    const timesAttempted = existing.times_attempted + 1;
    const bestScore = Math.max(existing.best_score_percentage || 0, scorePercentage);
    const avgScore = ((existing.average_score_percentage || 0) * existing.times_attempted + scorePercentage) / timesAttempted;

    const { data, error } = await supabase
      .from('topic_progress')
      .update({
        status,
        last_attempted: now,
        times_attempted: timesAttempted,
        best_score_percentage: bestScore,
        average_score_percentage: avgScore
      })
      .eq('student_id', studentId)
      .eq('topic_id', topicId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }
}

export default supabase;

//
// ============================================================================
// LOGIN TRACKING HELPERS
// ============================================================================

export async function trackLogin(userId, role, email, userAgent = null) {
  await supabase.from('login_events').insert([{
    user_id: userId,
    user_role: role,
    email,
    success: true,
    user_agent: userAgent
  }]);

  const { data: existing } = await supabase
    .from('user_activity_summary')
    .select('*')
    .eq('user_id', userId)
    .eq('user_role', role)
    .maybeSingle();

  if (!existing) {
    await supabase.from('user_activity_summary').insert([{
      user_id: userId,
      user_role: role,
      email,
      first_login_at: new Date().toISOString(),
      last_login_at: new Date().toISOString(),
      login_count: 1
    }]);

    return { isFirstLogin: true, loginCount: 1 };
  }

  const count = (existing.login_count || 0) + 1;

  await supabase
    .from('user_activity_summary')
    .update({
      last_login_at: new Date().toISOString(),
      login_count: count,
      updated_at: new Date().toISOString()
    })
    .eq('id', existing.id);

  return { isFirstLogin: false, loginCount: count };
}

export async function getResumeState(userId, role) {
  const { data } = await supabase
    .from('user_resume_state')
    .select('*')
    .eq('user_id', userId)
    .eq('user_role', role)
    .maybeSingle();

  return data;
}

export async function saveResumeState(userId, role, payload) {
  const { data: existing } = await supabase
    .from('user_resume_state')
    .select('*')
    .eq('user_id', userId)
    .eq('user_role', role)
    .maybeSingle();

  if (existing) {
    await supabase
      .from('user_resume_state')
      .update({
        ...payload,
        updated_at: new Date().toISOString()
      })
      .eq('id', existing.id);
  } else {
    await supabase
      .from('user_resume_state')
      .insert([{
        user_id: userId,
        user_role: role,
        ...payload
      }]);
  }

  return true;
}


