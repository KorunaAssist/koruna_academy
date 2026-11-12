import { ArrowRight, Award, BriefcaseBusiness, Check,Lock } from 'lucide-react';
import type { UserSessionData } from '../../services/auth';
import type { Course,UserProgress } from '../../services/db';
import type { CareerWorkspace,CareerPath } from '../../services/careerPaths';
import { careerPathProgress } from '../../services/careerPathRules';
import { missingPrerequisites } from '../../services/learningPathRules';
import '../courses/learningPaths.css';
import './careerPaths.css';

export function CareerPathDetails({path,workspace,userSession,courses,userProgress,assignedCourseIds,onStartStudy,onTabChange}: {
  path: CareerPath; workspace: CareerWorkspace; userSession: UserSessionData; courses: Course[];
  userProgress: UserProgress[]; onStartStudy: (course: Course) => void; onTabChange: (tab: string) => void;
  assignedCourseIds: string[];
}) {
  const personalProgress = userProgress.filter(p => !!userSession.email && p.userEmail.trim().toLowerCase()===userSession.email.trim().toLowerCase());
  const model = careerPathProgress(path,{userId:userSession.id,email:userSession.email,courses,progress:personalProgress,
    roadmaps:workspace.roadmaps,skills:workspace.skills,skillProgress:workspace.progress});
  const unmet = model.current?.requirements.filter(r => !r.complete) || [];
  const nextIds = [...new Set(unmet.flatMap(r => r.kind==='skill'
    ? workspace.requirements.filter(item => item.skill_id===r.id).map(item => item.course_id) : r.courseIds))];
  const complete = (id: string) => personalProgress.some(p => p.courseId===id && p.progressPercent>=100);
  // Prefer the first available prerequisite when a required course is locked.
  const findAvailable = (id: string,visited=new Set<string>()): Course | undefined => {
    if (visited.has(id) || complete(id)) return;
    visited.add(id);
    const missing = missingPrerequisites(id,workspace.roadmaps.prerequisites,personalProgress);
    if (missing.length) {
      for (const prerequisite of missing) {
        const candidate = findAvailable(prerequisite,visited);
        if (candidate) return candidate;
      }
      return;
    }
    return assignedCourseIds.includes(id) ? courses.find(c => c.id===id) : undefined;
  };
  const nextCourse = nextIds.map(id => findAvailable(id)).find(Boolean);
  const currentIndex = model.current ? model.stages.findIndex(stage => stage.id===model.current!.id) : -1;
  const previousStage = currentIndex>0 ? model.stages[currentIndex-1] : model.ready ? model.stages.at(-1) : undefined;
  const requiredCourseIds = (stage: typeof model.stages[number]) => [...new Set(stage.requirements.flatMap(r => r.kind==='skill'
    ? workspace.requirements.filter(item => item.skill_id===r.id).map(item => item.course_id) : r.courseIds))];
  const remainingCourses = model.current ? requiredCourseIds(model.current).filter(id => !complete(id)).length : 0;
  const remainingSkills = unmet.filter(r => r.kind==='skill').length;
  return <section className="lp-stack mc-details" aria-label={`${path.name} career stages`}>
    <div className="cp-promotion">
      <div className="cp-role-transition">
        <div className="cp-role"><small>CURRENT ROLE</small><span className="cp-role-icon"><BriefcaseBusiness size={22}/></span><strong>{previousStage?.title || 'Your starting role'}</strong><span>{userSession.department || path.name}</span></div>
        <ArrowRight className="cp-role-arrow" size={22} aria-hidden="true"/>
        <div className="cp-role"><small>{model.ready ? 'TRAINING COMPLETED' : 'NEXT ROLE'}</small><span className="cp-role-icon next"><Award size={22}/></span><strong>{model.current?.title || (model.ready ? 'Ready for a career discussion' : 'No role configured')}</strong><span>{userSession.department || path.name}</span></div>
      </div>
      <div className="cp-readiness">
        <progress max={100} value={model.current?.percent ?? (model.ready ? 100 : 0)} aria-label="Promotion readiness"/>
        <div className="cp-readiness-label"><strong>Promotion Readiness</strong><strong>{model.current?.percent ?? (model.ready ? 100 : 0)}%</strong></div>
        <p><strong>{remainingCourses}</strong> {remainingCourses===1 ? 'Course' : 'Courses'} Remaining</p>
        <p><strong>{remainingSkills}</strong> {remainingSkills===1 ? 'Skill' : 'Skills'} Remaining</p>
      </div>
    </div>
    <div className="lp-panel lp-stack">
      <div className="lp-toolbar"><h2>{path.name}</h2><strong>{model.percent}% training complete</strong></div>
      <p className="lp-muted">{path.description}</p>
      <progress max={100} value={model.percent} aria-label="Career training progress"/>
      <p>{model.completedStages} of {model.stages.length} stages completed</p>
      {path.status==='archived' && <p className="lp-notice">This career path is archived. Your selected goal and its training requirements are preserved.</p>}
      {model.ready ? <p className="lp-notice">Training requirements completed. You are ready for a career discussion with your team leader or trainer.</p>
        : model.current && <p>Next step: complete the remaining training requirements for <strong>{model.current.title}</strong>.</p>}
      {nextCourse && <div><button className="lp-button primary" onClick={() => onStartStudy(nextCourse)}>Continue training: {nextCourse.title}</button></div>}
      {!model.ready && !nextCourse && unmet.some(r => !r.available) && <p className="lp-muted">Some requirements are unavailable or have no lessons configured. Contact your admin or trainer.</p>}
      {!model.ready && !nextCourse && unmet.some(r => r.available) && <p className="lp-muted">Ask your team leader or trainer to assign the required courses or prerequisites. Selecting a career goal does not assign training.</p>}
    </div>
    <ol className="cp-stages">{model.stages.map((stage,index) => <li className={`lp-panel lp-stack mc-stage ${stage.status==='Completed' ? 'complete' : stage.status==='Locked' ? 'locked' : 'current'}`} key={stage.id}>
      <div className="lp-toolbar"><h3><span className="mc-stage-number">{stage.status==='Completed' ? <Check size={18}/> : stage.status==='Locked' ? <Lock size={16}/> : String(index+1).padStart(2,'0')}</span>{stage.title}</h3><span className={`lp-badge ${stage.status==='Completed' ? 'published' : ''}`}>
        {stage.status==='Completed' ? <Check size={14}/> : stage.status==='Locked' ? <Lock size={14}/> : null} {stage.status}</span></div>
      {stage.description && <p className="lp-muted">{stage.description}</p>}
      <p className="lp-muted">Complete the courses and skill targets below to unlock training readiness for this role.</p>
      <progress max={100} value={stage.percent} aria-label={`${stage.title} training progress`}/>
      <div className="cp-role-counts"><span>{stage.percent}% ready</span><span>{requiredCourseIds(stage).filter(id => !complete(id)).length} courses remaining</span><span>{stage.requirements.filter(r => r.kind==='skill' && !r.complete).length} skills remaining</span></div>
      {stage.status==='Locked' && <p className="lp-muted">Complete the earlier stages first. Training you have already finished will count.</p>}
      {!stage.requirements.length && <p className="lp-muted">No requirements configured.</p>}
      {!!requiredCourseIds(stage).length && <div className="lp-stack"><h4>Courses for this role</h4><ul className="cp-requirements">{requiredCourseIds(stage).map(id => {
        const course = courses.find(item => item.id===id);
        const done = complete(id);
        const prerequisites = missingPrerequisites(id,workspace.roadmaps.prerequisites,personalProgress);
        const assigned = assignedCourseIds.includes(id);
        return <li key={id}><div className="lp-stack"><strong>{done && <Check size={14}/>} {course?.title || 'Unavailable course'}</strong><small>{done ? 'Completed' : prerequisites.length ? `Complete first: ${prerequisites.map(required => courses.find(item => item.id===required)?.title || 'Unavailable prerequisite').join(', ')}` : !course ? 'Contact your trainer to configure this course.' : !assigned ? 'Ask your trainer to assign this course.' : 'Required training for this role'}</small></div><button className="lp-button" disabled={!course || (!done && (stage.status==='Locked' || !assigned || prerequisites.length>0))} onClick={() => done ? onTabChange('catalog_courses') : course && onStartStudy(course)}>{done ? 'Completed' : stage.status==='Locked' ? 'Locked' : !assigned ? 'Needs Assignment' : 'Open Course'}</button></li>;
      })}</ul></div>}
      <ul className="cp-requirements">{stage.requirements.filter(r => r.kind!=='course').map(r => {
        const course = r.kind==='course' ? courses.find(c => c.id===r.id) : undefined;
        const missing = course ? missingPrerequisites(course.id,workspace.roadmaps.prerequisites,personalProgress) : [];
        return <li key={`${r.kind}-${r.id}`}>
          <div className="lp-stack"><strong>{r.complete ? 'Completed: ' : ''}{r.title}</strong>
            <small>{r.kind==='roadmap' ? 'Learning roadmap' : r.kind==='skill' ? 'Skill target' : 'Course'} · {r.detail}</small>
            {!r.complete && r.available && <small>{r.kind==='skill' ? 'Reach the required skill percentage to meet this target.' : r.kind==='roadmap' ? 'Complete all required courses in this roadmap.' : 'Complete this course to meet this requirement.'}</small>}
            {!r.available && <small>Unavailable or not configured. Contact your trainer.</small>}
            {!!missing.length && <small>Complete first: {missing.map(id => courses.find(c => c.id===id)?.title || 'Unavailable prerequisite').join(', ')}</small>}
          </div>
          {course && <button className="lp-button" disabled={stage.status==='Locked' || (!r.complete && (missing.length>0 || !assignedCourseIds.includes(course.id)))}
            onClick={() => r.complete ? onTabChange('catalog_courses') : onStartStudy(course)}>{r.complete ? 'View Completed Courses' : !assignedCourseIds.includes(course.id) ? 'Needs Assignment' : 'Open Course'}</button>}
          {r.kind!=='course' && <button className="lp-button" onClick={() => onTabChange(r.kind==='skill' ? 'skills' : 'learning_path')}>{r.kind==='skill' ? 'View Skills' : 'View Learning Paths'}</button>}
        </li>;
      })}</ul>
    </li>)}</ol>
  </section>;
}

