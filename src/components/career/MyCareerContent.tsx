import { useState } from 'react';
import type { UserSessionData } from '../../services/auth';
import type { Course,UserProgress } from '../../services/db';
import type { CareerWorkspace } from '../../services/careerPaths';
import { CareerPathDetails } from './CareerPathDetails';

export function MyCareerContent({workspace,userSession,courses,userProgress,assignedCourseIds,onStartStudy,onTabChange,onSetGoal,onRefresh,loading,busy}: {
  workspace: CareerWorkspace; userSession: UserSessionData; courses: Course[]; userProgress: UserProgress[]; assignedCourseIds: string[];
  onStartStudy: (course: Course) => void; onTabChange: (tab: string) => void;
  onSetGoal: (id: string | null) => void; onRefresh: () => void; loading: boolean; busy: boolean;
}) {
  const [selectedId,setSelectedId] = useState('');
  const [query,setQuery] = useState('');
  const [exploring,setExploring] = useState(false);
  const goal = workspace.goals.find(g => g.user_id===userSession.id);
  const paths = workspace.paths.filter(p => p.status==='published' || p.id===goal?.path_id);
  const goalPath = paths.find(p => p.id===goal?.path_id);
  const selected = paths.find(p => p.id===selectedId);
  const showExplore = exploring || !goalPath;
  const details = (path: typeof paths[number]) => <CareerPathDetails path={path} workspace={workspace} userSession={userSession} courses={courses} userProgress={userProgress} assignedCourseIds={assignedCourseIds} onStartStudy={onStartStudy} onTabChange={onTabChange}/>;
  const visible = paths.filter(p => `${p.name} ${p.description}`.toLowerCase().includes(query.toLowerCase()));
  return <>
    <div className="lp-toolbar"><p>Your goal: <strong>{goalPath?.name || 'No goal selected'}</strong></p>
      <button className="lp-button" disabled={loading || busy} onClick={onRefresh}>{loading ? 'Refreshing...' : 'Refresh Career Path'}</button>
      {goalPath && <button className="lp-button" aria-expanded={showExplore} onClick={() => {setExploring(value => !value);setSelectedId('');}}>{showExplore ? 'Back to My Goal' : 'Explore Career Paths'}</button>}
      {goal && <button className="lp-button" disabled={loading || busy} onClick={() => onSetGoal(null)}>Clear Goal</button>}
    </div>
    {goalPath && !showExplore && details(goalPath)}
    {showExplore && <>
      {!goalPath && <div className="lp-panel lp-stack"><h2>Choose your career goal</h2><p>Explore a path such as Loan Processor, Parabroker, or Servicing Specialist. Preview its stages, then select it as your goal to keep it on My Career.</p><p className="lp-muted">Courses and skills you have already completed will count toward your selected goal.</p></div>}
      <label className="lp-field lp-search">Explore career paths<input type="search" placeholder="Search Loan Processor, Parabroker..." value={query} onChange={e => setQuery(e.target.value)}/></label>
      <div className="lp-card-grid">{visible.map(path =>
        <button className={`lp-roadmap-card ${selected?.id===path.id ? 'selected' : ''}`} aria-pressed={selected?.id===path.id} key={path.id} onClick={() => setSelectedId(path.id)}>
          <h2>{path.name}</h2><p>{path.description}</p><small>{path.stages.length} training stages{path.status==='archived' ? ' · Archived' : ''}</small><span>Preview Career Path</span>
          {goal?.path_id===path.id && <span className="lp-badge published">Your career goal</span>}
        </button>)}</div>
      {!paths.length && <p className="lp-empty">No career paths have been published yet. Your admin or trainer can create one in Career Paths in their suite.</p>}
      {!!paths.length && !visible.length && <p>No career paths match your search.</p>}
      {selected && <>
        <h2>{goal?.path_id===selected.id ? 'Your Career Goal' : 'Career Path Preview'}</h2>
        {goal?.path_id!==selected.id && selected.status==='published' && <div><button className="lp-button primary" disabled={busy || loading} onClick={() => onSetGoal(selected.id)}>Set as My Career Goal</button></div>}
        {details(selected)}
      </>}
    </>}
  </>;
}
