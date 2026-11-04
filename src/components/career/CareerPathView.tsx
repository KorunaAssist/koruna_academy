import { useEffect,useState } from 'react';
import { TrendingUp } from 'lucide-react';
import type { UserSessionData } from '../../services/auth';
import type { Course,UserProgress } from '../../services/db';
import { careerPathService,loadCareerWorkspace,type CareerWorkspace } from '../../services/careerPaths';
import '../courses/learningPaths.css';
import './careerPaths.css';

import { MyCareerContent } from './MyCareerContent';

export function CareerPathView({userSession,courses,userProgress,assignedCourseIds,onStartStudy,onTabChange}: {
  userSession: UserSessionData; courses: Course[]; userProgress: UserProgress[];
  onStartStudy: (course: Course) => void; onTabChange: (tab: string) => void;
  assignedCourseIds: string[];
}) {
  const [data,setData] = useState<CareerWorkspace | null>(null);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const [refresh,setRefresh] = useState(0);
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState(false);
  useEffect(() => {
    let active=true;
    setLoading(true);
    loadCareerWorkspace().then(value => {if (active) {setData(value);setError('');}})
      .catch(reason => {if (active) setError(reason instanceof Error ? reason.message : 'Unable to load career paths.');})
      .finally(() => {if (active) setLoading(false);});
    return () => {active=false;};
  },[userSession.id,courses,userProgress,refresh]);
  const setGoal = async (id: string | null) => {
    setBusy(true);setError('');setNotice('');
    try {
      await careerPathService.setGoal(id);
      // Update the selected goal immediately after the confirmed write, without
      // waiting for another request or showing the previous goal during refresh.
      setData(previous => previous ? {...previous,goals:id ? [{user_id:userSession.id!,path_id:id,selected_at:new Date().toISOString()}] : []} : previous);
      setNotice(id ? 'Career goal saved. Your existing training progress counts toward this goal.' : 'Career goal cleared. Your training progress is preserved.');
      setRefresh(n => n+1);
    }
    catch (reason) {setError(reason instanceof Error ? reason.message : 'Unable to save your goal.');}
    finally {setBusy(false);}
  };
  return <section className="lp-workspace lp-learner" aria-labelledby="career-title">
    <header className="lp-heading"><div><span className="lp-eyebrow">PLAN YOUR NEXT ROLE</span><h1 id="career-title">My Career</h1><p>Follow your career goal, see what you have achieved, and find your next training step.</p></div><TrendingUp size={42}/></header>
    <p className="lp-muted">Progress shows training readiness. Promotions and role changes are decided by your organisation.</p>
    {error && <div role="alert" className="lp-alert">{error}</div>}
    {notice && <p role="status" className="lp-notice">{notice}</p>}
    {loading && !data && <p role="status">Loading career paths...</p>}
    {!data && !loading && <button className="lp-button" onClick={() => setRefresh(n => n+1)}>Retry</button>}
    {data && <MyCareerContent key={data.goals.find(goal => goal.user_id===userSession.id)?.path_id || 'no-goal'} workspace={data} userSession={userSession} courses={courses} userProgress={userProgress} assignedCourseIds={assignedCourseIds} onStartStudy={onStartStudy} onTabChange={onTabChange} onSetGoal={setGoal} onRefresh={() => setRefresh(n => n+1)} loading={loading} busy={busy}/>}
  </section>;
}
