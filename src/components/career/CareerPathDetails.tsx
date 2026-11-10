import { Check,Lock } from 'lucide-react';
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
  const nextStage = currentIndex>=0 ? model.stages[currentIndex+1] : undefined;
  return <section className="lp-stack mc-details" aria-label={`${path.name} career stages`}>
    <div className="lp-panel lp-stack">
      <div className="lp-toolbar"><h2>{path.name}</h2><strong>{model.percent}% training complete</strong></div>
      <p className="lp-muted">{path.description}</p>
      <progress max={100} value={model.percent} aria-label="Career training progress"/>
      <p>{model.completedStages} of {model.stages.length} stages completed</p>
      {model.current && <div className="cp-summary" aria-label="Your next career steps">
        <div><small>Current training stage</small><strong>{model.current.title}</strong></div>
        <div><small>Next stage</small><strong>{nextStage?.title || 'Complete your career training'}</strong></div>
        <div><small>Requirements left in this stage</small><strong>{unmet.length}</strong></div>
      </div>}
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
      <progress max={100} value={stage.percent} aria-label={`${stage.title} training progress`}/>
      {stage.status==='Locked' && <p className="lp-muted">Complete the earlier stages first. Training you have already finished will count.</p>}
      {!stage.requirements.length && <p className="lp-muted">No requirements configured.</p>}
      <ul className="cp-requirements">{stage.requirements.map(r => {
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

