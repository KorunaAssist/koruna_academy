import { useEffect,useState } from 'react';
import { skillsService,type Skill } from '../../services/skills';
import { roleSkillsService,type SkillRole } from '../../services/roleSkills';
import '../courses/learningPaths.css';

export function RoleSkillsManager() {
  const [roles,setRoles] = useState<SkillRole[]>([]);
  const [skills,setSkills] = useState<Skill[]>([]);
  const [editor,setEditor] = useState<{id?:string;name:string;skillIds:string[]} | null>(null);
  const [query,setQuery] = useState('');
  const [skillName,setSkillName] = useState('');
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [message,setMessage] = useState('');
  const load = async () => {
    const [nextRoles,nextSkills] = await Promise.all([roleSkillsService.load(),skillsService.catalogue()]);
    setRoles(nextRoles);setSkills(nextSkills);
  };
  useEffect(() => { let active = true;
    Promise.all([roleSkillsService.load(),skillsService.catalogue()]).then(([r,s]) => {
      if (active) { setRoles(r);setSkills(s); }
    }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Unable to load role skills.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  },[]);
  const run = async (action:()=>Promise<void>) => {
    setBusy(true);setError('');setMessage('');
    try { await action();await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to save role skills.'); }
    finally { setBusy(false); }
  };
  return <section className="lp-workspace" aria-label="Skills by role">
    <div className="lp-toolbar"><p>Define job roles and the skills employees develop for each role. Skills can belong to multiple roles.</p>
      <button className="lp-button primary" disabled={loading || busy} onClick={() => {setEditor({name:'',skillIds:[]});setSkillName('');setMessage('');}}>Add Role</button></div>
    {loading && <p role="status">Loading role skills…</p>}
    {error && <div className="lp-alert" role="alert">{error} <button className="lp-button" disabled={busy} onClick={() => void run(async()=>{})}>Retry</button></div>}
    {message && <p role="status" className="lp-notice">{message}</p>}
    {editor && <form className="lp-panel lp-stack" onSubmit={e => {e.preventDefault();void run(async()=>{
      if (!editor.name.trim()) throw new Error('Enter a role name.');
      await roleSkillsService.save(editor.id,editor.name,editor.skillIds);
      setEditor(null);setMessage('Role skills saved. They are available in course creation.');
    });}}>
      <h2>{editor.id ? 'Edit Role Skills' : 'Add Role'}</h2>
      <label className="lp-field">Role name<input required maxLength={120} disabled={busy} value={editor.name} placeholder="e.g. Loan Processor" onChange={e=>setEditor({...editor,name:e.target.value})}/></label>
      <fieldset disabled={busy} className="lp-stack"><legend>Skills for this role ({editor.skillIds.length})</legend>
        {skills.filter(s=>!s.archived || editor.skillIds.includes(s.id)).map(skill=><label className="lp-check" key={skill.id}>
          <input type="checkbox" checked={editor.skillIds.includes(skill.id)} onChange={e=>setEditor({...editor,skillIds:e.target.checked ? [...editor.skillIds,skill.id] : editor.skillIds.filter(id=>id!==skill.id)})}/>
          {skill.name}{skill.archived ? ' (archived)' : ''}</label>)}
        {!skills.length && <p>No skills yet. Add a skill below.</p>}
      </fieldset>
      <label className="lp-field">New skill name<input maxLength={120} disabled={busy} value={skillName} onChange={e=>setSkillName(e.target.value)}/></label>
      <button type="button" className="lp-button" disabled={busy || !skillName.trim()} onClick={()=>void run(async()=>{
        await skillsService.create(skillName,'');
        const updated = await skillsService.catalogue();
        const created = updated.find(s=>s.name===skillName.trim());
        if (created) setEditor(current=>current ? {...current,skillIds:[...new Set([...current.skillIds,created.id])]} : current);
        setSkillName('');setMessage('Skill created and selected. Save the role to apply this selection.');
      })}>Create and Select Skill</button>
      <small>New skills are also added to the shared Skills Catalogue.</small>
      <div className="lp-actions"><button className="lp-button primary" disabled={busy} type="submit">{busy ? 'Saving…' : 'Save Role Skills'}</button>
        <button className="lp-button" type="button" disabled={busy} onClick={()=>setEditor(null)}>Cancel</button></div>
    </form>}
    <label className="lp-field lp-search">Find a role<input type="search" value={query} onChange={e=>setQuery(e.target.value)}/></label>
    <div className="lp-card-grid">{roles.filter(role=>role.name.toLowerCase().includes(query.toLowerCase())).map(role=><article key={role.id} className="lp-panel lp-stack">
      <h2>{role.name}</h2><p className="lp-muted">{role.skillIds.length} skills</p>
      <ul>{role.skillIds.map(id=><li key={id}>{skills.find(s=>s.id===id)?.name || 'Unavailable skill'}{skills.find(s=>s.id===id)?.archived ? ' (archived)' : ''}</li>)}</ul>
      <button className="lp-button" disabled={busy || loading} onClick={()=>{setEditor({...role});setSkillName('');setMessage('');}}>Edit Role Skills</button>
    </article>)}</div>
    {!loading && !error && !roles.length && <p className="lp-empty">No roles yet. Add a role and select its skills.</p>}
  </section>;
}
