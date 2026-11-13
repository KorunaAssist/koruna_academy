import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, X, BookOpen, Layers, ArrowRight, Route, Search, Globe, Save, LockKeyhole, AlertTriangle } from 'lucide-react';
import type { Course } from '../../services/db';
import type { UserSessionData } from '../../services/auth';
import { canManageCourse } from '../../services/authorization';
import './learningPathEditorModal.css';

export interface LearningPathEditor {
  versionId: string | null;
  name: string;
  description: string;
  courses: { course_id: string; required: boolean }[];
  prerequisites: Record<string, string[]>;
}

interface LearningPathEditorModalProps {
  editor: LearningPathEditor;
  courses: Course[];
  userSession: UserSessionData;
  busy: boolean;
  actionError: string;
  onChange: (editor: LearningPathEditor) => void;
  onSave: (publish: boolean) => Promise<void>;
  onClose: () => void;
}

export function LearningPathEditorModal({ editor, courses, userSession, busy, actionError, onChange: setEditor, onSave: save, onClose }: LearningPathEditorModalProps) {
  const [courseSearch, setCourseSearch] = useState('');
  const availableCourses = courses.filter(course => !editor.courses.some(row => row.course_id === course.id) && course.title.toLowerCase().includes(courseSearch.toLowerCase()));
  const requiredCount = editor.courses.filter(course => course.required).length;
  const title = (id: string) => courses.find(course => course.id === id)?.title || id;
  const editorDialogRef = useRef<HTMLDialogElement>(null);
  const closeConfirmationRef = useRef<HTMLDialogElement>(null);
  const requestClose = () => {
    if (!busy) closeConfirmationRef.current?.showModal();
  };
  useEffect(() => {
    const dialog = editorDialogRef.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);
  const move = (index: number,direction: number) => {
    const rows = [...editor.courses];
    [rows[index],rows[index+direction]] = [rows[index+direction],rows[index]];
    setEditor({ ...editor,courses: rows });
  };
  return <dialog ref={editorDialogRef} className="lpa-editor-dialog" aria-labelledby="lpa-editor-title" onCancel={event => {
      event.preventDefault();
      requestClose();
    }}>
    <form className="lp-panel lp-stack" onSubmit={e => { e.preventDefault(); void save(false); }}>
      <header className="lp-toolbar lpa-editor-heading"><div className="lpe-title"><span className="lpe-title-icon"><Route size={23}/></span><div><span className="lp-eyebrow">LEARNING PATH BUILDER</span><h2 id="lpa-editor-title">{editor.versionId ? 'Edit learning path' : 'Create a learning path'}</h2><p className="lp-muted">Build a journey. Give every course a purpose.</p></div></div><div className="lpe-header-actions"><span className="lp-badge draft">Draft</span><button type="button" className="lp-icon" aria-label="Close path editor" disabled={busy} onClick={requestClose}><X size={20}/></button></div></header>
      {actionError && <p className="lp-alert" role="alert">{actionError}</p>}
      <fieldset disabled={busy} className="lp-fieldset lp-stack">
        <div className="lpe-content">
        <section className="lpe-details" aria-labelledby="lpe-details-title">
        <div className="lpe-section-heading"><span className="lpe-section-number">01</span><div><h3 id="lpe-details-title">The big picture</h3><p>A clear name and goal help learners know where they’re headed.</p></div></div>
        <div className="lpe-details-fields">
        <label className="lp-field">Learning path name<input autoFocus required value={editor.name} placeholder="e.g. Mortgage Processing Essentials" onChange={e => setEditor({ ...editor,name: e.target.value })}/></label>
        <label className="lp-field">Description <span className="lpe-optional">Optional</span><textarea rows={3} placeholder="What will learners achieve by completing this path?" value={editor.description} onChange={e => setEditor({ ...editor,description: e.target.value })}/></label>
        </div></section>
        <div className="lpe-section-heading lpe-curriculum-heading"><span className="lpe-section-number">02</span><div><h3>Build the curriculum</h3><p>Add courses from the library and arrange the learning sequence.</p></div><span className="lpe-required-count">{requiredCount} required · {editor.courses.length - requiredCount} optional</span></div>
        <div className="lp-columns">
          <div className="lp-stack lpa-course-library"><h3><BookOpen size={17}/> Course library <span className="lpe-library-count">{availableCourses.length}</span></h3><label className="lpe-course-search"><Search size={16}/><input aria-label="Find a course" type="search" placeholder="Find a course..." value={courseSearch} onChange={e => setCourseSearch(e.target.value)}/></label>
            <div className="lp-picker">{availableCourses.map(c =>
              <button type="button" className="lp-picker-row" key={c.id} aria-label={`Add ${c.title}`} onClick={() => setEditor({ ...editor,courses: [...editor.courses,{ course_id: c.id,required: true }] })}><span className="lpe-course-copy">{c.title}<small>{c.code}</small></span><span className="lpe-add"><Plus size={16}/></span></button>)}
              {!courses.length && <p>Create a course first, then add it to this roadmap.</p>}
              {!!courses.length && !availableCourses.length && <p className="lp-muted">No available courses match. Try another search or review your selected courses.</p>}</div>
          </div>
          <div className="lp-stack lpa-sequence"><h3><Layers size={17}/> Course sequence <span>{editor.courses.length}</span></h3><p className="lp-muted">Set the order, mark required courses, and manage prerequisites.</p>
            {!editor.courses.length && <div className="lp-empty lpe-sequence-empty"><span><Layers size={27}/></span><h3>Your journey starts here</h3><p>Add a course from the library to start building your learning path.</p><span className="lpe-empty-hint">Courses appear in the order you add them</span></div>}
            {editor.courses.map((row,index) => {
              const course = courses.find(c => c.id === row.course_id);
              const editable = !!course && canManageCourse(userSession.role,userSession.id,course.createdBy);
              return <div className="lp-step-editor lp-stack" key={row.course_id}>
                <div className="lp-toolbar"><strong className="lpa-step-title"><span>{index+1}</span>{title(row.course_id)}</strong><div className="lp-actions">
                  <button type="button" className="lp-icon" disabled={index===0} aria-label={`Move ${title(row.course_id)} up`} onClick={() => move(index,-1)}><ArrowUp size={16}/></button>
                  <button type="button" className="lp-icon" disabled={index===editor.courses.length-1} aria-label={`Move ${title(row.course_id)} down`} onClick={() => move(index,1)}><ArrowDown size={16}/></button>
                  <button type="button" className="lp-icon" aria-label={`Remove ${title(row.course_id)}`} onClick={() => setEditor({ ...editor,courses: editor.courses.filter(c => c.course_id !== row.course_id) })}><X size={16}/></button>
                </div></div>
                <label className="lp-check"><input type="checkbox" checked={row.required} onChange={e => setEditor({ ...editor,courses: editor.courses.map(c => c.course_id === row.course_id ? { ...c,required: e.target.checked } : c) })}/> Required for roadmap completion</label>
                <details><summary><LockKeyhole size={13}/> Prerequisites <span>{(editor.prerequisites[row.course_id] || []).length}</span></summary>
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
        </div>
        <footer className="lp-actions lpa-editor-footer"><span className="lpe-publish-note"><Globe size={17}/><span><strong>Ready to share?</strong><small>Publishing makes this path available to every employee.</small></span></span><button type="submit" className="lp-button"><Save size={15}/>{busy ? 'Saving…' : 'Save draft'}</button><button type="button" className="lp-button primary" onClick={() => void save(true)}>Publish learning path <ArrowRight size={15}/></button></footer>
      </fieldset>
    </form>
    <dialog ref={closeConfirmationRef} className="lpe-close-confirmation" aria-labelledby="lpe-close-title" aria-describedby="lpe-close-description" onCancel={event => event.stopPropagation()}>
      <span className="lpe-close-icon"><AlertTriangle size={24}/></span>
      <h3 id="lpe-close-title">Discard unsaved changes?</h3>
      <p id="lpe-close-description">Any changes you haven't saved will be lost. You can keep editing and save your draft before closing.</p>
      <div className="lp-actions">
        <button autoFocus type="button" className="lp-button" onClick={() => closeConfirmationRef.current?.close()}>Keep editing</button>
        <button type="button" className="lp-button primary" onClick={() => { closeConfirmationRef.current?.close(); onClose(); }}>Discard and close</button>
      </div>
    </dialog>
    </dialog>;
}
