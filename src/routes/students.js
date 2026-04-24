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
      // quiz_results table may not exist yet — return empty
      return res.json([]);
    }

    res.json(data || []);
  } catch (err) {
    res.json([]);
  }
});

export default router;
