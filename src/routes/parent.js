import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { authMiddleware, hashPassword, comparePassword, generateToken } from '../config/auth.js';
import { supabase, createUser, getUserByEmail } from '../config/database.js';

const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

const _dashCache = new Map(); // parentId → { data, ts }
const DASH_TTL = 30 * 60 * 1000; // 30 minutes

async function generateRecommendations(studentData, parentName = 'Ibu Bapa') {
  try {
    const prompt = `Kamu adalah penasihat pendidikan Learnova yang mesra dan berempati.
Tulis 4 cadangan ringkas dalam Bahasa Malaysia untuk ${parentName} berdasarkan prestasi anak mereka:

Nama pelajar: ${studentData.name}
Subjek: ${(studentData.subjects || []).join(', ') || 'tiada data'}
Skor purata kuiz: ${studentData.avg_score != null ? studentData.avg_score + '%' : 'belum ada kuiz'}
Topik lemah: ${(studentData.weak_topics || []).join(', ') || 'tiada'}
Topik kuat: ${(studentData.strong_topics || []).join(', ') || 'tiada'}
Sesi minggu ini: ${studentData.sessions_this_week || 0}
Streak belajar: ${studentData.streak || 0} hari

Garis panduan:
- Mulakan setiap cadangan dengan "${parentName}, ..." atau "Ibu Bapa, ..."
- Nada hangat, mesra dan menyokong
- Spesifik kepada data di atas, bukan generik
- Setiap cadangan 1-2 ayat sahaja
- Fokus pada tindakan yang boleh diambil ibu bapa
- 4 cadangan sahaja, tiada tajuk, tiada nombor, tiada bullet`;

    const r = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }],
    });
    return r.content[0].text.trim().split('\n').filter(l => l.trim().length > 0).slice(0, 4);
  } catch (_) {
    return [];
  }
}

const router = express.Router();

/**
 * POST /api/parent/signup
 * Register a new parent account, auto-link any pre-registered students
 */
