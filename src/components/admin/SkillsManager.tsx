import { useEffect,useState } from 'react';
import { skillsService,type Skill } from '../../services/skills';
import '../courses/learningPaths.css';

export function SkillsManager() {
  const [skills,setSkills] = useState<Skill[]>([]);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const [message,setMessage] = useState('');
  const [busy,setBusy] = useState(false);
  const [editor,setEditor] = useState<{ id?: string; name: string; description: string } | null>(null);
  const [query,setQuery] = useState('');
  useEffect(() => {
    let active = true;
    skillsService.catalogue().then(rows => { if (active) setSkills(rows); })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Unable to load skills.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  },[]);
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError(''); setMessage('');
    try { await action(); setSkills(await skillsService.catalogue()); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to save the skill.'); }
    finally { setBusy(false); }
  };
  return <section className="lp-workspace" aria-label="Skill catalogue management">
    <div className="lp-toolbar"><p>Create the skills that courses and lessons teach. Each linked lesson contributes equally to that skill’s learning progress.</p>
      <button className="lp-button primary" disabled={busy || loading} onClick={() => { setEditor({ name: '',description: '' }); setMessage(''); }}>Create Skill</button></div>
    {loading && <p role="status">Loading skills…</p>}
    {error && <div className="lp-alert" role="alert">{error}<button className="lp-button" disabled={busy} onClick={() => run(async () => {})}>Retry</button></div>}
    {message && <p className="lp-notice" role="status">{message}</p>}
    {editor && <form className="lp-panel lp-stack" onSubmit={e => { e.preventDefault(); void run(async () => {
      if (!editor.name.trim()) throw new Error('Enter a skill name.');
      if (editor.id) await skillsService.update(editor.id,{ name: editor.name.trim(),description: editor.description.trim() });
      else await skillsService.create(editor.name,editor.description);
      setEditor(null); setMessage('Skill saved. It is available in the course editor.');
    }); }}>
      <h2>{editor.id ? 'Edit Skill' : 'Create Skill'}</h2>
      <label className="lp-field">Skill name<input required maxLength={120} value={editor.name} disabled={busy} placeholder="e.g. Servicing" onChange={e => setEditor({ ...editor,name: e.target.value })}/></label>
      <label className="lp-field">Description<textarea rows={3} value={editor.description} disabled={busy} placeholder="What should an employee learn to do?" onChange={e => setEditor({ ...editor,description: e.target.value })}/></label>
      <div className="lp-actions"><button className="lp-button primary" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save Skill'}</button><button className="lp-button" type="button" disabled={busy} onClick={() => setEditor(null)}>Cancel</button></div>
    </form>}
    <label className="lp-field lp-search">Find a skill<input type="search" value={query} onChange={e => setQuery(e.target.value)}/></label>
    <div className="lp-card-grid">{skills.filter(s => `${s.name} ${s.description}`.toLowerCase().includes(query.toLowerCase())).map(skill => <article className="lp-panel lp-stack" key={skill.id}>
      <span className={`lp-badge ${skill.archived ? 'archived' : 'published'}`}>{skill.archived ? 'Archived' : 'Active'}</span>
      <h2>{skill.name}</h2><p className="lp-muted">{skill.description || 'No description yet.'}</p>
      <div className="lp-actions"><button className="lp-button" disabled={busy} onClick={() => { setEditor({ id: skill.id,name: skill.name,description: skill.description }); setMessage(''); }}>Edit</button>
        <button className="lp-button" disabled={busy} onClick={() => run(async () => {
          await skillsService.update(skill.id,{ archived: !skill.archived });
          setMessage(skill.archived ? 'Skill restored.' : 'Skill archived. Existing course links and progress are retained.');
        })}>{skill.archived ? 'Restore' : 'Archive'}</button></div>
    </article>)}</div>
    {!loading && !error && !skills.length && <p className="lp-empty">No skills yet. Create Servicing, Loan Processing, or another skill to get started.</p>}
  </section>;
}
