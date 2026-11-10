import { useState } from 'react';
import { ArrowUpRight, BookOpen, CheckCircle2, Clock3, Search, Award, TrendingUp } from 'lucide-react';
import type { Course, UserProgress } from '../../services/db';
import './myProgress.css';

interface Props {
  courses: Course[];
  progress: UserProgress[];
  isAssigned: (course: Course) => boolean;
  onStudy: (course: Course, applicationId?: number) => void;
  onCertificate: (course: Course) => void;
  onBrowse: () => void;
}

export function MyProgress({ courses, progress, isAssigned, onStudy, onCertificate, onBrowse }: Props) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('priority');
  const rows = courses.flatMap<{ course: Course; record: UserProgress | undefined }>(course => {
    const records = progress.filter(item => item.courseId === course.id);
    return records.length ? records.map(record => ({ course, record })) : isAssigned(course) ? [{ course, record: undefined }] : [];
  }).map(item => {
    const percent = Math.min(100, Math.max(0, Number(item.record?.progressPercent) || 0));
    const due = item.record?.dueDate ? new Date(item.record.dueDate.slice(0, 10) + 'T23:59:59') : undefined;
    const overdue = percent < 100 && Boolean(due && due.getTime() < Date.now());
    return { ...item, percent, due, overdue, status: percent >= 100 ? 'completed' : percent > 0 ? 'active' : 'new' };
  });
  const completed = rows.filter(row => row.status === 'completed').length;
  const active = rows.filter(row => row.status === 'active').length;
  const overdue = rows.filter(row => row.overdue).length;
  const overall = rows.length ? Math.round(rows.reduce((sum, row) => sum + row.percent, 0) / rows.length) : 0;
  const hours = rows.reduce((sum, row) => sum + Math.max(0, Number(row.record?.learningHours) || 0), 0);
  const visible = rows.filter(row => (filter === 'all' || (filter === 'overdue' ? row.overdue : row.status === filter)) && `${row.course.title} ${row.course.category} ${row.course.code}`.toLowerCase().includes(query.trim().toLowerCase())).sort((a, b) => sort === 'title' ? a.course.title.localeCompare(b.course.title) : sort === 'progress' ? b.percent - a.percent : Number(a.status === 'completed') - Number(b.status === 'completed') || (a.due?.getTime() || Infinity) - (b.due?.getTime() || Infinity) || b.percent - a.percent);
  const next = [...rows].filter(row => row.percent < 100 && isAssigned(row.course)).sort((a, b) => Number(b.overdue) - Number(a.overdue) || b.percent - a.percent)[0];
  const filters = [{ id: 'all', label: 'All learning', count: rows.length }, { id: 'active', label: 'In progress', count: active }, { id: 'new', label: 'Not started', count: rows.filter(row => row.status === 'new').length }, { id: 'completed', label: 'Completed', count: completed }, { id: 'overdue', label: 'Overdue', count: overdue }];

  return <div className="mp-page">
    <header className="mp-hero"><div><span className="mp-eyebrow"><TrendingUp size={16} /> YOUR LEARNING JOURNEY</span><h2>Small steps. Real progress.</h2><p>See how far you’ve come, and pick up where you left off.</p><button className="mp-primary" onClick={onBrowse}>Explore courses <ArrowUpRight size={17} /></button></div><div className="mp-overall"><div className="mp-ring" style={{ background: `conic-gradient(#a31555 ${overall}%, #eadce3 0)` }}><div><strong>{overall}%</strong><span>overall progress</span></div></div><p>{completed} of {rows.length} learning assignments complete</p></div></header>
    <section className="mp-stats" aria-label="Learning summary">{[{ icon: BookOpen, value: active, label: 'Courses in progress', detail: 'Keep your momentum going' }, { icon: CheckCircle2, value: completed, label: 'Completed assignments', detail: 'Every finish is a step forward' }, { icon: Clock3, value: `${hours.toFixed(1)}h`, label: 'Recorded learning time', detail: 'Across your learning records' }, { icon: Award, value: new Set(rows.filter(row => row.percent === 100 && row.course.requiresCertification !== false).map(row => row.course.id)).size, label: 'Certificates earned', detail: 'Recognition for your work' }].map(stat => <article key={stat.label}><stat.icon size={21} /><strong>{stat.value}</strong><h3>{stat.label}</h3><p>{stat.detail}</p></article>)}</section>
    {next && <aside className="mp-next"><div className="mp-next-icon"><BookOpen size={24} /></div><div><span>{next.overdue ? 'NEEDS YOUR ATTENTION' : 'YOUR NEXT STEP'}</span><h3>{next.course.title}</h3><p>{next.percent}% complete{next.overdue ? ' · Past due — continue your learning today' : ' · A little progress goes a long way'}</p></div><button className="mp-primary" onClick={() => onStudy(next.course, next.record?.applicationId)}>{next.percent ? 'Continue learning' : 'Start learning'} <ArrowUpRight size={17} /></button></aside>}
    <section className="mp-collection" aria-labelledby="mp-title"><div className="mp-heading"><div><h3 id="mp-title">My Progress</h3><p>Your courses, milestones, and next steps in one place.</p></div><span>{rows.length} learning assignments</span></div>
      <div className="mp-tabs" aria-label="Filter learning status">{filters.map(item => <button key={item.id} aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>{item.label} <span>{item.count}</span></button>)}</div>
      <div className="mp-toolbar"><label><Search size={18} /><input aria-label="Search learning" placeholder="Search by course, category, or code…" value={query} onChange={event => setQuery(event.target.value)} /></label><select aria-label="Sort learning" value={sort} onChange={event => setSort(event.target.value)}><option value="priority">Priority: due soon</option><option value="progress">Progress: highest first</option><option value="title">Course: A–Z</option></select></div>
      <p className="mp-results" aria-live="polite">Showing {visible.length} of {rows.length} assignments</p>
      {visible.length > 0 && <section className="mp-chart" aria-labelledby="mp-chart-title">
        <div className="mp-chart-heading"><div><h4 id="mp-chart-title">Course progress at a glance</h4><p>Completion by assignment. Updates with your search and filters.</p></div><span><i /> Completed <i className="mp-chart-legend-active" /> In progress</span></div>
        <div className="mp-chart-layout">
          <div className="mp-chart-axis" aria-hidden="true">{[100, 75, 50, 25, 0].map(value => <span key={value}>{value}%</span>)}</div>
          <div className="mp-chart-scroll" tabIndex={0} aria-label="Course progress bar chart; scroll horizontally to see more assignments">
            <div className="mp-chart-plot">
              <div className="mp-chart-grid" aria-hidden="true">{[100, 75, 50, 25, 0].map(value => <div key={value} />)}</div>
              <div className="mp-chart-bars">{visible.map(row => <div className="mp-chart-column" key={`${row.course.id}-${row.record?.applicationId || 0}`}>
                <div className="mp-chart-bar-space"><div className={`mp-chart-bar ${row.percent === 100 ? 'complete' : ''}`} style={{ height: `${row.percent}%` }} role="img" aria-label={`${row.course.title}${row.record?.applicationId ? `, assignment ${row.record.applicationId}` : ''}: ${row.percent}% complete`}><strong>{row.percent}%</strong></div></div>
                <div className="mp-chart-label" title={row.course.title}>{row.course.title}{row.record?.applicationId ? <small>#{row.record.applicationId}</small> : null}</div>
              </div>)}</div>
            </div>
          </div>
        </div>
      </section>}
      <div className="mp-courses">{visible.map(row => { const lessonCount = new Set(row.record?.completedLessons.filter(id => row.course.lessons.some(lesson => lesson.id === id)) || []).size; const assigned = isAssigned(row.course); return <article className="mp-course" key={`${row.course.id}-${row.record?.applicationId || 0}`}><div className="mp-course-icon"><BookOpen size={24} /></div><div className="mp-course-main"><div className="mp-meta"><span>{row.course.category || 'Learning'}</span><span className={`mp-badge ${row.overdue ? 'overdue' : row.status}`}>{row.overdue ? 'Overdue' : row.status === 'completed' ? 'Completed' : row.status === 'active' ? 'In progress' : 'Not started'}</span></div><h4>{row.course.title}</h4><p>{lessonCount} / {row.course.lessons.length} lessons completed{row.record?.quizScore !== undefined ? ` · Best quiz: ${row.record.quizScore}%` : ''}{row.record?.applicationId ? ` · Assignment #${row.record.applicationId}` : ''}</p><div className="mp-track-line"><progress max="100" value={row.percent} aria-label={`${row.course.title} progress`} /><strong>{row.percent}%</strong></div><p className={row.overdue ? 'mp-due-overdue' : ''}>{row.due && !Number.isNaN(row.due.getTime()) ? `Due ${row.due.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}` : 'No due date'}{row.record?.lastViewedAt && !Number.isNaN(Date.parse(row.record.lastViewedAt)) ? ` · Last opened ${new Date(row.record.lastViewedAt).toLocaleDateString()}` : ''}</p></div><div className="mp-course-action">{row.percent === 100 ? row.course.requiresCertification !== false ? <button className="mp-secondary" onClick={() => onCertificate(row.course)}>View certificate <Award size={16} /></button> : <span className="mp-finished"><CheckCircle2 size={17} /> All done</span> : <button className="mp-secondary" disabled={!assigned} onClick={() => onStudy(row.course, row.record?.applicationId)}>{!assigned ? 'Not assigned' : row.percent ? 'Continue' : 'Start course'} <ArrowUpRight size={16} /></button>}</div></article>; })}</div>
      {!visible.length && <div className="mp-empty"><BookOpen size={34} /><h4>{rows.length ? 'No courses match your filters' : 'Your learning journey starts here'}</h4><p>{rows.length ? 'Try a different search or status to find your course.' : 'Assigned courses and your learning progress will appear here.'}</p><button className="mp-secondary" onClick={rows.length ? () => { setQuery(''); setFilter('all'); } : onBrowse}>{rows.length ? 'Clear filters' : 'Browse courses'}</button></div>}
    </section>
  </div>;
}