router.post('/signup', async (req, res) => {
  try {
    const { email, password, full_name } = req.body;
    if (!email || !password || !full_name) return res.status(400).json({ error: 'email, password, full_name required' });

    const normalizedEmail = email.toLowerCase().trim();
    const existingUser = await getUserByEmail(normalizedEmail);
    if (existingUser) return res.status(400).json({ error: 'Email sudah digunakan.' });

    const passwordHash = await hashPassword(password);
    const user = await createUser(normalizedEmail, passwordHash, full_name, 'parent');
    const token = generateToken(user.id, 'parent');

    // Auto-link any students that pre-registered with this parent email
    const { data: prelinked } = await supabase
      .from('student_parent_emails')
      .select('student_id, students!student_id(id, student_code, name)')
      .eq('parent_email', normalizedEmail)
      .eq('status', 'pending');

    const linked_students = [];
    for (const row of prelinked || []) {
      const student = row.students;
      if (!student) continue;
      const { error: connErr } = await supabase.from('parent_student_connections').upsert(
        [{
          parent_id: user.id,
          student_id: row.student_id,
          student_code: student.student_code || '',
          connection_method: 'email_prelink',
          connection_type: 'parent',
          status: 'pending',
          parent_name: full_name,
          parent_email: normalizedEmail,
          initiated_by: 'student',
        }],
        { onConflict: 'parent_id,student_id', ignoreDuplicates: true }
      );
      if (!connErr) {
        await supabase.from('student_parent_emails')
          .update({ status: 'claimed', claimed_at: new Date().toISOString() })
          .eq('student_id', row.student_id).eq('parent_email', normalizedEmail);
        linked_students.push(student.name);
      }
    }

    res.status(201).json({
      message: 'Akaun ibu bapa berjaya didaftarkan.',
      token,
      user: { id: user.id, email: user.email, full_name: user.full_name, role: 'parent' },
      linked_students,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/parent/login
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'email and password required' });

    const user = await getUserByEmail(email.toLowerCase().trim());
    if (!user || user.role !== 'parent') return res.status(401).json({ error: 'Emel atau kata laluan tidak sah.' });

    const valid = await comparePassword(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Emel atau kata laluan tidak sah.' });

    const token = generateToken(user.id, 'parent');

    const { data: connections } = await supabase
      .from('parent_student_connections')
      .select('student_id, status')
      .eq('parent_id', user.id)
      .in('status', ['accepted', 'pending']);

    res.json({
      message: 'Selamat datang!',
      token,
      user: { id: user.id, email: user.email, full_name: user.full_name, role: 'parent' },
      connections_count: (connections || []).length,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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
 * POST /api/parent/connect
 * Parent sends a connection request to a student by student_code
 */
router.post('/connect', authMiddleware, async (req, res) => {
  try {
    const { student_code } = req.body;
    if (!student_code) return res.status(400).json({ error: 'student_code required' });

    const { data: student } = await supabase
      .from('students')
      .select('id, name, form_level, student_code')
      .eq('student_code', student_code.toUpperCase().trim())
      .maybeSingle();

    if (!student) return res.status(404).json({ error: 'Kod pelajar tidak dijumpai. Sila semak semula.' });

    // Check existing connection in new table
    const { data: existing } = await supabase
      .from('parent_student_connections')
      .select('id, status')
      .eq('parent_id', req.user.userId)
      .eq('student_id', student.id)
      .maybeSingle();

    if (existing?.status === 'accepted') return res.status(409).json({ error: 'Kamu sudah berhubung dengan pelajar ini.' });
    if (existing?.status === 'pending') return res.status(409).json({ error: 'Permintaan sambungan sudah dihantar. Sila tunggu respons pelajar.' });

    // Get parent info
    const { data: parent } = await supabase
      .from('users')
      .select('id, full_name, email')
      .eq('id', req.user.userId)
      .maybeSingle();

    // Create connection request
    const { data: conn, error: connErr } = await supabase
      .from('parent_student_connections')
      .upsert({
        parent_id: req.user.userId,
        student_id: student.id,
        student_code: student.student_code,
        connection_method: 'manual_id',
        connection_type: 'parent',
        status: 'pending',
        parent_name: parent?.full_name || '',
        parent_email: parent?.email || '',
        initiated_by: 'parent',
        requested_at: new Date().toISOString(),
      }, { onConflict: 'parent_id,student_id' })
      .select()
      .single();

    if (connErr) throw connErr;

    // Notify student (action_required so notification bell shows red badge)
    await supabase.from('notifications').insert({
      recipient_id: student.id,
      recipient_type: 'student',
      type: 'connection_request',
      title: 'Permintaan Sambungan Ibu Bapa',
      message: `${parent?.full_name || 'Ibu bapa'} ingin memantau pembelajaran kamu di Learnova. Adakah kamu bersetuju?`,
      data: {
        request_id: conn.id,
        parent_id: req.user.userId,
        parent_name: parent?.full_name || '',
        parent_email: parent?.email || '',
      },
      action_required: true,
    });

    return res.json({
      success: true,
      message: 'Permintaan telah dihantar kepada pelajar.',
      student_name: student.name,
      request_id: conn.id,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/parent/notifications
 */
router.get('/notifications', authMiddleware, async (req, res) => {
  try {
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('recipient_id', req.user.userId)
      .eq('recipient_type', 'parent')
      .order('created_at', { ascending: false })
      .limit(30);
    res.json({ notifications: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /api/parent/notifications/read
 */
router.patch('/notifications/read', authMiddleware, async (req, res) => {
  try {
    const { notification_id } = req.body;
    if (notification_id) {
      await supabase.from('notifications').update({ is_read: true }).eq('id', notification_id).eq('recipient_id', req.user.userId);
    } else {
      await supabase.from('notifications').update({ is_read: true }).eq('recipient_id', req.user.userId).eq('is_read', false);
    }
    res.json({ success: true });
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
    await supabase.from('parent_student_connections').delete().eq('parent_id', req.user.userId).eq('student_id', req.params.studentId);
    res.json({ message: 'Student unlinked.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/parent/dashboard
 * Full 9-section parent dashboard — cached 30 min per parent
 */
router.get('/dashboard', authMiddleware, async (req, res) => {
  try {
    // Cache check
    const cacheKey = req.user.userId;
    const cached = _dashCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < DASH_TTL) return res.json(cached.data);

    // Parent name
    const { data: parentUser } = await supabase.from('users').select('full_name').eq('id', req.user.userId).maybeSingle();
    const parentName = parentUser?.full_name || 'Ibu Bapa';

    const { data: links, error } = await supabase
      .from('parent_student_connections')
      .select('student_id, students!student_id(id, name, email, form_level, student_code, created_at, subjects, current_streak)')
      .eq('parent_id', req.user.userId)
      .eq('status', 'accepted');
    if (error) throw error;

    const now = new Date();
    const SPM_DATE = new Date('2026-11-19T08:00:00');
    const spmDays = Math.max(0, Math.ceil((SPM_DATE - now) / 86400000));
    const since30d = new Date(Date.now() - 30*86400000).toISOString();
    const since14d = new Date(Date.now() - 14*86400000).toISOString();
    const since7d  = new Date(Date.now() -  7*86400000).toISOString();

    const children = await Promise.all((links || []).map(async link => {
      const st = link.students;
      if (!st) return null;
      const sid = st.id;

      const [
        { data: sessions },
        { data: summaries },
        { data: recSumm },
        { data: prevSumm },
        { data: mastery },
        { data: quizRes },
        { data: recentActivities },
      ] = await Promise.all([
        supabase.from('session_logs').select('duration_minutes, offtopic_count, created_at').eq('student_id', sid).gte('created_at', since30d).order('created_at', { ascending: false }).limit(200),
        supabase.from('session_summary').select('subject, topics_covered, session_duration_minutes, quiz_attempted, quiz_correct, quiz_score_percent, weak_topics, strong_topics, session_date, created_at').eq('student_id', sid).order('session_date', { ascending: false }).limit(60),
        supabase.from('session_summary').select('subject, quiz_score_percent').eq('student_id', sid).gte('session_date', since14d),
        supabase.from('session_summary').select('subject, quiz_score_percent').eq('student_id', sid).lt('session_date', since14d).gte('session_date', since30d),
        supabase.from('student_mastery').select('subject, topic, mastery_score, updated_at').eq('student_id', sid).order('updated_at', { ascending: false }).limit(40),
        supabase.from('quiz_results').select('subject, topic, score, total, percentage, created_at').eq('student_id', sid).order('created_at', { ascending: false }).limit(20),
        supabase.from('student_activities').select('activity_type, subject, topic, data, created_at').eq('student_id', sid).gte('created_at', since7d).order('created_at', { ascending: false }).limit(50),
      ]);

      // Section 1: Overview
      const streak = st.current_streak || 0;
      const formLevel = st.form_level || 0;
      const thirtyMinAgo = new Date(Date.now() - 30*60000).toISOString();
      const isActiveNow = (sessions||[]).some(s => s.created_at >= thirtyMinAgo);
      const enrolledAt = st.created_at ? new Date(st.created_at).toLocaleDateString('en-GB') : '—';

      // Section 2: SPM Countdown
      const topicsCovered = new Set((summaries||[]).flatMap(s => s.topics_covered||[])).size;
      const totalTopicsEst = formLevel >= 4 ? 120 : 80;
      const coveragePct = Math.min(100, Math.round((topicsCovered / totalTopicsEst) * 100));

      // Section 3: Alerts
      const alerts = [];
      const latestSess = (sessions||[])[0];
      const daysSince = latestSess ? Math.floor((now - new Date(latestSess.created_at)) / 86400000) : 999;
      if (streak >= 7) alerts.push({ type: 'achievement', severity: 'success', message: `Tahniah! ${st.name} belajar ${streak} hari berturut-turut` });
      if (daysSince >= 2 && daysSince < 999) alerts.push({ type: 'no_study', severity: 'warning', message: `${st.name} tidak belajar selama ${daysSince} hari` });
      else if (daysSince >= 999) alerts.push({ type: 'no_study', severity: 'info', message: `${st.name} belum memulakan sesi pembelajaran` });
      if (streak >= 3 && daysSince >= 1) alerts.push({ type: 'streak_risk', severity: 'amber', message: `Streak ${streak} hari mungkin akan tamat hari ini!` });
      const failCounts = {};
      for (const qr of quizRes||[]) {
        if ((qr.percentage||0) < 50 && qr.topic) failCounts[`${qr.subject}:${qr.topic}`] = (failCounts[`${qr.subject}:${qr.topic}`]||0)+1;
      }
      for (const [key, cnt] of Object.entries(failCounts)) {
        if (cnt >= 3) {
          const [subj, topic] = key.split(':');
          alerts.push({ type: 'repeated_fail', severity: 'danger', message: `${st.name} gagal "${topic}" (${subj}) sebanyak 3 kali` });
        }
      }

      // Section 4: Subject Performance with trend
      const subjMap = {};
      for (const s of summaries||[]) {
        if (!s.subject) continue;
        if (!subjMap[s.subject]) subjMap[s.subject] = { sessions:0, scores:[], topicsDone:new Set(), weak:new Set(), strong:new Set() };
        const m = subjMap[s.subject];
        m.sessions++;
        if (s.quiz_score_percent != null) m.scores.push(s.quiz_score_percent);
        (s.topics_covered||[]).forEach(t => m.topicsDone.add(t));
        (s.weak_topics||[]).forEach(t => m.weak.add(t));
        (s.strong_topics||[]).forEach(t => m.strong.add(t));
      }
      const recentBySubj = {}, prevBySubj = {};
      for (const s of recSumm||[]) { if (s.subject && s.quiz_score_percent!=null) { if (!recentBySubj[s.subject]) recentBySubj[s.subject]=[]; recentBySubj[s.subject].push(s.quiz_score_percent); } }
      for (const s of prevSumm||[]) { if (s.subject && s.quiz_score_percent!=null) { if (!prevBySubj[s.subject]) prevBySubj[s.subject]=[]; prevBySubj[s.subject].push(s.quiz_score_percent); } }
      const subject_performance = Object.entries(subjMap).map(([subj, m]) => {
        const avg = m.scores.length ? Math.round(m.scores.reduce((a,b)=>a+b,0)/m.scores.length) : null;
        const rArr=recentBySubj[subj]||[], pArr=prevBySubj[subj]||[];
        const rAvg=rArr.length?rArr.reduce((a,b)=>a+b,0)/rArr.length:null;
        const pAvg=pArr.length?pArr.reduce((a,b)=>a+b,0)/pArr.length:null;
        const trend=rAvg!=null&&pAvg!=null?(rAvg>pAvg+5?'up':rAvg<pAvg-5?'down':'stable'):'stable';
        return { subject:subj, avg_score:avg, prev_avg_score:pAvg!=null?Math.round(pAvg):null, trend, sessions:m.sessions, topics_done:m.topicsDone.size, topics_total:formLevel>=4?20:15, weakest_concepts:[...m.weak].slice(0,3), strongest_concepts:[...m.strong].slice(0,3) };
      });

      // Section 6: Behaviour patterns
      const hourCnt={}, dayCnt={}, topicFreq={};
      let totMins=0, sessCnt=0;
      for (const s of summaries||[]) {
        if (!s.session_date) continue;
        const d=new Date(s.session_date);
        hourCnt[d.getHours()]=(hourCnt[d.getHours()]||0)+1;
        dayCnt[d.getDay()]=(dayCnt[d.getDay()]||0)+1;
        if (s.session_duration_minutes) { totMins+=s.session_duration_minutes; sessCnt++; }
        (s.topics_covered||[]).forEach(t => topicFreq[t]=(topicFreq[t]||0)+1);
      }
      const dayNames=['Ahad','Isnin','Selasa','Rabu','Khamis','Jumaat','Sabtu'];
      const peakHour=Object.entries(hourCnt).sort(([,a],[,b])=>b-a)[0]?.[0];
      const prodDays=Object.entries(dayCnt).sort(([,a],[,b])=>b-a).slice(0,3).map(([d])=>dayNames[+d]);
      const topTopics=Object.entries(topicFreq).sort(([,a],[,b])=>b-a).slice(0,5).map(([t])=>t);

      // Section 7: Activity feed
      const feed=[];
      for (const s of (summaries||[]).slice(0,8)) feed.push({ type:'session', subject:s.subject, topics:s.topics_covered||[], minutes:s.session_duration_minutes||0, quiz_score:s.quiz_score_percent, at:s.session_date||s.created_at });
      for (const qr of (quizRes||[]).slice(0,5)) feed.push({ type:'quiz', subject:qr.subject, topic:qr.topic, score:qr.score, total:qr.total, percentage:qr.percentage, at:qr.created_at });
      feed.sort((a,b)=>new Date(b.at)-new Date(a.at));

      // Section 9: Wellbeing
      const mScores=(mastery||[]).map(m=>m.mastery_score).filter(x=>x!=null);
      const masteryAvg=mScores.length?Math.round(mScores.reduce((a,b)=>a+b,0)/mScores.length):null;
      const lowTopics=(mastery||[]).filter(m=>m.mastery_score!=null&&m.mastery_score<40).map(m=>m.topic).slice(0,4);
      let confTrend='stable';
      if (mScores.length>=4) {
        const h=Math.floor(mScores.length/2);
        const rA=mScores.slice(0,h).reduce((a,b)=>a+b,0)/h, oA=mScores.slice(h).reduce((a,b)=>a+b,0)/(mScores.length-h);
        confTrend=rA>oA+5?'improving':rA<oA-5?'declining':'stable';
      }

      // Aggregate stats
      const allAtt=(summaries||[]).reduce((s,r)=>s+(r.quiz_attempted||0),0);
      const allCor=(summaries||[]).reduce((s,r)=>s+(r.quiz_correct||0),0);
      const avgScore=allAtt>0?Math.round((allCor/allAtt)*100):null;
      const allWeak=[...new Set((summaries||[]).flatMap(s=>s.weak_topics||[]))].slice(0,8);
      const allStrong=[...new Set((summaries||[]).flatMap(s=>s.strong_topics||[]))].slice(0,8);
      const sessWeek=(sessions||[]).filter(r=>r.created_at>=since7d).length;
      const totalStudyMins=(sessions||[]).reduce((s,r)=>s+(r.duration_minutes||0),0);

      return {
        id:sid, name:st.name, email:st.email, form_level:formLevel,
        student_code:st.student_code, enrolled_at:enrolledAt,
        subjects:st.subjects||[], is_active_now:isActiveNow, streak,
        spm_countdown:{ days_remaining:spmDays, projected_coverage_pct:coveragePct },
        alerts, subject_performance,
        behaviour:{ peak_study_hour:peakHour!=null?+peakHour:null, avg_session_minutes:sessCnt>0?Math.round(totMins/sessCnt):0, most_reviewed_topics:topTopics, productive_days:prodDays },
        activity_feed:feed.slice(0,10),
        wellbeing:{ confidence_trend:confTrend, mastery_avg:masteryAvg, low_mastery_topics:lowTopics },
        total_sessions:(sessions||[]).length, total_study_minutes:totalStudyMins,
        sessions_this_week:sessWeek, avg_score:avgScore,
        recent_activities: recentActivities || [],
        topics_this_week: [...new Set((recentActivities||[]).filter(a=>a.activity_type==='session_start'&&a.topic).map(a=>a.topic))].slice(0,10),
        quiz_accuracy_this_week: (() => { const q=(recentActivities||[]).filter(a=>a.activity_type==='quiz_attempted'); if(!q.length) return null; return Math.round((q.filter(a=>a.data?.correct).length/q.length)*100); })(),
        _recs:{ name:st.name, subjects:subject_performance.map(sp=>sp.subject), avg_score:avgScore, weak_topics:allWeak, strong_topics:allStrong, sessions_this_week:sessWeek, streak },
      };
    }));

    const valid = children.filter(Boolean);

    // Section 5: Learnova platform average for comparison
    const { data: allSumm } = await supabase.from('session_summary').select('subject, quiz_score_percent').not('quiz_score_percent','is',null).gte('session_date',since30d).limit(500);
    const platMap = {};
    for (const r of allSumm||[]) { if (r.subject) { if (!platMap[r.subject]) platMap[r.subject]=[]; platMap[r.subject].push(r.quiz_score_percent); } }
    const learnovaAvg = {};
    for (const [s,arr] of Object.entries(platMap)) learnovaAvg[s]=Math.round(arr.reduce((a,b)=>a+b,0)/arr.length);

    // Section 8: AI Recommendations + attach comparison
    const final_children = await Promise.all(valid.map(async child => {
      const recs = await generateRecommendations(child._recs, parentName);
      const comp = {};
      for (const sp of child.subject_performance) {
        if (sp.avg_score!=null && learnovaAvg[sp.subject]!=null)
          comp[sp.subject]={ your_score:sp.avg_score, learnova_avg:learnovaAvg[sp.subject], diff:sp.avg_score-learnovaAvg[sp.subject] };
      }
      const { _recs, ...rest } = child;
      return { ...rest, learnova_comparison:comp, recommendations:recs };
    }));

    const { data: pending } = await supabase.from('parent_student_connections').select('id').eq('parent_id',req.user.userId).eq('status','pending');
    const payload = { parent_name:parentName, children:final_children, pending_count:(pending||[]).length };
    _dashCache.set(cacheKey, { data:payload, ts:Date.now() });
    res.json(payload);
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
      .from('parent_student_connections')
      .select('id')
      .eq('parent_id', req.user.userId)
      .eq('student_id', req.params.studentId)
      .eq('status', 'accepted')
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
    // Try by student_id first (newer records), fallback to student_name join
    let notifications = [];
    const { data: notifById } = await supabase
      .from('parent_notifications')
      .select('subject, topic, score, total, percentage, summary, weak_areas, notified_at')
      .eq('student_id', req.params.studentId)
      .order('notified_at', { ascending: false })
      .limit(8);

    if (notifById && notifById.length > 0) {
      notifications = notifById;
    } else {
      // Fallback: join via student name for older rows that didn't store student_id
      const { data: studentRow } = await supabase
        .from('students')
        .select('full_name')
        .eq('id', req.params.studentId)
        .maybeSingle();
      if (studentRow?.full_name) {
        const { data: notifByName } = await supabase
          .from('parent_notifications')
          .select('subject, topic, score, total, percentage, summary, weak_areas, notified_at')
          .eq('student_name', studentRow.full_name)
          .order('notified_at', { ascending: false })
          .limit(8);
        notifications = notifByName || [];
      }
    }

    res.json({
      quiz_results: results || [],
      notifications,
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
      .from('parent_student_connections')
      .select('id, status')
      .eq('parent_id', req.user.userId)
      .eq('student_id', linkToken.student_id)
      .maybeSingle();

    if (existing?.status === 'accepted') {
      return res.json({ message: 'Already linked to this student!' });
    }

    // Get parent info and student code for the connection record
    const { data: parentUser } = await supabase.from('users').select('full_name, email').eq('id', req.user.userId).maybeSingle();
    const { data: studentForCode } = await supabase.from('students').select('student_code').eq('id', linkToken.student_id).maybeSingle();

    // QR scan creates an accepted connection immediately (no student approval needed)
    await supabase.from('parent_student_connections').upsert([{
      parent_id: req.user.userId,
      student_id: linkToken.student_id,
      student_code: studentForCode?.student_code || '',
      connection_method: 'qr_scan',
      connection_type: 'parent',
      status: 'accepted',
      parent_name: parentUser?.full_name || '',
      parent_email: parentUser?.email || '',
      initiated_by: 'parent',
      accepted_at: new Date().toISOString(),
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
      .select('id, name, student_code')
      .eq('id', student_id)
      .maybeSingle();

    if (!student) return res.status(404).json({ error: 'Student not found. Please check the ID.' });

    const { data: existing } = await supabase
      .from('parent_student_connections')
      .select('id, status')
      .eq('parent_id', req.user.userId)
      .eq('student_id', student_id)
      .maybeSingle();

    if (existing?.status === 'accepted') return res.json({ message: 'Already linked!' });
    if (existing?.status === 'pending') return res.json({ message: 'Request already sent — waiting for student approval.' });

    const { data: parentUser } = await supabase.from('users').select('full_name, email').eq('id', req.user.userId).maybeSingle();

    const { data: conn, error: connErr } = await supabase.from('parent_student_connections').insert([{
      parent_id: req.user.userId,
      student_id,
      student_code: student.student_code || '',
      connection_method: 'manual_id',
      connection_type: 'parent',
      status: 'pending',
      parent_name: parentUser?.full_name || '',
      parent_email: parentUser?.email || '',
      initiated_by: 'parent',
    }]).select().single();

    if (connErr) throw connErr;

    // Notify student
    await supabase.from('notifications').insert({
      recipient_id: student_id,
      recipient_type: 'student',
      type: 'connection_request',
      title: 'Permintaan Sambungan Ibu Bapa',
      message: `${parentUser?.full_name || 'Ibu bapa'} ingin memantau pembelajaran kamu di Learnova. Adakah kamu bersetuju?`,
      data: { request_id: conn.id, parent_id: req.user.userId, parent_name: parentUser?.full_name || '', parent_email: parentUser?.email || '' },
      action_required: true,
    });

    res.json({ message: `Link request sent to ${student.name}. Waiting for their approval.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
