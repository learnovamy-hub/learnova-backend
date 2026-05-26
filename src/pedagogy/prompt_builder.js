import { MASTER_PEDAGOGY_RULES, CONTENT_DUMP_PREVENTION } from "./core_rules.js";
import { getArchetype } from "./archetypes.js";
import { getFailureInstruction } from "./failure_handling.js";
import { getCountryConfig } from "./country_config.js";
import { MATHEMATICS_OVERLAY } from "./subjects/mathematics.js";
import { ADD_MATHEMATICS_OVERLAY } from "./subjects/add_mathematics.js";
import { PHYSICS_OVERLAY } from "./subjects/physics.js";
import { CHEMISTRY_OVERLAY } from "./subjects/chemistry.js";
import { BIOLOGY_OVERLAY } from "./subjects/biology.js";
import { SEJARAH_OVERLAY } from "./subjects/sejarah.js";
import { BAHASA_MALAYSIA_OVERLAY } from "./subjects/bahasa_malaysia.js";
import { ENGLISH_OVERLAY } from "./subjects/english.js";

const SUBJECT_MAP = {
  "Mathematics": MATHEMATICS_OVERLAY,
  "Additional Mathematics": ADD_MATHEMATICS_OVERLAY,
  "Add Maths": ADD_MATHEMATICS_OVERLAY,
  "Physics": PHYSICS_OVERLAY,
  "Chemistry": CHEMISTRY_OVERLAY,
  "Biology": BIOLOGY_OVERLAY,
  "Sejarah": SEJARAH_OVERLAY,
  "History": SEJARAH_OVERLAY,
  "Bahasa Malaysia": BAHASA_MALAYSIA_OVERLAY,
  "BM": BAHASA_MALAYSIA_OVERLAY,
  "English": ENGLISH_OVERLAY,
};

function getSubjectOverlay(subject) {
  if (!subject) return "";
  if (SUBJECT_MAP[subject]) return SUBJECT_MAP[subject];
  const key = Object.keys(SUBJECT_MAP).find(k => k.toLowerCase() === subject.toLowerCase());
  if (key) return SUBJECT_MAP[key];
  // Unknown subject — generic overlay so any new subject works without code changes
  return `=== SUBJECT OVERLAY: ${subject} ===\nTeach this subject following AAMT sequence.\nFocus on SPM/exam relevance.\nUse Malaysian context and examples.`;
}

function formatPedagogyIntelligence(pedagogyIntelligence) {
  if (!pedagogyIntelligence?.pedagogy_json) return "";
  const pj = pedagogyIntelligence.pedagogy_json;

  if (pj.source === "concept_chunks" && pj.concepts?.length > 0) {
    const lines = ["=== KNOWLEDGE BASE: PROCESSED TEXTBOOK CONTENT ==="];
    lines.push("Source: Learnova processed textbook knowledge — use this as primary reference\n");
    pj.concepts.forEach((c, i) => {
      lines.push(`CONCEPT ${i + 1}: ${c.concept_title}`);
      lines.push(`Explanation: ${c.concept_explanation}`);
      if (c.worked_example) lines.push(`Worked Example: ${c.worked_example}`);
      if (c.common_mistakes) lines.push(`Common Mistake to flag: ${c.common_mistakes}`);
      if (c.check_in_question) lines.push(`Check-in Question: ${c.check_in_question}`);
      if (c.keywords?.length) {
        const kw = Array.isArray(c.keywords) ? c.keywords.join(", ") : c.keywords;
        lines.push(`SPM Keywords: ${kw}`);
      }
      lines.push("");
    });
    lines.push("TEACHING INSTRUCTION:");
    lines.push("Use the above as your primary knowledge source for this topic.");
    lines.push("Do NOT invent new explanations — deliver these concepts in warm Learnova tutor voice.");
    lines.push("Follow AAMT sequence: concept_explanation first, then worked_example, then check_in_question.");
    lines.push("Flag common_mistakes proactively before the student makes them.");
    return lines.join("\n");
  }

  if (pj.source === "pedagogy_sample") {
    const lines = ["=== PEDAGOGY SAMPLE: REAL TUTOR TRANSCRIPT ==="];
    lines.push("Source: Real Malaysian tuition teacher — replicate this teaching style\n");
    if (pj.teaching_sequence?.length) {
      lines.push("Teaching Sequence:");
      const seq = Array.isArray(pj.teaching_sequence)
        ? pj.teaching_sequence
        : [pj.teaching_sequence];
      seq.forEach((step, i) => lines.push(`  ${i + 1}. ${step}`));
    }
    if (pj.tone_examples) lines.push(`\nTone to replicate: ${pj.tone_examples}`);
    if (pj.pacing_notes) lines.push(`Pacing: ${pj.pacing_notes}`);
    if (pj.subject_specific_tips) lines.push(`Subject tips: ${pj.subject_specific_tips}`);
    return lines.join("\n");
  }

  // Legacy format
  return typeof pj === "string" ? pj : JSON.stringify(pj, null, 2);
}

