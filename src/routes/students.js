import express from 'express';
import { authMiddleware } from '../config/auth.js';
import { supabase } from '../config/database.js';

const router = express.Router();

/**
 * GET /api/student/profile
 */
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, full_name, role, created_at')
      .eq('id', req.user.userId)
      .single();

    if (error) throw error;

    // Get quiz stats
    const { data: quizResults } = await supabase
      .from('quiz_results')
      .select('score, total, percentage')
      .eq('user_id', req.user.userId);

    const totalQuizzes = quizResults?.length || 0;
    const avgScore = totalQuizzes > 0
      ? Math.round(quizResults.reduce((sum, r) => sum + (r.percentage || 0), 0) / totalQuizzes)
      : 0;

    res.json({
      student: {
        id: user.id,
        email: user.email,
        name: user.full_name,
        role: user.role,
        created_at: user.created_at,
      },
      stats: {
        totalQuizzes,
        avgScore,
        totalStudyTime: 0,
      }
    });
  } catch (err) {
    console.error('Student profile error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/student/quiz-history
 */
router.get('/quiz-history', authMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('quiz_results')
      .select('id, quiz_id, score, total, percentage, created_at, quizzes(title, topic, subject)')
      .eq('user_id', req.user.userId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      // quiz_results table may not exist yet Ã¢â‚¬â€ return empty
      return res.json([]);
    }

    res.json(data || []);
  } catch (err) {
    res.json([]);
  }
});


// PATCH /api/student/profile - save onboarding data
router.post('/profile/onboard', async (req, res) => {
  try {
    let { student_id, token, form_level, subjects, preferred_language, onboarding_complete } = req.body;
    if (!student_id && token) {
      try {
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
        student_id = payload.userId;
      } catch(_) {}
    }
    if (!student_id) return res.status(400).json({ error: 'student_id required' });
    const { error } = await supabase.from('students').upsert(
      { id: student_id, form_level, subjects, preferred_language, onboarding_complete },
      { onConflict: 'id' }
    );
    if (error) throw error;
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/profile', async (req, res) => {
  try {
    let { student_id, form_level, subjects, onboarding_complete, preferred_language } = req.body;
    // Also check header
    if (!student_id) student_id = req.headers['x-student-id'];
    // Also check JWT
    if (!student_id) {
      try {
        const auth = req.headers['authorization'] || '';
        if (auth.startsWith('Bearer ')) {
          const jwt = JSON.parse(Buffer.from(auth.split('.')[1], 'base64').toString());
          student_id = jwt.userId;
        }
      } catch(_) {}
    }
    if (!student_id) {
      const auth = req.headers['authorization'];
      if (auth) {
        try {
          const { generateToken, verifyToken } = await import('../config/auth.js');
          const decoded = verifyToken(auth.replace('Bearer ', ''));
          student_id = decoded?.userId;
        } catch(e) {}
      }
    }
    if (!student_id) return res.status(400).json({ error: 'student_id required' });
    const { error } = await supabase
      .from('students')
      .update({ form_level, subjects, onboarding_complete })
      .eq('id', student_id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/student/profile/:studentId - check onboarding status
router.get('/profile/:studentId', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('students')
      .select('id, form_level, subjects, onboarding_complete, preferred_language')
      .eq('id', req.params.studentId)
      .maybeSingle();
    if (error) throw error;
    res.json(data || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// GET /api/student/enrolled-subjects/:studentId
// Returns ONLY subjects student signed up for during onboarding
// + filters to only subjects with at least one lesson started (unlocked)
router.get('/enrolled-subjects/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;

    // Get student's enrolled subjects from profile
    const { data: student, error: studentErr } = await supabase
      .from('students')
      .select('subjects, form_level')
      .eq('id', studentId)
      .maybeSingle();

    if (studentErr) throw studentErr;
    if (!student) return res.json({ subjects: [] });

    const enrolledSubjects = student.subjects || [];
    const formLevel = student.form_level || 5;

    // Get subjects that have at least one lesson session started (unlocked)
    const { data: sessions } = await supabase
      .from('session_logs')
      .select('subject_name')
      .eq('student_id', studentId)
      .not('subject', 'is', null);

    const unlockedSubjectNames = new Set(
      (sessions || []).map(s => s.subject).filter(Boolean)
    );

    // Subject color map
    const colorMap = {
      'Mathematics':     0xFF6366F1,
      'Add Maths':       0xFF8B5CF6,
      'Physics':         0xFFF59E0B,
      'Biology':         0xFF10B981,
      'Chemistry':       0xFFEF4444,
      'Geography':       0xFF06B6D4,
      'Sejarah':         0xFFD97706,
      'Bahasa Malaysia': 0xFFEC4899,
      'English':         0xFF14B8A6,
      'Pendidikan Islam':0xFF0EA5E9,
      'Pendidikan Moral':0xFFF97316,
      'Accounts':        0xFF84CC16,
      'Economics':       0xFFA855F7,
    };

    // Build response â€” enrolled subjects only, mark unlocked status
    const subjects = enrolledSubjects.map(name => ({
      name,
      color: colorMap[name] || 0xFF6366F1,
      form_level: formLevel,
      unlocked: unlockedSubjectNames.has(name),
      // First subject is always unlocked (entry point)
      // Subsequent subjects only unlocked after first lesson
    }));

    // Always unlock the first subject so student isn't stuck on first login
    if (subjects.length > 0 && !subjects[0].unlocked) {
      subjects[0].unlocked = true;
    }

    res.json({ subjects, form_level: formLevel });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/student/last-session/:studentId
// Returns the most recent lesson session so orb can say "continue from X"
router.get('/last-session/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;

    const { data, error } = await supabase
      .from('session_logs')
      .select('subject, topic, started_at')
      .eq('student_id', studentId)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    if (!data) return res.json({ session: null });

    res.json({
      session: {
        subject_name: data.subject,
        topic_name: data.topic,
        subtopic_name: null,
        started_at:     data.started_at,
        duration_seconds: null,
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;











