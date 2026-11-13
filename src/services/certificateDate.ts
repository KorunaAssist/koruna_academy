import type { UserProgress } from './db';

// Keep a completion timestamp even on databases that predate completed_at.
// last_viewed_at is the existing persisted compatibility field in those installs.
export function completionActivityDate(previous: Partial<UserProgress> | undefined, percent: number, now: string): string | undefined {
  if ((previous?.progressPercent ?? 0) >= 100) return previous?.completedAt || previous?.lastViewedAt;
  return percent >= 100 ? now : undefined;
}

export function formatCertificateIssueDate(
  progress?: Pick<UserProgress, 'completedAt'> & Partial<Pick<UserProgress, 'progressPercent' | 'lastViewedAt'>>,
): string {
  // Older records predate completed_at. Match the database migration's
  // historical fallback, only for completed courses; never use today's date.
  const candidates = [progress?.completedAt,
    (progress?.progressPercent ?? 0) >= 100 ? progress?.lastViewedAt : undefined];
  for (const value of candidates) {
    if (!value) continue;
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric', timeZone: 'Asia/Singapore',
    });
  }
  return 'Date unavailable';
}
