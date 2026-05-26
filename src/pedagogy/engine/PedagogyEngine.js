/**
 * Learnova Pedagogy Engine - Master Orchestrator
 * The single entry point for all pedagogy decisions.
 * This is the heart of the app.
 *
 * Usage in tutor.js:
 * import { PedagogyEngine } from '../pedagogy/engine/PedagogyEngine.js';
 * const engine = new PedagogyEngine(supabase);
 * const result = await engine.process({ studentId, subject, topic, message, sessionId });
 * // result.systemPrompt -> ready to send to Claude
 */

import { ResponseClassifier } from './ResponseClassifier.js';
import { MasteryEngine } from './MasteryEngine.js';
import { StrategyEngine } from './StrategyEngine.js';
import { SequencerEngine } from './SequencerEngine.js';
import { ProgressPersistence } from './ProgressPersistence.js';
import { buildMasterSystemPrompt } from '../prompt_builder.js';

export class PedagogyEngine {

  constructor(supabase) {
    this.supabase = supabase;
    this.mastery = new MasteryEngine(supabase);
    this.sequencer = new SequencerEngine(supabase);
    this.persistence = new ProgressPersistence(supabase);

    // In-memory session state (cleared when session ends)
    this.sessionState = new Map();
  }

  /**
   * Start a new tutoring session.
   * Call this when student enters AI Tutor tab.
   */
  async startSession({ studentId, subject, topic, archetypeUsed = 'kak_sara' }) {
    const sessionId = await this.persistence.startSession(
      studentId, subject, topic, archetypeUsed
    );

    this.sessionState.set(sessionId, {
      studentId,
      subject,
      topic,
      archetypeUsed,
      currentConcept: null,
      failureTier: 0,
      offTopicCount: 0,
      lastStrategy: null,
      correctStreak: 0,
      totalExchanges: 0,
    });

    return sessionId;
  }

  /**
   * Process a student message through the full pedagogy pipeline.
   * Returns everything needed to call Claude and log the event.
   *
   * @param {object} params
   * @param {string} params.studentId
   * @param {string} params.subject
   * @param {string} params.topic
   * @param {string} params.concept - current concept being taught
   * @param {string} params.message - raw student message
   * @param {string} params.sessionId
   * @param {string} params.language - 'en' | 'ms' | 'bm'
   * @param {string} params.country - 'MY' | 'SG'
   * @param {number} params.studentFormLevel - 4 or 5
   * @param {object} params.pedagogyIntelligence - from pedagogy_library
   * @param {object} params.anchors - from memory_anchor_library
   * @param {object} params.misconceptions - from misconception_library
   * @param {string} params.langSuffix - language instruction suffix
   * @param {string|null} params.expectedAnswer - for check-in context
   * @param {string} params.context - 'free_chat' | 'check_in' | 'working'
   * @returns {object} { systemPrompt, classification, strategy, sequencerDecision, masteryUpdate }
   */
  async process({
    studentId,
    subject,
    topic,
    concept = null,
    message,
    sessionId,
    language = 'en',
    country = 'MY',
    studentFormLevel = 4,
    pedagogyIntelligence = null,
    pedagogySample = null,
    anchors = null,
    misconceptions = null,
    langSuffix = '',
    expectedAnswer = null,
    context = 'free_chat',
  }) {

    const startTime = Date.now();

    // Get or create session state
    let state = this.sessionState.get(sessionId);
    if (!state) {
      state = {
        studentId, subject, topic,
        archetypeUsed: 'kak_sara',
        currentConcept: concept,
        failureTier: 0,
        offTopicCount: 0,
        lastStrategy: null,
        correctStreak: 0,
        totalExchanges: 0,
      };
      this.sessionState.set(sessionId, state);
    }

    state.totalExchanges++;
    if (concept) state.currentConcept = concept;

    // ── LAYER 1: Classify student response ──────────────────────────────────
    const classification = ResponseClassifier.classify(message, expectedAnswer, context);

    // ── LAYER 2: Get current mastery ────────────────────────────────────────
    const masteryData = concept
      ? await this.mastery.getMastery(studentId, subject, concept)
      : { mastery_score: 0, attempts: 0 };

    // ── LAYER 3: Update failure tier ────────────────────────────────────────
    if (classification.isCorrect) {
      state.failureTier = 0;
      state.correctStreak++;
    } else if (classification.isWrong || classification.isConfused) {
      state.failureTier = Math.min(4, state.failureTier + 1);
      state.correctStreak = 0;
    }

    if (classification.isOffTopic) {
      state.offTopicCount++;
    }

    // ── LAYER 4: Select teaching strategy ───────────────────────────────────
    const { strategy, instruction: strategyInstruction } = StrategyEngine.select({
      classification,
      failureTier: state.failureTier,
      masteryScore: masteryData.mastery_score,
      offTopicCount: state.offTopicCount,
      lastStrategy: state.lastStrategy,
    });
    state.lastStrategy = strategy;

    // ── LAYER 5: Sequencer decision ─────────────────────────────────────────
    const sequencerDecision = concept ? await this.sequencer.decide({
      studentId,
      subject,
      topic,
      currentConcept: concept,
      masteryScore: masteryData.mastery_score,
      failureTier: state.failureTier,
    }) : null;

    // ── LAYER 6: Get mastery context for prompt ──────────────────────────────
    const masteryContext = await this.mastery.buildMasteryContext(studentId, subject, topic);

    // ── LAYER 7: Build complete system prompt ────────────────────────────────
    const systemPrompt = this.buildPrompt({
      subject, topic, concept,
      archetypeUsed: state.archetypeUsed || 'kak_sara',
      country, studentFormLevel, language, langSuffix,
      failureTier: state.failureTier,
      offTopicCount: state.offTopicCount,
      pedagogyIntelligence, pedagogySample, anchors, misconceptions,
      strategyInstruction,
      masteryContext,
      sequencerDecision,
    });

    // ── LAYER 8: Update mastery if answer given ──────────────────────────────
    let masteryUpdate = null;
    if (concept && (classification.isCorrect || classification.isWrong || classification.isPartial)) {
      masteryUpdate = await this.mastery.updateMastery(
        studentId, subject, topic, concept,
        classification.isCorrect,
        classification.type === 'partial',
      );
    }

    // ── LAYER 9: Log event ───────────────────────────────────────────────────
    await this.persistence.logEvent(sessionId, studentId, {
      subject, topic, concept,
      eventType: classification.type,
      strategyUsed: strategy,
      failureTier: state.failureTier,
      responseTimeMs: Date.now() - startTime,
    });

    return {
      systemPrompt,
      classification,
      strategy,
      sequencerDecision,
      masteryUpdate,
      sessionState: { ...state },
    };
  }

