/**
 * Learnova Pedagogy Engine - ResponseClassifier
 * Reads student message and classifies what type of response it is.
 * This is the first gate every student message passes through.
 */

export class ResponseClassifier {

  // Classification types
  static TYPES = {
    CORRECT:             'correct',             // Student got it right
    PARTIAL:             'partial',             // Student partially correct
    WRONG:               'wrong',               // Student got it wrong
    CONFUSED:            'confused',            // Student is lost
    QUESTION:            'question',            // Student asking a question
    OFF_TOPIC:           'off_topic',           // Student went off topic
    SKIP:                'skip',                // Student wants to skip
    ACKNOWLEDGE:         'acknowledge',         // Student just said ok/yes/understood
    EMOTIONAL:           'emotional',           // Student expressing frustration/stress
    UNSURE:              'unsure',              // Student not sure, guessing
    GENERAL_ENRICHMENT:  'general_enrichment',  // "Why is this important?", "Tell me more"
    CALCULATION_HELP:    'calculation_help',    // Numeric problem solving request
  };

  // Keyword patterns for fast classification (no API call needed)
  static PATTERNS = {
    general_enrichment: [
      'kenapa', 'why is', 'why does', 'why do', 'history of', 'sejarah topik',
      'real world', 'real-world', 'kehidupan', 'aplikasi', 'application',
      'boleh cerita', 'cerita lebih', 'explain more', 'tell me more',
      'lebih lanjut', 'interesting', 'fun fact', 'kaitan dengan',
      'how does this relate', 'apa kaitan', 'contoh dalam kehidupan',
      'importance', 'kepentingan', 'where is this used',
    ],
    calculation_help: [
      'calculate', 'kira', 'solve', 'cari nilai', 'jawab soalan',
      'find the value', 'work out', 'compute', 'evaluate',
    ],
    confused: [
      'i dont understand', 'i do not understand', 'tak faham', 'confuse',
      'confused', 'lost', 'what', 'huh', 'blur', 'dont get it',
      'do not get it', 'explain again', 'explain lagi', 'what do you mean',
    ],
    correct_signals: [
      'oh i see', 'oh faham', 'makes sense', 'i get it', 'faham dah',
      'okay faham', 'got it', 'i understand now',
    ],
    off_topic: [
      'what did you eat', 'favourite movie', 'favourite food', 'game',
      'tiktok', 'youtube', 'bored', 'tired', 'hungry', 'sleep',
      'boyfriend', 'girlfriend', 'crush', 'drama',
    ],
    skip: [
      'skip', 'next', 'move on', 'next topic', 'already know',
      'dah tahu', 'tahu dah', 'i know this',
    ],
    emotional: [
      'stress', 'tension', 'give up', 'cannot do', 'too hard',
      'susah sangat', 'menyerah', 'hopeless', 'stupid', 'dumb',
      'hate this', 'hate maths', 'hate physics',
    ],
    question: [
      'why', 'how', 'what is', 'what are', 'can you', 'kenapa',
      'macam mana', 'apa', 'bila', 'where', 'which', '?',
    ],
    acknowledge: [
      'ok', 'okay', 'alright', 'yes', 'yeah', 'yep', 'sure',
      'noted', 'ok cikgu', 'ok kak', 'baik',
    ],
    unsure: [
      'maybe', 'i think', 'not sure', 'perhaps', 'possibly',
      'agaknya', 'rasanya', 'kot', 'entah',
    ],
  };

