import type { Course, UserProgress } from './db';
import { isCourseAssigned } from './courseAccess.ts';

export function dashboardLearningStats(courses: Course[], progress: UserProgress[], email: string, identities: string[] = []) {
  const userEmail = email.trim().toLowerCase();
  const courseIds = new Set(courses.map(course => course.id));
  const userProgress = progress.filter(item => Boolean(userEmail) &&
    item.userEmail.trim().toLowerCase() === userEmail && courseIds.has(item.courseId));
  const courseProgress = new Map<string, number>();
  for (const item of userProgress) {
    const percent = Number.isFinite(item.progressPercent) ? Math.min(100, Math.max(0, item.progressPercent)) : 0;
    courseProgress.set(item.courseId, Math.max(courseProgress.get(item.courseId) || 0, percent));
  }
  const enrolledCourses = courses.filter(course => courseProgress.has(course.id) ||
    (Boolean(userEmail) && isCourseAssigned(course, [userEmail, ...identities], userProgress)));
  const earnedCourses = courses.filter(course => course.requiresCertification !== false && courseProgress.get(course.id) === 100);
  return {
    userProgress,
    earnedCourses,
    overallProgress: enrolledCourses.length
      ? Math.round(enrolledCourses.reduce((sum, course) => sum + (courseProgress.get(course.id) || 0), 0) / enrolledCourses.length)
      : 0,
  };
}
