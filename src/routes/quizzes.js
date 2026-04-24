import express from 'express';
import { body, validationResult } from 'express-validator';
import { authMiddleware, studentMiddleware } from '../config/auth.js';
import {
  supabase,
  getStudentByUserId,
  updateTopicProgress
} from '../config/database.js';

const router = express.Router();

// GET /api/quizzes/list/:subject
router.get('/list/:subject', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('quizzes')
      .select('id, title, topic, subject, difficulty, total_questions, is_published')
      .eq('subject', req.params.subject)
      .eq('is_published', true)
      .order('topic', { ascending: true });
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/quizzes/:quizId
 * Get quiz questions
 */
router.get('/:quizId', async (req, res) => {
  try {
    const { data: quiz, error: quizError } = await supabase
      .from('quizzes')
      .select('*')
      .eq('id', req.params.quizId)
      .eq('status', 'published')
      .single();

    if (quizError || !quiz) {
      return res.status(404).json({ error: 'Quiz not found' });
    }

    const { data: questions, error: questionsError } = await supabase
      .from('quiz_questions').select('id, question, type, options, correct_answer, explanation, difficulty_level')
      .eq('quiz_id', req.params.quizId)
      .order('question_number', { ascending: true });

    if (questionsError) throw questionsError;

    res.json({
      quiz,
      questions
    });
  } catch (error) {
    console.error('Get quiz error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/quizzes/:quizId/start
 * Start a quiz attempt
 */
router.post(
  '/:quizId/start',
  authMiddleware,
  studentMiddleware,
  async (req, res) => {
    try {
      const student = await getStudentByUserId(req.user.userId);
      if (!student) {
        return res.status(404).json({ error: 'Student profile not found' });
      }

      // Get quiz to find topic
      const { data: quiz, error: quizError } = await supabase
        .from('quizzes')
        .select('*')
        .eq('id', req.params.quizId)
        .single();

      if (quizError || !quiz) {
        return res.status(404).json({ error: 'Quiz not found' });
      }

      // Create quiz attempt
      const { data: attempt, error: attemptError } = await supabase
        .from('quiz_attempts')
        .insert([{
          student_id: student.id,
          quiz_id: req.params.quizId,
          topic_id: quiz.topic_id,
          status: 'in_progress'
        }])
        .select()
        .single();

      if (attemptError) throw attemptError;

      res.json({
        message: 'Quiz started',
        attempt_id: attempt.id,
        time_limit_minutes: quiz.time_limit_minutes
      });
    } catch (error) {
      console.error('Start quiz error:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * POST /api/quizzes/attempts/:attemptId/submit
 * Submit quiz responses and calculate score
 */
router.post(
  '/attempts/:attemptId/submit',
  [
    body('responses').isArray(),
    body('time_spent_seconds').isInt({ min: 0 })
  ],
  authMiddleware,
  studentMiddleware,
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { responses, time_spent_seconds } = req.body;

      // Get attempt
      const { data: attempt, error: attemptError } = await supabase
        .from('quiz_attempts')
        .select('*')
        .eq('id', req.params.attemptId)
        .single();

      if (attemptError || !attempt) {
        return res.status(404).json({ error: 'Attempt not found' });
      }

      // Get all questions for the quiz
      const { data: questions, error: questionsError } = await supabase
        .from('quiz_questions').select('id, correct_answer')
        .eq('quiz_id', attempt.quiz_id);

      if (questionsError) throw questionsError;

      // Grade responses
      let correctCount = 0;
      const gradePromises = responses.map(async (response) => {
        const question = questions.find(q => q.id === response.question_id);
        const isCorrect = question && question.correct_answer === response.answer;

        if (isCorrect) correctCount++;

        // Store response
        await supabase
          .from('question_responses')
          .insert([{
            quiz_attempt_id: req.params.attemptId,
            question_id: response.question_id,
            student_answer: response.answer,
            is_correct: isCorrect,
            time_spent_seconds: response.time_spent_seconds || 0
          }]);
      });

      await Promise.all(gradePromises);

      const totalQuestions = questions.length;
      const scorePercentage = (correctCount / totalQuestions) * 100;
      const passed = scorePercentage >= (attempt.quiz?.passing_score_percentage || 70);

      // Update attempt
      const { data: updatedAttempt, error: updateError } = await supabase
        .from('quiz_attempts')
        .update({
          completed_at: new Date().toISOString(),
          total_time_seconds: time_spent_seconds,
          total_questions: totalQuestions,
          correct_answers: correctCount,
          score_percentage: scorePercentage,
          status: 'completed'
        })
        .eq('id', req.params.attemptId)
        .select()
        .single();

      if (updateError) throw updateError;

      // Update topic progress
      const newStatus = scorePercentage >= 80 ? 'mastered' : scorePercentage >= 70 ? 'completed' : 'in_progress';
      await updateTopicProgress(attempt.student_id, attempt.topic_id, newStatus, scorePercentage);

      res.json({
        message: 'Quiz submitted',
        attempt: updatedAttempt,
        score: {
          percentage: scorePercentage.toFixed(2),
          correct: correctCount,
          total: totalQuestions,
          passed
        }
      });
    } catch (error) {
      console.error('Submit quiz error:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * GET /api/quizzes/attempts/:attemptId
 * Get quiz attempt results
 */
router.get('/attempts/:attemptId', authMiddleware, async (req, res) => {
  try {
    const { data: attempt, error: attemptError } = await supabase
      .from('quiz_attempts')
      .select('*')
      .eq('id', req.params.attemptId)
      .single();

    if (attemptError || !attempt) {
      return res.status(404).json({ error: 'Attempt not found' });
    }

    const { data: responses, error: responsesError } = await supabase
      .from('question_responses')
      .select(`
        *,
        questions:question_id(explanation)
      `)
      .eq('quiz_attempt_id', req.params.attemptId);

    if (responsesError) throw responsesError;

    res.json({
      attempt,
      responses
    });
  } catch (error) {
    console.error('Get attempt error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;


