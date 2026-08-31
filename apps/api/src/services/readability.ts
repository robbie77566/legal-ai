/**
 * Reading-level lint (M5): Part A promises 8th-grade plain English —
 * measure it instead of hoping. Flesch–Kincaid grade level via the
 * standard formula; syllables counted with the usual vowel-group
 * heuristic (silent-e discounted). Deterministic, dependency-free.
 */

const PART_A_TARGET_GRADE = 8;

function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (w.length === 0) return 0;
  if (w.length <= 3) return 1;
  const stripped = w.replace(/(?:ed|es|e)$/, (m) => (m === 'es' && /[sxz]es$|[cs]hes$/.test(w) ? m : ''));
  const groups = stripped.match(/[aeiouy]+/g);
  return Math.max(groups ? groups.length : 1, 1);
}

export function fleschKincaidGrade(text: string): number {
  const sentences = Math.max(text.split(/[.!?]+[\s$]/).filter((s) => s.trim().length > 0).length, 1);
  const words = text.split(/\s+/).filter((w) => /[a-zA-Z]/.test(w));
  if (words.length === 0) return 0;
  const syllables = words.reduce((a, w) => a + countSyllables(w), 0);
  const grade = 0.39 * (words.length / sentences) + 11.8 * (syllables / words.length) - 15.59;
  return Math.round(Math.max(grade, 0) * 10) / 10;
}

export interface ReadabilityLint {
  grade: number;
  overTarget: boolean;
  target: number;
}

export function lintPartA(text: string): ReadabilityLint {
  const grade = fleschKincaidGrade(text);
  return { grade, overTarget: grade > PART_A_TARGET_GRADE, target: PART_A_TARGET_GRADE };
}
