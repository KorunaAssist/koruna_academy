import { useEffect,useState } from 'react';
import { ArrowRight, BookOpen, Check, ChartNoAxesCombined, Award, Layers, RefreshCw, Search, Target } from 'lucide-react';
import type { Course,UserProgress } from '../../services/db';
import { skillsService,type Skill,type SkillRequirement,type SkillProgress } from '../../services/skills';
import './learningPaths.css';
import './skillsDashboard.css';

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
  const [filter,setFilter] = useState<'all' | 'learning' | 'completed'>('all');
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
  const progressFor = (id: string) => data.progress.find(p => p.skill_id === id && (!userId || p.user_id === userId));
  const activeSkills = data.skills.filter(skill => !skill.archived);
  const isCompleted = (skill: Skill) => { const p = progressFor(skill.id); return !!p?.required_lessons && p.completed_lessons >= p.required_lessons; };
  const isLearning = (skill: Skill) => !!progressFor(skill.id)?.started && !isCompleted(skill);
  const percentFor = (id: string) => {
    const percent = progressFor(id)?.progress_percent;
    return typeof percent === 'number' && Number.isFinite(percent) ? Math.min(100,Math.max(0,percent)) : 0;
  };
  const scoreFor = (id: string) => percentFor(id) / 10;
  const averageScore = activeSkills.length ? activeSkills.reduce((total,skill) => total + scoreFor(skill.id),0) / activeSkills.length : 0;
  const strongSkillsCount = activeSkills.filter(skill => scoreFor(skill.id) >= 8).length;
  const visible = data.skills.filter(skill => (showArchived || !skill.archived) &&
    (filter === 'all' || (filter === 'completed' ? isCompleted(skill) : isLearning(skill))) &&
    `${skill.name} ${skill.description}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <section className="lp-workspace lp-learner skills-dashboard" aria-labelledby="skills-title">
    <header className="skills-banner"><h1 id="skills-title">Skills Dashboard</h1><p>Your skills at a glance, based on the training you complete at Koruna Academy.</p></header>
    {loading && <div className="lp-empty" role="status">Loading your skills...</div>}
    {error && <div className="lp-alert" role="alert">{error}<button className="lp-button" disabled={refreshing} onClick={() => setRetry(n => n+1)}>Retry</button></div>}
    {!loading && (hasLoaded || !error) && <>
      <div className="skills-summary" aria-label="Skills overview">
        <div><span className="lp-stat-icon"><ChartNoAxesCombined size={20}/></span><div><strong>{activeSkills.length}</strong><span>Skills tracked</span></div></div>
        <div><span className="lp-stat-icon"><Target size={20}/></span><div><strong>{averageScore.toFixed(1)} / 10</strong><span>Average score</span></div></div>
        <div><span className="lp-stat-icon"><Award size={20}/></span><div><strong>{strongSkillsCount}</strong><span>Skills at 8+</span></div></div>
      </div>
      <div className="lp-library-heading"><div><h2>Your skill collection</h2><p className="lp-muted">Find a focus and take your next step.</p></div><div className="skills-search-actions"><label className="lp-search-box"><Search size={18}/><input aria-label="Search skills" type="search" value={query} placeholder="Search skills..." onChange={e => setQuery(e.target.value)}/></label><button className="lp-button skills-refresh" disabled={refreshing} onClick={() => setRetry(n => n+1)} aria-label={refreshing ? 'Refreshing skills' : 'Refresh skills'} title="Refresh skills"><RefreshCw size={17} className={refreshing ? 'skills-spinning' : ''}/></button></div></div>
      <div className="skills-filter-row"><div className="lp-tabs" role="group" aria-label="Filter skills">{([{id:'all',label:'All skills'}, {id:'learning',label:'In progress'}, {id:'completed',label:'Completed'}] as const).map(item => <button key={item.id} aria-pressed={filter === item.id} className={filter === item.id ? 'active' : ''} onClick={() => setFilter(item.id)}>{item.label}</button>)}</div><label className="lp-check skills-archived"><input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)}/> Show archived</label></div>
      <div className="skills-chart" role="group" aria-label="Employee skill scores out of 10" aria-describedby="skills-score-note">
        {visible.map(skill => <div className="skills-chart-row" key={skill.id}>
          <div className="skills-chart-label"><span id={`skill-label-${skill.id}`}>{skill.name}</span>{skill.archived && <span className="lp-badge archived">Archived</span>}</div>
          <div className="skills-chart-value"><div className="skills-chart-track" role="meter" aria-labelledby={`skill-label-${skill.id}`} aria-valuemin={0} aria-valuemax={10} aria-valuenow={scoreFor(skill.id)}><span style={{width: `${percentFor(skill.id)}%`}}/></div><span className="skills-chart-score">{Number(scoreFor(skill.id).toFixed(1))}/10</span></div>
        </div>)}
      </div>
      {!!visible.length && <details className="skills-training-details"><summary>View required training and continue learning</summary><div className="lp-card-grid">{visible.map(skill => {
        const progress = progressFor(skill.id);
        const required = progress?.required_lessons || 0;
        const completed = progress?.completed_lessons || 0;
        const percent = percentFor(skill.id);
        const status = !required ? 'Not configured' : completed >= required ? 'Completed' : progress?.started ? 'Learning' : 'Not started';
        const requirements = data.requirements.filter(r => r.skill_id === skill.id);
        const courseIds = [...new Set(requirements.map(r => r.course_id))];
        const next = requirements.find(r => !lessonCompleted(r));
        const nextCourse = courses.find(c => c.id === next?.course_id);
        return <article className={`lp-panel lp-stack skill-card ${status === 'Completed' ? 'skill-completed' : ''}`} key={skill.id}>
          <div className="lp-toolbar"><span className="skill-card-icon"><Layers size={21}/></span><span className={`lp-badge ${status === 'Completed' ? 'published' : ''}`}>{status}</span>{skill.archived && <span className="lp-badge archived">Archived</span>}</div>
          <h2>{skill.name}</h2><p className="lp-muted skill-description">{skill.description || 'Build this capability through focused training.'}</p>
          <div className="skill-progress-label"><span>Training progress</span><strong>{percent}%</strong></div><progress max={100} value={percent} aria-label={`${skill.name} learning progress`}/>
          <p className="skill-lesson-count"><BookOpen size={14}/>{completed} of {required} required lessons completed</p>
          {!required && <p className="lp-muted">Your admin or trainer has not linked required lessons yet.</p>}
          {nextCourse && <button className="lp-button primary skill-start" onClick={() => onStartStudy(nextCourse)}>{progress?.started ? 'Continue learning' : 'Start learning'}<ArrowRight size={16}/></button>}
          {!!requirements.length && <details><summary>Required training ({courseIds.length} courses)</summary><div className="lp-stack">{courseIds.map(id => {
            const course = courses.find(c => c.id === id);
            return <div key={id}><div className="lp-toolbar"><strong>{course?.title || 'Unavailable course'}</strong>{course && <button className="lp-button" onClick={() => onStartStudy(course)}>Open course</button>}</div>
              <ul className="skill-lesson-list">{requirements.filter(r => r.course_id === id).map(r => <li key={r.lesson_id}>{lessonCompleted(r) ? <Check size={15} aria-label="Completed"/> : <span className="skill-lesson-dot" aria-label="Not completed"/>}<span>{r.lesson_title || 'Untitled lesson'}</span></li>)}</ul>
            </div>;
          })}</div></details>}
        </article>;
      })}</div></details>}
      {!visible.length && <div className="lp-empty"><Layers size={30}/><h3>{data.skills.length ? 'No skills to show' : 'Your skills journey starts here'}</h3><p>{data.skills.length ? 'Try another search or filter to find your next focus.' : 'Skills will appear here when your admin adds them to the Skills Catalogue.'}</p>{data.skills.length > 0 && <button className="lp-button" onClick={() => { setQuery(''); setFilter('all'); setShowArchived(false); }}>Clear filters</button>}</div>}
      <p className="skills-footnote" id="skills-score-note">Scores reflect required training completed: 100% completion equals 10/10. They are not proficiency assessments. Trainer verification and professional certification are tracked separately.</p>
    </>}
  </section>;
}