  /**
   * Build the final system prompt from all layers.
   */
  buildPrompt({
    subject, topic, concept,
    archetypeUsed, country, studentFormLevel, language, langSuffix,
    failureTier, offTopicCount,
    pedagogyIntelligence, pedagogySample, anchors, misconceptions,
    strategyInstruction, masteryContext, sequencerDecision,
  }) {
    const basePrompt = buildMasterSystemPrompt({
      subject, topic,
      tutorArchetype: archetypeUsed,
      country,
      failureTier,
      studentFormLevel,
      language,
      pedagogyIntelligence,
      pedagogySample,
      langSuffix,
    });

    const extras = [];

    if (strategyInstruction) extras.push(strategyInstruction);
    if (masteryContext) extras.push(masteryContext);

    if (anchors?.length > 0) {
      const anchorText = anchors.map(a => `- "${a.anchor}" (${a.purpose})`).join('\n');
      extras.push(`=== MEMORY ANCHORS FOR THIS TOPIC ===\nUse these in your teaching:\n${anchorText}`);
    }

    if (misconceptions?.length > 0) {
      const miscText = misconceptions.map(m =>
        `- Common mistake: "${m.mistake}" → Correct: "${m.correction}"`
      ).join('\n');
      extras.push(`=== KNOWN MISCONCEPTIONS TO WATCH FOR ===\n${miscText}`);
    }

    if (sequencerDecision?.decision === 'remediate' && sequencerDecision.prerequisiteMissing) {
      extras.push(`=== SEQUENCER ALERT ===\nStudent is missing prerequisite: "${sequencerDecision.prerequisiteMissing}"\nAddress this before continuing with current concept.`);
    }

    if (offTopicCount >= 2) {
      extras.push(`=== DISCIPLINE NOTE ===\nStudent has gone off-topic ${offTopicCount} times this session. Apply Tier ${Math.min(offTopicCount, 3)} discipline.`);
    }

    return [basePrompt, ...extras].filter(Boolean).join('\n\n');
  }

  /**
   * End the session cleanly.
   */
  async endSession(sessionId, studentId, subject) {
    const state = this.sessionState.get(sessionId);
    const performance = state
      ? state.correctStreak > 0
        ? Math.min(1.0, state.correctStreak / Math.max(state.totalExchanges, 1))
        : 0
      : 0;

    await this.persistence.endSession(sessionId, studentId, subject, performance);
    this.sessionState.delete(sessionId);
  }
}