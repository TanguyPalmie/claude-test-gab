import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

/**
 * Generate a stable question ID from text + category.
 * Uses SHA-256 truncated to 16 hex chars for brevity.
 */
function questionId(text, category) {
  return crypto
    .createHash('sha256')
    .update(`${category}::${text}`)
    .digest('hex')
    .slice(0, 16);
}

/**
 * Load all questions from .txt files in the given directory.
 * Each file = one category (derived from filename without extension).
 * Each non-empty line = one question.
 * Deduplicates within and across files.
 *
 * Returns: Array<{ id, text, category }>
 */
export function loadQuestions(dir) {
  const seen = new Set();
  const questions = [];

  if (!fs.existsSync(dir)) {
    console.warn(`[questions] Directory not found: ${dir}`);
    return questions;
  }

  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.txt'));

  for (const file of files) {
    const category = path.basename(file, '.txt');
    const content = fs.readFileSync(path.join(dir, file), 'utf-8');
    const lines = content.split('\n');

    for (const raw of lines) {
      const text = raw.trim();
      if (!text) continue;

      const id = questionId(text, category);
      if (seen.has(id)) continue;
      seen.add(id);

      questions.push({ id, text, category });
    }
  }

  return questions;
}

/**
 * Returns count of questions per category.
 */
export function questionStats(questions) {
  const stats = {};
  for (const q of questions) {
    stats[q.category] = (stats[q.category] || 0) + 1;
  }
  return stats;
}
