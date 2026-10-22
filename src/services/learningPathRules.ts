// Pure rules shared by the catalogue start guard and the roadmap display.
export function coursePercent(courseId: string, progress: { courseId: string; progressPercent: number }[]) {
  return Math.max(0,...progress.filter(p => p.courseId === courseId).map(p => Math.min(100,p.progressPercent)));
}
export function missingPrerequisites(courseId: string,
  prerequisites: { course_id: string; prerequisite_course_id: string }[],
  progress: { courseId: string; progressPercent: number; practicalStatus: string }[]) {
  if (coursePercent(courseId,progress) >= 100) return [];
  return prerequisites.filter(p => p.course_id === courseId).map(p => p.prerequisite_course_id)
    .filter(id => !progress.some(p => p.courseId === id && p.progressPercent >= 100 && !['pending','rejected'].includes(p.practicalStatus)));
}
