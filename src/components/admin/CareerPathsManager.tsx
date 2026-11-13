import { useEffect,useState } from 'react';
import type { FormEvent } from 'react';
import { GitBranch, Plus, Search, ShieldCheck, FileEdit, Layers } from 'lucide-react';
import './careerPathsManager.css';
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
  const [search,setSearch] = useState('');
  const [courseSearch,setCourseSearch] = useState<Record<string,string>>({});
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
    setStages(path ? structuredClone(path.stages) : [newStage()]);setCourseSearch({});setEditing(true);setError('');setNotice('');
  };
  const updateStage = (index: number,changes: Partial<CareerStage>) => setStages(rows => rows.map((row,i) => i===index ? {...row,...changes} : row));
  const toggle = (values: string[],value: string) => values.includes(value) ? values.filter(id => id!==value) : [...values,value];
  const move = (index: number,direction: number) => setStages(rows => {
    const next=[...rows]; [next[index],next[index+direction]]=[next[index+direction],next[index]];return next;
  });
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const publish = ((event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.value==='publish';
    if (publish && stages.some(stage => !stage.course_ids.length && !stage.roadmap_version_ids.length && !stage.skills.length)) {
      setError('Add at least one course, learning roadmap, or skill target to every role before publishing.');return;
    }
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
  const visible = owned.filter(path => (status==='all' || path.status===status) && `${path.name} ${path.description} ${path.stages.map(stage => stage.title).join(' ')}`.toLowerCase().includes(search.trim().toLowerCase()));
  return <section className="lp-workspace cpa" aria-labelledby="career-manager-title">
    <header className="lp-toolbar cpa-heading"><div><span className="cpa-eyebrow">PEOPLE DEVELOPMENT</span><h1 id="career-manager-title">Career Paths</h1><p className="lp-muted">Build clear progressions. Give every employee a path to their next role.</p></div>
      {!editing && <button className="lp-button primary" disabled={loading || busy || !data} onClick={() => edit()}><Plus size={16}/> Create career path</button>}
    </header>
    {error && <div className="lp-alert" role="alert">{error}</div>}
    {notice && <p className="lp-notice" role="status">{notice}</p>}
    {!editing && <div className="cpa-stats" aria-label="Career path overview">{[
      {label:'Total career paths',value:owned.length,icon:GitBranch,tone:'rose'},
      {label:'Published paths',value:owned.filter(p => p.status==='published').length,icon:ShieldCheck,tone:'green'},
      {label:'Drafts in progress',value:owned.filter(p => p.status==='draft').length,icon:FileEdit,tone:'amber'},
      {label:'Active role stages',value:owned.filter(p => p.status!=='archived').reduce((sum,p) => sum+p.stages.length,0),icon:Layers,tone:'blue'},
    ].map(stat => <div key={stat.label}><span className={`cpa-stat-icon ${stat.tone}`}><stat.icon size={21}/></span><div><strong>{loading && !data ? '—' : stat.value}</strong><span>{stat.label}</span></div></div>)}</div>}
    <div className="lp-toolbar cpa-guidance"><ShieldCheck size={18}/><p className="lp-muted">Published paths preserve employee requirements. Copy a path to a new draft to introduce changes.</p>
      <button className="lp-button" disabled={loading || busy} onClick={() => setRefresh(n => n+1)}>{loading ? 'Refreshing...' : 'Refresh'}</button></div>
    {loading && !data && <p role="status">Loading career paths...</p>}
    {data && (editing ? <form className="lp-panel lp-stack cp-editor" onSubmit={save}>
      <h2>{id ? 'Edit Career Path Draft' : 'New Career Path'}</h2>
      <label className="lp-field">Career path name<input required maxLength={160} value={name} disabled={busy} placeholder="Loan Processor" onChange={e => setName(e.target.value)}/></label>
      <label className="lp-field">Description<textarea value={description} disabled={busy} onChange={e => setDescription(e.target.value)}/></label>
      <div className="cp-admin-guide"><strong>Build a role progression</strong><p>Add roles in career order, then select multiple required courses and skill targets for each one. Employees complete these requirements to unlock training readiness for that role.</p></div>
      {!!stages.length && <ol className="cp-admin-progression" aria-label="Role progression preview">{stages.map((stage,index) => <li key={stage.id}><small>ROLE {index+1}</small><strong>{stage.title || 'Untitled role'}</strong><span>{stage.course_ids.length} courses · {stage.skills.length} skill targets</span></li>)}</ol>}
      {stages.map((stage,index) => <fieldset className="lp-stack" key={stage.id} disabled={busy}>
        <legend>Role {index+1}{stage.title ? `: ${stage.title}` : ''}</legend>
        <div className="lp-actions">
          <button className="lp-button" type="button" disabled={index===0} onClick={() => move(index,-1)}>Move Up</button>
          <button className="lp-button" type="button" disabled={index===stages.length-1} onClick={() => move(index,1)}>Move Down</button>
          <button className="lp-button" type="button" onClick={() => setStages(rows => rows.filter(row => row.id!==stage.id))}>Remove Role</button>
        </div>
        <label className="lp-field">Role title<input required maxLength={160} value={stage.title} placeholder="Senior Loan Processing Officer" onChange={e => updateStage(index,{title:e.target.value})}/></label>
        <label className="lp-field">Role description<textarea value={stage.description} onChange={e => updateStage(index,{description:e.target.value})}/></label>
        <div className="lp-stack"><h3>Required courses ({stage.course_ids.length} selected)</h3><p className="lp-muted">Select all courses needed for this role. You can add multiple courses.</p>
        <label className="lp-field">Search courses<input type="search" value={courseSearch[stage.id] || ''} placeholder="Search courses to add..." onChange={e => setCourseSearch(previous => ({...previous,[stage.id]:e.target.value}))}/></label><div className="cp-options">
          {courses.filter(course => course.title.toLowerCase().includes((courseSearch[stage.id] || '').toLowerCase())).map(course => <label className="lp-check" key={course.id}><input type="checkbox" checked={stage.course_ids.includes(course.id)} onChange={() => updateStage(index,{course_ids:toggle(stage.course_ids,course.id)})}/>{course.title}</label>)}
          {!!courses.length && !courses.some(course => course.title.toLowerCase().includes((courseSearch[stage.id] || '').toLowerCase())) && <p>No courses match your search.</p>}
          {!courses.length && <p>No courses available. Create courses first.</p>}
          {stage.course_ids.filter(id => !courses.some(c => c.id===id)).map(id => <label className="lp-check" key={id}><input type="checkbox" checked onChange={() => updateStage(index,{course_ids:toggle(stage.course_ids,id)})}/>Unavailable course — remove this requirement</label>)}
        </div>
        {!!stage.course_ids.length && <ul className="cp-admin-selected" aria-label={`Selected courses for role ${index+1}`}>{stage.course_ids.map(courseId => <li key={courseId}><span>{courses.find(course => course.id===courseId)?.title || 'Unavailable course'}</span><button type="button" className="lp-button" onClick={() => updateStage(index,{course_ids:toggle(stage.course_ids,courseId)})} aria-label={`Remove ${courses.find(course => course.id===courseId)?.title || 'unavailable course'} from role ${index+1}`}>Remove</button></li>)}</ul>}</div>
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
        <small>Every published role needs at least one requirement. All requirements must be met to complete training for this role.</small>
      </fieldset>)}
      <div><button className="lp-button" type="button" disabled={busy || stages.length>=20} onClick={() => setStages(rows => [...rows,newStage()])}>+ Add Role</button></div>
      <div className="lp-actions"><button className="lp-button" type="submit" value="draft" disabled={busy}>Save Draft</button>
        <button className="lp-button primary" type="submit" value="publish" disabled={busy || !stages.length}>Publish Career Path</button>
        <button className="lp-button" type="button" disabled={busy} onClick={() => setEditing(false)}>Cancel</button></div>
    </form> : <>
      <div className="cpa-library-heading"><div><h2>Career path library</h2><p className="lp-muted">Manage the roles and requirements that shape your team's growth.</p></div><label className="cpa-search"><Search size={17}/><input aria-label="Search career paths" type="search" placeholder="Search career paths..." value={search} onChange={e => setSearch(e.target.value)}/></label></div>
      <div className="cpa-tabs" aria-label="Filter career paths by status">{['all','published','draft','archived'].map(value => <button key={value} type="button" className={status===value ? 'active' : ''} aria-pressed={status===value} onClick={() => setStatus(value)}>{value==='all' ? 'All paths' : value==='draft' ? 'Drafts' : value[0].toUpperCase()+value.slice(1)}<span>{owned.filter(p => value==='all' || p.status===value).length}</span></button>)}</div>
      <div className="lp-card-grid cpa-grid">{visible.map(path => <article className="lp-panel lp-stack cpa-card" key={path.id}>
        <div className="lp-toolbar"><span className="cpa-path-icon"><GitBranch size={23}/></span><span className={`lp-badge ${path.status}`}>{path.status}</span></div><div className="cpa-card-copy"><h2>{path.name}</h2><p className="lp-muted">{path.description || 'A structured progression of roles, learning, and skills.'}</p></div>
        <div className="cpa-card-meta"><Layers size={14}/>{path.stages.length} roles <span>{path.stages.reduce((sum,stage) => sum+stage.course_ids.length+stage.roadmap_version_ids.length+stage.skills.length,0)} requirements</span></div>
        <ol className="cpa-role-list">{path.stages.map((stage,index) => <li key={stage.id}><span className="cpa-role-number">{String(index+1).padStart(2,'0')}</span><div><strong>{stage.title}</strong><small>{stage.course_ids.length} courses · {stage.roadmap_version_ids.length} roadmaps · {stage.skills.length} skills</small></div></li>)}</ol>
        <div className="lp-actions">
          {path.status==='draft' && <button className="lp-button primary" disabled={busy} onClick={() => edit(path)}>Edit Draft</button>}
          <button className="lp-button" disabled={busy || path.stages.length>=20} onClick={() => {edit(path,path.status!=='draft');setStages([...structuredClone(path.stages),newStage()]);}}>Add Role{path.status!=='draft' ? ' in New Draft' : ''}</button>
          <button className="lp-button" disabled={busy} onClick={() => edit(path,true)}>Copy to New Draft</button>
          {path.status!=='archived' && <button className="lp-button" disabled={busy} onClick={() => archive(path.id)}>Archive</button>}
        </div>
      </article>)}</div>
      {!owned.length && <div className="lp-empty cpa-empty"><GitBranch size={34}/><h3>Build the next step in their career</h3><p>Create your first career path with roles, courses, and skill targets.</p><button className="lp-button primary" disabled={busy || loading} onClick={() => edit()}><Plus size={16}/> Create career path</button></div>}
      {!!owned.length && !visible.length && <div className="lp-empty cpa-empty"><Search size={26}/><h3>No matching career paths</h3><p>Try a different search or status filter.</p><button className="lp-button" onClick={() => {setSearch('');setStatus('all');}}>Clear filters</button></div>}
    </>)}
  </section>;
}
