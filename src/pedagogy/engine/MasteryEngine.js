/**
 * Learnova Pedagogy Engine - MasteryEngine
 * Tracks student understanding per concept permanently.
 * Reads and writes to student_mastery table in Supabase.
 */

export class MasteryEngine {

  // Mastery thresholds
  static LEVELS = {
    UNKNOWN:    { min: 0.0,  max: 0.2,  label: 'Not started',   color: 'grey' },
    STRUGGLING: { min: 0.2,  max: 0.4,  label: 'Struggling',    color: 'red' },
    DEVELOPING: { min: 0.4,  max: 0.6,  label: 'Developing',    color: 'orange' },
    CONFIDENT:  { min: 0.6,  max: 0.8,  label: 'Confident',     color: 'yellow' },
    MASTERED:   { min: 0.8,  max: 1.0,  label: 'Mastered',      color: 'green' },
  };

  constructor(supabase) {
    this.supabase = supabase;
  }

  /**
   * Get mastery score for a student on a specific concept.
   * Returns 0.0 if never seen before.
   */
  async getMastery(studentId, subject, concept) {
    try {
      const { data } = await this.supabase
        .from('student_mastery')
        .select('mastery_score, attempts, correct_count, needs_review, last_seen_at')
        .eq('student_id', studentId)
        .eq('subject', subject)
        .eq('concept', concept)
        .maybeSingle();
      return data || { mastery_score: 0.0, attempts: 0, correct_count: 0, needs_review: false };
    } catch (_) {
      return { mastery_score: 0.0, attempts: 0, correct_count: 0, needs_review: false };
    }
  }

  /**
   * Get all mastery records for a student in a subject.
   * Used for progress dashboard.
   */
  async getSubjectMastery(studentId, subject) {
    try {
      const { data } = await this.supabase
        .from('student_mastery')
        .select('*')
        .eq('student_id', studentId)
        .eq('subject', subject)
        .order('mastery_score', { ascending: true });
      return data || [];
    } catch (_) {
      return [];
    }
  }

  /**
   * Get concepts that need review (mastery < 0.6 or needs_review = true).
   * Used to recommend what to study next.
   */
  async getWeakConcepts(studentId, subject = null) {
    try {
      let query = this.supabase
        .from('student_mastery')
        .select('subject, topic, concept, mastery_score, last_seen_at')
        .eq('student_id', studentId)
        .or('mastery_score.lt.0.6,needs_review.eq.true')
        .order('mastery_score', { ascending: true })
        .limit(10);

      if (subject) query = query.eq('subject', subject);

      const { data } = await query;
      return data || [];
    } catch (_) {
      return [];
    }
  }

  /**
   * Update mastery after a student response.
   * isCorrect: true/false
   * isPartial: true/false (partial credit)
   */
  async updateMastery(studentId, subject, topic, concept, isCorrect, isPartial = false) {
    try {
      // Get existing record
      const existing = await this.getMastery(studentId, subject, concept);

      const attempts = (existing.attempts || 0) + 1;
      const correctCount = (existing.correct_count || 0) + (isCorrect ? 1 : isPartial ? 0.5 : 0);

      // Calculate new mastery using weighted recent performance
      // Recent attempts matter more than old ones
      const baseScore = correctCount / attempts;
      const recencyBoost = isCorrect ? 0.05 : isPartial ? 0.01 : -0.05;
      const newScore = Math.min(1.0, Math.max(0.0,
        (existing.mastery_score || 0) * 0.7 + baseScore * 0.3 + recencyBoost
      ));

      // Flag for review if mastery dropped or is consistently low
      const needsReview = newScore < 0.4 || (attempts >= 3 && newScore < 0.5);

      // Upsert into Supabase
      await this.supabase
        .from('student_mastery')
        .upsert({
          student_id: studentId,
          subject,
          topic,
          concept,
          mastery_score: Math.round(newScore * 1000) / 1000,
          attempts,
          correct_count: correctCount,
          needs_review: needsReview,
          last_seen_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'student_id,subject,concept',
        });

      return {
        mastery_score: newScore,
        attempts,
        level: this.getMasteryLevel(newScore),
        needs_review: needsReview,
      };
    } catch (err) {
      console.error('MasteryEngine.updateMastery error:', err.message);
      return null;
    }
  }

  /**
   * Get mastery level label from score.
   */
  getMasteryLevel(score) {
    for (const [key, level] of Object.entries(MasteryEngine.LEVELS)) {
      if (score >= level.min && score <= level.max) return { key, ...level };
    }
    return { key: 'UNKNOWN', ...MasteryEngine.LEVELS.UNKNOWN };
  }

  /**
   * Build a mastery context string for the system prompt.
   * Tells Claude what the student already knows and struggles with.
   */
  async buildMasteryContext(studentId, subject, topic) {
    try {
      const weakConcepts = await this.getWeakConcepts(studentId, subject);
      const subjectMastery = await this.getSubjectMastery(studentId, subject);

      if (subjectMastery.length === 0) return '';

      const weak = weakConcepts.slice(0, 3).map(c =>
        `${c.concept} (mastery: ${Math.round(c.mastery_score * 100)}%)`
      ).join(', ');

      const strong = subjectMastery
        .filter(c => c.mastery_score >= 0.7)
        .slice(0, 3)
        .map(c => c.concept)
        .join(', ');

      const lines = ['=== STUDENT MASTERY CONTEXT ==='];
      if (weak) lines.push(`Weak areas needing attention: ${weak}`);
      if (strong) lines.push(`Strong areas student is confident in: ${strong}`);
      lines.push('Use this to personalise difficulty and flag relevant weak areas during teaching.');

      return lines.join('\n');
    } catch (_) {
      return '';
    }
  }
}