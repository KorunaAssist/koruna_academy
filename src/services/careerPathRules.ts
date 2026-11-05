import type { CareerPath } from './careerPaths';
import type { Course,UserProgress } from './db';
import type { PathData } from './learningPaths';
import type { Skill,SkillProgress } from './skills';

export interface CareerRequirement {
  id: string; kind: 'course' | 'roadmap' | 'skill'; title: string; percent: number;
  complete: boolean; available: boolean; detail: string; courseIds: string[];
}
export function careerPathProgress(path: CareerPath,input: {
  userId?: string; email: string; courses: Course[]; progress: UserProgress[];
  roadmaps: PathData; skills: Skill[]; skillProgress: SkillProgress[];
}) {
  const email = input.email.trim().toLowerCase();
  const progress = input.progress.filter(p => Boolean(email) && p.userEmail.trim().toLowerCase()===email);
  const coursePercent = (id: string) => Math.max(0,...progress.filter(p => p.courseId===id)
    .map(p => Number.isFinite(p.progressPercent) ? Math.min(100,Math.max(0,p.progressPercent)) : 0));
  let previousComplete = true;
  const stages = path.stages.map(stage => {
    const requirements: CareerRequirement[] = [
      ...stage.course_ids.map(id => {
        const course = input.courses.find(c => c.id===id);
        const percent = course ? coursePercent(id) : 0;
        return {id,kind:'course' as const,title:course?.title || 'Unavailable course',percent,complete:!!course && percent===100,
          available:!!course,detail:`${percent}% completed`,courseIds:[id]};
      }),
      ...stage.roadmap_version_ids.map(id => {
        const version = input.roadmaps.versions.find(v => v.id===id);
        const rows = input.roadmaps.courses.filter(c => c.version_id===id && c.required).sort((a,b) => a.position-b.position);
        const available = !!version && rows.length>0 && rows.every(row => input.courses.some(c => c.id===row.course_id));
        const completed = rows.filter(row => coursePercent(row.course_id)===100).length;
        const percent = available ? Math.floor(rows.reduce((sum,row) => sum+coursePercent(row.course_id),0)/rows.length) : 0;
        return {id,kind:'roadmap' as const,title:version ? `${version.name} (version ${version.version_number})` : 'Unavailable roadmap version',
          percent,complete:available && completed===rows.length,available,detail:`${completed} of ${rows.length} required courses completed`,courseIds:rows.map(row => row.course_id)};
      }),
      ...stage.skills.map(target => {
        const skill = input.skills.find(s => s.id===target.skill_id);
        const earned = input.skillProgress.find(p => !!input.userId && p.user_id===input.userId && p.skill_id===target.skill_id);
        const available = !!skill && (earned?.required_lessons || 0)>0;
        const actual = available ? earned!.progress_percent : 0;
        return {id:target.skill_id,kind:'skill' as const,title:skill?.name || 'Unavailable skill',available,
          percent:available ? Math.min(100,Math.floor(actual/target.target_percent*100)) : 0,
          complete:available && actual>=target.target_percent,detail:`${actual}% learned / ${target.target_percent}% required`,courseIds:[]};
      }),
    ];
    const requirementsMet = requirements.length>0 && requirements.every(r => r.complete);
    const status = !previousComplete ? 'Locked' : requirementsMet ? 'Completed' : 'Current stage';
    previousComplete = previousComplete && requirementsMet;
    return {...stage,requirements,requirementsMet,status,
      percent:requirements.length ? Math.floor(requirements.reduce((sum,r) => sum+r.percent,0)/requirements.length) : 0};
  });
  return {stages,completedStages:stages.filter(s => s.status==='Completed').length,
    ready:stages.length>0 && stages.every(s => s.status==='Completed'),
    percent:stages.length ? Math.floor(stages.reduce((sum,s) => sum+s.percent,0)/stages.length) : 0,
    current:stages.find(s => s.status==='Current stage'),
  };
}
