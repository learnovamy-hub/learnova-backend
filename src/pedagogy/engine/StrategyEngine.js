/**
 * Learnova Pedagogy Engine - StrategyEngine
 * Decides HOW to teach the next concept based on mastery and failure count.
 * Returns a teaching strategy instruction injected into the system prompt.
 */

export class StrategyEngine {

  static STRATEGIES = {
    SOCRATIC:    'socratic',    // Guide through questions only
    EXPLAIN:     'explain',     // Direct clear explanation first
    ANALOGY:     'analogy',     // Use Malaysian real-world analogy
    STORY:       'story',       // Narrative/storytelling approach
    EXAMPLE:     'example',     // Worked example step by step
    DRILL:       'drill',       // Rapid practice questions
    REMEDIATE:   'remediate',   // Go back to prerequisite concept
    CELEBRATE:   'celebrate',   // Positive reinforcement moment
    EMOTIONAL:   'emotional',   // Emotional support first, study second
  };

  /**
   * Select the best teaching strategy based on current state.
   *
   * @param {object} params
   * @param {string} params.classification - from ResponseClassifier
   * @param {number} params.failureTier - 0-4
   * @param {number} params.masteryScore - 0.0 to 1.0
   * @param {number} params.offTopicCount - times student went off topic this session
   * @param {string} params.lastStrategy - what was used last (avoid repeating)
   * @returns {object} { strategy, instruction }
   */
  static select({
    classification,
    failureTier = 0,
    masteryScore = 0,
    offTopicCount = 0,
    lastStrategy = null,
  }) {

    // Emotional support always wins
    if (classification.needsEmotionalSupport) {
      return this.build(this.STRATEGIES.EMOTIONAL);
    }

    // Student got it right and mastery is high - celebrate and advance
    if (classification.isCorrect && masteryScore >= 0.7) {
      return this.build(this.STRATEGIES.CELEBRATE);
    }

    // Student got it right but mastery still low - drill to consolidate
    if (classification.isCorrect && masteryScore < 0.7) {
      return this.build(this.STRATEGIES.DRILL);
    }

    // Failure tier 1 - try explanation if last was socratic, else socratic
    if (failureTier === 1) {
      const strategy = lastStrategy === this.STRATEGIES.SOCRATIC
        ? this.STRATEGIES.EXPLAIN
        : this.STRATEGIES.SOCRATIC;
      return this.build(strategy);
    }

    // Failure tier 2 - switch to analogy or story
    if (failureTier === 2) {
      const strategy = lastStrategy === this.STRATEGIES.ANALOGY
        ? this.STRATEGIES.STORY
        : this.STRATEGIES.ANALOGY;
      return this.build(strategy);
    }

    // Failure tier 3+ - remediate, go back to prerequisites
    if (failureTier >= 3) {
      return this.build(this.STRATEGIES.REMEDIATE);
    }

    // Student is confused - explain clearly
    if (classification.isConfused) {
      return this.build(this.STRATEGIES.EXPLAIN);
    }

    // Student asking a question - socratic response
    if (classification.type === 'question') {
      return this.build(this.STRATEGIES.SOCRATIC);
    }

    // Low mastery, first time - start with example
    if (masteryScore < 0.3) {
      return this.build(this.STRATEGIES.EXAMPLE);
    }

    // Default - socratic guided discovery
    return this.build(this.STRATEGIES.SOCRATIC);
  }

  /**
   * Build the strategy instruction string for the system prompt.
   */
  static build(strategy) {
    const instructions = {
      [this.STRATEGIES.SOCRATIC]: `
=== TEACHING STRATEGY: SOCRATIC QUESTIONING ===
Do NOT explain. Ask questions only.
Guide the student to discover the answer themselves through a sequence of smaller questions.
Each question should be answerable with what the student already knows.
Never give the answer even if student is close. Keep guiding.
      `.trim(),

      [this.STRATEGIES.EXPLAIN]: `
=== TEACHING STRATEGY: DIRECT EXPLANATION ===
Give a clear, concise explanation in plain conversational language.
Maximum 3 sentences. Use one Malaysian real-world example.
After explaining, immediately check understanding with one question.
Do not dump multiple points - explain ONE thing clearly.
      `.trim(),

      [this.STRATEGIES.ANALOGY]: `
=== TEACHING STRATEGY: ANALOGY ===
Find a Malaysian everyday analogy that maps exactly to this concept.
Examples: mamak, traffic, weather, food, family, sports.
Introduce the analogy first, establish it makes sense, then connect to the concept.
"This works just like... you know how... that is exactly what is happening here."
      `.trim(),

      [this.STRATEGIES.STORY]: `
=== TEACHING STRATEGY: STORYTELLING ===
Tell a short story (2-3 sentences) that illustrates the concept.
Use Malaysian characters, places, situations.
Make the student the protagonist if possible.
After the story, connect it explicitly to the concept being taught.
      `.trim(),

      [this.STRATEGIES.EXAMPLE]: `
=== TEACHING STRATEGY: WORKED EXAMPLE ===
Walk through a complete worked example step by step.
Show every single step. Explain WHY each step happens, not just what to do.
After the example, ask student to identify which step was the key one.
Then give a very similar example and ask student to try the first step.
      `.trim(),

      [this.STRATEGIES.DRILL]: `
=== TEACHING STRATEGY: DRILL ===
Student just got something right. Consolidate it with rapid practice.
Give a similar but slightly varied question immediately.
Keep it quick and encouraging. Build confidence through repetition.
"Good - now try this one. It is the same idea but with different numbers."
      `.trim(),

      [this.STRATEGIES.REMEDIATE]: `
=== TEACHING STRATEGY: REMEDIATION ===
Student is stuck. The problem is likely a missing prerequisite concept.
Identify what foundational concept they need first.
Step back entirely from the current topic.
"Before we continue with this, I want to check something more basic first."
Address the prerequisite, confirm mastery, then return to the original topic.
      `.trim(),

      [this.STRATEGIES.CELEBRATE]: `
=== TEACHING STRATEGY: CELEBRATE AND ADVANCE ===
Student mastered this concept. Celebrate genuinely in one sentence.
Then advance to the next concept or a harder variation.
Do not linger on celebration - one warm acknowledgement then move forward.
"Yes, exactly right! Now let us take this one step further -"
      `.trim(),

      [this.STRATEGIES.EMOTIONAL]: `
=== TEACHING STRATEGY: EMOTIONAL SUPPORT ===
Study comes second. Student wellbeing comes first.
Acknowledge how they are feeling genuinely and warmly.
Do not immediately redirect to studying - let them feel heard first.
After 1-2 exchanges, gently bring them back with something achievable and confidence-building.
Never say "just focus" or "stop worrying" - validate first.
      `.trim(),
    };

    return {
      strategy,
      instruction: instructions[strategy] || instructions[this.STRATEGIES.SOCRATIC],
    };
  }
}