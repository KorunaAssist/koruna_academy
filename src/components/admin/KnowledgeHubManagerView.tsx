import React, { useEffect, useRef, useState } from 'react';
import { CloudUpload, FileText, Plus, Trash2 } from 'lucide-react';
import { dbService, type KnowledgeHubResource } from '../../services/db';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';
import type { UserSessionData } from '../../services/auth';

const SECTIONS: KnowledgeHubResource['section'][] = ['Company', 'Policies', 'Operations', 'Industry Knowledge'];

export const KnowledgeHubManagerView: React.FC<{ userSession: UserSessionData; showToast: (message: string) => void }> = ({ userSession, showToast }) => {
  const [resources, setResources] = useState<KnowledgeHubResource[]>([]);
  const [title, setTitle] = useState('');
  const [section, setSection] = useState<KnowledgeHubResource['section']>('Company');
  const [description, setDescription] = useState('');
  const [content, setContent] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const loadResources = async () => setResources(await dbService.getKnowledgeHubResources());
  useEffect(() => { void loadResources(); }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim() || (!content.trim() && !file)) {
      showToast('Add a title and either written content or a file.');
      return;
    }
    setIsSaving(true);
    try {
      let fileUrl: string | undefined;
      if (file) {
        if (isSupabaseConfigured()) {
          const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
          const path = `knowledge-hub/${Date.now()}-${safeName}`;
          const { error } = await supabase.storage.from('course-documents').upload(path, file, { cacheControl: '3600', upsert: false });
          if (error) throw new Error(`Upload failed: ${error.message}`);
          fileUrl = supabase.storage.from('course-documents').getPublicUrl(path).data.publicUrl;
        } else {
          fileUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => reject(new Error('Unable to read the selected file.'));
            reader.readAsDataURL(file);
          });
        }
      }
      await dbService.saveKnowledgeHubResource({
        id: `khr-${Date.now()}`, title: title.trim(), section, description: description.trim(), content: content.trim() || undefined,
        fileName: file?.name, fileUrl, createdAt: new Date().toISOString(), createdBy: userSession.name
      });
      setTitle(''); setDescription(''); setContent(''); setFile(null);
      if (fileInput.current) fileInput.current.value = '';
      await loadResources();
      showToast('Knowledge Hub resource published.');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to publish this resource.');
    } finally { setIsSaving(false); }
  };

  const remove = async (resource: KnowledgeHubResource) => {
    if (!window.confirm(`Remove “${resource.title}” from the Knowledge Hub?`)) return;
    await dbService.deleteKnowledgeHubResource(resource.id);
    await loadResources();
    showToast('Knowledge Hub resource removed.');
  };

  return <div className="as-stack">
    <form className="as-card" onSubmit={handleSubmit}>
      <div className="as-card-head"><div><h2 className="as-card-title">Publish a Knowledge Hub resource</h2><p className="as-card-desc">Share an article, guide, policy, or downloadable file with your team.</p></div></div>
      <div className="as-card-body khm-form">
        <label>Resource title<input value={title} onChange={event => setTitle(event.target.value)} placeholder="e.g. New starter checklist" required /></label>
        <label>Collection<select value={section} onChange={event => setSection(event.target.value as KnowledgeHubResource['section'])}>{SECTIONS.map(item => <option key={item}>{item}</option>)}</select></label>
        <label className="khm-full">Short description<input value={description} onChange={event => setDescription(event.target.value)} placeholder="A short summary to help team members find it." /></label>
        <label className="khm-full">Written content<textarea value={content} onChange={event => setContent(event.target.value)} placeholder="Add the guide, announcement, or instructions here…" rows={6} /></label>
        <div className="khm-full khm-upload"><input ref={fileInput} type="file" onChange={event => setFile(event.target.files?.[0] || null)} /><CloudUpload size={18} /><span>{file ? file.name : 'Attach a file (optional when written content is added)'}</span><button type="button" className="as-btn as-btn--secondary" onClick={() => fileInput.current?.click()}>Choose file</button></div>
        <div className="khm-full khm-actions"><button className="as-btn as-btn--primary" disabled={isSaving} type="submit"><Plus size={16} />{isSaving ? 'Publishing…' : 'Publish resource'}</button></div>
      </div>
    </form>

    <section className="as-card"><div className="as-card-head"><div><h2 className="as-card-title">Published resources</h2><p className="as-card-desc">{resources.length} custom resource{resources.length === 1 ? '' : 's'} available in the Knowledge Hub.</p></div></div>
      <div className="as-card-body khm-list">{resources.length ? resources.map(resource => <article key={resource.id} className="khm-item"><FileText size={18} /><div><strong>{resource.title}</strong><small>{resource.section}{resource.fileName ? ` · ${resource.fileName}` : ''}</small>{resource.description && <p>{resource.description}</p>}</div><button type="button" className="as-icon-btn" onClick={() => void remove(resource)} aria-label={`Remove ${resource.title}`}><Trash2 size={17} /></button></article>) : <p className="as-card-desc">No custom resources yet. Publish your first one above.</p>}</div>
    </section>
  </div>;
};
