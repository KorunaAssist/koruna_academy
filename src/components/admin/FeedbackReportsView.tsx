import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BarChart3, MessageSquareText, RefreshCw, Users } from 'lucide-react';
import type { UserSessionData } from '../../services/auth';
import { canManageCourse } from '../../services/authorization';
import type { Course } from '../../services/db';
import { courseSurveyService, type CourseSurvey, type CourseSurveyResults } from '../../services/courseSurveys';

type CourseFeedback = { course:Course; survey:CourseSurvey; result:CourseSurveyResults };

export function FeedbackReportsView({ userSession, courses }: { userSession:UserSessionData; courses:Course[] }) {
  const [items,setItems] = useState<CourseFeedback[]>([]);
  const [selectedId,setSelectedId] = useState<string | null>(null);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const [revision,setRevision] = useState(0);
  const manageable = useMemo(() => courses.filter(course => course.contentType !== 'document' && canManageCourse(userSession.role,userSession.id,course.createdBy)),[courses,userSession.id,userSession.role]);

  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    Promise.all(manageable.map(async course => {
      const [survey,result] = await Promise.all([courseSurveyService.load(course.id),courseSurveyService.results(course.id)]);
      return survey.enabled && result ? { course,survey,result } : null;
    })).then(rows => { if (active) setItems(rows.filter((row): row is CourseFeedback => row !== null)); })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Unable to load feedback reports.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  },[manageable,revision]);

  const selected = items.find(item => item.course.id === selectedId) || null;
  if (selected) return <section className="as-stack" aria-labelledby="feedback-report-title">
    <header className="as-header"><div><button className="as-btn as-btn--secondary" onClick={() => setSelectedId(null)}><ArrowLeft size={15}/> All feedback</button><h1 className="as-title" id="feedback-report-title" style={{ marginTop: '0.8rem' }}>{selected.course.title}</h1><p className="as-subtitle">{selected.result.responses} submitted response{selected.result.responses === 1 ? '' : 's'} · Feedback report</p></div><button className="as-btn as-btn--secondary" onClick={() => setRevision(value => value + 1)}><RefreshCw size={15}/> Refresh</button></header>
    {!selected.result.responses && <div className="as-empty"><MessageSquareText size={32}/><h3>No feedback yet</h3><p>Employees will appear here after completing the course and submitting its survey.</p></div>}
    {selected.result.questions.map(question => <article className="as-card" key={question.id} style={{ display: 'grid', gap: '0.75rem' }}>
      <div><span className="as-cell-sub" style={{ textTransform: 'uppercase', fontWeight: 700 }}>{question.kind === 'rating' ? 'Rating scale' : question.kind === 'choice' ? 'Multiple choice' : 'Written feedback'}</span><h2 style={{ margin: '0.2rem 0 0', fontSize: '1rem' }}>{question.question}</h2></div>
      {question.kind === 'rating' && <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.55rem' }}><strong style={{ fontSize: '1.7rem', color: '#6d28d9' }}>{question.average ?? '—'}</strong><span className="as-cell-sub">average out of 10 · {question.responses} response{question.responses === 1 ? '' : 's'}</span></div>}
      <div style={{ display: 'grid', gap: '0.6rem' }}>{question.answers.length ? question.answers.map((answer,index) => <div key={index} style={{ borderLeft: '3px solid #c4b5fd', padding: '0.55rem 0.75rem', background: '#faf5ff', borderRadius: '0 8px 8px 0' }}><p style={{ margin: 0 }}>{question.kind === 'text' ? `“${answer.value}”` : answer.value}</p><small className="as-cell-sub">{answer.respondent || 'Anonymous'}</small></div>) : <p className="as-cell-sub" style={{ margin: 0 }}>No responses yet.</p>}</div>
    </article>)}
  </section>;

  return <section className="as-stack" aria-labelledby="feedback-reports-title">
    <header className="as-header"><div><h1 className="as-title" id="feedback-reports-title">Feedback Reports</h1><p className="as-subtitle">Review completion-survey results for your courses.</p></div><button className="as-btn as-btn--secondary" disabled={loading} onClick={() => setRevision(value => value + 1)}><RefreshCw size={15}/> Refresh</button></header>
    {loading ? <p role="status">Loading feedback reports…</p> : error ? <p role="alert">{error}</p> : !items.length ? <div className="as-empty"><MessageSquareText size={32}/><h3>No course surveys found</h3><p>Enable a completion feedback survey in a course to see its report here.</p></div> : <div className="as-course-grid">{items.map(item => <article className="as-card" key={item.course.id} style={{ display: 'grid', gap: '0.8rem' }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}><div><h2 style={{ fontSize: '1rem', margin: 0 }}>{item.course.title}</h2><p className="as-cell-sub" style={{ margin: '0.3rem 0 0' }}>{item.course.code}</p></div><MessageSquareText size={20} color="#6d28d9"/></div><div style={{ display: 'flex', gap: '1rem' }}><span className="as-cell-sub"><Users size={14}/> {item.result.responses} responses</span><span className="as-cell-sub"><BarChart3 size={14}/> {item.result.questions.length} questions</span></div><button className="as-btn as-btn--primary" onClick={() => setSelectedId(item.course.id)}>View feedback</button></article>)}</div>}
  </section>;
}
