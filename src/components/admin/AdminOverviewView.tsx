import React, { useMemo } from 'react';
import {
  BookOpen,
  CheckCircle2,
  Clock3,
  Users,
  Plus,
  UserPlus,
  ClipboardList,
  AlertTriangle,
  PlayCircle,
  Award,
  Target,
  ChevronRight
} from 'lucide-react';
import type { Course, DatabaseUser, UserProgress } from '../../services/db';

interface AdminOverviewViewProps {
  users: DatabaseUser[];
  courses: Course[];
  totalHours: number;
  teamProgress?: Record<string, UserProgress[]>;
  onNavigate: (tab: string) => void;
}

const roleLabel: Record<string, string> = {
  employee: 'Employees',
  trainer: 'Trainers',
  team_leader: 'Team leaders',
  admin: 'Administrators'
};

const COLORS = { done: '#34d399', active: '#f472b6', idle: 'rgba(255,255,255,0.28)', ok: '#059669' };
const AVATAR_COLORS = ['#a31555', '#4f46e5', '#0284c7', '#059669', '#d97706', '#7c3aed'];

const avatarColor = (name = '') => {
  let sum = 0;
  for (let i = 0; i < name.length; i++) sum += name.charCodeAt(i);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
};

const getInitials = (name = '') => {
  const parts = name.trim().split(' ').filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (name.substring(0, 2) || 'U').toUpperCase();
};

