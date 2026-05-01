import express from 'express';
import { authMiddleware } from '../config/auth.js';
import { supabase } from '../config/database.js';

const router = express.Router();

/**
 * POST /api/parent/link-request
 * Student sends link request to parent email
 */
router.post('/link-request', authMiddleware, async (req, res) => {
  try {
    const { parent_email } = req.body;
    if (!parent_email) return res.status(400).json({ error: 'Parent email required' });

    // Find parent account
    const { data: parent } = await supabase
      .from('users')
      .select('id, full_name, email')
      .eq('email', parent_email.toLowerCase())
      .eq('role', 'parent')
      .maybeSingle();

    if (!parent) return res.status(404).json({ error: 'No parent account found with that email. Please ask your parent to sign up first.' });

    // Check if already linked
    const { data: existing } = await supabase
      .from('parent_student_links')
      .select('id, status')
      .eq('parent_id', parent.id)
      .eq('student_id', req.user.userId)
      .maybeSingle();

    if (existing) {
      if (existing.status === 'approved') return res.json({ message: 'Already linked to this parent!' });
      if (existing.status === 'pending') return res.json({ message: 'Link request already sent. Waiting for parent approval.' });
    }

    // Create link request
    await supabase.from('parent_student_links').insert([{
      parent_id: parent.id,
      student_id: req.user.userId,
      status: 'pending',
    }]);

    res.json({ message: `Link request sent to ${parent.full_name}! They will need to approve it in their dashboard.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/parent/pending-links
 * Parent sees pending link requests from students
 */
router.get('/pending-links', authMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('parent_student_links')
      .select('id, status, linked_at, users!student_id(id, full_name, email)')
      .eq('parent_id', req.user.userId)
      .eq('status', 'pending');

    if (error) throw error;

    const links = (data || []).map(l => ({
      link_id: l.id,
      student_id: l.users?.id,
      student_name: l.users?.full_name,
      student_email: l.users?.email,
      requested_at: l.linked_at,
    }));

    res.json(links);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/parent/approve-link/:linkId
 * Parent approves a student link request
 */
router.post('/approve-link/:linkId', authMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('parent_student_links')
      .update({ status: 'approved', approved_at: new Date().toISOString() })
      .eq('id', req.params.linkId)
      .eq('parent_id', req.user.userId)
      .select()
      .single();

    if (error) throw error;
    res.json({ message: 'Student linked successfully!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/parent/reject-link/:linkId
 */
router.post('/reject-link/:linkId', authMiddleware, async (req, res) => {
  try {
    await supabase.from('parent_student_links').update({ status: 'rejected' }).eq('id', req.params.linkId).eq('parent_id', req.user.userId);
    res.json({ message: 'Link request rejected.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/parent/unlink/:studentId
 * Parent removes a child from their dashboard
 */
router.delete('/unlink/:studentId', authMiddleware, async (req, res) => {
  try {
    await supabase.from('parent_student_links').delete().eq('parent_id', req.user.userId).eq('student_id', req.params.studentId);
    res.json({ message: 'Student unlinked.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/parent/dashboard
 * Parent dashboard - get all linked children with session summaries
 */
router.get('/dashboard', authMiddleware, async (req, res) => {
  try {
    // Get all approved children
    const { data: links, error } = await supabase
      .from('parent_student_links')
      .select('student_id, users!student_id(id, full_name, email, created_at)')
      .eq('parent_id', req.user.userId)
      .eq('status', 'approved');

    if (error) throw error;

    const children = await Promise.all((links || []).map(async (link) => {
      const student = link.users;
      if (!student) return null;

      // Get session summary for this student
      const { data: sessions } = await supabase
        .from('session_logs')
        .select('duration_minutes, offtopic_count, questions_attempted')
        .eq('student_id', student.id)
        .gte('created_at', new Date(Date.now() - 30*24*60*60*1000).toISOString());

      const totalMinutes = (sessions || []).reduce((s, r) => s + (r.duration_minutes || 0), 0);
      const totalStoppages = (sessions || []).reduce((s, r) => s + (r.offtopic_count || 0), 0);

      return {
        id: student.id,
        name: student.full_name,
        email: student.email,
        total_sessions: (sessions || []).length,
        total_study_time: totalMinutes,
        total_stoppages: totalStoppages,
        avg_score: 0,
      };
    }));

    // Get pending requests count
    const { data: pending } = await supabase
      .from('parent_student_links')
      .select('id')
      .eq('parent_id', req.user.userId)
      .eq('status', 'pending');

    res.json({
      children: children.filter(Boolean),
      pending_count: (pending || []).length,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// GET /api/parent/session-reports/:studentId
// Returns recent session quiz results for parent dashboard
router.get('/session-reports/:studentId', authMiddleware, async (req, res) => {
  try {
    // Verify parent is linked to this student
    const { data: link } = await supabase
      .from('parent_student_links')
      .select('id')
      .eq('parent_id', req.user.userId)
      .eq('student_id', req.params.studentId)
      .eq('status', 'approved')
      .maybeSingle();

    if (!link) return res.status(403).json({ error: 'Not authorised to view this student' });

    // Get quiz results
    const { data: results, error } = await supabase
      .from('session_quiz_results')
      .select('id, subject, topic, score, total, percentage, completed_at, answers')
      .eq('student_id', req.params.studentId)
      .order('completed_at', { ascending: false })
      .limit(10);

    if (error) throw error;

    // Get parent notifications (AI-generated summaries)
    const { data: notifications } = await supabase
      .from('parent_notifications')
      .select('subject, topic, score, total, percentage, summary, weak_areas, notified_at')
      .eq('student_id', req.params.studentId)
      .order('notified_at', { ascending: false })
      .limit(5);

    res.json({
      quiz_results: results || [],
      notifications: notifications || [],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/parent/generate-qr-token
// Student calls this to generate a linkage QR token
router.post('/generate-qr-token', authMiddleware, async (req, res) => {
  try {
    const token = Math.random().toString(36).substring(2, 10).toUpperCase();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 min expiry

    await supabase.from('parent_link_tokens').upsert([{
      student_id: req.user.userId,
      token,
      expires_at: expiresAt,
      used: false,
    }], { onConflict: 'student_id' });

    res.json({ token, expires_at: expiresAt });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/parent/link-by-token
// Parent enters or scans QR token to link immediately
router.post('/link-by-token', authMiddleware, async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Token required' });

    // Find valid token
    const { data: linkToken } = await supabase
      .from('parent_link_tokens')
      .select('student_id, expires_at, used')
      .eq('token', token.toUpperCase().trim())
      .maybeSingle();

    if (!linkToken) return res.status(404).json({ error: 'Invalid code. Please check and try again.' });
    if (linkToken.used) return res.status(400).json({ error: 'This code has already been used.' });
    if (new Date(linkToken.expires_at) < new Date()) return res.status(400).json({ error: 'Code has expired. Ask your child to generate a new one.' });

    // Check not already linked
    const { data: existing } = await supabase
      .from('parent_student_links')
      .select('id, status')
      .eq('parent_id', req.user.userId)
      .eq('student_id', linkToken.student_id)
      .maybeSingle();

    if (existing?.status === 'approved') {
      return res.json({ message: 'Already linked to this student!' });
    }

    // Create approved link immediately
    await supabase.from('parent_student_links').upsert([{
      parent_id: req.user.userId,
      student_id: linkToken.student_id,
      status: 'approved',
      approved_at: new Date().toISOString(),
    }], { onConflict: 'parent_id,student_id' });

    // Mark token used
    await supabase.from('parent_link_tokens').update({ used: true }).eq('token', token.toUpperCase().trim());

    // Get student name for response
    const { data: student } = await supabase
      .from('students')
      .select('full_name')
      .eq('id', linkToken.student_id)
      .maybeSingle();

    res.json({ message: `Successfully linked to ${student?.full_name ?? 'student'}!` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/parent/link-by-student-id
// Parent enters student ID — requires student approval
router.post('/link-by-student-id', authMiddleware, async (req, res) => {
  try {
    const { student_id } = req.body;
    if (!student_id) return res.status(400).json({ error: 'Student ID required' });

    const { data: student } = await supabase
      .from('students')
      .select('id, full_name')
      .eq('id', student_id)
      .maybeSingle();

    if (!student) return res.status(404).json({ error: 'Student not found. Please check the ID.' });

    const { data: existing } = await supabase
      .from('parent_student_links')
      .select('id, status')
      .eq('parent_id', req.user.userId)
      .eq('student_id', student_id)
      .maybeSingle();

    if (existing?.status === 'approved') return res.json({ message: 'Already linked!' });
    if (existing?.status === 'pending') return res.json({ message: 'Request already sent — waiting for student approval.' });

    await supabase.from('parent_student_links').insert([{
      parent_id: req.user.userId,
      student_id,
      status: 'pending',
    }]);

    res.json({ message: `Link request sent to ${student.full_name}. Waiting for their approval.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