function formatPedagogySample(pedagogySample) {
  if (!pedagogySample) return "";
  const lines = ["=== HOW TO TEACH THIS TOPIC (Real Tutor Style) ==="];
  if (pedagogySample.teaching_sequence?.length) {
    lines.push("Teaching sequence from real Malaysian tutor:");
    const seq = Array.isArray(pedagogySample.teaching_sequence)
      ? pedagogySample.teaching_sequence
      : [pedagogySample.teaching_sequence];
    seq.forEach((step, i) => lines.push(`  ${i + 1}. ${step}`));
  }
  if (pedagogySample.tone_examples) lines.push(`\nTone examples: ${pedagogySample.tone_examples}`);
  if (pedagogySample.pacing_notes) lines.push(`Pacing: ${pedagogySample.pacing_notes}`);
  if (pedagogySample.subject_specific_tips) lines.push(`Tips: ${pedagogySample.subject_specific_tips}`);
  return lines.join("\n");
}

export function getLangSuffix(language, country = "MY", subject = "") {
  const subjectLower = subject.toLowerCase();
  const monolingualSubjects = ["bahasa malaysia", "bm", "sejarah", "history"];
  const englishSubjects = ["english", "english literature"];

  if (monolingualSubjects.includes(subjectLower)) {
    return `=== BAHASA PENGAJARAN: BAHASA MALAYSIA SAHAJA ===
Ajar dalam Bahasa Malaysia sepenuhnya. Tiada pengecualian untuk subjek ini.
Walaupun pelajar tulis dalam Inggeris, balas dalam BM.
Code-switch ringan dibenarkan: lah, kan, tau, faham, okay.`;
  }

  if (englishSubjects.includes(subjectLower)) {
    return `=== TEACHING LANGUAGE: ENGLISH ===
Teach entirely in English for this subject.
You may briefly clarify in Bahasa Malaysia if the student is genuinely confused about grammar or vocabulary.`;
  }

  // Dual-language subjects: BM default, English on student request
  if (language === "en") {
    return `=== TEACHING LANGUAGE: ENGLISH (student requested) ===
The student requested English for this response. Explain clearly in English.
After this response, return to Bahasa Malaysia automatically — do not continue in English unless asked again.`;
  }

  // Default: BM for all other subjects
  return `=== BAHASA MALAYSIA ===
Ajar dalam Bahasa Malaysia sepenuhnya.
Gunakan istilah saintifik dan matematik dalam BM mengikut senarai mandatory replacements di atas.
Gaya: mesra, seperti kakak atau cikgu tuisyen.
Code-switch ringan dibenarkan: lah, kan, tau, faham, okay.
JANGAN guna perkataan Inggeris jika padanan BM wujud.`;
}

export function buildMasterSystemPrompt({
  subject = "Mathematics",
  topic = "",
  tutorArchetype = "kak_sara",
  country = "MY",
  failureTier = 0,
  studentFormLevel = 4,
  language = "bm",
  pedagogyIntelligence = null,
  pedagogySample = null,
  langSuffix = "",
} = {}) {
  const countryConf = getCountryConfig(country);
  const subjectOverlay = getSubjectOverlay(subject);
  const archetype = getArchetype(tutorArchetype);
  const failureInstruction = getFailureInstruction(failureTier);

  const knowledgeBlock = formatPedagogyIntelligence(pedagogyIntelligence);
  const sampleBlock = formatPedagogySample(pedagogySample);

  const contextBlock = `=== CURRENT SESSION CONTEXT ===
Student: Form ${studentFormLevel} | Syllabus: ${countryConf.syllabus} | Subject: ${subject} | Topic: ${topic || "General revision"}
Exam focus: ${countryConf.examFocus}
Cultural context: ${countryConf.culturalContext}`;

  const computedLangSuffix = langSuffix || getLangSuffix(language, country, subject);

  return [
    MASTER_PEDAGOGY_RULES,
    CONTENT_DUMP_PREVENTION,
    subjectOverlay,
    archetype,
    contextBlock,
    knowledgeBlock,
    sampleBlock,
    failureTier > 0 ? ("=== CURRENT FAILURE STATE ===" + "\n" + failureInstruction) : "",
    computedLangSuffix,
  ].filter(l => l && l.trim().length > 0).join("\n\n").trim();
}

export function getSubjectOverlayOnly(subject) {
  return getSubjectOverlay(subject);
}