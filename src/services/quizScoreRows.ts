import type { UserProgress } from './db';

export function quizScoreRows(progress: UserProgress[]) {
  return progress.flatMap(record => {
    const history = record.quizHistory || [];
    const base = { email: record.userEmail, courseId: record.courseId, applicationId: record.applicationId };
    const rows = history.map(entry => ({ ...base, attempt: entry.attempt as number | null, score: entry.score, submittedAt: entry.submittedAt as string | null }));
    // Historical individual attempts were not stored. Show the saved best
    // score separately without inventing a date or an attempt number.
    if (record.quizScore !== undefined && record.quizAttempts > history.length) {
      rows.push({ ...base, attempt: null, score: record.quizScore, submittedAt: null });
    }
    return rows;
  }).sort((a, b) => (b.submittedAt || '').localeCompare(a.submittedAt || ''));
}
