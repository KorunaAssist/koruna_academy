import { useEffect,useState } from 'react';
import { BarChart3,RefreshCw,Send } from 'lucide-react';
import type { UserSessionData } from '../../services/auth';
import { teamReportsService,emptyTeamReport,type TeamReport,type ReportLearner } from '../../services/teamReports';
import { teamReportMetrics,learnerLearningStatus,groupTeamOverview } from '../../services/teamReportMetrics';
import { TeamOverviewGroups } from './TeamOverviewGroups';
import '../courses/learningPaths.css';
import './teamReports.css';

type Tab = 'overview' | 'assignments' | 'practicals' | 'teams';
export function TeamReportsView({ userSession,onChanged,initialTab = 'overview' }: { userSession: UserSessionData; onChanged?: () => Promise<void>; initialTab?: Tab }) {
  const canManageTeams = userSession.role==='admin' || userSession.role==='team_leader';
  const [data,setData] = useState<TeamReport>(emptyTeamReport);
  const [loading,setLoading] = useState(true);
  const [refreshing,setRefreshing] = useState(false);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [message,setMessage] = useState('');
  const [tab,setTab] = useState<Tab>(() => initialTab==='teams' && !canManageTeams ? 'overview' : initialTab);
  const [query,setQuery] = useState('');
  const [department,setDepartment] = useState('');
  const [manager,setManager] = useState('');
  const [roadmap,setRoadmap] = useState('');
  const [status,setStatus] = useState('');
  const [assignment,setAssignment] = useState({ userId: '',kind: 'course' as 'course' | 'path',itemId: '',deadline: '' });
  const [team,setTeam] = useState({ managerId: '',memberId: '' });
  const [feedback,setFeedback] = useState<Record<string,string>>({});
  const [reviewStatus,setReviewStatus] = useState('pending');
  useEffect(() => {
    let active = true;
    teamReportsService.load().then(result => { if (active) setData(result); })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Unable to load the report.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  },[userSession.id]);
  const refresh = async () => {
    setRefreshing(true); setError('');
    try { setData(await teamReportsService.load()); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to refresh the report.'); }
    finally { setRefreshing(false); }
  };
  const run = async (work: () => Promise<void>,success: string) => {
    setBusy(true); setError(''); setMessage('');
    try {
      await work(); setMessage(success);
      setData(await teamReportsService.load());
      if (onChanged) await onChanged();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to complete the action.'); }
    finally { setBusy(false); }
  };
  const isAdminOverview = userSession.role==='admin' && tab==='overview';
  const employeeIds = new Set(data.team_candidates.map(person => person.id));
  const eligibleEmployees = data.learners.filter(learner => employeeIds.has(learner.id));
  const leaderIds = new Set(data.managers.map(person => person.id));
  const teamMemberIds = new Set(data.team_members.filter(member => leaderIds.has(member.manager_id)).map(member => member.member_id));
  const scopedLearners = isAdminOverview ? eligibleEmployees.filter(learner => teamMemberIds.has(learner.id)) : data.learners;
  const departments = [...new Set(scopedLearners.map(l => l.department).filter(Boolean))].sort();
  const paths = [...new Map(scopedLearners.flatMap(l => l.paths.map(p => [p.path_id,p.name] as const))).entries()];
  const visible = scopedLearners.filter(l => `${l.name} ${l.email}`.toLowerCase().includes(query.toLowerCase())
    && (!department || l.department===department)
    && (!manager || data.team_members.some(t => t.manager_id===manager && t.member_id===l.id))
    && (!roadmap || l.paths.some(p => p.path_id===roadmap))
    && (!status || (status==='overdue' ? l.courses.some(c => c.overdue) || l.paths.some(p => p.overdue)
      : learnerLearningStatus(l)===status)));
  const metrics = teamReportMetrics(visible,data.practicals);
  const groupedTeams = groupTeamOverview(data.managers,data.team_members,eligibleEmployees,visible,manager);
  const date = (value: string | null) => value ? new Date(value).toLocaleDateString('en-SG',{ timeZone: 'Asia/Singapore' }) : 'No deadline';
  const reminder = (learner: ReportLearner,kind: 'course' | 'path',id: string,last: string | null) => <span className="tr-reminder">
    <button className="lp-button" disabled={busy || refreshing || !!last && Date.now()-new Date(last).getTime()<60000} onClick={() => run(() => teamReportsService.remind(learner.id,kind,id),'Reminder saved in the employee’s notifications.')}><Send size={13}/> Remind</button>
    {last && <small>Last sent {new Date(last).toLocaleString('en-SG',{ timeZone: 'Asia/Singapore' })}</small>}
  </span>;
  const renderLearner = (learner: ReportLearner) => <article className="lp-panel lp-stack" key={learner.id}>
          <div className="lp-toolbar"><div><h2>{learner.name}</h2><p className="lp-muted">{learner.email} · {learner.department || 'No department'}</p></div><button className="lp-button" onClick={() => { setAssignment({ userId: learner.id,kind: 'course',itemId: '',deadline: '' }); setTab('assignments'); }}>Assign Training</button></div>
          <details open><summary>Courses ({learner.courses.length})</summary><div className="tr-table-wrap"><table className="tr-table"><thead><tr><th>Course</th><th>Progress</th><th>Quiz</th><th>Deadline</th><th>Actions</th></tr></thead><tbody>
            {learner.courses.map(course => <tr key={course.course_id}><td><strong>{course.title}</strong><small>{course.code} · {course.assigned ? 'Assigned' : 'Self-started / roadmap'}</small></td><td><progress max={100} value={course.percent} aria-label={`${course.title} progress`}/>{course.percent}%</td><td>{course.quiz_score===null ? '—' : `${course.quiz_score}%`}</td><td><span className={course.overdue ? 'tr-overdue' : ''}>{date(course.due_at)}{course.overdue ? ' · Overdue' : ''}</span></td><td><div className="lp-actions">{reminder(learner,'course',course.course_id,course.last_reminder_at)}{course.assigned && course.can_assign && <button className="lp-button" disabled={busy} onClick={() => run(() => teamReportsService.assign(learner.id,'course',course.course_id,undefined,true),'Course assignment removed; learning progress is retained.')}>Unassign</button>}</div></td></tr>)}
          </tbody></table>{!learner.courses.length && <p className="lp-muted">No course activity yet.</p>}</div></details>
          <details><summary>Learning paths ({learner.paths.length})</summary><div className="lp-stack">{learner.paths.map(path => <div className="tr-training-row" key={path.path_id}><div><strong>{path.name}</strong><small>Version {path.version_number} · {path.source} · {path.completed}/{path.required} required courses</small><span className={path.overdue ? 'tr-overdue' : 'lp-muted'}>{date(path.due_at)}{path.overdue ? ' · Overdue' : ''}</span></div><strong>{path.percent}%</strong><div className="lp-actions">{reminder(learner,'path',path.path_id,path.last_reminder_at)}{path.source==='assigned' && path.can_assign && <button className="lp-button" disabled={busy} onClick={() => run(() => teamReportsService.assign(learner.id,'path',path.path_id,undefined,true),'Roadmap assignment removed; enrolment and learning progress are retained.')}>Unassign</button>}</div></div>)}{!learner.paths.length && <p className="lp-muted">No roadmap enrolments yet.</p>}</div></details>
          <details><summary>Skill learning progress ({learner.skills.length})</summary><p className="lp-muted">Skill percentages measure required training completed, not trainer verification.</p><div className="tr-skill-grid">{learner.skills.map(skill => <div className="tr-skill" key={skill.skill_id}><strong>{skill.name}</strong><progress max={100} value={skill.percent} aria-label={`${skill.name} learning progress`}/><span>{skill.percent}% · {skill.completed}/{skill.required} required lessons</span></div>)}{!learner.skills.length && <p className="lp-muted">No linked skills in this reporting scope.</p>}</div></details>
        </article>;
  return <section className="lp-workspace lp-learner tr-page" aria-labelledby="team-report-title">
    <header className="lp-heading"><div><span className="lp-eyebrow">LEARNING OPERATIONS</span><h1 id="team-report-title">Team Reports</h1><p>{userSession.role==='admin' ? 'Learning progress across all employees.' : userSession.role==='team_leader' ? 'Learning progress for employees assigned to your team.' : 'Progress in the courses and roadmaps you manage.'}</p></div><BarChart3 size={42}/></header>
    <div className="lp-toolbar"><p className="lp-muted">{data.generated_at ? `Updated ${new Date(data.generated_at).toLocaleString('en-SG',{ timeZone: 'Asia/Singapore' })}` : 'Loading authorised report data.'}</p><button className="lp-button" disabled={busy || refreshing} onClick={() => void refresh()}><RefreshCw size={15}/>{refreshing ? 'Refreshing…' : 'Refresh Report'}</button></div>
    {loading && <p role="status">Loading team reports…</p>}
    {error && <p className="lp-alert" role="alert">{error}</p>}{message && <p className="lp-notice" role="status">{message}</p>}
    {!loading && <>
      <nav className="tr-tabs" aria-label="Report sections">{(['overview','assignments','practicals',...(canManageTeams ? ['teams'] : [])] as Tab[]).map(item => <button className={`lp-button ${tab===item ? 'primary' : ''}`} key={item} aria-current={tab===item ? 'page' : undefined} onClick={() => setTab(item)}>{({overview:'Team Overview',assignments:'Assign Training',practicals:'Practical Reviews',teams:userSession.role==='team_leader' ? 'Manage My Team' : 'Manage Teams'})[item]}</button>)}</nav>
      {(tab==='overview' || tab==='practicals') && <div className="tr-filters">
        <label className="lp-field">Employee<input type="search" placeholder="Search name or email" value={query} onChange={e => setQuery(e.target.value)}/></label>
        <label className="lp-field">Department<select value={department} onChange={e => setDepartment(e.target.value)}><option value="">All departments</option>{departments.map(d => <option key={d}>{d}</option>)}</select></label>
        {userSession.role==='admin' && !!data.managers.length && <label className="lp-field">Team leader<select value={manager} onChange={e => setManager(e.target.value)}><option value="">All teams</option>{data.managers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>}
        <label className="lp-field">Roadmap<select value={roadmap} onChange={e => setRoadmap(e.target.value)}><option value="">All roadmaps</option>{paths.map(([id,name]) => <option key={id} value={id}>{name}</option>)}</select></label>
        <label className="lp-field">Learning status<select value={status} onChange={e => setStatus(e.target.value)}><option value="">All statuses</option><option value="not_started">Not started</option><option value="in_progress">In progress</option><option value="completed">Completed</option><option value="overdue">Overdue</option></select></label>
      </div>}
      {tab==='overview' && <>
        <div className="tr-stats">{[['Employees',metrics.learners],['Average course progress',`${metrics.average}%`],['Overdue assignments',metrics.overdue],['Pending practical reviews',metrics.pending]].map(([label,value]) => <article className="lp-panel" key={label}><span className="lp-muted">{label}</span><strong>{value}</strong></article>)}</div>
        <p className="lp-muted">Average is across the displayed employees’ course records, including assigned, self-started, and roadmap courses. Repeated application records count as one course.</p>
        {!isAdminOverview && !visible.length && <div className="lp-empty">{data.learners.length ? 'No employees match these filters.' : userSession.role==='team_leader' ? 'No employees are assigned to your team yet. Open Manage My Team to select your members.' : 'No employee learning activity is available in your reporting scope yet.'}</div>}
        {isAdminOverview ? <TeamOverviewGroups groups={groupedTeams} renderMember={renderLearner} /> : visible.map(renderLearner)}
      </>}
      {tab==='assignments' && <form className="lp-panel lp-stack" onSubmit={e => { e.preventDefault(); void run(async () => {
        if (!assignment.userId || !assignment.itemId) throw new Error('Choose an employee and training.');
        await teamReportsService.assign(assignment.userId,assignment.kind,assignment.itemId,assignment.deadline ? new Date(`${assignment.deadline}T23:59:59+08:00`).toISOString() : undefined);
        setAssignment(previous => ({ ...previous,itemId: '',deadline: '' }));
      },'Training assigned. The employee has received an in-platform notification.'); }}>
        <h2>Assign Training</h2><div className="tr-filters"><label className="lp-field">Employee<select required disabled={busy} value={assignment.userId} onChange={e => setAssignment({ ...assignment,userId: e.target.value })}><option value="">Choose employee</option>{data.assignment_learners.map(l => <option key={l.id} value={l.id}>{l.name} · {l.email}</option>)}</select></label>
          <label className="lp-field">Training type<select disabled={busy} value={assignment.kind} onChange={e => setAssignment({ ...assignment,kind: e.target.value as 'course' | 'path',itemId: '' })}><option value="course">Course</option><option value="path">Learning path</option></select></label>
          <label className="lp-field">Training<select required disabled={busy} value={assignment.itemId} onChange={e => setAssignment({ ...assignment,itemId: e.target.value })}><option value="">Choose training</option>{(assignment.kind==='course' ? data.assignable_courses : data.assignable_paths).map(option => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>
          <label className="lp-field">Deadline (optional)<input type="date" disabled={busy} value={assignment.deadline} onChange={e => setAssignment({ ...assignment,deadline: e.target.value })}/></label></div>
        <p className="lp-muted">Courses default to seven days if no deadline is selected. Roadmap deadlines are optional. Existing progress and pinned roadmap versions are preserved.</p><div><button className="lp-button primary" disabled={busy || !data.assignment_learners.length}>{busy ? 'Assigning…' : 'Assign Training'}</button></div>
      </form>}
      {tab==='practicals' && <section className="lp-stack"><label className="lp-field lp-search">Review status<select value={reviewStatus} onChange={e => setReviewStatus(e.target.value)}><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Needs revision</option><option value="">All reviews</option></select></label>
        {data.practicals.filter(p => visible.some(l => l.id===p.user_id) && (!reviewStatus || p.status===reviewStatus)).map(practical => <article className="lp-panel lp-stack" key={practical.id}><div className="lp-toolbar"><div><h2>{practical.course_title}</h2><p className="lp-muted">{practical.user_name} · {practical.date_submitted}</p></div><span className="lp-badge">{practical.status}</span></div><p className="tr-submission">{practical.submission_text}</p>
          {practical.status==='pending' ? <><label className="lp-field">Feedback (required when requesting changes)<textarea rows={3} disabled={busy} value={feedback[practical.id] || ''} onChange={e => setFeedback({ ...feedback,[practical.id]: e.target.value })}/></label><div className="lp-actions"><button className="lp-button primary" disabled={busy} onClick={() => run(() => teamReportsService.review(practical.id,'approved',feedback[practical.id] || ''),'Practical approved. The learner’s practical status has been updated.')}>Approve</button><button className="lp-button" disabled={busy} onClick={() => run(() => teamReportsService.review(practical.id,'rejected',feedback[practical.id] || ''),'Submission returned for revision.')}>Request Changes</button></div></> : <div>{practical.review_feedback && <p className="lp-muted">Feedback: {practical.review_feedback}</p>}{practical.reviewer_name && <small>Reviewed by {practical.reviewer_name}{practical.reviewed_at ? ` · ${date(practical.reviewed_at)}` : ''}</small>}</div>}
        </article>)}
        {!data.practicals.some(p => visible.some(l => l.id===p.user_id) && (!reviewStatus || p.status===reviewStatus)) && <p className="lp-empty">No practical submissions match these filters.</p>}
      </section>}
      {tab==='teams' && canManageTeams && <section className="lp-stack">
        <form className="lp-panel lp-stack" onSubmit={e => { e.preventDefault(); void run(async () => {
          const managerId = userSession.role==='team_leader' ? userSession.id : team.managerId;
          if (!managerId || !team.memberId) throw new Error('Select a team leader and employee.');
          await teamReportsService.setTeam(managerId,team.memberId);
          setTeam(previous => ({ ...previous,memberId: '' }));
        },'Employee added to the team.'); }}>
          <h2>{userSession.role==='team_leader' ? 'Select your team members' : 'Assign a team member'}</h2>
          <p className="lp-muted">{userSession.role==='team_leader' ? 'Add employees to your own team to view their progress and assign training. You can also remove your own memberships.' : 'Choose a team leader and the employee to add.'} Adding an employee does not remove them from any other team.</p>
          <div className="tr-filters">
            {userSession.role==='admin' ? <label className="lp-field">Team leader<select required disabled={busy} value={team.managerId} onChange={e => setTeam({ ...team,managerId: e.target.value })}><option value="">Choose team leader</option>{data.managers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label> : <p>Team leader: <strong>{userSession.name}</strong></p>}
            <label className="lp-field">Employee<select required disabled={busy} value={team.memberId} onChange={e => setTeam({ ...team,memberId: e.target.value })}><option value="">Choose employee</option>{data.team_candidates.filter(l => !data.team_members.some(t => t.member_id===l.id && t.manager_id===(userSession.role==='team_leader' ? userSession.id : team.managerId))).map(l => <option key={l.id} value={l.id}>{l.name} · {l.email}</option>)}</select></label>
          </div>
          <div><button className="lp-button primary" disabled={busy || !data.managers.length || !team.memberId}>Add Team Member</button></div>
          {!data.managers.length && <p className="lp-muted">Create or promote a team leader in User Directory first.</p>}
        </form>
        <div className="lp-panel lp-stack"><h2>{userSession.role==='team_leader' ? 'My team members' : 'Current team memberships'}</h2>{data.team_members.map(t => <div className="lp-toolbar" key={`${t.manager_id}-${t.member_id}`}><span>{data.team_candidates.find(l => l.id===t.member_id)?.name || 'Employee'} → {data.managers.find(m => m.id===t.manager_id)?.name || 'Manager'}</span><button className="lp-button" disabled={busy} onClick={() => run(() => teamReportsService.setTeam(t.manager_id,t.member_id,true),'Team membership removed.')}>Remove</button></div>)}{!data.team_members.length && <p className="lp-muted">No team memberships yet. Select an employee above to build your team.</p>}</div>
      </section>}
    </>}
  </section>;
}
