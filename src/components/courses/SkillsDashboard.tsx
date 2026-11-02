import { useEffect,useState } from 'react';
import { Check,SlidersHorizontal } from 'lucide-react';
import type { Course,UserProgress } from '../../services/db';
import { skillsService,type Skill,type SkillRequirement,type SkillProgress } from '../../services/skills';
import './learningPaths.css';

export function SkillsDashboard({ userId,courses,userProgress,onStartStudy }: {
  userId?: string; courses: Course[]; userProgress: UserProgress[]; onStartStudy: (course: Course) => void;
}) {
  const [data,setData] = useState<{ skills: Skill[]; requirements: SkillRequirement[]; progress: SkillProgress[] }>({ skills: [],requirements: [],progress: [] });
  const [loading,setLoading] = useState(true);
  const [refreshing,setRefreshing] = useState(false);
  const [hasLoaded,setHasLoaded] = useState(false);
  const [error,setError] = useState('');
  const [retry,setRetry] = useState(0);
  const [query,setQuery] = useState('');
  const [showArchived,setShowArchived] = useState(false);
  useEffect(() => {
    let active = true;
    // The initial request shows loading; later updates keep the cards mounted.
    setRefreshing(true);
    skillsService.dashboard().then(next => { if (active) { setData(next); setError(''); setHasLoaded(true); } })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Unable to load skills.'); })
      .finally(() => { if (active) { setLoading(false); setRefreshing(false); } });
    return () => { active = false; };
  },[userId,userProgress,courses,retry]);
  const lessonCompleted = (r: SkillRequirement) => userProgress.some(p => p.courseId === r.course_id && (p.progressPercent >= 100 || p.completedLessons.includes(r.lesson_id)));
  const visible = data.skills.filter(s => (showArchived || !s.archived) && `${s.name} ${s.description}`.toLowerCase().includes(query.toLowerCase()));
  return <section className="lp-workspace lp-learner" aria-labelledby="skills-title">
    <header className="lp-heading"><div><span className="lp-eyebrow">GROW YOUR CAPABILITIES</span><h1 id="skills-title">Skills Dashboard</h1><p>Your learning progress across the required lessons linked to each skill. Completing the same lesson through different roadmaps counts once.</p></div><SlidersHorizontal size={42}/></header>
    {loading && <p role="status">Loading your skills…</p>}
    {error && <div className="lp-alert" role="alert">{error}<button className="lp-button" disabled={refreshing} onClick={() => setRetry(n => n+1)}>Retry</button></div>}
    {!loading && (hasLoaded || !error) && <>
      <div className="lp-toolbar"><label className="lp-field lp-search">Find a skill<input type="search" value={query} placeholder="Search Servicing, Loan Processing…" onChange={e => setQuery(e.target.value)}/></label>
        <label className="lp-check"><input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)}/> Include archived skills</label>
        <button className="lp-button" disabled={refreshing} onClick={() => setRetry(n => n+1)}>{refreshing ? 'Refreshing…' : 'Refresh Skills'}</button></div>
      <p className="lp-muted">Percentages show training completed. They do not represent trainer verification or professional certification.</p>
      <div className="lp-card-grid">{visible.map(skill => {
        const progress = data.progress.find(p => p.skill_id === skill.id);
        const required = progress?.required_lessons || 0;
        const completed = progress?.completed_lessons || 0;
        const percent = progress?.progress_percent || 0;
        const status = !required ? 'Not configured' : completed === required ? 'Completed' : progress?.started ? 'Learning' : 'Not Started';
        const requirements = data.requirements.filter(r => r.skill_id === skill.id);
        const courseIds = [...new Set(requirements.map(r => r.course_id))];
        const next = requirements.find(r => !lessonCompleted(r));
        const nextCourse = courses.find(c => c.id === next?.course_id);
        return <article className="lp-panel lp-stack" key={skill.id}>
          <div className="lp-toolbar"><span className={`lp-badge ${status==='Completed' ? 'published' : ''}`}>{status}</span>{skill.archived && <span className="lp-badge archived">Archived</span>}<strong>{percent}%</strong></div>
          <h2>{skill.name}</h2><p className="lp-muted">{skill.description}</p><progress max={100} value={percent} aria-label={`${skill.name} learning progress`}/>
          <p>{completed} of {required} required lessons completed</p>
          {!required && <p className="lp-muted">Your admin or trainer has not linked required lessons yet.</p>}
          {nextCourse && <button className="lp-button primary" onClick={() => onStartStudy(nextCourse)}>{progress?.started ? 'Continue Learning' : 'Start Learning'}</button>}
          {!!requirements.length && <details><summary>Required training ({courseIds.length} courses)</summary><div className="lp-stack">{courseIds.map(id => {
            const course = courses.find(c => c.id === id);
            return <div key={id}><div className="lp-toolbar"><strong>{course?.title || 'Unavailable course'}</strong>{course && <button className="lp-button" onClick={() => onStartStudy(course)}>Open Course</button>}</div>
              <ul className="skill-lesson-list">{requirements.filter(r => r.course_id === id).map(r => <li key={r.lesson_id}>{lessonCompleted(r) ? <Check size={15} aria-label="Completed"/> : <span className="skill-lesson-dot" aria-label="Not completed"/>}<span>{r.lesson_title || 'Untitled lesson'}</span></li>)}</ul>
            </div>;
          })}</div></details>}
        </article>;
      })}</div>
      {!visible.length && <p className="lp-empty">{data.skills.length ? 'No skills match your filters.' : 'No skills have been created yet. Your admin can add them in the Skills Catalogue.'}</p>}
    </>}
  </section>;
}
