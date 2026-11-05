interface Course { course_id: string; percent: number; assigned: boolean; overdue: boolean }
interface Path { path_id: string; percent: number; overdue: boolean }
interface Learner { id: string; courses: Course[]; paths: Path[] }
interface Practical { user_id: string; status: string }

export interface TeamOverviewGroup<T> {
  leader: { id: string; name: string };
  members: T[];
  totalMembers: number;
}

export function groupTeamOverview<T extends {id: string}>(
  leaders: {id: string; name: string}[],memberships: {manager_id: string; member_id: string}[],
  employees: T[],filteredEmployees: T[] = employees,selectedLeader = '',
): TeamOverviewGroup<T>[] {
  const eligibleIds = new Set(employees.map(employee => employee.id));
  return leaders.filter(leader => !selectedLeader || leader.id===selectedLeader).map(leader => {
    const memberIds = new Set(memberships.filter(m => m.manager_id===leader.id && eligibleIds.has(m.member_id)).map(m => m.member_id));
    return {leader,totalMembers:memberIds.size,members:filteredEmployees.filter(employee => memberIds.has(employee.id))};
  });
}

export function learnerLearningStatus(learner: Learner) {
  const training = [...learner.courses,...learner.paths];
  if (!training.length) return 'no_training';
  if (training.every(item => item.percent>=100)) return 'completed';
  if (training.every(item => item.percent===0)) return 'not_started';
  return 'in_progress';
}

export function teamReportMetrics(learners: Learner[],practicals: Practical[]) {
  const courses = learners.flatMap(l => l.courses);
  return {
    learners: learners.length,
    average: courses.length ? Math.round(courses.reduce((sum,c) => sum+c.percent,0)/courses.length) : 0,
    completed: courses.filter(c => c.percent>=100).length,
    courses: courses.length,
    overdue: courses.filter(c => c.overdue).length + learners.flatMap(l => l.paths).filter(p => p.overdue).length,
    pending: practicals.filter(p => p.status==='pending' && learners.some(l => l.id===p.user_id)).length,
  };
}
