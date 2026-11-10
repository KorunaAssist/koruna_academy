import { useState } from 'react';
import { Award, ArrowUpRight, Search, BookOpen, CheckCircle, SlidersHorizontal } from 'lucide-react';
import type { Course, UserProgress } from '../../services/db';
import './earnedCertificates.css';
import { CertificateDocument } from './CertificateDocument';

interface Props {
  courses: Course[];
  progress: UserProgress[];
  learnerName: string;
  getIssueDate: (course: Course) => string;
  onView: (course: Course) => void;
  onBrowse: () => void;
}

export function EarnedCertificates({ courses, progress, learnerName, getIssueDate, onView, onBrowse }: Props) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [sort, setSort] = useState('az');
  const earned = courses.filter(course => course.requiresCertification !== false &&
    progress.some(p => p.courseId === course.id && p.progressPercent === 100));
  const categories = [...new Set(earned.map(course => course.category).filter(Boolean))];
  const visible = earned.filter(course => (category === 'all' || course.category === category) &&
    `${course.title} ${course.category || ''}`.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => sort === 'az' ? a.title.localeCompare(b.title) : b.title.localeCompare(a.title));

  return (
    <div className="earned-page">
      <header className="earned-hero">
        <div className="earned-hero-copy">
          <span className="earned-eyebrow"><Award size={16} /> YOUR LEARNING, RECOGNIZED</span>
          <h2>My Earned Certificates</h2>
          <p>Every course completed is a step forward. Celebrate your achievements and keep growing.</p>
          <button className="earned-browse" onClick={onBrowse}>Explore more courses <ArrowUpRight size={17} /></button>
        </div>
        <div className="earned-total"><div className="earned-medal"><Award size={42} strokeWidth={1.4} /></div><strong>{earned.length}</strong><span>{earned.length === 1 ? 'certificate earned' : 'certificates earned'}</span></div>
      </header>

      <section className="earned-collection" aria-label="Earned certificate collection">
        <div className="earned-section-heading"><div><h3>Your certificate collection</h3><p>A little proof of all the work you’ve put in.</p></div><span className="earned-count">{earned.length} {earned.length === 1 ? 'achievement' : 'achievements'}</span></div>
        <div className="earned-toolbar">
          <label className="earned-search"><Search size={18} /><input aria-label="Search certificates" placeholder="Search your certificates…" value={query} onChange={event => setQuery(event.target.value)} /></label>
          <label className="earned-select"><SlidersHorizontal size={16} /><select aria-label="Filter by category" value={category} onChange={event => setCategory(event.target.value)}><option value="all">All categories</option>{categories.map(item => <option key={item} value={item}>{item}</option>)}</select></label>
          <select className="earned-sort" aria-label="Sort certificates" value={sort} onChange={event => setSort(event.target.value)}><option value="az">Title: A–Z</option><option value="za">Title: Z–A</option></select>
        </div>
        <p className="earned-results" aria-live="polite">Showing {visible.length} of {earned.length} certificates</p>
        <div className="earned-grid">
          {visible.map(course => <article className="earned-card" key={course.id}>
            <button className="earned-preview" onClick={() => onView(course)} aria-label={`View certificate for ${course.title}`}>
              <CertificateDocument recipientName={learnerName} displayCourseTitle={course.title} displayTrainerName={course.trainer?.trim() || 'Koruna Academy Trainer'} displayIssueDate={getIssueDate(course)} />
              <span className="earned-preview-action">View certificate <ArrowUpRight size={15} /></span>
            </button>
            <div className="earned-card-body"><div className="earned-card-meta"><span>{course.category || 'Professional learning'}</span><span className="earned-complete"><CheckCircle size={13} /> Completed</span></div><h4>{course.title}</h4><p>Issued by Koruna Academy</p><button className="earned-view" onClick={() => onView(course)}>View certificate <ArrowUpRight size={17} /></button></div>
          </article>)}
        </div>
        {visible.length === 0 && <div className="earned-empty"><div><Award size={36} /></div><h3>{earned.length ? 'No matching certificates' : 'Your next achievement starts here'}</h3><p>{earned.length ? 'Try another search or category to find your certificate.' : 'Complete a course that offers certification to add your first certificate to this collection.'}</p>{earned.length ? <button className="earned-browse" onClick={() => { setQuery(''); setCategory('all'); }}>Clear filters</button> : <button className="earned-browse" onClick={onBrowse}><BookOpen size={17} /> Explore courses</button>}</div>}
      </section>
    </div>
  );
}
