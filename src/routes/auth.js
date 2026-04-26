import express from 'express';
import { body, validationResult } from 'express-validator';
import {
  hashPassword,
  comparePassword,
  generateToken,
  authMiddleware
} from '../config/auth.js';
import {
  createUser,
  getUserByEmail,
  getUserById,
  createStudent,
  createTeacher,
  getStudentByUserId,
  getTeacherByUserId,
  trackLogin,
  getResumeState,
  saveResumeState
} from '../config/database.js';

const router = express.Router();

/**
 * POST /api/auth/signup
 * Register a new user (student, parent, or teacher)
 */
router.post(
  '/signup',
  [
    body('email').isEmail(),
    body('password').isLength({ min: 6 }),
    body('full_name').notEmpty(),
    body('role').isIn(['student', 'parent', 'teacher'])
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { email, password, full_name, role, parent_id, school_name, form_level, subject, bio } = req.body;

      // Check if user already exists
      const existingUser = await getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ error: 'User already exists' });
      }

      // Hash password
      const passwordHash = await hashPassword(password);

      // Create user
      const user = await createUser(email, passwordHash, full_name, role);

      // If student, create student profile
      // Auto-link to parent if parent_email provided
      if (role === 'student' && parent_email) {
        const { data: parentUser } = await supabase.from('users').select('id').eq('email', parent_email.toLowerCase()).eq('role', 'parent').maybeSingle();
        if (parentUser) {
          await supabase.from('parent_student_links').upsert([{ parent_id: parentUser.id, student_id: user.id, status: 'pending' }], { onConflict: 'parent_id,student_id', ignoreDuplicates: true });
        }
      }
      // Student profile created on first login

      // If teacher, create teacher profile
      if (role === 'teacher') {
        await createTeacher(user.id, subject || 'Mathematics', 4, bio || null);
      }

      // Generate token
      const token = generateToken(user.id, role);

      res.status(201).json({
        message: 'User registered successfully',
        token,
        user: {
          id: user.id,
          email: user.email,
          full_name: user.full_name,
          role: user.role
        }
      });
    } catch (error) {
      console.error('Signup error:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * POST /api/auth/login
 * Login user and return JWT token
 */
router.post(
  '/login',
  [
    body('email').isEmail(),
    body('password').notEmpty()
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { email, password } = req.body;

      // Find user
      const user = await getUserByEmail(email);
      if (!user) {
        return res.status(401).json({ error: 'Incorrect email or password. Please try again.' });
      }

      // Compare password
      const isPasswordValid = await comparePassword(password, user.password_hash);
      if (!isPasswordValid) {
        return res.status(401).json({ error: 'Incorrect email or password. Please try again.' });
      }

      // Generate token
      const token = generateToken(user.id, user.role);

      const loginMeta = await trackLogin(
        user.id,
        user.role,
        user.email,
        req.headers['user-agent'] || null
      );

      const resumeState = await getResumeState(user.id, user.role);

      // Create a default resume state for first login users
      if (loginMeta.isFirstLogin && !resumeState) {
        await saveResumeState(user.id, user.role, {
          last_screen: user.role === 'teacher'
            ? 'teacher_onboarding'
            : user.role === 'parent'
              ? 'parent_dashboard'
              : 'student_dashboard',
          subject: null,
          topic: null,
          subtopic: null,
          lesson_id: null,
          quiz_id: null,
          progress_percent: 0
        });
      }

      const latestResumeState = await getResumeState(user.id, user.role);

      res.json({
        message: loginMeta.isFirstLogin ? 'Welcome to Learnova!' : 'Welcome back!',
        token,
        is_first_login: loginMeta.isFirstLogin,
        login_count: loginMeta.loginCount,
        resume_state: latestResumeState,
        user: {
          id: user.id,
          email: user.email,
          full_name: user.full_name,
          role: user.role
        }
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * GET /api/auth/me
 * Get current user info (requires auth token)
 */
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await getUserById(req.user.userId);
    res.json({
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/auth/student-profile
 * Get student profile (requires auth + student role)
 */
router.get('/student-profile', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'student') {
      return res.status(403).json({ error: 'Students only' });
    }

    const student = await getStudentByUserId(req.user.userId);
    if (!student) {
      return res.status(404).json({ error: 'Student profile not found' });
    }

    res.json({ student });
  } catch (error) {
    console.error('Get student profile error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/auth/teacher-profile
 * Get teacher profile (requires auth + teacher role)
 */
router.get('/teacher-profile', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'teacher') {
      return res.status(403).json({ error: 'Teachers only' });
    }

    const teacher = await getTeacherByUserId(req.user.userId);
    if (!teacher) {
      return res.status(404).json({ error: 'Teacher profile not found' });
    }

    res.json({ teacher });
  } catch (error) {
    console.error('Get teacher profile error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;