  /**
   * Classify a student message.
   * Returns classification object with type, confidence, and signals found.
   *
   * @param {string} message - raw student message
   * @param {string|null} expectedAnswer - what the correct answer was (if in check-in)
   * @param {string} context - 'free_chat' | 'check_in' | 'working'
   * @returns {object} { type, confidence, signals, isOffTopic, needsEmotionalSupport }
   */
  static classify(message, expectedAnswer = null, context = 'free_chat') {
    const lower = message.toLowerCase().trim();

    // Emotional support takes absolute priority
    if (this.matchesAny(lower, this.PATTERNS.emotional)) {
      return this.result(this.TYPES.EMOTIONAL, 0.95, ['emotional_keywords']);
    }

    // Check-in context: compare against expected answer
    if (context === 'check_in' && expectedAnswer) {
      return this.classifyCheckIn(lower, expectedAnswer);
    }

    // Calculation help — has digits + math context OR explicit calc keywords
    if (
      this.matchesAny(lower, this.PATTERNS.calculation_help) ||
      /\d.*[+\-×÷*/=]|[+\-×÷*/=].*\d/.test(lower)
    ) {
      return this.result(this.TYPES.CALCULATION_HELP, 0.9, ['calculation_keywords']);
    }

    // General enrichment — curiosity / deeper context questions
    if (this.matchesAny(lower, this.PATTERNS.general_enrichment)) {
      return this.result(this.TYPES.GENERAL_ENRICHMENT, 0.85, ['enrichment_keywords']);
    }

    // Off-topic detection
    if (this.matchesAny(lower, this.PATTERNS.off_topic)) {
      return this.result(this.TYPES.OFF_TOPIC, 0.9, ['off_topic_keywords']);
    }

    // Skip intent
    if (this.matchesAny(lower, this.PATTERNS.skip)) {
      return this.result(this.TYPES.SKIP, 0.9, ['skip_keywords']);
    }

    // Confusion
    if (this.matchesAny(lower, this.PATTERNS.confused)) {
      return this.result(this.TYPES.CONFUSED, 0.9, ['confusion_keywords']);
    }

    // Question
    if (this.matchesAny(lower, this.PATTERNS.question)) {
      return this.result(this.TYPES.QUESTION, 0.85, ['question_keywords']);
    }

    // Acknowledgement only (very short, no content)
    if (lower.length < 20 && this.matchesAny(lower, this.PATTERNS.acknowledge)) {
      return this.result(this.TYPES.ACKNOWLEDGE, 0.8, ['acknowledge_keywords']);
    }

    // Unsure / guessing
    if (this.matchesAny(lower, this.PATTERNS.unsure)) {
      return this.result(this.TYPES.UNSURE, 0.75, ['unsure_keywords']);
    }

    // Default: treat as an attempt (could be correct or wrong - needs Claude to assess)
    return this.result(this.TYPES.PARTIAL, 0.5, ['no_clear_signal']);
  }

  /**
   * Classify a check-in response against the expected answer.
   */
  static classifyCheckIn(lower, expectedAnswer) {
    const expected = expectedAnswer.toLowerCase().trim();

    // Exact or very close match
    if (lower === expected || lower.includes(expected) || expected.includes(lower)) {
      return this.result(this.TYPES.CORRECT, 0.95, ['exact_match']);
    }

    // Confused signals even in check-in
    if (this.matchesAny(lower, this.PATTERNS.confused)) {
      return this.result(this.TYPES.CONFUSED, 0.9, ['confusion_in_checkin']);
    }

    // Short wrong answer
    if (lower.length < 5) {
      return this.result(this.TYPES.WRONG, 0.7, ['too_short']);
    }

    // Default for check-in: needs Claude to verify
    return this.result(this.TYPES.PARTIAL, 0.5, ['needs_claude_verification']);
  }

  static matchesAny(text, patterns) {
    return patterns.some(p => text.includes(p));
  }

  static result(type, confidence, signals) {
    return {
      type,
      confidence,
      signals,
      isOffTopic: type === this.TYPES.OFF_TOPIC,
      needsEmotionalSupport: type === this.TYPES.EMOTIONAL,
      isCorrect: type === this.TYPES.CORRECT,
      isWrong: type === this.TYPES.WRONG,
      isConfused: type === this.TYPES.CONFUSED,
    };
  }
}