const timeAgo = (date: string) => {
  const t = new Date(date).getTime();
  if (Number.isNaN(t)) return '';
  const days = Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${days} days ago`;
};

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

export const AdminOverviewView: React.FC<AdminOverviewViewProps> = ({
  users,
  courses,
  totalHours,
  teamProgress = {},
  onNavigate
}) => {
  const d = useMemo(() => {
    const records = Object.values(teamProgress).flat();
    const byUser = new Map<string, UserProgress[]>();
    records.forEach(p => {
      const k = (p.userEmail || '').toLowerCase();
      byUser.set(k, [...(byUser.get(k) || []), p]);
    });
    const userOf = (email: string) => users.find(u => u.email.toLowerCase() === email.toLowerCase());
    const courseOf = (id: string) => courses.find(c => c.id === id);

    const completed = records.filter(p => p.progressPercent >= 100);
    const inProgress = records.filter(p => p.progressPercent > 0 && p.progressPercent < 100);
    const notStarted = records.filter(p => !p.progressPercent || p.progressPercent <= 0);
    const overdue = records.filter(p => p.overdue && p.progressPercent < 100);
    const quizScores = records.map(p => p.quizScore).filter((s): s is number => typeof s === 'number');
    const avgQuiz = quizScores.length ? Math.round(quizScores.reduce((a, b) => a + b, 0) / quizScores.length) : null;

    // Most assigned content
    const perCourse = new Map<string, number>();
    records.forEach(p => perCourse.set(p.courseId, (perCourse.get(p.courseId) || 0) + 1));
    const popular = courses
      .map(course => ({
        course,
        enrolled: Math.max(course.assignedUsers?.length || 0, perCourse.get(course.id) || 0)
      }))
      .sort((a, b) => b.enrolled - a.enrolled || a.course.title.localeCompare(b.course.title))
      .slice(0, 5);

    // Roles
    const roleCounts = Object.keys(roleLabel)
      .map(role => ({ role, count: users.filter(u => u.role === role).length }))
      .filter(r => r.count > 0);

    // Departments: user count + average progress
    const deptMap = new Map<string, { users: number; sum: number; n: number }>();
    users.forEach(u => {
      const key = u.department || 'General';
      const e = deptMap.get(key) || { users: 0, sum: 0, n: 0 };
      e.users += 1;
      (byUser.get(u.email.toLowerCase()) || []).forEach(p => {
        e.sum += p.progressPercent;
        e.n += 1;
      });
      deptMap.set(key, e);
    });
    const depts = [...deptMap.entries()]
      .map(([name, e]) => ({ name, users: e.users, avg: e.n ? Math.round(e.sum / e.n) : 0, hasData: e.n > 0 }))
      .sort((a, b) => b.users - a.users)
      .slice(0, 5);

    // Top learners
    const learners = users
      .map(u => {
        const recs = byUser.get(u.email.toLowerCase()) || [];
        const done = recs.filter(r => r.progressPercent >= 100).length;
        const avg = recs.length ? Math.round(recs.reduce((s, r) => s + r.progressPercent, 0) / recs.length) : 0;
        return { user: u, total: recs.length, done, avg };
      })
      .filter(l => l.total > 0)
      .sort((a, b) => b.done - a.done || b.avg - a.avg)
      .slice(0, 5);

    const noEnrollment = users.filter(u => !(byUser.get(u.email.toLowerCase())?.length)).length;

    // Content mix
    const docs = courses.filter(c => c.contentType === 'document').length;
    const catMap = new Map<string, number>();
    courses.forEach(c => {
      const k = c.category || 'Uncategorized';
      catMap.set(k, (catMap.get(k) || 0) + 1);
    });
    const categories = [...catMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);

    return {
      records, completed, inProgress, notStarted, overdue, avgQuiz,
      popular, roleCounts, depts, learners, noEnrollment,
      docs, coursesOnly: courses.length - docs, categories,
      overdueList: overdue.slice(0, 4).map(p => ({ p, user: userOf(p.userEmail), course: courseOf(p.courseId) })),
      completions: completed.slice(0, 3).map(p => ({ p, user: userOf(p.userEmail), course: courseOf(p.courseId) })),
      newest: [...users]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 4)
    };
  }, [users, courses, teamProgress]);

  const total = d.records.length;
  const completionRate = pct(d.completed.length, total);
  const maxEnrolled = Math.max(1, ...d.popular.map(p => p.enrolled));
  const maxRole = Math.max(1, ...d.roleCounts.map(r => r.count));
  const maxCat = Math.max(1, ...d.categories.map(c => c[1]));

  const kpis = [
    { label: 'Users', value: String(users.length), hint: d.noEnrollment > 0 ? `${d.noEnrollment} without courses` : 'All enrolled', icon: Users, tab: 'users', tone: '' },
    { label: 'Courses and documents', value: String(courses.length), hint: `${d.coursesOnly} courses, ${d.docs} documents`, icon: BookOpen, tab: 'inventory', tone: '' },
    { label: 'Active enrollments', value: String(d.inProgress.length + d.notStarted.length), hint: `${d.inProgress.length} in progress`, icon: PlayCircle, tab: 'assignments', tone: '' },
    { label: 'Completed', value: String(d.completed.length), hint: `of ${total} enrollments`, icon: Target, tab: 'assignments', tone: 'ok' },
    { label: 'Overdue', value: String(d.overdue.length), hint: d.overdue.length ? 'Needs follow-up' : 'On track', icon: AlertTriangle, tab: 'assignments', tone: d.overdue.length ? 'bad' : 'ok' },
    { label: 'Training hours', value: `${totalHours.toFixed(1)}h`, hint: d.avgQuiz !== null ? `Average quiz score ${d.avgQuiz}%` : 'No quiz scores yet', icon: Clock3, tab: 'assignments', tone: '' }
  ];

  // Donut geometry
  const R = 44;
  const C = 2 * Math.PI * R;
  const segments = [
    { label: 'Completed', n: d.completed.length, color: COLORS.done },
    { label: 'In progress', n: d.inProgress.length, color: COLORS.active },
    { label: 'Not started', n: d.notStarted.length, color: COLORS.idle }
  ];
  let offset = 0;

  return (
    <div className="ao">
      <style>{`
        .ao {
          --ao-accent: #a31555; --ao-accent-deep: #85104a; --ao-accent-soft: #fbeef4;
          --ao-ink: #17141c; --ao-muted: #6f6a7a; --ao-faint: #f4f2f7;
          --ao-line: #ebe8f0; --ao-ok: #059669; --ao-bad: #dc2626;
          --ao-radius: 16px;
          display: flex; flex-direction: column; gap: 1.25rem; width: 100%; color: var(--ao-ink);
          font-variant-numeric: tabular-nums;
        }
        .ao * { box-sizing: border-box; }
        .ao button { font: inherit; }
        .ao :focus-visible { outline: 2px solid var(--ao-accent); outline-offset: 2px; }

        /* Header */
        .ao-top { display: flex; align-items: flex-end; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
        .ao-h1 { margin: 0; font-size: 1.6rem; font-weight: 700; letter-spacing: -0.02em; }
        .ao-lede { margin: 0.2rem 0 0; font-size: 0.92rem; color: var(--ao-muted); }
        .ao-actions { display: flex; flex-wrap: wrap; gap: 0.5rem; }
        .ao-btn {
          display: inline-flex; align-items: center; gap: 0.45rem; cursor: pointer; height: 40px; padding: 0 1rem;
          border-radius: 999px; border: 1px solid var(--ao-line); background: #fff; color: var(--ao-ink);
          font-size: 0.86rem; font-weight: 600; transition: background .15s ease, border-color .15s ease;
        }
        .ao-btn:hover { border-color: var(--ao-accent); background: var(--ao-accent-soft); }
        .ao-btn--solid { background: var(--ao-accent); border-color: var(--ao-accent); color: #fff; }
        .ao-btn--solid:hover { background: var(--ao-accent-deep); border-color: var(--ao-accent-deep); }

        /* Hero: completion panel + KPI board */
        .ao-hero { display: grid; grid-template-columns: minmax(0, 5fr) minmax(0, 7fr); gap: 1rem; }
        .ao-panel {
          background: #2a0b1c; color: #fff; border-radius: var(--ao-radius); padding: 1.5rem;
          display: flex; flex-direction: column; gap: 1.25rem; justify-content: space-between; min-width: 0;
        }
        .ao-panel h2 { margin: 0; font-size: 1rem; font-weight: 600; color: rgba(255,255,255,0.78); }
        .ao-donut-wrap { display: flex; align-items: center; gap: 1.5rem; flex-wrap: wrap; }
        .ao-donut { position: relative; width: 168px; height: 168px; flex-shrink: 0; }
        .ao-donut svg { width: 100%; height: 100%; transform: rotate(-90deg); }
        .ao-donut-c { position: absolute; inset: 0; display: grid; place-content: center; text-align: center; }
        .ao-donut-c b { font-size: 2.4rem; line-height: 1; font-weight: 700; letter-spacing: -0.03em; }
        .ao-donut-c span { font-size: 0.8rem; color: rgba(255,255,255,0.65); margin-top: 0.25rem; }
        .ao-legend { display: flex; flex-direction: column; gap: 0.65rem; font-size: 0.9rem; flex: 1; min-width: 150px; }
        .ao-legend div { display: flex; align-items: center; gap: 0.6rem; color: rgba(255,255,255,0.85); }
        .ao-legend b { margin-left: auto; color: #fff; }
        .ao-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
        .ao-panel-foot {
          display: flex; align-items: center; justify-content: space-between; gap: 0.75rem;
          padding-top: 1rem; border-top: 1px solid rgba(255,255,255,0.12); font-size: 0.85rem; color: rgba(255,255,255,0.7);
        }
        .ao-panel-link { appearance: none; background: rgba(255,255,255,0.1); border: 0; color: #fff; cursor: pointer; border-radius: 999px; padding: 0.4rem 0.85rem; font-size: 0.82rem; font-weight: 600; }
        .ao-panel-link:hover { background: rgba(255,255,255,0.18); }
        .ao-panel-empty { color: rgba(255,255,255,0.65); font-size: 0.92rem; padding: 2rem 0; }

        .ao-kpis {
          display: grid; grid-template-columns: repeat(3, minmax(0, 1fr));
          background: #fff; border: 1px solid var(--ao-line); border-radius: var(--ao-radius); overflow: hidden;
        }
        .ao-kpi {
          appearance: none; text-align: left; cursor: pointer; background: transparent; border: 0;
          border-right: 1px solid var(--ao-line); border-bottom: 1px solid var(--ao-line);
          padding: 1.25rem; display: flex; flex-direction: column; gap: 0.5rem; min-width: 0; transition: background .15s ease;
        }
        .ao-kpi:nth-child(3n) { border-right: 0; }
        .ao-kpi:nth-last-child(-n+3) { border-bottom: 0; }
        .ao-kpi:hover { background: var(--ao-faint); }
        .ao-kpi-top { display: flex; align-items: center; gap: 0.55rem; font-size: 0.82rem; font-weight: 500; color: var(--ao-muted); }
        .ao-kpi-ico { width: 30px; height: 30px; border-radius: 10px; background: var(--ao-accent-soft); color: var(--ao-accent); display: grid; place-items: center; flex-shrink: 0; }
        .ao-kpi--ok .ao-kpi-ico { background: #ecfdf5; color: var(--ao-ok); }
        .ao-kpi--bad .ao-kpi-ico { background: #fef2f2; color: var(--ao-bad); }
        .ao-kpi--bad .ao-kpi-val { color: var(--ao-bad); }
        .ao-kpi-val { font-size: 2rem; font-weight: 700; line-height: 1.05; letter-spacing: -0.03em; }
        .ao-kpi-hint { font-size: 0.8rem; color: var(--ao-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

        /* Cards */
        .ao-grid { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 1rem; }
        .ao-s4 { grid-column: span 4; } .ao-s5 { grid-column: span 5; } .ao-s6 { grid-column: span 6; } .ao-s7 { grid-column: span 7; }
        .ao-card { background: #fff; border: 1px solid var(--ao-line); border-radius: var(--ao-radius); display: flex; flex-direction: column; min-width: 0; overflow: hidden; }
        .ao-head { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 1.1rem 1.25rem 0.6rem; }
        .ao-title { font-size: 1rem; font-weight: 700; margin: 0; letter-spacing: -0.01em; }
        .ao-link {
          appearance: none; background: none; border: 0; cursor: pointer; color: var(--ao-muted); font-size: 0.82rem; font-weight: 600;
          padding: 4px 4px 4px 8px; border-radius: 999px; white-space: nowrap; display: inline-flex; align-items: center; gap: 2px;
        }
        .ao-link:hover { color: var(--ao-accent); background: var(--ao-accent-soft); }
        .ao-body { padding: 0.5rem 1.25rem 1.25rem; display: flex; flex-direction: column; gap: 1rem; }

        .ao-list { list-style: none; margin: 0; padding: 0 0.5rem 0.5rem; }
        .ao-item { display: flex; align-items: center; gap: 0.85rem; padding: 0.7rem 0.75rem; border-radius: 12px; }
        .ao-item:hover { background: var(--ao-faint); }
        .ao-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.4rem; font-size: 0.9rem; }
        .ao-name { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .ao-sub { font-size: 0.78rem; color: var(--ao-muted); }
        .ao-meta { font-size: 0.82rem; color: var(--ao-muted); white-space: nowrap; }
        .ao-meta strong { color: var(--ao-ink); font-size: 0.95rem; }
        .ao-text { flex: 1; min-width: 0; font-size: 0.88rem; line-height: 1.45; color: #3b3744; }
        .ao-text strong { color: var(--ao-ink); }
        .ao-bar { height: 6px; border-radius: 999px; background: var(--ao-faint); overflow: hidden; }
        .ao-bar > span { display: block; height: 100%; border-radius: 999px; background: var(--ao-accent); min-width: 3px; }

        .ao-row { display: flex; flex-direction: column; gap: 0.45rem; }
        .ao-row-top { display: flex; justify-content: space-between; gap: 0.5rem; font-size: 0.86rem; }
        .ao-row-top > :first-child { font-weight: 600; }
        .ao-row-top > :last-child { color: var(--ao-muted); }

        .ao-avatar { width: 36px; height: 36px; border-radius: 50%; color: #fff; font-size: 0.74rem; font-weight: 700; display: grid; place-items: center; flex-shrink: 0; }
        .ao-avatar--done { background: #ecfdf5; color: var(--ao-ok); }
        .ao-avatar--bad { background: #fef2f2; color: var(--ao-bad); }

        .ao-empty { padding: 2rem 1.25rem; text-align: center; color: var(--ao-muted); font-size: 0.88rem; display: flex; flex-direction: column; align-items: center; gap: 0.75rem; }
        .ao-note { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; margin: auto 0 0; padding: 0.85rem 1.25rem; background: var(--ao-faint); font-size: 0.84rem; color: var(--ao-muted); }
        .ao-split { border-top: 1px solid var(--ao-line); padding-top: 1rem; display: flex; flex-direction: column; gap: 0.9rem; }

        @media (max-width: 1180px) {
          .ao-hero { grid-template-columns: 1fr; }
          .ao-s4 { grid-column: span 6; }
          .ao-s5, .ao-s7 { grid-column: span 12; }
        }
        @media (max-width: 780px) {
          .ao-s4, .ao-s6 { grid-column: span 12; }
          .ao-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .ao-kpi, .ao-kpi:nth-child(3n) { border-right: 1px solid var(--ao-line); border-bottom: 1px solid var(--ao-line); }
          .ao-kpi:nth-child(2n) { border-right: 0; }
          .ao-kpi:nth-last-child(-n+2) { border-bottom: 0; }
        }
        @media (max-width: 520px) { .ao-actions { width: 100%; } .ao-actions .ao-btn { flex: 1; justify-content: center; padding: 0 0.6rem; } }
      `}</style>

      <header className="ao-top">
        <div>
          <h2 className="ao-h1">Overview</h2>
          <p className="ao-lede">Training progress across your organization.</p>
        </div>
        <div className="ao-actions">
          <button type="button" className="ao-btn" onClick={() => onNavigate('users')}><UserPlus size={16} /> Add user</button>
          <button type="button" className="ao-btn" onClick={() => onNavigate('assignments')}><ClipboardList size={16} /> Assign courses</button>
          <button type="button" className="ao-btn ao-btn--solid" onClick={() => onNavigate('creator')}><Plus size={16} /> Create content</button>
        </div>
      </header>

      {/* Hero */}
      <div className="ao-hero">
        <section className="ao-panel">
          <h2>Training completion</h2>
          {total > 0 ? (
            <div className="ao-donut-wrap">
              <div className="ao-donut">
                <svg viewBox="0 0 100 100" role="img" aria-label={`${completionRate}% of enrollments completed`}>
                  <circle cx="50" cy="50" r={R} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="9" />
                  {segments.map(s => {
                    const len = (s.n / total) * C;
                    const el = (
                      <circle
                        key={s.label}
                        cx="50" cy="50" r={R} fill="none" stroke={s.color} strokeWidth="9"
                        strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-offset}
                      />
                    );
                    offset += len;
                    return s.n > 0 ? el : null;
                  })}
                </svg>
                <div className="ao-donut-c"><b>{completionRate}%</b><span>completed</span></div>
              </div>
              <div className="ao-legend">
                {segments.map(s => (
                  <div key={s.label}><span className="ao-dot" style={{ background: s.color }} />{s.label}<b>{s.n}</b></div>
                ))}
              </div>
            </div>
          ) : (
            <div className="ao-panel-empty">No enrollments yet. Assign a course to start tracking progress.</div>
          )}
          <div className="ao-panel-foot">
            <span>{d.completed.length} of {total} enrollments completed</span>
            <button type="button" className="ao-panel-link" onClick={() => onNavigate('assignments')}>View details</button>
          </div>
        </section>

        <div className="ao-kpis">
          {kpis.map(({ label, value, hint, icon: Icon, tab, tone }) => (
            <button key={label} type="button" className={`ao-kpi ${tone ? `ao-kpi--${tone}` : ''}`} onClick={() => onNavigate(tab)}>
              <span className="ao-kpi-top"><span className="ao-kpi-ico"><Icon size={16} /></span>{label}</span>
              <span className="ao-kpi-val">{value}</span>
              <span className="ao-kpi-hint">{hint}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="ao-grid">
        {/* Needs attention */}
        <section className="ao-card ao-s5">
          <div className="ao-head">
            <h3 className="ao-title">Needs attention</h3>
            <button type="button" className="ao-link" onClick={() => onNavigate('assignments')}>View all <ChevronRight size={14} /></button>
          </div>
          {d.overdueList.length > 0 ? (
            <ul className="ao-list">
              {d.overdueList.map(({ p, user, course }, i) => (
                <li className="ao-item" key={`${p.userEmail}-${p.courseId}-${i}`}>
                  <span className="ao-avatar ao-avatar--bad"><AlertTriangle size={16} /></span>
                  <span className="ao-text"><strong>{user?.name || p.userEmail}</strong> is overdue on {course?.title || 'a course'}</span>
                  <span className="ao-meta"><strong>{p.progressPercent}%</strong></span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="ao-empty"><CheckCircle2 size={24} style={{ color: COLORS.ok }} />No overdue assignments.</div>
          )}
          <div className="ao-note">
            <span>{d.noEnrollment > 0 ? `${d.noEnrollment} user${d.noEnrollment === 1 ? '' : 's'} with no enrolled courses` : 'Every user has at least one course'}</span>
            {d.noEnrollment > 0 && <button type="button" className="ao-link" onClick={() => onNavigate('assignments')}>Assign</button>}
          </div>
        </section>

        {/* Most assigned */}
        <section className="ao-card ao-s7">
          <div className="ao-head">
            <h3 className="ao-title">Most assigned content</h3>
            <button type="button" className="ao-link" onClick={() => onNavigate('assignments')}>Manage <ChevronRight size={14} /></button>
          </div>
          {d.popular.length > 0 ? (
            <ul className="ao-list">
              {d.popular.map(({ course, enrolled }) => (
                <li className="ao-item" key={course.id}>
                  <div className="ao-main">
                    <span className="ao-name" title={course.title}>{course.title}</span>
                    <span className="ao-bar" aria-hidden="true"><span style={{ width: `${(enrolled / maxEnrolled) * 100}%`, opacity: enrolled === 0 ? 0.25 : 1 }} /></span>
                    <span className="ao-sub">{course.code || 'No code'}, {course.contentType === 'document' ? 'document' : 'course'}</span>
                  </div>
                  <span className="ao-meta"><strong>{enrolled}</strong> assigned</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="ao-empty">
              No content has been created yet.
              <button type="button" className="ao-btn ao-btn--solid" onClick={() => onNavigate('creator')}><Plus size={14} /> Create content</button>
            </div>
          )}
        </section>

        {/* Department progress */}
        <section className="ao-card ao-s4">
          <div className="ao-head">
            <h3 className="ao-title">Progress by department</h3>
            <button type="button" className="ao-link" onClick={() => onNavigate('users')}>Users <ChevronRight size={14} /></button>
          </div>
          <div className="ao-body">
            {d.depts.length > 0 ? d.depts.map(dep => (
              <div className="ao-row" key={dep.name}>
                <div className="ao-row-top"><span>{dep.name}</span><span>{dep.hasData ? `${dep.avg}%` : 'No data'}</span></div>
                <div className="ao-bar"><span style={{ width: `${dep.avg}%`, opacity: dep.hasData ? 1 : 0.2 }} /></div>
                <span className="ao-sub">{dep.users} user{dep.users === 1 ? '' : 's'}</span>
              </div>
            )) : <div className="ao-empty">No users yet.</div>}
          </div>
        </section>

        {/* Top learners */}
        <section className="ao-card ao-s4">
          <div className="ao-head"><h3 className="ao-title">Top learners</h3><Award size={18} style={{ color: 'var(--ao-accent)' }} /></div>
          {d.learners.length > 0 ? (
            <ul className="ao-list">
              {d.learners.map(({ user, done, total: t, avg }) => (
                <li className="ao-item" key={user.id}>
                  <span className="ao-avatar" style={{ background: avatarColor(user.name) }}>{getInitials(user.name)}</span>
                  <div className="ao-main">
                    <span className="ao-name">{user.name}</span>
                    <span className="ao-bar"><span style={{ width: `${avg}%`, background: avg >= 100 ? COLORS.ok : undefined }} /></span>
                  </div>
                  <span className="ao-meta"><strong>{done}</strong>/{t}</span>
                </li>
              ))}
            </ul>
          ) : <div className="ao-empty">No learner activity yet.</div>}
        </section>

        {/* Recent activity */}
        <section className="ao-card ao-s4">
          <div className="ao-head">
            <h3 className="ao-title">Recent activity</h3>
            <button type="button" className="ao-link" onClick={() => onNavigate('users')}>Users <ChevronRight size={14} /></button>
          </div>
          {d.newest.length + d.completions.length > 0 ? (
            <ul className="ao-list">
              {d.newest.map(u => (
                <li className="ao-item" key={u.id}>
                  <span className="ao-avatar" style={{ background: avatarColor(u.name) }}>{getInitials(u.name)}</span>
                  <span className="ao-text"><strong>{u.name}</strong> joined {u.department || 'the platform'}</span>
                  <span className="ao-meta">{timeAgo(u.createdAt)}</span>
                </li>
              ))}
              {d.completions.map(({ p, user, course }, i) => (
                <li className="ao-item" key={`${p.userEmail}-${p.courseId}-${i}`}>
                  <span className="ao-avatar ao-avatar--done"><CheckCircle2 size={16} /></span>
                  <span className="ao-text"><strong>{user?.name || p.userEmail}</strong> completed {course?.title || 'a course'}</span>
                </li>
              ))}
            </ul>
          ) : <div className="ao-empty">No recent platform activity.</div>}
        </section>

        {/* Users by role */}
        <section className="ao-card ao-s6">
          <div className="ao-head">
            <h3 className="ao-title">Users by role</h3>
            <button type="button" className="ao-link" onClick={() => onNavigate('users')}>Manage <ChevronRight size={14} /></button>
          </div>
          <div className="ao-body">
            {d.roleCounts.length > 0 ? d.roleCounts.map(r => (
              <div className="ao-row" key={r.role}>
                <div className="ao-row-top"><span>{roleLabel[r.role]}</span><span>{r.count}</span></div>
                <div className="ao-bar"><span style={{ width: `${(r.count / maxRole) * 100}%` }} /></div>
              </div>
            )) : <div className="ao-empty">No users yet.</div>}
          </div>
        </section>

        {/* Content mix */}
        <section className="ao-card ao-s6">
          <div className="ao-head">
            <h3 className="ao-title">Content mix</h3>
            <button type="button" className="ao-link" onClick={() => onNavigate('inventory')}>Inventory <ChevronRight size={14} /></button>
          </div>
          <div className="ao-body">
            {courses.length > 0 ? (
              <>
                <div className="ao-row">
                  <div className="ao-row-top"><span>Courses</span><span>{d.coursesOnly}</span></div>
                  <div className="ao-bar"><span style={{ width: `${pct(d.coursesOnly, courses.length)}%` }} /></div>
                </div>
                <div className="ao-row">
                  <div className="ao-row-top"><span>Documents</span><span>{d.docs}</span></div>
                  <div className="ao-bar"><span style={{ width: `${pct(d.docs, courses.length)}%`, background: '#4f46e5' }} /></div>
                </div>
                {d.categories.length > 0 && (
                  <div className="ao-split">
                    {d.categories.map(([name, n]) => (
                      <div className="ao-row" key={name}>
                        <div className="ao-row-top"><span>{name}</span><span>{n}</span></div>
                        <div className="ao-bar"><span style={{ width: `${(n / maxCat) * 100}%`, background: '#0284c7' }} /></div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : <div className="ao-empty">No content yet.</div>}
          </div>
        </section>
      </div>
    </div>
  );
};