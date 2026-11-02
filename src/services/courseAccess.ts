import type { Course, UserProgress } from './db';

export function isCourseAssigned(course: Course, identities: string[], progress: UserProgress[]): boolean {
  const keys = new Set(identities.filter(Boolean).map(value => value.trim().toLowerCase()));
  return Boolean(course.assignedUsers?.some(assignment => keys.has(String(assignment.userId).trim().toLowerCase())) ||
    progress.some(item => item.courseId === course.id && keys.has(item.userEmail.trim().toLowerCase()) &&
      (item.dueDate || item.assignedBy || (item.applicationId || 0) > 0)));
}
