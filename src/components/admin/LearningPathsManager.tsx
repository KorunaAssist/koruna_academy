import { useState } from 'react';
import { Plus, Route, X, Search, BookOpen, Users, CheckCircle2, Pencil } from 'lucide-react';
import type { UserSessionData } from '../../services/auth';
import type { Course, DatabaseUser } from '../../services/db';
import { canManageCourse } from '../../services/authorization';
import { learningPathService, type PathVersion, type PathData } from '../../services/learningPaths';
import { useLearningPaths } from '../courses/useLearningPaths';
import '../courses/learningPaths.css';
import './learningPathsManager.css';

import { LearningPathEditorModal, type LearningPathEditor } from './LearningPathEditorModal';
export function LearningPathsManager({ userSession,courses,users }: { userSession: UserSessionData; courses: Course[]; users: DatabaseUser[] }) {
  const { data,loading,error,reload } = useLearningPaths(userSession.id);
  const [editor,setEditor] = useState<LearningPathEditor | null>(null);
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState('');
  const [actionError,setActionError] = useState('');
  const [assignment,setAssignment] = useState<PathVersion | null>(null);
  const [deleteCandidate,setDeleteCandidate] = useState<PathVersion | null>(null);
  const [assignedUsers,setAssignedUsers] = useState<string[]>([]);
  const [deadline,setDeadline] = useState('');
  const [learnerSearch,setLearnerSearch] = useState('');
  const [pathSearch,setPathSearch] = useState('');
  const [statusFilter,setStatusFilter] = useState<'all' | PathVersion['status']>('all');
  const owned = data.paths.filter(p => userSession.role === 'admin' || p.created_by === userSession.id);
  const versions = data.versions.filter(v => owned.some(p => p.id === v.path_id))
    .sort((a,b) => a.name.localeCompare(b.name) || b.version_number-a.version_number);
  const visibleVersions = versions.filter(v => (statusFilter === 'all' || v.status === statusFilter) && `${v.name} ${v.description}`.toLowerCase().includes(pathSearch.toLowerCase()));
  const learnersCount = new Set(data.enrolments.filter(e => versions.some(v => v.id === e.version_id)).map(e => e.user_id)).size;
  const managedAssignments = assignment ? data.enrolments.filter(enrolment => enrolment.path_id === assignment.path_id && enrolment.source === 'assigned') : [];
  const open = (version: PathVersion | null, source: PathData = data) => {
    const prerequisites: Record<string,string[]> = {};
    for (const edge of source.prerequisites) (prerequisites[edge.course_id] ||= []).push(edge.prerequisite_course_id);
    setEditor({ versionId: version?.id || null,name: version?.name || '',description: version?.description || '',
      courses: source.courses.filter(c => c.version_id === version?.id).sort((a,b) => a.position-b.position)
        .map(c => ({ course_id: c.course_id,required: c.required })),prerequisites });
    setMessage(''); setActionError('');
  };
  const run = async (work: () => Promise<void>) => {
    setBusy(true); setMessage(''); setActionError('');
    try { await work(); } catch (reason) { setActionError(reason instanceof Error ? reason.message : 'Unable to complete the action.'); }
    finally { setBusy(false); }
  };
  const save = (publish: boolean) => run(async () => {
    if (!editor) return;
    if (!editor.name.trim()) throw new Error('Enter a roadmap name.');
    if (publish && !editor.courses.some(c => c.required)) throw new Error('Add at least one required course before publishing.');
    const versionId = await learningPathService.saveDraft({ name: editor.name,description: editor.description,
      versionId: editor.versionId,courses: editor.courses,
      prerequisites: editor.courses.filter(row => {
        const course = courses.find(c => c.id === row.course_id);
        return course && canManageCourse(userSession.role,userSession.id,course.createdBy);
      }).map(row => ({ course_id: row.course_id,prerequisite_course_ids: editor.prerequisites[row.course_id] || [] })) });
    // Retain the saved ID even if a later publish request fails; retry edits the draft.
    setEditor(previous => previous ? { ...previous,versionId } : null);
    if (publish) await learningPathService.setStatus(versionId,'published');
    await reload(); setEditor(null);
    setMessage(publish ? 'Roadmap published. All employees can now browse and join it.' : 'Draft saved. It is visible to its creator and admins.');
  });
  return <section className="lp-workspace lpa" aria-label="Manage learning paths">
    <header className="lpa-heading"><div><span className="lp-eyebrow">LEARNING MANAGEMENT</span><h1>Learning paths</h1><p>Turn individual courses into a clear journey of growth.</p></div>
      <button className="lp-button primary" disabled={busy || loading || !!error} onClick={() => open(null)}><Plus size={17}/> Create learning path</button></header>
    <div className="lpa-stats" aria-label="Learning path overview">
      <div><span className="lpa-stat-icon"><Route size={20}/></span><div><strong>{loading || error ? '—' : owned.length}</strong><span>Learning paths</span></div></div>
      <div><span className="lpa-stat-icon green"><CheckCircle2 size={20}/></span><div><strong>{loading || error ? '—' : versions.filter(v => v.status === 'published').length}</strong><span>Published versions</span></div></div>
      <div><span className="lpa-stat-icon amber"><Pencil size={20}/></span><div><strong>{loading || error ? '—' : versions.filter(v => v.status === 'draft').length}</strong><span>Draft versions</span></div></div>
      <div><span className="lpa-stat-icon blue"><Users size={20}/></span><div><strong>{loading || error ? '—' : learnersCount}</strong><span>Enrolled learners</span></div></div>
    </div>
    {loading && <p role="status">Loading roadmaps…</p>}
    {error && <div className="lp-alert" role="alert">{error}<button className="lp-button" onClick={() => run(async () => { await reload(); })}>Retry</button></div>}
    {actionError && !editor && <p className="lp-alert" role="alert">{actionError}</p>}
    {message && <p className="lp-notice" role="status">{message}</p>}
    {editor && <LearningPathEditorModal
      editor={editor} courses={courses} userSession={userSession}
      busy={busy} actionError={actionError} onChange={setEditor} onSave={save}
      onClose={() => { setEditor(null); setActionError(''); }}
    />}
    <>
      <div className="lpa-library-heading"><div><h2>Your learning paths</h2><p className="lp-muted">Manage drafts, published versions, and learner progress.</p></div><label className="lpa-search"><Search size={17}/><input type="search" aria-label="Search learning paths" placeholder="Search learning paths..." value={pathSearch} onChange={e => setPathSearch(e.target.value)}/></label></div>
      <div className="lpa-tabs" aria-label="Filter learning paths by status">{(['all','published','draft','archived'] as const).map(status => <button key={status} className={statusFilter === status ? 'active' : ''} aria-pressed={statusFilter === status} onClick={() => setStatusFilter(status)}>{status === 'all' ? 'All versions' : status === 'draft' ? 'Drafts' : status[0].toUpperCase()+status.slice(1)}<span>{status === 'all' ? versions.length : versions.filter(v => v.status === status).length}</span></button>)}</div>
      <div className="lp-card-grid">
      {!loading && !error && versions.length===0 && <div className="lp-empty"><Route size={30}/><h3>No roadmaps yet</h3><p>Create your first roadmap using existing courses.</p></div>}
      {!loading && !error && versions.length > 0 && !visibleVersions.length && <div className="lp-empty"><Search size={28}/><h3>No matching learning paths</h3><p>Try a different name or status.</p><button className="lp-button" onClick={() => { setPathSearch(''); setStatusFilter('all'); }}>Reset filters</button></div>}
      {visibleVersions.map(version => {
        const learners = data.enrolments.filter(e => e.version_id === version.id);
        const roadmapCourses = data.courses.filter(course => course.version_id === version.id).sort((a,b) => a.position-b.position);
        const latestPublished = data.versions.filter(v => v.path_id === version.path_id && v.status === 'published').sort((a,b) => b.version_number-a.version_number)[0];
        return <article className="lp-panel lp-stack lpa-path-card" key={version.id}>
          <div className="lp-toolbar"><span className="lpa-path-icon"><Route size={22}/></span><span className={`lp-badge ${version.status}`}>{version.status}</span></div>
          <div className="lpa-card-copy"><small className="lpa-version">VERSION {version.version_number}</small><h2>{version.name}</h2><p className="lp-muted">{version.description || 'A guided sequence of courses to build practical skills.'}</p></div>
          <div className="lpa-card-meta"><span><BookOpen size={15}/>{data.courses.filter(c => c.version_id === version.id).length} courses</span><span><Users size={15}/>{learners.length} learners</span></div>
          <div className="lp-actions">
            {version.status === 'draft' ? <button className="lp-button primary" disabled={busy} onClick={() => open(version)}>Edit Draft</button> :
              <button className="lp-button" disabled={busy} onClick={() => run(async () => {
                const id = await learningPathService.clone(version.id); const next = await reload();
                open(next.versions.find(v => v.id === id)!,next);
              })}>Create New Version</button>}
            {version.status === 'published' && <>
              {latestPublished?.id === version.id && <button className="lp-button primary" disabled={busy} onClick={() => { setAssignment(version); setAssignedUsers([]); setDeadline(''); setLearnerSearch(''); setActionError(''); }}>Manage Assignments</button>}
              <button className="lp-button" disabled={busy} onClick={() => run(async () => { await learningPathService.setStatus(version.id,'archived'); await reload(); setMessage('Version archived. Existing learners retain access.'); })}>Archive</button>
            </>}
            {version.status === 'archived' && <>
              <button className="lp-button primary" disabled={busy} onClick={() => run(async () => { await learningPathService.restoreVersion(version.id); await reload(); setMessage(`Version ${version.version_number} restored as published.`); })}>Restore</button>
              <button className="lp-button danger" disabled={busy} onClick={() => setDeleteCandidate(version)}>Permanently Delete</button>
            </>}
          </div>
          {!!learners.length && <details><summary>Learner progress</summary><div className="lp-stack"><section className="lpa-roadmap-courses"><h3>Courses in this learning path</h3><ol>{roadmapCourses.map(course => {
            const courseDetails = courses.find(item => item.id === course.course_id);
            return <li key={course.course_id}><span>{courseDetails?.title || course.course_id}</span>{!course.required && <small>Optional</small>}</li>;
          })}</ol></section><h3 className="lpa-learner-progress-title">Learners</h3>{learners.map(e => {
            const learner = users.find(u => u.id === e.user_id);
            const progress = data.progress.find(p => p.enrolment_id === e.id);
            return <div className="lp-toolbar" key={e.id}><span>{learner?.name || learner?.email || 'Learner'}<small>{e.source}{e.due_at ? ` · Due ${new Date(e.due_at).toLocaleDateString()}` : ''}</small></span><strong>{progress?.progress_percent || 0}%</strong></div>;
          })}</div></details>}
        </article>;
      })}
    </div></>
    {assignment && <div className="lp-overlay"><section className="lp-dialog lp-stack lpa-assignment-dialog" role="dialog" aria-modal="true" aria-labelledby="lp-assign-title">
      <div className="lp-toolbar"><h2 id="lp-assign-title">Manage assignments: {assignment.name}</h2><button className="lp-icon" aria-label="Close assignment" disabled={busy} onClick={() => setAssignment(null)}><X size={20}/></button></div>
      <p>Assign the published roadmap to employees or remove a managed assignment. Removing an assignment preserves completed course progress.</p>
      {!!managedAssignments.length && <section className="lpa-managed-assignments"><h3>Currently assigned</h3>{managedAssignments.map(enrolment => {
        const learner = users.find(user => user.id === enrolment.user_id);
        return <div className="lp-toolbar" key={enrolment.id}><span>{learner?.name || learner?.email || 'Employee'}<small>{enrolment.due_at ? `Due ${new Date(enrolment.due_at).toLocaleDateString()}` : 'No deadline'}</small></span>
          <div className="lp-actions">{enrolment.version_id !== assignment.id && <button className="lp-button" disabled={busy} onClick={() => run(async () => { await learningPathService.moveLearnerToLatestVersion(assignment.path_id,enrolment.user_id); await reload(); setMessage(`Moved ${learner?.name || 'the employee'} to Version ${assignment.version_number}.`); })}>Move to Version {assignment.version_number}</button>}
          <button className="lp-button" disabled={busy} onClick={() => run(async () => { await learningPathService.setAssignment(assignment.path_id,enrolment.user_id,undefined,true); await reload(); setMessage(`Removed the assignment for ${learner?.name || 'the employee'}.`); })}>Remove Assignment</button></div></div>;
      })}</section>}
      <label className="lp-field">Find employees<input type="search" value={learnerSearch} disabled={busy} onChange={e => setLearnerSearch(e.target.value)}/></label>
      <h3>Assign employees</h3><div className="lp-picker">{users.filter(u => u.role === 'employee' && u.id && `${u.name} ${u.email}`.toLowerCase().includes(learnerSearch.toLowerCase())).map(u =>
        <label className="lp-check" key={u.id}><input type="checkbox" disabled={busy} checked={assignedUsers.includes(u.id)} onChange={e => setAssignedUsers(previous => e.target.checked ? [...previous,u.id] : previous.filter(id => id !== u.id))}/><span>{u.name}<small>{u.email}</small></span></label>)}</div>
      <label className="lp-field">Deadline (optional)<input type="date" value={deadline} disabled={busy} onChange={e => setDeadline(e.target.value)}/></label>
      {actionError && <p className="lp-alert" role="alert">{actionError}</p>}
      <button className="lp-button primary" disabled={busy || !assignedUsers.length} onClick={() => run(async () => {
        const results = await Promise.allSettled(assignedUsers.map(id => learningPathService.setAssignment(assignment.path_id,id,deadline ? new Date(`${deadline}T23:59:59`).toISOString() : undefined)));
        const failed = results.flatMap((r,i) => r.status === 'rejected' ? [assignedUsers[i]] : []);
        await reload();
        if (failed.length) { setAssignedUsers(failed); throw new Error(`${results.length-failed.length} assignments saved; ${failed.length} failed. Retry the remaining employees.`); }
        setAssignment(null); setMessage(`Roadmap assigned to ${results.length} employees.`);
      })}>{busy ? 'Assigning…' : `Assign ${assignedUsers.length} Employees`}</button>
    </section></div>}
    {deleteCandidate && <div className="lp-overlay"><section className="lp-dialog lp-stack" role="dialog" aria-modal="true" aria-labelledby="lp-delete-title">
      <div className="lp-toolbar"><h2 id="lp-delete-title">Permanently delete Version {deleteCandidate.version_number}?</h2><button className="lp-icon" aria-label="Close delete confirmation" disabled={busy} onClick={() => setDeleteCandidate(null)}><X size={20}/></button></div>
      <p>This removes this archived roadmap version and its Learning Path enrolments. Employees’ completed course progress and certificates will be kept. This cannot be undone.</p>
      <div className="lp-actions"><button className="lp-button" disabled={busy} onClick={() => setDeleteCandidate(null)}>Cancel</button><button className="lp-button danger" disabled={busy} onClick={() => run(async () => { const version = deleteCandidate; await learningPathService.deleteArchivedVersion(version.id); await reload(); setDeleteCandidate(null); setMessage(`Version ${version.version_number} permanently deleted.`); })}>{busy ? 'Deleting…' : 'Permanently Delete'}</button></div>
      {actionError && <p className="lp-alert" role="alert">{actionError}</p>}
    </section></div>}
  </section>;
}
