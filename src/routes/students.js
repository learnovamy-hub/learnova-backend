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
      // quiz_results table may not exist yet ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â return empty
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
      .update({ form_level, subjects, onboarding_complete, preferred_language })
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

    // Build response Ã¢â‚¬â€ enrolled subjects only, mark unlocked status
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

/**
 * GET /api/student/id-card
 * Returns student_code and barcode_url for the logged-in student
 */
router.get('/id-card', authMiddleware, async (req, res) => {
  try {
    const { data: student, error } = await supabase
      .from('students')
      .select('id, name, student_code, barcode_url, form_level')
      .eq('id', req.user.userId)
      .maybeSingle();
    if (error) throw error;
    res.json({ student });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/student/my-id
 * Returns student_code and barcode for profile screen.
 * Generates QR on demand if barcode is missing.
 */
router.get('/my-id', authMiddleware, async (req, res) => {
  try {
    const { data: student, error } = await supabase
      .from('students')
      .select('id, name, student_code, barcode_url, form_level')
      .eq('id', req.user.userId)
      .maybeSingle();

    if (error) throw error;
    if (!student) return res.status(404).json({ error: 'Student not found' });

    // Generate QR if student_code exists but barcode is missing
    if (student.student_code && !student.barcode_url) {
      try {
        const QRCode = await import('qrcode');
        const barcodeUrl = await QRCode.default.toDataURL(student.student_code, {
          width: 300, margin: 2,
          color: { dark: '#1a1a2e', light: '#ffffff' },
          errorCorrectionLevel: 'M',
        });
        await supabase
          .from('students')
          .update({ barcode_url: barcodeUrl, barcode_generated_at: new Date().toISOString() })
          .eq('id', student.id);
        student.barcode_url = barcodeUrl;
      } catch (qrErr) {
        console.error('[StudentID] QR generation failed:', qrErr.message);
      }
    }

    return res.json({
      student_code: student.student_code,
      barcode_url: student.barcode_url,
      name: student.name,
      form: student.form_level,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/student/notifications
 * Returns notifications for the logged-in student
 */
router.get('/notifications', authMiddleware, async (req, res) => {
  try {
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('recipient_id', req.user.userId)
      .eq('recipient_type', 'student')
      .order('created_at', { ascending: false })
      .limit(30);
    const unread = (data || []).filter(n => !n.is_read).length;
    res.json({ notifications: data || [], unread_count: unread });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /api/student/notifications/read
 * Mark one or all notifications as read
 */
router.patch('/notifications/read', authMiddleware, async (req, res) => {
  try {
    const { notification_id } = req.body;
    const q = supabase.from('notifications').update({ is_read: true }).eq('recipient_id', req.user.userId);
    if (notification_id) q.eq('id', notification_id);
    await q;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/student/connection/respond
 * Student accepts or rejects a parent connection request
 * Body: { request_id, action: 'accept' | 'reject' }
 */
router.post('/connection/respond', authMiddleware, async (req, res) => {
  try {
    const { request_id, action } = req.body;
    if (!['accept', 'reject'].includes(action)) return res.status(400).json({ error: 'Tindakan tidak sah.' });

    const { data: conn } = await supabase
      .from('parent_student_connections')
      .select('*')
      .eq('id', request_id)
      .eq('student_id', req.user.userId)
      .eq('status', 'pending')
      .maybeSingle();

    if (!conn) return res.status(404).json({ error: 'Permintaan tidak dijumpai.' });

    const now = new Date().toISOString();
    const newStatus = action === 'accept' ? 'accepted' : 'rejected';
    await supabase
      .from('parent_student_connections')
      .update({
        status: newStatus,
        responded_at: now,
        ...(action === 'accept' ? { accepted_at: now } : {}),
      })
      .eq('id', request_id);

    if (action === 'accept') {
      await supabase.from('notifications').insert({
        recipient_id: conn.parent_id,
        recipient_type: 'parent',
        type: 'connection_accepted',
        title: 'Permintaan Diterima',
        message: 'Pelajar telah menerima permintaan sambungan kamu. Kamu kini boleh memantau pembelajaran mereka.',
        data: { student_id: req.user.userId, request_id },
      });
    } else {
      await supabase.from('notifications').insert({
        recipient_id: conn.parent_id,
        recipient_type: 'parent',
        type: 'connection_rejected',
        title: 'Permintaan Ditolak',
        message: 'Pelajar telah menolak permintaan sambungan kamu.',
        data: { request_id },
      });
    }

    await supabase
      .from('notifications')
      .update({ is_read: true, action_taken: true })
      .eq('recipient_id', req.user.userId)
      .eq('type', 'connection_request')
      .eq('is_read', false);

    return res.json({
      success: true,
      action,
      message: action === 'accept'
        ? 'Sambungan diterima. Ibu bapa kamu kini boleh melihat kemajuan pembelajaran kamu.'
        : 'Permintaan sambungan ditolak.',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Topic read tracking ─────────────────────────────────────────────────────
// POST /api/student/topic-read  { student_id, subject, topic }
// No auth required (student_id passed in body for web clients without Bearer token)
router.post('/topic-read', async (req, res) => {
  try {
    const { student_id, subject, topic } = req.body;
    if (!student_id || !subject || !topic) return res.json({ success: false });

    await supabase.from('student_mastery').upsert({
      student_id,
      subject,
      topic,
      intro_read: true,
      intro_read_at: new Date().toISOString(),
    }, { onConflict: 'student_id,subject,topic', ignoreDuplicates: false });

    return res.json({ success: true });
  } catch (err) {
    // Silently succeed — missing columns or table just means tracking not ready yet
    return res.json({ success: false, reason: err.message });
  }
});

/**
 * GET /api/student/activity-summary
 * Returns aggregated activity stats for the last N days
 */
router.get('/activity-summary', authMiddleware, async (req, res) => {
  try {
    const { days = 7 } = req.query;
    const studentId = req.user.userId;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const { data: activities } = await supabase
      .from('student_activities')
      .select('*')
      .eq('student_id', studentId)
      .gte('created_at', since)
      .order('created_at', { ascending: false });

    if (!activities || activities.length === 0) {
      return res.json({ summary: {}, subjects: [], topics_studied: [], daily_activity: [], recent_activities: [] });
    }

    const sessions     = activities.filter(a => a.activity_type === 'session_start');
    const messages     = activities.filter(a => a.activity_type === 'message_sent');
    const quizzes      = activities.filter(a => a.activity_type === 'quiz_attempted');
    const completions  = activities.filter(a => a.activity_type === 'topic_completed');
    const correctCount = quizzes.filter(a => a.data?.correct).length;

    const topicsStudied = [...new Set(sessions.map(a => a.topic).filter(Boolean))];

    const subjectMap = {};
    sessions.forEach(a => {
      if (a.subject) subjectMap[a.subject] = (subjectMap[a.subject] || 0) + 1;
    });

    const dailyMap = {};
    activities.forEach(a => {
      const day = a.created_at.substring(0, 10);
      dailyMap[day] = (dailyMap[day] || 0) + 1;
    });

    // Study streak
    let streak = 0;
    const studyDays = Object.keys(dailyMap).sort().reverse();
    for (const day of studyDays) {
      const expected = new Date(Date.now() - streak * 86400000).toISOString().substring(0, 10);
      if (day === expected) streak++;
      else break;
    }

    res.json({
      summary: {
        total_sessions: sessions.length,
        total_messages: messages.length,
        topics_completed: completions.length,
        topics_studied: topicsStudied.length,
        quiz_attempts: quizzes.length,
        quiz_accuracy: quizzes.length > 0 ? Math.round((correctCount / quizzes.length) * 100) : 0,
        study_streak: streak,
        days_active: Object.keys(dailyMap).length,
      },
      subjects: Object.entries(subjectMap).map(([subject, count]) => ({ subject, sessions: count })),
      topics_studied: topicsStudied,
      daily_activity: Object.entries(dailyMap).map(([date, count]) => ({ date, count })),
      recent_activities: activities.slice(0, 20),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;











