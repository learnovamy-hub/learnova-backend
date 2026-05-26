/**
 * Learnova Pedagogy Engine - SequencerEngine
 * Decides what comes NEXT in the learning journey.
 * Uses concept_graph to check prerequisites.
 * Decides: advance / repeat / remediate / complete.
 */

export class SequencerEngine {

  static DECISIONS = {
    ADVANCE:     'advance',     // Move to next concept
    REPEAT:      'repeat',      // Stay on current concept
    REMEDIATE:   'remediate',   // Go back to prerequisite
    COMPLETE:    'complete',    // Topic fully mastered
    CHECKPOINT:  'checkpoint',  // Run a mastery check before advancing
  };

  constructor(supabase) {
    this.supabase = supabase;
  }

  /**
   * Decide what to do next based on current mastery and concept graph.
   *
   * @param {object} params
   * @param {string} params.studentId
   * @param {string} params.subject
   * @param {string} params.topic
   * @param {string} params.currentConcept
   * @param {number} params.masteryScore - current concept mastery
   * @param {number} params.failureTier
   * @returns {object} { decision, nextConcept, reason, prerequisiteMissing }
   */
  async decide({ studentId, subject, topic, currentConcept, masteryScore, failureTier }) {

    // Mastered - check if we can advance
    if (masteryScore >= 0.75 && failureTier === 0) {
      const next = await this.getNextConcept(subject, topic, currentConcept);
      if (next) {
        // Check prerequisites of next concept are met
        const prereqMet = await this.checkPrerequisites(studentId, subject, next.concept);
        if (prereqMet.allMet) {
          return {
            decision: this.DECISIONS.ADVANCE,
            nextConcept: next.concept,
            reason: 'Student has mastered current concept',
            prerequisiteMissing: null,
          };
        } else {
          return {
            decision: this.DECISIONS.REMEDIATE,
            nextConcept: prereqMet.weakestPrerequisite,
            reason: 'Prerequisites not met for next concept',
            prerequisiteMissing: prereqMet.weakestPrerequisite,
          };
        }
      } else {
        return {
          decision: this.DECISIONS.COMPLETE,
          nextConcept: null,
          reason: 'All concepts in topic completed',
          prerequisiteMissing: null,
        };
      }
    }

    // High failure - remediate
    if (failureTier >= 3) {
      const prereq = await this.getWeakestPrerequisite(studentId, subject, currentConcept);
      return {
        decision: this.DECISIONS.REMEDIATE,
        nextConcept: prereq || currentConcept,
        reason: 'Student struggling - checking prerequisites',
        prerequisiteMissing: prereq,
      };
    }

    // Medium mastery - checkpoint before advancing
    if (masteryScore >= 0.5 && masteryScore < 0.75) {
      return {
        decision: this.DECISIONS.CHECKPOINT,
        nextConcept: currentConcept,
        reason: 'Mastery developing - run checkpoint before advancing',
        prerequisiteMissing: null,
      };
    }

    // Default - repeat current concept
    return {
      decision: this.DECISIONS.REPEAT,
      nextConcept: currentConcept,
      reason: 'Mastery not sufficient to advance',
      prerequisiteMissing: null,
    };
  }

  /**
   * Get the next concept in sequence for this topic.
   */
  async getNextConcept(subject, topic, currentConcept) {
    try {
      const { data } = await this.supabase
        .from('concept_graph')
        .select('concept, difficulty_level')
        .eq('subject', subject)
        .eq('topic', topic)
        .gt('difficulty_level', 0)
        .order('difficulty_level', { ascending: true });

      if (!data || data.length === 0) return null;

      const currentIndex = data.findIndex(c => c.concept === currentConcept);
      if (currentIndex === -1 || currentIndex >= data.length - 1) return null;

      return data[currentIndex + 1];
    } catch (_) {
      return null;
    }
  }

  /**
   * Check if all prerequisites for a concept are met.
   */
  async checkPrerequisites(studentId, subject, concept) {
    try {
      const { data: graphEntry } = await this.supabase
        .from('concept_graph')
        .select('prerequisites')
        .eq('subject', subject)
        .eq('concept', concept)
        .maybeSingle();

      if (!graphEntry || !graphEntry.prerequisites || graphEntry.prerequisites.length === 0) {
        return { allMet: true, weakestPrerequisite: null };
      }

      const prerequisites = graphEntry.prerequisites;
      let weakest = null;
      let weakestScore = 1.0;

      for (const prereq of prerequisites) {
        const { data: mastery } = await this.supabase
          .from('student_mastery')
          .select('mastery_score')
          .eq('student_id', studentId)
          .eq('subject', subject)
          .eq('concept', prereq)
          .maybeSingle();

        const score = mastery?.mastery_score || 0;
        if (score < 0.5) {
          if (score < weakestScore) {
            weakestScore = score;
            weakest = prereq;
          }
        }
      }

      return {
        allMet: weakest === null,
        weakestPrerequisite: weakest,
      };
    } catch (_) {
      return { allMet: true, weakestPrerequisite: null };
    }
  }

  /**
   * Get the weakest prerequisite concept for remediation.
   */
  async getWeakestPrerequisite(studentId, subject, concept) {
    const result = await this.checkPrerequisites(studentId, subject, concept);
    return result.weakestPrerequisite;
  }
}