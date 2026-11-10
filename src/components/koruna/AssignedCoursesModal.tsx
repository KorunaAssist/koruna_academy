import { useState, type ReactNode, type RefObject } from 'react';
import { BookOpen, CheckCircle2, Clock3, X } from 'lucide-react';
import './assignedCoursesModal.css';

type CourseSection = 'incomplete' | 'completed';
interface AssignedCoursesModalProps {
  dialogRef: RefObject<HTMLDialogElement | null>;
  renderCourses: (completion: CourseSection) => ReactNode;
}

export function AssignedCoursesModal({ dialogRef, renderCourses }: AssignedCoursesModalProps) {
  const [section, setSection] = useState<CourseSection>('incomplete');
  return (
    <dialog ref={dialogRef} className="assigned-courses-modal" aria-labelledby="assigned-courses-dialog-title" aria-describedby="assigned-courses-description"
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) event.currentTarget.close();
      }}>
      <div className="acm-layout">
        <header className="acm-header">
          <div className="acm-heading">
            <span className="acm-icon"><BookOpen size={25} aria-hidden="true" /></span>
            <div><p className="acm-eyebrow">YOUR LEARNING JOURNEY</p><h2 id="assigned-courses-dialog-title">My courses</h2></div>
          </div>
          <button type="button" className="acm-close" aria-label="Close courses" onClick={() => dialogRef.current?.close()}><X size={20} /></button>
          <p id="assigned-courses-description">Keep moving forward with your assignments and celebrate what you’ve achieved.</p>
        </header>
        <div className="acm-tabs" role="tablist" aria-label="Course status">
          {(['incomplete', 'completed'] as const).map((value) => (
            <button key={value} type="button" role="tab" id={'acm-tab-' + value} aria-controls={'acm-panel-' + value}
              aria-selected={section === value} tabIndex={section === value ? 0 : -1}
              onClick={() => setSection(value)}
              onKeyDown={(event) => {
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                event.preventDefault();
                const next = event.key === 'Home' ? 'incomplete' : event.key === 'End' ? 'completed' : section === 'incomplete' ? 'completed' : 'incomplete';
                setSection(next);
                dialogRef.current?.querySelector<HTMLButtonElement>('#acm-tab-' + next)?.focus();
              }}>
              {value === 'incomplete' ? <Clock3 size={17} aria-hidden="true" /> : <CheckCircle2 size={17} aria-hidden="true" />}
              {value === 'incomplete' ? 'Not completed' : 'Completed'}
            </button>
          ))}
        </div>
        <div className="acm-body">
          <div className="acm-section-heading">
            <h3>{section === 'incomplete' ? 'Your next steps' : 'Your achievements'}</h3>
            <p>{section === 'incomplete' ? 'Pick up where you left off or start something new.' : 'Every finished course is another step forward.'}</p>
          </div>
          {(['incomplete', 'completed'] as const).map((value) => (
            <section key={value} role="tabpanel" id={'acm-panel-' + value} aria-labelledby={'acm-tab-' + value} hidden={section !== value} tabIndex={0}>
              {renderCourses(value)}
            </section>
          ))}
        </div>
        <footer className="acm-footer">
          <span><BookOpen size={14} aria-hidden="true" /> A little progress, every day.</span>
          <button type="button" onClick={() => dialogRef.current?.close()}>Back to dashboard</button>
        </footer>
      </div>
    </dialog>
  );
}
