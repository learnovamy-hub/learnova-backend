import express from 'express';
import { authMiddleware } from '../config/auth.js';
import { supabase } from '../config/database.js';

const router = express.Router();

/**
 * POST /api/sessions/start
 * Called when student starts a tutor session on a topic
 */
router.post('/start', authMiddleware, async (req, res) => {
  try {
    const { subject, topic } = req.body;
    const { data, error } = await supabase
      .from('session_logs')
      .insert([{
        student_id: req.user.userId,
        subject,
        topic,
        session_start: new Date().toISOString(),
        stoppages: [],
        offtopic_count: 0,
      }])
      .select()
      .single();

    if (error) throw error;
    res.json({ session_id: data.id, started_at: data.session_start });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/sessions/stoppage
 * Called when student goes off-topic (from tutor route)
 */
router.post('/stoppage', authMiddleware, async (req, res) => {
  try {
    const { session_id, type, message, timestamp } = req.body;

    // Get current session
    const { data: session } = await supabase
      .from('session_logs')
      .select('stoppages, offtopic_count')
      .eq('id', session_id)
      .eq('student_id', req.user.userId)
      .single();

    if (!session) return res.status(404).json({ error: 'Session not found' });

    const stoppages = session.stoppages || [];
    stoppages.push({
      type: type || 'offtopic',
      message: message?.substring(0, 100),
      timestamp: timestamp || new Date().toISOString(),
    });

    await supabase
      .from('session_logs')
      .update({
        stoppages,
        offtopic_count: (session.offtopic_count || 0) + 1,
      })
      .eq('id', session_id);

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/sessions/end
 * Called when student exits lesson or session times out
 */
router.post('/end', authMiddleware, async (req, res) => {
  try {
    const { session_id, phase_reached, questions_attempted } = req.body;

    const { data: session } = await supabase
      .from('session_logs')
      .select('session_start')
      .eq('id', session_id)
      .eq('student_id', req.user.userId)
      .single();

    if (!session) return res.status(404).json({ error: 'Session not found' });

    const end = new Date();
    const start = new Date(session.session_start);
    const duration = Math.round((end - start) / 60000);

    await supabase
      .from('session_logs')
      .update({
        session_end: end.toISOString(),
        duration_minutes: duration,
        phase_reached: phase_reached || 'unknown',
        questions_attempted: questions_attempted || 0,
      })
      .eq('id', session_id);

    res.json({ ok: true, duration_minutes: duration });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/sessions/parent/:studentId
 * Parent dashboard - full session history for their child
 */
router.get('/parent/:studentId', authMiddleware, async (req, res) => {
  try {
    const { studentId } = req.params;
    const { days = 30 } = req.query;

    const since = new Date();
    since.setDate(since.getDate() - parseInt(days));

    const { data: sessions, error } = await supabase
      .from('session_logs')
      .select('*')
      .eq('student_id', studentId)
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Calculate summary stats
    const totalMinutes = sessions.reduce((s, r) => s + (r.duration_minutes || 0), 0);
    const totalStoppages = sessions.reduce((s, r) => s + (r.offtopic_count || 0), 0);
    const totalQuestions = sessions.reduce((s, r) => s + (r.questions_attempted || 0), 0);

    // Time per subject
    const bySubject = {};
    for (const s of sessions) {
      if (!s.subject) continue;
      bySubject[s.subject] = (bySubject[s.subject] || 0) + (s.duration_minutes || 0);
    }

    // Time per topic
    const byTopic = {};
    for (const s of sessions) {
      if (!s.topic) continue;
      byTopic[s.topic] = (byTopic[s.topic] || 0) + (s.duration_minutes || 0);
    }

    // Recent stoppages
    const recentStoppages = sessions
      .slice(0, 5)
      .flatMap(s => (s.stoppages || []).map(st => ({ ...st, topic: s.topic, subject: s.subject })))
      .slice(0, 10);

    // Daily activity
    const dailyActivity = {};
    for (const s of sessions) {
      const day = s.created_at?.substring(0, 10);
      if (!day) continue;
      if (!dailyActivity[day]) dailyActivity[day] = { minutes: 0, sessions: 0 };
      dailyActivity[day].minutes += s.duration_minutes || 0;
      dailyActivity[day].sessions += 1;
    }

    res.json({
      summary: {
        totalSessions: sessions.length,
        totalMinutes,
        totalHours: Math.round(totalMinutes / 60 * 10) / 10,
        totalStoppages,
        totalQuestions,
        avgSessionMinutes: sessions.length > 0 ? Math.round(totalMinutes / sessions.length) : 0,
      },
      bySubject,
      byTopic,
      recentStoppages,
      dailyActivity,
      sessions: sessions.slice(0, 20),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/sessions/my
 * Student's own session history
 */
router.get('/my', authMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('session_logs')
      .select('id, subject, topic, session_start, session_end, duration_minutes, offtopic_count, phase_reached, questions_attempted')
      .eq('student_id', req.user.userId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
