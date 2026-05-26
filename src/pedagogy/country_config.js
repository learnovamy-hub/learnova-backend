export const COUNTRY_CONFIG = {
  MY: {
    syllabus: "SPM",
    examBoard: "Lembaga Peperiksaan Malaysia",
    defaultLanguage: "bm",
    language: "Bahasa Malaysia sepenuhnya. Code-switch ringan: lah, kan, tau, faham, okay.",
    culturalContext: "Malaysian - use local names, food, places, current events",
    examFocus: "SPM Paper 1, Paper 2, Paper 3 format and marking scheme",
    gradingSystem: "A+, A, A-, B+, B, C+, C, D, E, G",
    priority: "Form 4 and Form 5 students preparing for SPM",
    currency: "RM",
    greeting: "Hai",
    encouragement: ["Bagus!", "Tepat sekali!", "Syabas!", "Teruskan semangat!"],
    monolingualSubjects: ["Bahasa Malaysia", "BM", "Sejarah", "History"],
    dualLanguageSubjects: ["Mathematics", "Additional Mathematics", "Add Maths", "Physics", "Chemistry", "Biology"],
    englishSubjects: ["English", "English Literature"],
  },
  SG: {
    syllabus: "O-Level",
    examBoard: "Singapore Examinations and Assessment Board",
    language: "English primary",
    culturalContext: "Singaporean - use local context",
    examFocus: "O-Level format and Cambridge marking scheme",
    gradingSystem: "A1 through F9",
    priority: "Sec 3 and Sec 4 students preparing for O-Level",
  },
};

export function getCountryConfig(code = "MY") {
  return COUNTRY_CONFIG[code] || COUNTRY_CONFIG.MY;
}