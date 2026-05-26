/**
 * Learnova Pedagogy Engine - ProgressPersistence
 * Saves and loads all session data to Supabase.
 * Handles session_events and learning_sessions tables.
 */

import { v4 as uuidv4 } from 'uuid';

export class ProgressPersistence {

  constructor(supabase) {
    this.supabase = supabase;
    this.activeSessions = new Map(); // sessionId -> session data in memory
  }

  /**
   * Start a new learning session.
   * Returns sessionId to use throughout the session.
   */
  async startSession(studentId, subject, topic, archetypeUsed = 'kak_sara') {
    const sessionId = uuidv4();

    try {
      // Get current mastery snapshot
      const { data: mastery } = await this.supabase
        .from('student_mastery')
        .select('concept, mastery_score')
        .eq('student_id', studentId)
        .eq('subject', subject);

      const masterySnapshot = {};
      (mastery || []).forEach(m => {
        masterySnapshot[m.concept] = m.mastery_score;
      });

      // Create session record
      const { data } = await this.supabase
        .from('learning_sessions')
        .insert({
          id: sessionId,
          student_id: studentId,
          subject,
          topic,
          archetype_used: archetypeUsed,
          mastery_before: masterySnapshot,
          started_at: new Date().toISOString(),
        })
        .select()
        .single();

      // Track in memory
      this.activeSessions.set(sessionId, {
        studentId, subject, topic, archetypeUsed,
        masteryBefore: masterySnapshot,
        conceptsCovered: new Set(),
        events: [],
        startedAt: Date.now(),
      });

      return sessionId;
    } catch (err) {
      console.error('ProgressPersistence.startSession error:', err.message);
      return sessionId; // Return ID even if DB write fails
    }
  }

  /**
   * Log an event that happened during the session.
   */
  async logEvent(sessionId, studentId, {
    subject, topic, concept,
    eventType, strategyUsed, failureTier, responseTimeMs,
  }) {
    try {
      // Track concept as covered
      const session = this.activeSessions.get(sessionId);
      if (session && concept) session.conceptsCovered.add(concept);

      await this.supabase
        .from('session_events')
        .insert({
          student_id: studentId,
          session_id: sessionId,
          subject,
          topic,
          concept: concept || null,
          event_type: eventType,
          strategy_used: strategyUsed || null,
          failure_tier: failureTier || 0,
          response_time_ms: responseTimeMs || null,
          created_at: new Date().toISOString(),
        });
    } catch (err) {
      console.error('ProgressPersistence.logEvent error:', err.message);
    }
  }

  /**
   * End a session and save final mastery snapshot.
   */
  async endSession(sessionId, studentId, subject, overallPerformance = 0) {
    try {
      const session = this.activeSessions.get(sessionId);

      // Get updated mastery snapshot
      const { data: mastery } = await this.supabase
        .from('student_mastery')
        .select('concept, mastery_score')
        .eq('student_id', studentId)
        .eq('subject', subject);

      const masteryAfter = {};
      (mastery || []).forEach(m => {
        masteryAfter[m.concept] = m.mastery_score;
      });

      await this.supabase
        .from('learning_sessions')
        .update({
          ended_at: new Date().toISOString(),
          mastery_after: masteryAfter,
          concepts_covered: session ? Array.from(session.conceptsCovered) : [],
          overall_performance: overallPerformance,
        })
        .eq('id', sessionId);

      this.activeSessions.delete(sessionId);
    } catch (err) {
      console.error('ProgressPersistence.endSession error:', err.message);
    }
  }

  /**
   * Get session history for a student.
   * Used for parent dashboard and progress tracking.
   */
  async getSessionHistory(studentId, limit = 10) {
    try {
      const { data } = await this.supabase
        .from('learning_sessions')
        .select('*')
        .eq('student_id', studentId)
        .order('started_at', { ascending: false })
        .limit(limit);
      return data || [];
    } catch (_) {
      return [];
    }
  }
}