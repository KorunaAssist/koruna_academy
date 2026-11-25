import { useEffect, useState } from 'react';
import type { UserSessionData } from '../../services/auth';
import type { Course, DatabaseUser, UserProgress } from '../../services/db';
import { isCourseAssigned } from '../../services/courseAccess';
import { learningPathService, type PathData } from '../../services/learningPaths';
import { missingPrerequisites } from '../../services/learningPathRules';
import { careerPathService, type CareerPath } from '../../services/careerPaths';
import { CourseBannerHeader } from '../courses/CourseCard';

export function RecommendedCourses({ userSession,courses,users,progress,onStartStudy,onBrowse }: { userSession:UserSessionData; courses:Course[]; users:DatabaseUser[]; progress:UserProgress[]; onStartStudy:(course:Course,applicationId?:number)=>void; onBrowse:()=>void }) {
  const [paths,setPaths] = useState<PathData | null>(null);
  const [goal,setGoal] = useState<CareerPath | null>(null);
  useEffect(() => {
    let active = true;
    setPaths(null); setGoal(null);
    void learningPathService.load().then(value => { if (active) setPaths(value); }).catch(() => {});
    void careerPathService.load().then(value => { if (active) { const selected = value.goals.find(item => item.user_id === userSession.id); setGoal(value.paths.find(path => path.id === selected?.path_id) || null); } }).catch(() => {});
    return () => { active = false; };
  },[userSession.id]);
  const email = userSession.email.trim().toLowerCase();
  const personal = progress.filter(item => item.userEmail.trim().toLowerCase() === email);
  const account = users.find(user => user.email.trim().toLowerCase() === email);
  const identities = [email,userSession.id || '',account?.id || '',String(account?.userId || '')];
  const completed = (id:string) => personal.some(item => item.courseId === id && item.progressPercent >= 100);
  const eligible = (course:Course) => course.contentType !== 'document' && !completed(course.id) && isCourseAssigned(course,identities,personal) && !!paths && missingPrerequisites(course.id,paths.prerequisites,personal).length === 0;
  const result:{course:Course;reason:string;applicationId?:number}[] = [];
  const add = (id:string,reason:string) => { const course=courses.find(item => item.id===id); if (course && eligible(course) && !result.some(item => item.course.id===id)) result.push({course,reason,applicationId:personal.find(item => item.courseId===id)?.applicationId || undefined}); };
  if (paths) for (const enrolment of paths.enrolments.filter(item => item.user_id === userSession.id)) {
    const next = paths.courses.filter(item => item.version_id===enrolment.version_id && item.required).sort((a,b) => a.position-b.position).find(item => !completed(item.course_id));
    if (next) add(next.course_id,'Next in your learning path');
  }
  if (goal) for (const stage of goal.stages) {
    const ids = [...stage.course_ids,...(paths ? stage.roadmap_version_ids.flatMap(id => paths.courses.filter(row => row.version_id===id && row.required).sort((a,b) => a.position-b.position).map(row => row.course_id)) : [])];
    if (ids.some(id => !completed(id))) { ids.forEach(id => add(id,'For your career goal')); break; }
  }
  personal.filter(item => item.progressPercent === 0).sort((a,b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999')).forEach(item => add(item.courseId,'Assigned to you'));
  courses.filter(course => isCourseAssigned(course,identities,personal)).forEach(course => add(course.id,'Assigned to you'));
  return <div><h2 style={{fontSize:'1.15rem',fontWeight:800,color:'#0f172a',marginBottom:'1rem'}}>Recommended For You</h2><div style={{display:'grid',gap:'1rem'}}>{result.slice(0,3).map(({course,reason,applicationId}) => <button key={course.id} type="button" onClick={() => onStartStudy(course,applicationId)} style={{background:'#fff',borderRadius:16,border:'1px solid #e2e8f0',padding:'1rem 1.25rem',display:'flex',alignItems:'center',gap:'1.25rem',textAlign:'left',cursor:'pointer'}}><CourseBannerHeader course={course} height="60px" borderRadius="10px" style={{width:80,flexShrink:0}}/><span><strong style={{display:'block',color:'#a31555',fontSize:12}}>{reason}</strong><strong style={{display:'block',color:'#0f172a',margin:'5px 0'}}>{course.title}</strong><small style={{color:'#64748b'}}>{course.category} · {course.lessons?.length || 0} lessons</small></span></button>)}{!result.length && <div style={{background:'#fff',border:'1px solid #e2e8f0',borderRadius:16,padding:'1.25rem'}}><p>{paths ? 'No recommended courses are available yet.' : 'Loading recommendations…'}</p><button type="button" className="btn-koruna-outline" onClick={onBrowse}>Browse courses</button></div>}</div></div>;
}
