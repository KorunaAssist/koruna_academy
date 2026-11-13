import type { UserProgress } from './db';

export function formatCertificateIssueDate(progress?: Pick<UserProgress, 'completedAt'>): string {
  if (!progress?.completedAt) return 'Date unavailable';
  const date = new Date(progress.completedAt);
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric', timeZone: 'Asia/Singapore',
  });
}
