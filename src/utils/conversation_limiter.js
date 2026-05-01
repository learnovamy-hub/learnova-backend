const SCHOOL_KEYWORDS = ['mathematics','math','physics','chemistry','biology','sejarah','geography','english','bahasa','spm','pt3','exam','formula','equation','calculate','solve','quadratic','trigonometry','calculus','matrix','photosynthesis','osmosis','titration','newton','atom','molecule','essay','karangan'];

export function isSchoolRelated(message) {
  const lower = message.toLowerCase();
  return SCHOOL_KEYWORDS.some(kw => lower.includes(kw));
}

export function getConversationLimit(claudeCallCount, message) {
  if (claudeCallCount >= 5) {
    return { limited: true, reply: "I have really enjoyed our chat! For deeper conversations beyond SPM topics, do check out claude.ai. My specialty is helping you ace your SPM exams, so shall we get back to your lessons?", quickReplies: ["Yes lets study!", "Show my lessons", "Quiz me"] };
  }
  if (claudeCallCount >= 3 && !isSchoolRelated(message)) {
    return { limited: true, reply: "That is interesting! I am best at SPM subjects though. Want to tackle Mathematics, Sciences or Languages? I promise to make it fun!", quickReplies: ["Lets do Maths", "Science topics", "Show my lessons"] };
  }
  return { limited: false };
}
