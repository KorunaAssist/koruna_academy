import { useEffect,useState } from 'react';
import type { FormEvent } from 'react';
import type { UserSessionData } from '../../services/auth';
import type { Course } from '../../services/db';
import { careerPathService,loadCareerWorkspace,type CareerPath,type CareerStage,type CareerWorkspace } from '../../services/careerPaths';
import '../courses/learningPaths.css';
import '../career/careerPaths.css';

const newStage = (): CareerStage => ({id:crypto.randomUUID(),title:'',description:'',course_ids:[],roadmap_version_ids:[],skills:[]});
export function CareerPathsManager({userSession,courses}: {userSession: UserSessionData; courses: Course[]}) {
  const canManage = userSession.role==='admin' || userSession.role==='trainer';
  const [data,setData] = useState<CareerWorkspace | null>(null);
  const [refresh,setRefresh] = useState(0);
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const [editing,setEditing] = useState(false);
  const [id,setId] = useState<string | undefined>();
  const [name,setName] = useState('');
  const [description,setDescription] = useState('');
  const [stages,setStages] = useState<CareerStage[]>([]);
  const [status,setStatus] = useState('all');
  useEffect(() => {
    if (!canManage) return;
    let active=true;
    setLoading(true);
    loadCareerWorkspace().then(value => {if (active) {setData(value);setError('');}})
      .catch(reason => {if (active) setError(reason instanceof Error ? reason.message : 'Unable to load career paths.');})
      .finally(() => {if (active) setLoading(false);});
    return () => {active=false;};
  },[userSession.id,canManage,refresh]);
  if (!canManage) return <p role="alert">Only admins and trainers can manage career paths.</p>;
  const owned = data?.paths.filter(path => userSession.role==='admin' || path.created_by===userSession.id) || [];
  const edit = (path?: CareerPath,copy=false) => {
    setId(copy ? undefined : path?.id);setName(path?.name || '');setDescription(path?.description || '');
    setStages(path ? structuredClone(path.stages) : [newStage()]);setEditing(true);setError('');setNotice('');
  };
  const updateStage = (index: number,changes: Partial<CareerStage>) => setStages(rows => rows.map((row,i) => i===index ? {...row,...changes} : row));
  const toggle = (values: string[],value: string) => values.includes(value) ? values.filter(id => id!==value) : [...values,value];
  const move = (index: number,direction: number) => setStages(rows => {
    const next=[...rows]; [next[index],next[index+direction]]=[next[index+direction],next[index]];return next;
  });
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const publish = ((event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.value==='publish';
    setBusy(true);setError('');setNotice('');
    try {
      await careerPathService.save({id,name,description,stages,publish});setEditing(false);
      setNotice(publish ? 'Career path published. Employees can now select it as their career goal.' : 'Career path draft saved.');setRefresh(n => n+1);
    } catch (reason) {setError(reason instanceof Error ? reason.message : 'Unable to save career path.');}
    finally {setBusy(false);}
  };
  const archive = async (pathId: string) => {
    setBusy(true);setError('');setNotice('');
    try {await careerPathService.archive(pathId);setNotice('Career path archived. Existing goals and training progress are preserved.');setRefresh(n => n+1);}
    catch (reason) {setError(reason instanceof Error ? reason.message : 'Unable to archive career path.');}
    finally {setBusy(false);}
  };
  return <section className="lp-workspace" aria-labelledby="career-manager-title">
    <header className="lp-toolbar"><div><h1 id="career-manager-title">Career Paths</h1><p className="lp-muted">Define career stages using courses, published roadmaps, and skill targets.</p></div>
      {!editing && <button className="lp-button primary" disabled={loading || busy || !data} onClick={() => edit()}>Create Career Path</button>}
    </header>
    {error && <div className="lp-alert" role="alert">{error}</div>}
    {notice && <p className="lp-notice" role="status">{notice}</p>}
    <div className="lp-toolbar"><p className="lp-muted">Published requirements are frozen. Copy a path to a new draft to make changes; existing goals keep their original requirements.</p>
      <button className="lp-button" disabled={loading || busy} onClick={() => setRefresh(n => n+1)}>{loading ? 'Refreshing...' : 'Refresh'}</button></div>
    {loading && !data && <p role="status">Loading career paths...</p>}
    {data && (editing ? <form className="lp-panel lp-stack cp-editor" onSubmit={save}>
      <h2>{id ? 'Edit Career Path Draft' : 'New Career Path'}</h2>
      <label className="lp-field">Career path name<input required maxLength={160} value={name} disabled={busy} placeholder="Loan Processor" onChange={e => setName(e.target.value)}/></label>
      <label className="lp-field">Description<textarea value={description} disabled={busy} onChange={e => setDescription(e.target.value)}/></label>
      {stages.map((stage,index) => <fieldset className="lp-stack" key={stage.id} disabled={busy}>
        <legend>Stage {index+1}</legend>
        <div className="lp-actions">
          <button className="lp-button" type="button" disabled={index===0} onClick={() => move(index,-1)}>Move Up</button>
          <button className="lp-button" type="button" disabled={index===stages.length-1} onClick={() => move(index,1)}>Move Down</button>
          <button className="lp-button" type="button" onClick={() => setStages(rows => rows.filter(row => row.id!==stage.id))}>Remove Stage</button>
        </div>
        <label className="lp-field">Stage title<input required maxLength={160} value={stage.title} placeholder="Junior Loan Processor" onChange={e => updateStage(index,{title:e.target.value})}/></label>
        <label className="lp-field">Stage description<textarea value={stage.description} onChange={e => updateStage(index,{description:e.target.value})}/></label>
        <details open={!!stage.course_ids.length}><summary>Required courses ({stage.course_ids.length})</summary><div className="cp-options">
          {courses.map(course => <label className="lp-check" key={course.id}><input type="checkbox" checked={stage.course_ids.includes(course.id)} onChange={() => updateStage(index,{course_ids:toggle(stage.course_ids,course.id)})}/>{course.title}</label>)}
          {!courses.length && <p>No courses available. Create courses first.</p>}
          {stage.course_ids.filter(id => !courses.some(c => c.id===id)).map(id => <label className="lp-check" key={id}><input type="checkbox" checked onChange={() => updateStage(index,{course_ids:toggle(stage.course_ids,id)})}/>Unavailable course — remove this requirement</label>)}
        </div></details>
        <details open={!!stage.roadmap_version_ids.length}><summary>Required learning roadmaps ({stage.roadmap_version_ids.length})</summary><div className="cp-options">
          {data.roadmaps.versions.filter(v => v.status==='published' || stage.roadmap_version_ids.includes(v.id)).map(version => <label className="lp-check" key={version.id}>
            <input type="checkbox" checked={stage.roadmap_version_ids.includes(version.id)} onChange={() => updateStage(index,{roadmap_version_ids:toggle(stage.roadmap_version_ids,version.id)})}/>
            {version.name} · v{version.version_number}{version.status!=='published' ? ' (replace with a published version)' : ''}</label>)}
          {!data.roadmaps.versions.some(v => v.status==='published') && <p>No published roadmaps available.</p>}
          {stage.roadmap_version_ids.filter(id => !data.roadmaps.versions.some(v => v.id===id)).map(id => <label className="lp-check" key={id}><input type="checkbox" checked onChange={() => updateStage(index,{roadmap_version_ids:toggle(stage.roadmap_version_ids,id)})}/>Unavailable roadmap — remove this requirement</label>)}
        </div></details>
        <details open={!!stage.skills.length}><summary>Required skill targets ({stage.skills.length})</summary><div className="lp-stack">
          {data.skills.filter(s => !s.archived || stage.skills.some(target => target.skill_id===s.id)).map(skill => {
            const target=stage.skills.find(item => item.skill_id===skill.id);
            return <div className="cp-skill-target" key={skill.id}>
              <label className="lp-check"><input type="checkbox" checked={!!target} onChange={() => updateStage(index,{skills:target ? stage.skills.filter(item => item.skill_id!==skill.id) : [...stage.skills,{skill_id:skill.id,target_percent:100}]})}/>{skill.name}{skill.archived ? ' (archived — replace)' : ''}</label>
              {target && <label className="lp-field">Target %<input type="number" required min={1} max={100} step={1} value={target.target_percent} onChange={e => updateStage(index,{skills:stage.skills.map(item => item.skill_id===skill.id ? {...item,target_percent:Number(e.target.value)} : item)})}/></label>}
            </div>;
          })}
          {!data.skills.length && <p>No skills available. An admin can create them in Skills Catalogue.</p>}
        </div></details>
        <small>Every published stage needs at least one requirement. All requirements in a stage must be met.</small>
      </fieldset>)}
      <div><button className="lp-button" type="button" disabled={busy || stages.length>=20} onClick={() => setStages(rows => [...rows,newStage()])}>Add Stage</button></div>
      <div className="lp-actions"><button className="lp-button" type="submit" value="draft" disabled={busy}>Save Draft</button>
        <button className="lp-button primary" type="submit" value="publish" disabled={busy || !stages.length}>Publish Career Path</button>
        <button className="lp-button" type="button" disabled={busy} onClick={() => setEditing(false)}>Cancel</button></div>
    </form> : <>
      <label className="lp-field lp-search">Status<select value={status} onChange={e => setStatus(e.target.value)}><option value="all">All statuses</option><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></select></label>
      <div className="lp-card-grid">{owned.filter(path => status==='all' || path.status===status).map(path => <article className="lp-panel lp-stack" key={path.id}>
        <span className={`lp-badge ${path.status}`}>{path.status}</span><h2>{path.name}</h2><p className="lp-muted">{path.description}</p>
        <ol>{path.stages.map(stage => <li key={stage.id}>{stage.title} <small>{stage.course_ids.length} courses · {stage.roadmap_version_ids.length} roadmaps · {stage.skills.length} skill targets</small></li>)}</ol>
        <div className="lp-actions">
          {path.status==='draft' && <button className="lp-button primary" disabled={busy} onClick={() => edit(path)}>Edit Draft</button>}
          <button className="lp-button" disabled={busy} onClick={() => edit(path,true)}>Copy to New Draft</button>
          {path.status!=='archived' && <button className="lp-button" disabled={busy} onClick={() => archive(path.id)}>Archive</button>}
        </div>
      </article>)}</div>
      {!owned.length && <p className="lp-empty">No career paths created yet. Create a path such as Loan Processor, Parabroker, or Servicing Specialist.</p>}
      {!!owned.length && !owned.some(path => status==='all' || path.status===status) && <p>No career paths match this status.</p>}
    </>)}
  </section>;
}
