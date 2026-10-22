import { useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Route, X } from 'lucide-react';
import type { UserSessionData } from '../../services/auth';
import type { Course, DatabaseUser } from '../../services/db';
import { canManageCourse } from '../../services/authorization';
import { learningPathService, type PathVersion, type PathData } from '../../services/learningPaths';
import { useLearningPaths } from '../courses/useLearningPaths';
import '../courses/learningPaths.css';

type Selection = { course_id: string; required: boolean };
interface Editor { versionId: string | null; name: string; description: string; courses: Selection[]; prerequisites: Record<string,string[]> }
export function LearningPathsManager({ userSession,courses,users }: { userSession: UserSessionData; courses: Course[]; users: DatabaseUser[] }) {
  const { data,loading,error,reload } = useLearningPaths(userSession.id);
  const [editor,setEditor] = useState<Editor | null>(null);
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState('');
  const [actionError,setActionError] = useState('');
  const [courseSearch,setCourseSearch] = useState('');
  const [assignment,setAssignment] = useState<PathVersion | null>(null);
  const [assignedUsers,setAssignedUsers] = useState<string[]>([]);
  const [deadline,setDeadline] = useState('');
  const [learnerSearch,setLearnerSearch] = useState('');
  const owned = data.paths.filter(p => userSession.role === 'admin' || p.created_by === userSession.id);
  const versions = data.versions.filter(v => owned.some(p => p.id === v.path_id))
    .sort((a,b) => a.name.localeCompare(b.name) || b.version_number-a.version_number);
  const title = (id: string) => courses.find(c => c.id === id)?.title || id;
  const open = (version: PathVersion | null, source: PathData = data) => {
    const prerequisites: Record<string,string[]> = {};
    for (const edge of source.prerequisites) (prerequisites[edge.course_id] ||= []).push(edge.prerequisite_course_id);
    setEditor({ versionId: version?.id || null,name: version?.name || '',description: version?.description || '',
      courses: source.courses.filter(c => c.version_id === version?.id).sort((a,b) => a.position-b.position)
        .map(c => ({ course_id: c.course_id,required: c.required })),prerequisites });
    setCourseSearch(''); setMessage(''); setActionError('');
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
  const move = (index: number,direction: number) => {
    if (!editor) return;
    const rows = [...editor.courses];
    [rows[index],rows[index+direction]] = [rows[index+direction],rows[index]];
    setEditor({ ...editor,courses: rows });
  };
  return <section className="lp-workspace" aria-label="Manage learning paths">
    <div className="lp-toolbar"><p>Build a sequence of courses. Published roadmaps are available to every employee.</p>
      <button className="lp-button primary" disabled={busy || loading || !!error} onClick={() => open(null)}><Plus size={16}/> Create Roadmap</button></div>
    {loading && <p role="status">Loading roadmaps…</p>}
    {error && <div className="lp-alert" role="alert">{error}<button className="lp-button" onClick={() => run(async () => { await reload(); })}>Retry</button></div>}
    {actionError && <p className="lp-alert" role="alert">{actionError}</p>}
    {message && <p className="lp-notice" role="status">{message}</p>}
    {editor ? <form className="lp-panel lp-stack" onSubmit={e => { e.preventDefault(); void save(false); }}>
      <div className="lp-toolbar"><h2>{editor.versionId ? 'Edit draft' : 'Create Roadmap'}</h2><button type="button" className="lp-button" disabled={busy} onClick={() => setEditor(null)}>Cancel</button></div>
      <fieldset disabled={busy} className="lp-fieldset lp-stack">
        <label className="lp-field">Roadmap name<input required value={editor.name} placeholder="e.g. Parabroker" onChange={e => setEditor({ ...editor,name: e.target.value })}/></label>
        <label className="lp-field">Description<textarea rows={3} value={editor.description} onChange={e => setEditor({ ...editor,description: e.target.value })}/></label>
        <div className="lp-columns">
          <div className="lp-stack"><h3>Available courses</h3><label className="lp-field">Find a course<input type="search" value={courseSearch} onChange={e => setCourseSearch(e.target.value)}/></label>
            <div className="lp-picker">{courses.filter(c => !editor.courses.some(row => row.course_id === c.id) && c.title.toLowerCase().includes(courseSearch.toLowerCase())).map(c =>
              <button type="button" className="lp-picker-row" key={c.id} onClick={() => setEditor({ ...editor,courses: [...editor.courses,{ course_id: c.id,required: true }] })}><span>{c.title}<small>{c.code}</small></span><Plus size={16}/></button>)}
              {!courses.length && <p>Create a course first, then add it to this roadmap.</p>}</div>
          </div>
          <div className="lp-stack"><h3>Course sequence ({editor.courses.length})</h3><p className="lp-muted">Sequence suggests an order. Prerequisites lock courses until earlier requirements are completed.</p>
            {!editor.courses.length && <div className="lp-empty">Select courses to build your roadmap.</div>}
            {editor.courses.map((row,index) => {
              const course = courses.find(c => c.id === row.course_id);
              const editable = !!course && canManageCourse(userSession.role,userSession.id,course.createdBy);
              return <div className="lp-step-editor lp-stack" key={row.course_id}>
                <div className="lp-toolbar"><strong>{index+1}. {title(row.course_id)}</strong><div className="lp-actions">
                  <button type="button" className="lp-icon" disabled={index===0} aria-label={`Move ${title(row.course_id)} up`} onClick={() => move(index,-1)}><ArrowUp size={16}/></button>
                  <button type="button" className="lp-icon" disabled={index===editor.courses.length-1} aria-label={`Move ${title(row.course_id)} down`} onClick={() => move(index,1)}><ArrowDown size={16}/></button>
                  <button type="button" className="lp-icon" aria-label={`Remove ${title(row.course_id)}`} onClick={() => setEditor({ ...editor,courses: editor.courses.filter(c => c.course_id !== row.course_id) })}><X size={16}/></button>
                </div></div>
                <label className="lp-check"><input type="checkbox" checked={row.required} onChange={e => setEditor({ ...editor,courses: editor.courses.map(c => c.course_id === row.course_id ? { ...c,required: e.target.checked } : c) })}/> Required for roadmap completion</label>
                <details><summary>Prerequisites ({(editor.prerequisites[row.course_id] || []).length})</summary>
                  <p className="lp-muted">These requirements apply to this course everywhere it appears. {editable ? 'Choose the courses that must be completed first.' : 'Only the course owner or an admin can edit them.'}</p>
                  <div className="lp-picker">{courses.filter(c => c.id !== row.course_id).map(c => <label className="lp-check" key={c.id}><input type="checkbox" disabled={!editable}
                    checked={(editor.prerequisites[row.course_id] || []).includes(c.id)} onChange={e => {
                      const previous = editor.prerequisites[row.course_id] || [];
                      setEditor({ ...editor,prerequisites: { ...editor.prerequisites,[row.course_id]: e.target.checked ? [...previous,c.id] : previous.filter(id => id !== c.id) } });
                    }}/>{c.title}</label>)}</div>
                </details>
              </div>;
            })}
          </div>
        </div>
        <div className="lp-actions"><button type="submit" className="lp-button">{busy ? 'Saving…' : 'Save Draft'}</button><button type="button" className="lp-button primary" onClick={() => void save(true)}>Publish Roadmap</button></div>
      </fieldset>
    </form> : <div className="lp-card-grid">
      {!loading && !error && versions.length===0 && <div className="lp-empty"><Route size={30}/><h3>No roadmaps yet</h3><p>Create your first roadmap using existing courses.</p></div>}
      {versions.map(version => {
        const learners = data.enrolments.filter(e => e.version_id === version.id);
        const latestPublished = data.versions.filter(v => v.path_id === version.path_id && v.status === 'published').sort((a,b) => b.version_number-a.version_number)[0];
        return <article className="lp-panel lp-stack" key={version.id}>
          <div className="lp-toolbar"><span className={`lp-badge ${version.status}`}>{version.status}</span><small>Version {version.version_number}</small></div>
          <h2>{version.name}</h2><p className="lp-muted">{version.description || 'A guided sequence of courses.'}</p>
          <p>{data.courses.filter(c => c.version_id === version.id).length} courses · {learners.length} learners</p>
          <div className="lp-actions">
            {version.status === 'draft' ? <button className="lp-button primary" disabled={busy} onClick={() => open(version)}>Edit Draft</button> :
              <button className="lp-button" disabled={busy} onClick={() => run(async () => {
                const id = await learningPathService.clone(version.id); const next = await reload();
                open(next.versions.find(v => v.id === id)!,next);
              })}>Create New Version</button>}
            {version.status === 'published' && <>
              {latestPublished?.id === version.id && <button className="lp-button primary" disabled={busy} onClick={() => { setAssignment(version); setAssignedUsers([]); setDeadline(''); setLearnerSearch(''); setActionError(''); }}>Assign Employees</button>}
              <button className="lp-button" disabled={busy} onClick={() => run(async () => { await learningPathService.setStatus(version.id,'archived'); await reload(); setMessage('Version archived. Existing learners retain access.'); })}>Archive</button>
            </>}
          </div>
          {!!learners.length && <details><summary>Learner progress</summary><div className="lp-stack">{learners.map(e => {
            const learner = users.find(u => u.id === e.user_id);
            const progress = data.progress.find(p => p.enrolment_id === e.id);
            return <div className="lp-toolbar" key={e.id}><span>{learner?.name || learner?.email || 'Learner'}<small>{e.source}{e.due_at ? ` · Due ${new Date(e.due_at).toLocaleDateString()}` : ''}</small></span><strong>{progress?.progress_percent || 0}%</strong></div>;
          })}</div></details>}
        </article>;
      })}
    </div>}
    {assignment && <div className="lp-overlay"><section className="lp-dialog lp-stack" role="dialog" aria-modal="true" aria-labelledby="lp-assign-title">
      <div className="lp-toolbar"><h2 id="lp-assign-title">Assign {assignment.name}</h2><button className="lp-icon" aria-label="Close assignment" disabled={busy} onClick={() => setAssignment(null)}><X size={20}/></button></div>
      <p>Assign the published roadmap to employees. Existing learners keep their current version.</p>
      <label className="lp-field">Find employees<input type="search" value={learnerSearch} disabled={busy} onChange={e => setLearnerSearch(e.target.value)}/></label>
      <div className="lp-picker">{users.filter(u => u.role === 'employee' && u.id && `${u.name} ${u.email}`.toLowerCase().includes(learnerSearch.toLowerCase())).map(u =>
        <label className="lp-check" key={u.id}><input type="checkbox" disabled={busy} checked={assignedUsers.includes(u.id)} onChange={e => setAssignedUsers(previous => e.target.checked ? [...previous,u.id] : previous.filter(id => id !== u.id))}/><span>{u.name}<small>{u.email}</small></span></label>)}</div>
      <label className="lp-field">Deadline (optional)<input type="date" value={deadline} disabled={busy} onChange={e => setDeadline(e.target.value)}/></label>
      {actionError && <p className="lp-alert" role="alert">{actionError}</p>}
      <button className="lp-button primary" disabled={busy || !assignedUsers.length} onClick={() => run(async () => {
        const results = await Promise.allSettled(assignedUsers.map(id => learningPathService.enrol(assignment.path_id,id,deadline ? new Date(`${deadline}T23:59:59`).toISOString() : undefined)));
        const failed = results.flatMap((r,i) => r.status === 'rejected' ? [assignedUsers[i]] : []);
        await reload();
        if (failed.length) { setAssignedUsers(failed); throw new Error(`${results.length-failed.length} assignments saved; ${failed.length} failed. Retry the remaining employees.`); }
        setAssignment(null); setMessage(`Roadmap assigned to ${results.length} employees.`);
      })}>{busy ? 'Assigning…' : `Assign ${assignedUsers.length} Employees`}</button>
    </section></div>}
  </section>;
}
