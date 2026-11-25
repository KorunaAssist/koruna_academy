import { useState } from 'react';
import { ArrowRight, BookOpen, Check, CircleCheck, Lock, Play, Route, Search, Target } from 'lucide-react';
import type { Course, UserProgress } from '../../services/db';
import type { UserSessionData } from '../../services/auth';
import { learningPathService, type PathVersion } from '../../services/learningPaths';
import { coursePercent, missingPrerequisites } from '../../services/learningPathRules';
import { useLearningPaths } from './useLearningPaths';
import './learningPaths.css';

export interface LearningPathViewProps {
  userSession: UserSessionData;
  courses?: Course[];
  userProgress?: UserProgress[];
  onStartStudy?: (course: Course) => void;
}
export function LearningPathView({ userSession,courses = [],userProgress = [],onStartStudy }: LearningPathViewProps) {
  const { data,loading,error,reload } = useLearningPaths(userSession.id);
  const [selectedId,setSelectedId] = useState('');
  const [busy,setBusy] = useState(false);
  const [actionError,setActionError] = useState('');
  const [query,setQuery] = useState('');
  const [tab,setTab] = useState<'mine' | 'assigned' | 'explore'>('mine');
  const myEnrolments = data.enrolments.filter(e => e.user_id === userSession.id);
  const myVersions = myEnrolments.flatMap(e => data.versions.filter(v => v.id === e.version_id));
  const assignedVersions = myVersions.filter(v => myEnrolments.some(e => e.version_id === v.id && e.source === 'assigned'));
  const published = data.versions.filter(v => v.status === 'published' && !data.versions.some(other =>
    other.path_id === v.path_id && other.status === 'published' && other.version_number > v.version_number));
  const discover = published.filter(v => !myEnrolments.some(e => e.path_id === v.path_id));
  const selected = [...myVersions,...discover].find(v => v.id === selectedId) || myVersions[0] || discover[0];
  const enrolment = myEnrolments.find(e => e.version_id === selected?.id);
  const pathProgress = data.progress.find(p => p.enrolment_id === enrolment?.id);
  const selectedCourses = data.courses.filter(c => c.version_id === selected?.id).sort((a,b) => a.position-b.position);
  const courseTitle = (id: string) => courses.find(c => c.id === id)?.title || 'Unavailable course';
  const nextCourse = selectedCourses.find(row => coursePercent(row.course_id,userProgress) < 100 &&
    missingPrerequisites(row.course_id,data.prerequisites,userProgress).length === 0 && courses.some(c => c.id === row.course_id));
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setActionError('');
    try { await action(); } catch (reason) { setActionError(reason instanceof Error ? reason.message : 'Unable to complete the action.'); }
    finally { setBusy(false); }
  };
  const matches = (v: PathVersion) => `${v.name} ${v.description}`.toLowerCase().includes(query.toLowerCase());
  const completedCount = myEnrolments.filter(e => data.progress.some(p => p.enrolment_id === e.id && p.progress_percent >= 100)).length;
  const visiblePaths = (tab === 'mine' ? myVersions : tab === 'assigned' ? assignedVersions : discover).filter(matches);
  const card = (v: PathVersion) => {
    const joined = myEnrolments.find(e => e.version_id === v.id);
    const progress = data.progress.find(p => p.enrolment_id === joined?.id);
    return <button className={`lp-roadmap-card ${selected?.id === v.id ? 'selected' : ''}`} key={v.id} onClick={() => setSelectedId(v.id)} aria-pressed={selected?.id === v.id}>
      <div className="lp-toolbar"><span className="lp-path-icon"><Route size={23}/></span><span className="lp-badge">{joined ? (progress?.progress_percent === 100 ? 'Completed' : joined.source === 'assigned' ? 'Assigned' : 'In Progress') : 'Open to everyone'}</span></div>
      <h3>{v.name}</h3><p>{v.description || 'Follow a guided sequence of courses.'}</p>
      <small>{data.courses.filter(c => c.version_id === v.id).length} courses · Version {v.version_number}{v.status === 'archived' ? ' · Archived' : ''}</small>
      {joined && <><progress aria-label={`${v.name} progress`} max={100} value={progress?.progress_percent || 0}/><strong>{progress?.progress_percent || 0}% complete</strong></>}
      <span className="lp-card-link">View learning path <ArrowRight size={16}/></span>
    </button>;
  };
  return <section className="lp-workspace lp-learner" aria-labelledby="lp-title">
    <header className="lp-page-heading"><div><span className="lp-eyebrow">LEARN WITH PURPOSE</span><h1 id="lp-title">Learning paths</h1><p>Build your skills, one milestone at a time. Your next step starts here.</p></div><span className="lp-page-label"><Route size={16}/> Your learning journey</span></header>
    {loading && <div className="lp-empty" role="status">Loading your learning paths...</div>}
    {(error || actionError) && <div className="lp-alert" role="alert">{error || actionError}<button className="lp-button" disabled={busy} onClick={() => run(async () => { await reload(); })}>Retry</button></div>}
    {!loading && !error && <>
      <div className="lp-overview">
        <div className="lp-stats" aria-label="Your learning path summary">
          <div><span className="lp-stat-icon"><Route size={20}/></span><strong>{myEnrolments.length}<small>Paths joined</small></strong></div>
          <div><span className="lp-stat-icon green"><CircleCheck size={20}/></span><strong>{completedCount}<small>Paths completed</small></strong></div>
          <div><span className="lp-stat-icon amber"><Target size={20}/></span><strong>{discover.length}<small>Paths to explore</small></strong></div>
        </div>
      </div>
      <div className="lp-library-heading"><div><h2>Your path to what's next</h2><p className="lp-muted">A roadmap for every next step in your career.</p></div><label className="lp-search-box"><Search size={18}/><input aria-label="Search learning paths" type="search" placeholder="Search learning paths..." value={query} onChange={e => setQuery(e.target.value)}/></label></div>
      <div className="lp-tabs" role="group" aria-label="Learning path collection"><button aria-pressed={tab === 'mine'} className={tab === 'mine' ? 'active' : ''} onClick={() => setTab('mine')}>My learning paths <span>{myVersions.length}</span></button><button aria-pressed={tab === 'assigned'} className={tab === 'assigned' ? 'active' : ''} onClick={() => setTab('assigned')}>Assigned <span>{assignedVersions.length}</span></button><button aria-pressed={tab === 'explore'} className={tab === 'explore' ? 'active' : ''} onClick={() => setTab('explore')}>Explore paths <span>{discover.length}</span></button></div>
      <div className="lp-card-grid">{visiblePaths.map(card)}{!visiblePaths.length && <div className="lp-empty"><BookOpen size={30}/><h3>{query ? 'No matching paths' : tab === 'mine' ? 'Your journey is ready to begin' : tab === 'assigned' ? 'No assigned learning paths' : 'All caught up'}</h3><p>{query ? 'Try a different name or keyword.' : tab === 'assigned' ? 'Learning paths assigned by your admin will appear here.' : tab === 'mine' ? 'Explore the available learning paths and find your next goal.' : published.length ? 'You have joined all available paths. Keep going with your courses below.' : 'New learning paths will appear here when they are published.'}</p>{tab === 'mine' && !query && <button className="lp-button primary" onClick={() => setTab('explore')}>Explore paths <ArrowRight size={16}/></button>}</div>}</div>
      {selected && <section className="lp-panel lp-stack" aria-label={`${selected.name} course sequence`}>
        <div className="lp-toolbar"><div><span className="lp-eyebrow">COURSE ROADMAP · VERSION {selected.version_number}</span><h2>{selected.name}</h2></div>
          {enrolment ? <strong>{pathProgress?.progress_percent || 0}% complete</strong> : <button className="lp-button primary" disabled={busy} onClick={() => run(async () => { await learningPathService.enrol(selected.path_id); await reload(); })}>{busy ? 'Joining...' : 'Join Learning Path'}</button>}
        </div>
        <p className="lp-muted">{selected.description}</p>
        {enrolment?.due_at && <p>Due {new Date(enrolment.due_at).toLocaleDateString()}</p>}
        {enrolment && <progress aria-label="Selected path progress" max={100} value={pathProgress?.progress_percent || 0}/>}
        {nextCourse && <div><button className="lp-button primary" disabled={busy || !onStartStudy} onClick={() => onStartStudy?.(courses.find(c => c.id === nextCourse.course_id)!)}><Play size={16}/> {enrolment ? 'Continue Learning' : 'Start First Available Course'}</button></div>}
        <ol className="lp-sequence">{selectedCourses.map(row => {
          const course = courses.find(c => c.id === row.course_id);
          const percent = coursePercent(row.course_id,userProgress);
          const missing = missingPrerequisites(row.course_id,data.prerequisites,userProgress);
          const status = percent >= 100 ? 'Completed' : missing.length ? 'Locked' : userProgress.some(p => p.courseId === row.course_id) ? 'In Progress' : 'Available';
          return <li className={`lp-course-step ${status === 'Completed' ? 'complete' : ''}`} key={row.course_id}>
            <span className="lp-step-number">{status === 'Completed' ? <Check size={19}/> : missing.length ? <Lock size={17}/> : row.position}</span>
            <div className="lp-step-copy"><h3>{courseTitle(row.course_id)}</h3><p>{row.required ? 'Required' : 'Optional'} · {status}{percent > 0 ? ` · ${percent}%` : ''}</p>
              {!!missing.length && <p className="lp-lock-reason">Complete first: {missing.map(courseTitle).join(', ')}</p>}
              {!course && <p>This course is unavailable. Contact your trainer.</p>}
            </div>
            <button className="lp-button" disabled={busy || !course || !onStartStudy || missing.length > 0} onClick={() => course && onStartStudy?.(course)}>{status === 'Completed' ? 'Review' : missing.length ? 'Locked' : percent > 0 ? 'Continue' : 'Start Course'}</button>
          </li>;
        })}</ol>
      </section>}
    </>}
  </section>;
}
