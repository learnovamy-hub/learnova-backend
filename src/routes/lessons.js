import express from 'express';
import { authMiddleware, studentMiddleware } from '../config/auth.js';
import {
  getAllTopics,
  getTopicById,
  getLessonByTopic,
  startAppSession,
  endAppSession,
  getStudentByUserId
} from '../config/database.js';

const router = express.Router();

/**
 * GET /api/topics
 * Get all Form 4 Math topics
 */
router.get('/topics', async (req, res) => {
  try {
    const topics = await getAllTopics();
    res.json({ topics });
  } catch (error) {
    console.error('Get topics error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/topics/:topicId
 * Get specific topic details
 */
router.get('/topics/:topicId', async (req, res) => {
  try {
    const topic = await getTopicById(req.params.topicId);
    if (!topic) {
      return res.status(404).json({ error: 'Topic not found' });
    }
    res.json({ topic });
  } catch (error) {
    console.error('Get topic error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/lessons/:topicId
 * Get lesson for a topic
 */
router.get('/lessons/:topicId', async (req, res) => {
  try {
    const lesson = await getLessonByTopic(req.params.topicId);
    if (!lesson) {
      return res.status(404).json({ error: 'Lesson not found' });
    }
    res.json({ lesson });
  } catch (error) {
    console.error('Get lesson error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/sessions/start
 * Start an app session (track learning time)
 */
router.post(
  '/sessions/start',
  authMiddleware,
  studentMiddleware,
  async (req, res) => {
    try {
      const { topic_id, activity_type = 'viewing_lesson' } = req.body;

      // Get student ID from user ID
      const student = await getStudentByUserId(req.user.userId);
      if (!student) {
        return res.status(404).json({ error: 'Student profile not found' });
      }

      // Start session
      const session = await startAppSession(student.id, topic_id, activity_type);

      res.json({
        message: 'Session started',
        session
      });
    } catch (error) {
      console.error('Start session error:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * POST /api/sessions/:sessionId/end
 * End an app session
 */
router.post(
  '/sessions/:sessionId/end',
  authMiddleware,
  studentMiddleware,
  async (req, res) => {
    try {
      const { duration_seconds } = req.body;

      const session = await endAppSession(req.params.sessionId, duration_seconds);

      res.json({
        message: 'Session ended',
        session
      });
    } catch (error) {
      console.error('End session error:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

// Add this route to lessons.js BEFORE export default router;
// GET /api/lessons?subject=Mathematics&form_level=4
router.get('/', async (req, res) => {
  try {
    const { subject, form_level = 4 } = req.query;

    let query = supabase
      .from('lessons')
      .select('id, title, topic, subject, form_level, introduction, content, worked_examples, common_mistakes, summary, learning_objectives, status, created_at')
      .eq('status', 'published')
      .order('created_at', { ascending: true });

    if (subject) query = query.eq('subject', subject);
    if (form_level) query = query.eq('form_level', parseInt(form_level));

    const { data, error } = await query;
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error('Lessons fetch error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;

