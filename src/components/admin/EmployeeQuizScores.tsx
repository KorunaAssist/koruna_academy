import { useEffect, useState } from 'react';
import { dbService, type Course, type DatabaseUser, type UserProgress } from '../../services/db';
import { quizScoreRows } from '../../services/quizScoreRows';

export function EmployeeQuizScores({ users, courses }: { users: DatabaseUser[]; courses: Course[] }) {
  const [progress, setProgress] = useState<UserProgress[]>([]);
  const [query, setQuery] = useState('');
  const [courseId, setCourseId] = useState('');
  const [employeeEmail, setEmployeeEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    dbService.getQuizScoreProgress().then(data => { if (active) setProgress(data); })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Unable to load quiz scores.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [revision]);
  const names = new Map(users.map(user => [user.email.toLowerCase(), user.name]));
  const titles = new Map(courses.map(course => [course.id, course.title]));
  const selectedEmployee = users.find(user => user.email.toLowerCase() === employeeEmail);
  const assignedToEmployee = (course: Course) => !employeeEmail ||
    course.assignedUsers?.some(assignment => String(assignment.userId).toLowerCase() === String(selectedEmployee?.id).toLowerCase() || String(assignment.userId).toLowerCase() === employeeEmail) ||
    progress.some(record => record.courseId === course.id && record.userEmail.toLowerCase() === employeeEmail && (record.assignedBy || record.dueDate || (record.applicationId || 0) > 0));
  const quizOptions = courses.filter(course => course.quiz?.length && assignedToEmployee(course));
  const assignedQuizIds = new Set(quizOptions.map(course => course.id));
  const selectedProgress = progress.filter(record => (!courseId || record.courseId === courseId) && (!employeeEmail || (record.userEmail.toLowerCase() === employeeEmail && assignedQuizIds.has(record.courseId))));
  const attemptCount = selectedProgress.reduce((total, record) => total + record.quizAttempts, 0);
  const rows = quizScoreRows(selectedProgress).filter(row =>
    `${names.get(row.email.toLowerCase()) || ''} ${row.email}`.toLowerCase().includes(query.toLowerCase().trim()));
  return <section className="as-stack" aria-labelledby="employee-quiz-scores-title">
    <header className="as-header">
      <div><h1 className="as-title" id="employee-quiz-scores-title">Employee Quiz Scores</h1><p className="as-subtitle">Saved quiz scores for each attempt.</p></div>
      <button className="as-btn as-btn--secondary" disabled={loading} onClick={() => setRevision(value => value + 1)}>Refresh</button>
    </header>
    <div className="as-form-grid">
      <label className="as-field">Select employee<select className="as-select" value={employeeEmail} onChange={event => { setEmployeeEmail(event.target.value); setCourseId(''); }}><option value="">All employees</option>{users.filter(user => user.role === 'employee' || progress.some(record => record.userEmail.toLowerCase() === user.email.toLowerCase())).map(user => <option key={user.email} value={user.email.toLowerCase()}>{user.name} ({user.email})</option>)}</select></label>
      <label className="as-field">Employee<input className="as-input" type="search" placeholder="Search name or email" value={query} onChange={event => setQuery(event.target.value)} /></label>
      <label className="as-field">{employeeEmail ? 'Assigned quiz' : 'Quiz'}<select className="as-select" value={courseId} onChange={event => setCourseId(event.target.value)}><option value="">{employeeEmail ? 'All assigned quizzes' : 'All quizzes'}</option>{quizOptions.map(course => <option key={course.id} value={course.id}>{course.title}</option>)}</select></label>
    </div>
    {employeeEmail && !quizOptions.length && !loading && <p>No quizzes are assigned to this employee.</p>}
    {(employeeEmail || courseId) && !loading && !error && <p>{attemptCount} saved {attemptCount === 1 ? 'attempt' : 'attempts'}{courseId ? ` for ${titles.get(courseId) || 'this quiz'}` : ''}.</p>}
    <p className="as-hint">Older records contain only the highest saved score. Individual attempt scores are available for submissions saved after attempt tracking was added.</p>
    {loading ? <p role="status">Loading quiz scores…</p> : error ? <p role="alert">{error}</p> : <div className="as-card as-table-wrap">
      <table className="as-table"><thead><tr><th>Employee</th><th>Course</th><th>Attempt</th><th>Score</th><th>Submitted</th></tr></thead><tbody>
        {rows.map((row, index) => <tr key={`${row.email}-${row.courseId}-${row.applicationId}-${row.attempt}-${index}`}>
          <td>{names.get(row.email.toLowerCase()) || row.email}<div className="as-cell-sub">{row.email}</div></td>
          <td>{titles.get(row.courseId) || row.courseId}</td><td>{row.attempt ?? 'Saved best (older attempts unavailable)'}</td><td>{row.score}%</td>
          <td>{row.submittedAt ? new Date(row.submittedAt).toLocaleString('en-SG', { timeZone: 'Asia/Singapore' }) : 'Not recorded'}</td>
        </tr>)}
        {!rows.length && <tr><td colSpan={5}>{courseId && attemptCount === 0 ? 'This quiz has not been attempted yet.' : 'No saved scores match this selection.'}</td></tr>}
      </tbody></table>
    </div>}
  </section>;
}
