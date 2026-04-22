import express from 'express';
import { authMiddleware } from '../config/auth.js';
import { getTeacherByUserId } from '../config/database.js';
import { supabase } from '../config/database.js';

const router = express.Router();

router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const teacher = await getTeacherByUserId(req.user.userId);
    if (!teacher) return res.status(404).json({ error: 'Teacher profile not found' });
    res.json({ teacher });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/profile', authMiddleware, async (req, res) => {
  try {
    const { school_name, subjects, years_experience, qualifications, teaching_philosophy } = req.body;
    const teacher = await getTeacherByUserId(req.user.userId);
    if (!teacher) return res.status(404).json({ error: 'Teacher not found' });
    const { data, error } = await supabase.from('teachers').update({ school_name, subjects, years_experience, qualifications, teaching_philosophy, onboarding_complete: true }).eq('user_id', req.user.userId).select().single();
    if (error) throw error;
    res.json({ message: 'Profile updated', teacher: data });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
