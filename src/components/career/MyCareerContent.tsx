import { useState } from 'react';
import { ArrowUpRight, BriefcaseBusiness, CheckCircle2, Compass, Flag, Layers, RefreshCw, Search, Target } from 'lucide-react';
import { careerPathProgress } from '../../services/careerPathRules';
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
  const progress = goalPath ? careerPathProgress(goalPath,{userId:userSession.id,email:userSession.email,courses,progress:userProgress,roadmaps:workspace.roadmaps,skills:workspace.skills,skillProgress:workspace.progress}) : null;
  return <>
    <div className="mc-overview">
      <div className="mc-hero">
        <span className="mc-icon"><Target size={24}/></span>
        <span className="lp-eyebrow">{goalPath ? 'YOUR CAREER GOAL' : 'MAKE ROOM FOR WHAT COMES NEXT'}</span>
        <h2>{goalPath?.name || 'Your next chapter starts here.'}</h2>
        <p>{goalPath?.description || 'Discover where your strengths can take you. Choose a career path and turn your ambition into a clear training plan.'}</p>
        <span className="mc-hero-note"><CheckCircle2 size={16}/> Your completed training counts toward your goal.</span>
      </div>
      <aside className="mc-snapshot" aria-label="Career overview">
        <span className="lp-eyebrow">YOUR JOURNEY AT A GLANCE</span>
        <div><Compass size={22}/><strong>{paths.length}<small>Career paths to explore</small></strong></div>
        <div><CheckCircle2 size={22}/><strong>{progress ? progress.completedStages+' / '+progress.stages.length : '\u2014'}<small>Training stages completed</small></strong></div>
        <div><Flag size={22}/><strong>{progress ? progress.percent+'%' : '\u2014'}<small>{progress ? 'Training readiness' : 'Choose a goal to track progress'}</small></strong></div>
      </aside>
    </div>
    <div className="lp-toolbar mc-actions"><div><span className="lp-eyebrow">{showExplore ? 'FIND YOUR DIRECTION' : 'ONE STEP AT A TIME'}</span><h2>{showExplore ? 'Explore career paths' : 'Your training plan'}</h2></div><div className="lp-actions">
      <button className="lp-button" disabled={loading || busy} onClick={onRefresh}><RefreshCw size={15}/>{loading ? 'Refreshing...' : 'Refresh'}</button>
      {goalPath && <button className="lp-button" aria-expanded={showExplore} onClick={() => {setExploring(value => !value);setSelectedId('');}}>{showExplore ? 'Back to My Goal' : 'Explore Career Paths'}</button>}
      {goal && <button className="lp-button" disabled={loading || busy} onClick={() => onSetGoal(null)}>Clear Goal</button>}
    </div></div>
    {goalPath && !showExplore && details(goalPath)}
    {showExplore && <>
      {!goalPath && <div className="mc-guide"><span className="mc-icon"><BriefcaseBusiness size={22}/></span><div><h3>One goal. A clear way forward.</h3><p>Preview a path to see its stages, skills, and courses. Set your goal when you find the right fit.</p></div></div>}
      <div className="mc-search-row"><label className="mc-search"><Search size={18}/><input aria-label="Search career paths" type="search" placeholder="Search career paths..." value={query} onChange={e => setQuery(e.target.value)}/></label><span>{visible.length} {visible.length===1 ? 'path' : 'paths'} to explore</span></div>
      <div className="lp-card-grid">{visible.map(path =>
        <button className={`lp-roadmap-card ${selected?.id===path.id ? 'selected' : ''}`} aria-pressed={selected?.id===path.id} key={path.id} onClick={() => setSelectedId(path.id)}>
          <span className="mc-icon"><BriefcaseBusiness size={23}/></span><h2>{path.name}</h2><p>{path.description}</p><small className="mc-card-meta"><Layers size={14}/>{path.stages.length} training stages{path.status==='archived' ? ' - Archived' : ''}</small><span className="lp-card-link">Explore this path <ArrowUpRight size={17}/></span>
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
