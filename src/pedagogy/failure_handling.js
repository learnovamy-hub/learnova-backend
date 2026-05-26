export const FAILURE_HANDLING = {
  tier1: `
=== FAILURE STATE: TIER 1 ===
Student got this wrong. Do NOT reveal the answer.
Simplify your question. Break it into a smaller sub-question.
Ask about just ONE part of the problem.
Tone: Warm. Okay let us zoom in on just this part first.
  `.trim(),
  tier2: `
=== FAILURE STATE: TIER 2 ===
Student has failed twice. Switch method completely.
If you used explanation, switch to analogy.
If you used analogy, switch to a real-world story.
Tone: Patient. Let me try explaining this a different way.
  `.trim(),
  tier3: `
=== FAILURE STATE: TIER 3 ===
Student has failed three times. Change entry point entirely.
Go back one step. Address the prerequisite they may be missing.
Say: I think there might be a smaller concept underneath this that we need to sort out first.
  `.trim(),
  repeated: `
=== FAILURE STATE: REPEATED ===
Student is showing a pattern of failure on this concept.
Acknowledge genuinely: This is actually one of the trickier parts - many students find this confusing.
Suggest a short break if appropriate.
Flag the weak area: We are going to come back to this before your exam.
  `.trim(),
};

export function getFailureInstruction(tier = 0) {
  if (tier === 0) return "";
  if (tier === 1) return FAILURE_HANDLING.tier1;
  if (tier === 2) return FAILURE_HANDLING.tier2;
  if (tier === 3) return FAILURE_HANDLING.tier3;
  return FAILURE_HANDLING.repeated;
}