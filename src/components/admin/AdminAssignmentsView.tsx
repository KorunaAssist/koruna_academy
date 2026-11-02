import React, { useState, useEffect, useMemo } from 'react';
import { Search, Check, Plus, X, Copy, AlertCircle, RotateCcw } from 'lucide-react';
import { dbService, type Course, type DatabaseUser, type UserProgress, type Department } from '../../services/db';
import { LoadingModal } from '../LoadingModal';

export interface AdminAssignmentsViewProps {
  users: DatabaseUser[];
  courses: Course[];
  handleAssignCourse: (courseId: string, userEmail: string) => Promise<void>;
  teamProgress?: Record<string, UserProgress[]>;
  departments?: Department[];
}

type StatusFilter = 'all' | 'assigned' | 'unassigned' | 'completed';

const roleLabel: Record<string, string> = {
  employee: 'Employee',
  trainer: 'Trainer',
  team_leader: 'Team Leader',
  admin: 'Administrator'
};

const AVATAR_COLORS = ['#a31555', '#4f46e5', '#0284c7', '#059669', '#d97706', '#7c3aed'];

const avatarColor = (name = '') => {
  let sum = 0;
  for (let i = 0; i < name.length; i++) sum += name.charCodeAt(i);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
};

const getInitials = (name = '') => {
  if (!name) return 'U';
  const parts = name.trim().split(' ');
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.substring(0, 2).toUpperCase();
};

const lc = (s?: string) => (s || '').toLowerCase();

export const AdminAssignmentsView: React.FC<AdminAssignmentsViewProps> = ({
  users,
  courses,
  handleAssignCourse,
  teamProgress = {},
  departments = []
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDept, setSelectedDept] = useState('all');
  const [selectedRole, setSelectedRole] = useState('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const [panelEmail, setPanelEmail] = useState<string | null>(null);
  const [courseSearch, setCourseSearch] = useState('');
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null);
  const [assigningMap, setAssigningMap] = useState<Record<string, boolean>>({});
  const [activeAssignment, setActiveAssignment] = useState<{
    action: 'assign' | 'unassign';
    courseTitle: string;
    userName: string;
  } | null>(null);

  const [userProgressMap, setUserProgressMap] = useState<Record<string, UserProgress[]>>(teamProgress);

  useEffect(() => {
    setUserProgressMap(teamProgress);
  }, [teamProgress]);

  // Load progress for users missing from the map (in parallel)
  useEffect(() => {
    let isMounted = true;
    const missing = users.filter(u => !userProgressMap[u.email.toLowerCase()]);
    if (missing.length === 0) return;

    (async () => {
      const results = await Promise.all(
        missing.map(async u => {
          try {
            return [u.email.toLowerCase(), await dbService.getUserProgress(u.email)] as const;
          } catch (e) {
            console.error('Error fetching progress for', u.email, e);
            return null;
          }
        })
      );
      if (!isMounted) return;
      const loaded = results.filter((r): r is readonly [string, UserProgress[]] => r !== null);
      if (loaded.length > 0) {
        setUserProgressMap(prev => ({ ...prev, ...Object.fromEntries(loaded) }));
      }
    })();

    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users]);

  // Close panel on Escape
  useEffect(() => {
    if (!panelEmail) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPanelEmail(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [panelEmail]);

  const getInfo = (user: DatabaseUser) => {
    const userProgs = userProgressMap[user.email.toLowerCase()] || [];
    const ids = new Set(
      [user.email, user.id, user.userId !== undefined ? String(user.userId) : undefined]
        .filter((v): v is string => Boolean(v))
        .map(v => v.toLowerCase().trim())
    );

    const assigned = courses
      .map(course => {
        const prog = userProgs.find(p => p.courseId === course.id);
        const fromProgress = Boolean(
          prog && (prog.dueDate || prog.assignedBy || (prog.applicationId !== undefined && prog.applicationId > 0))
        );
        const fromCourse = Boolean(
          course.assignedUsers?.some(a => ids.has(String(a.userId).toLowerCase().trim()))
        );
        const progressPercent = prog ? prog.progressPercent : 0;
        return {
          course,
          prog,
          isAssigned: fromProgress || fromCourse,
          progressPercent,
          isCompleted: progressPercent >= 100,
          overdue: prog ? Boolean(prog.overdue) : false
        };
      })
      .filter(i => i.isAssigned);

    const total = assigned.length;
    const completed = assigned.filter(a => a.isCompleted).length;
    const overdue = assigned.filter(a => a.overdue && !a.isCompleted).length;
    const avg = total > 0 ? Math.round(assigned.reduce((s, a) => s + a.progressPercent, 0) / total) : 0;

    return { assigned, total, completed, overdue, avg };
  };

  // Compute once per render for all users
  const infoMap = useMemo(() => {
    const m: Record<string, ReturnType<typeof getInfo>> = {};
    users.forEach(u => {
      m[u.email.toLowerCase()] = getInfo(u);
    });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users, courses, userProgressMap]);

  const infoOf = (u: DatabaseUser) => infoMap[u.email.toLowerCase()] ?? getInfo(u);

  // Filters (status is applied last so tab counts reflect the other filters)
  const baseFiltered = users.filter(u => {
    const q = lc(searchQuery);
    const matchesSearch = lc(u.name).includes(q) || lc(u.email).includes(q);
    const matchesDept = selectedDept === 'all' || (u.department || 'General') === selectedDept;
    const matchesRole = selectedRole === 'all' || u.role === selectedRole;
    return matchesSearch && matchesDept && matchesRole;
  });

  const counts = {
    all: baseFiltered.length,
    assigned: baseFiltered.filter(u => infoOf(u).total > 0).length,
    unassigned: baseFiltered.filter(u => infoOf(u).total === 0).length,
    completed: baseFiltered.filter(u => {
      const i = infoOf(u);
      return i.total > 0 && i.completed === i.total;
    }).length
  };

  const filteredUsers = baseFiltered.filter(u => {
    const i = infoOf(u);
    if (statusFilter === 'assigned') return i.total > 0;
    if (statusFilter === 'unassigned') return i.total === 0;
    if (statusFilter === 'completed') return i.total > 0 && i.completed === i.total;
    return true;
  });

  const deptList = Array.from(
    new Set([...departments.map(d => d.name), ...users.map(u => u.department || 'General')])
  ).filter(Boolean);

  const tabs: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'assigned', label: 'Enrolled' },
    { key: 'unassigned', label: 'Needs courses' },
    { key: 'completed', label: 'Completed' }
  ];

  const toggleAssignment = async (courseId: string, userEmail: string) => {
    const lockKey = `${userEmail}-${courseId}`;
    if (assigningMap[lockKey]) return;

    const course = courses.find(c => c.id === courseId);
    const user = users.find(u => lc(u.email) === lc(userEmail));
    const isAssigned = Boolean(user && infoOf(user).assigned.some(i => i.course.id === courseId));

    setAssigningMap(prev => ({ ...prev, [lockKey]: true }));
    setActiveAssignment({
      action: isAssigned ? 'unassign' : 'assign',
      courseTitle: course?.title || 'course',
      userName: user?.name || userEmail
    });
    try {
      await handleAssignCourse(courseId, userEmail);
      const fresh = await dbService.getUserProgress(userEmail);
      setUserProgressMap(prev => ({ ...prev, [userEmail.toLowerCase()]: fresh }));
    } catch (err) {
      console.error('Failed to toggle course assignment:', err);
    } finally {
      setAssigningMap(prev => ({ ...prev, [lockKey]: false }));
      setActiveAssignment(null);
    }
  };

  const copyEmail = (email: string) => {
    navigator.clipboard.writeText(email);
    setCopiedEmail(email);
    setTimeout(() => setCopiedEmail(null), 1800);
  };

  const openPanel = (email: string) => {
    setCourseSearch('');
    setPanelEmail(email);
  };

  const panelUser = panelEmail ? users.find(u => lc(u.email) === lc(panelEmail)) ?? null : null;
  const panelInfo = panelUser ? infoOf(panelUser) : null;
  const panelCourses = panelUser
    ? courses.filter(c => lc(c.title).includes(lc(courseSearch)) || lc(c.code).includes(lc(courseSearch)))
    : [];

  return (
    <div className="ah">
      <style>{`
        .ah {
          --ah-accent: #a31555;
          --ah-accent-soft: #fbeef4;
          --ah-ink: #111827;
          --ah-muted: #6b7280;
          --ah-line: var(--line, #e5e7eb);
          --ah-ok: #059669;
          --ah-warn: #b45309;
          --ah-bad: #dc2626;
          display: flex; flex-direction: column; gap: 1rem; width: 100%;
          color: var(--ah-ink);
        }
        .ah button { font: inherit; }
        .ah :focus-visible { outline: 2px solid var(--ah-accent); outline-offset: 2px; }

        /* Toolbar */
        .ah-bar { display: flex; flex-wrap: wrap; gap: 0.6rem; align-items: center; }
        .ah-search { position: relative; flex: 1 1 240px; min-width: 200px; }
        .ah-search svg { position: absolute; left: 0.75rem; top: 50%; transform: translateY(-50%); color: #9ca3af; pointer-events: none; }
        .ah-field, .ah-select {
          height: 38px; border: 1px solid #d1d5db; border-radius: 8px; background: #fff;
          font-size: 0.875rem; color: var(--ah-ink);
        }
        .ah-field { width: 100%; padding: 0 0.75rem 0 2.15rem; }
        .ah-select { padding: 0 0.6rem; cursor: pointer; }
        .ah-field:focus, .ah-select:focus { outline: none; border-color: var(--ah-accent); box-shadow: 0 0 0 3px rgba(163,21,85,.12); }

        /* Status tabs */
        .ah-tabs { display: flex; gap: 0.25rem; border-bottom: 1px solid var(--ah-line); overflow-x: auto; }
        .ah-tab {
          appearance: none; background: none; border: 0; cursor: pointer; white-space: nowrap;
          padding: 0.6rem 0.9rem; font-size: 0.875rem; font-weight: 500; color: var(--ah-muted);
          border-bottom: 2px solid transparent; margin-bottom: -1px;
          display: inline-flex; align-items: center; gap: 0.4rem;
        }
        .ah-tab:hover { color: var(--ah-ink); }
        .ah-tab[aria-selected="true"] { color: var(--ah-accent); border-bottom-color: var(--ah-accent); font-weight: 600; }
        .ah-count { font-size: 0.75rem; padding: 1px 7px; border-radius: 999px; background: #f3f4f6; color: var(--ah-muted); font-weight: 600; }
        .ah-tab[aria-selected="true"] .ah-count { background: var(--ah-accent-soft); color: var(--ah-accent); }

        /* List */
        .ah-list { background: #fff; border: 1px solid var(--ah-line); border-radius: 12px; overflow: hidden; }
        .ah-head, .ah-row {
          display: grid; grid-template-columns: minmax(220px, 2.2fr) minmax(120px, 1fr) minmax(180px, 1.6fr) auto;
          align-items: center; gap: 1rem; padding: 0.8rem 1.1rem;
        }
        .ah-head { background: #fafafa; border-bottom: 1px solid var(--ah-line); font-size: 0.78rem; font-weight: 600; color: var(--ah-muted); }
        .ah-row { border-bottom: 1px solid #f1f2f4; cursor: pointer; transition: background .12s ease; }
        .ah-row:last-child { border-bottom: 0; }
        .ah-row:hover { background: #fafafa; }

        .ah-person { display: flex; align-items: center; gap: 0.7rem; min-width: 0; }
        .ah-avatar { width: 36px; height: 36px; border-radius: 50%; color: #fff; font-size: 0.8rem; font-weight: 700; display: grid; place-items: center; flex-shrink: 0; }
        .ah-name { font-size: 0.92rem; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .ah-sub { font-size: 0.8rem; color: var(--ah-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .ah-role { font-size: 0.85rem; line-height: 1.35; min-width: 0; }

        .ah-prog { display: flex; flex-direction: column; gap: 0.35rem; min-width: 0; }
        .ah-prog-top { display: flex; justify-content: space-between; gap: 0.5rem; font-size: 0.8rem; color: var(--ah-muted); }
        .ah-prog-top strong { color: var(--ah-ink); font-weight: 600; }
        .ah-bar-bg { height: 6px; border-radius: 999px; background: #e5e7eb; overflow: hidden; }
        .ah-bar-fill { height: 100%; border-radius: 999px; background: var(--ah-accent); transition: width .3s ease; }
        .ah-bar-fill--done { background: var(--ah-ok); }
        .ah-none { font-size: 0.85rem; color: #9ca3af; }
        .ah-flag { color: var(--ah-bad); font-weight: 600; }

        .ah-btn {
          display: inline-flex; align-items: center; justify-content: center; gap: 0.35rem; cursor: pointer;
          height: 34px; padding: 0 0.85rem; border-radius: 8px; font-size: 0.84rem; font-weight: 600;
          border: 1px solid #d1d5db; background: #fff; color: #374151; white-space: nowrap;
        }
        .ah-btn:hover { border-color: var(--ah-accent); color: var(--ah-accent); background: var(--ah-accent-soft); }
        .ah-btn:disabled { opacity: .6; cursor: default; }
        .ah-btn--solid { background: var(--ah-accent); border-color: var(--ah-accent); color: #fff; }
        .ah-btn--solid:hover { background: #85104a; border-color: #85104a; color: #fff; }

        .ah-empty { padding: 3rem 1rem; text-align: center; color: var(--ah-muted); font-size: 0.9rem; }
        .ah-empty svg { margin: 0 auto 0.6rem; display: block; color: #9ca3af; }

        /* Side panel */
        .ah-scrim { position: fixed; inset: 0; background: rgba(17,24,39,.4); z-index: 999; animation: ah-fade .15s ease; }
        .ah-panel {
          position: fixed; top: 0; right: 0; bottom: 0; width: min(480px, 100%); background: #fff; z-index: 1000;
          display: flex; flex-direction: column; box-shadow: -12px 0 32px rgba(0,0,0,.12);
          animation: ah-slide .22s cubic-bezier(.16,1,.3,1);
        }
        .ah-panel-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; padding: 1.1rem 1.25rem; border-bottom: 1px solid var(--ah-line); }
        .ah-x { appearance: none; border: 0; background: none; color: var(--ah-muted); cursor: pointer; padding: 6px; border-radius: 6px; display: grid; place-items: center; }
        .ah-x:hover { background: #f3f4f6; color: var(--ah-ink); }
        .ah-copy { appearance: none; border: 0; background: none; cursor: pointer; color: #9ca3af; padding: 2px; display: inline-flex; vertical-align: middle; border-radius: 4px; }
        .ah-copy:hover { color: var(--ah-accent); }
        .ah-panel-body { flex: 1; overflow-y: auto; padding: 1.1rem 1.25rem 1.5rem; display: flex; flex-direction: column; gap: 1.1rem; }
        .ah-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.6rem; }
        .ah-stat { border: 1px solid var(--ah-line); border-radius: 10px; padding: 0.6rem 0.8rem; }
        .ah-stat b { display: block; font-size: 1.25rem; line-height: 1.2; }
        .ah-stat span { font-size: 0.78rem; color: var(--ah-muted); }
        .ah-h { font-size: 0.9rem; font-weight: 700; margin: 0; }

        .ah-course { display: flex; align-items: center; gap: 0.85rem; padding: 0.7rem 0.1rem; border-bottom: 1px solid #f1f2f4; }
        .ah-course:last-child { border-bottom: 0; }
        .ah-course-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.3rem; }
        .ah-course-title { font-size: 0.9rem; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .ah-course-title span { color: var(--ah-accent); margin-right: 0.35rem; }
        .ah-course-meta { font-size: 0.78rem; color: var(--ah-muted); }
        .ah-spin { animation: ah-spin .8s linear infinite; }

        @keyframes ah-fade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes ah-slide { from { transform: translateX(24px); opacity: 0; } to { transform: none; opacity: 1; } }
        @keyframes ah-spin { to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) { .ah-scrim, .ah-panel, .ah-spin, .ah-bar-fill { animation: none; transition: none; } }

        @media (max-width: 820px) {
          .ah-head { display: none; }
          .ah-row { grid-template-columns: 1fr auto; gap: 0.6rem 0.75rem; }
          .ah-row .ah-role { grid-column: 1; grid-row: 2; }
          .ah-row .ah-prog { grid-column: 1 / -1; grid-row: 3; }
          .ah-row .ah-btn { grid-column: 2; grid-row: 1; }
        }
      `}</style>

      {activeAssignment && (
        <LoadingModal
          type="academy"
          variant="modal"
          message={`${activeAssignment.action === 'assign' ? 'Assigning' : 'Unassigning'} "${activeAssignment.courseTitle}" for ${activeAssignment.userName}...`}
        />
      )}

      {/* Toolbar */}
      <div className="ah-bar">
        <div className="ah-search">
          <Search size={16} />
          <input
            className="ah-field"
            type="text"
            placeholder="Search by name or email"
            aria-label="Search employees"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
        <select className="ah-select" aria-label="Department" value={selectedDept} onChange={e => setSelectedDept(e.target.value)}>
          <option value="all">All departments</option>
          {deptList.map(d => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
        <select className="ah-select" aria-label="Role" value={selectedRole} onChange={e => setSelectedRole(e.target.value)}>
          <option value="all">All roles</option>
          {Object.entries(roleLabel).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>

      {/* Status tabs */}
      <div className="ah-tabs" role="tablist" aria-label="Filter by enrollment status">
        {tabs.map(t => (
          <button
            key={t.key}
            role="tab"
            className="ah-tab"
            aria-selected={statusFilter === t.key}
            onClick={() => setStatusFilter(t.key)}
          >
            {t.label}
            <span className="ah-count">{counts[t.key]}</span>
          </button>
        ))}
      </div>

      {/* List */}
      <div className="ah-list">
        <div className="ah-head" aria-hidden="true">
          <div>Employee</div>
          <div>Role</div>
          <div>Progress</div>
          <div style={{ width: 92 }} />
        </div>

        {filteredUsers.map(user => {
          const info = infoOf(user);
          const allDone = info.total > 0 && info.completed === info.total;
          return (
            <div
              key={user.email}
              className="ah-row"
              onClick={() => openPanel(user.email)}
            >
              <div className="ah-person">
                <div className="ah-avatar" style={{ background: avatarColor(user.name) }}>{getInitials(user.name)}</div>
                <div style={{ minWidth: 0 }}>
                  <div className="ah-name">{user.name}</div>
                  <div className="ah-sub">{user.email}</div>
                </div>
              </div>

              <div className="ah-role">
                <div>{roleLabel[user.role] || user.role}</div>
                <div className="ah-sub">{user.department || 'General'}</div>
              </div>

              {info.total > 0 ? (
                <div className="ah-prog">
                  <div className="ah-prog-top">
                    <span>
                      <strong>{info.completed}</strong> of {info.total} completed
                      {info.overdue > 0 && <span className="ah-flag"> · {info.overdue} overdue</span>}
                    </span>
                    <strong>{info.avg}%</strong>
                  </div>
                  <div className="ah-bar-bg">
                    <div className={`ah-bar-fill ${allDone ? 'ah-bar-fill--done' : ''}`} style={{ width: `${info.avg}%` }} />
                  </div>
                </div>
              ) : (
                <span className="ah-none">No courses assigned</span>
              )}

              <button
                className={`ah-btn ${info.total === 0 ? 'ah-btn--solid' : ''}`}
                onClick={e => {
                  e.stopPropagation();
                  openPanel(user.email);
                }}
              >
                {info.total === 0 ? <><Plus size={14} /> Assign</> : 'Manage'}
              </button>
            </div>
          );
        })}

        {filteredUsers.length === 0 && (
          <div className="ah-empty">
            <AlertCircle size={28} />
            No employees match these filters. Try clearing the search or picking another tab.
          </div>
        )}
      </div>

      {/* Side panel: progress + course assignment in one place */}
      {panelUser && panelInfo && (
        <>
          <div className="ah-scrim" onClick={() => setPanelEmail(null)} />
          <aside className="ah-panel" role="dialog" aria-modal="true" aria-label={`Courses for ${panelUser.name}`}>
            <div className="ah-panel-head">
              <div className="ah-person">
                <div className="ah-avatar" style={{ background: avatarColor(panelUser.name), width: 44, height: 44 }}>
                  {getInitials(panelUser.name)}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div className="ah-name" style={{ fontSize: '1.05rem' }}>{panelUser.name}</div>
                  <div className="ah-sub">
                    {panelUser.email}{' '}
                    <button className="ah-copy" onClick={() => copyEmail(panelUser.email)} aria-label="Copy email">
                      {copiedEmail === panelUser.email ? <Check size={13} style={{ color: '#059669' }} /> : <Copy size={13} />}
                    </button>
                  </div>
                  <div className="ah-sub">
                    {roleLabel[panelUser.role] || panelUser.role} · {panelUser.department || 'General'}
                  </div>
                </div>
              </div>
              <button className="ah-x" onClick={() => setPanelEmail(null)} aria-label="Close">
                <X size={18} />
              </button>
            </div>

            <div className="ah-panel-body">
              <div className="ah-stats">
                <div className="ah-stat"><b>{panelInfo.total}</b><span>Enrolled</span></div>
                <div className="ah-stat"><b style={{ color: 'var(--ah-ok)' }}>{panelInfo.completed}</b><span>Completed</span></div>
                <div className="ah-stat"><b style={{ color: 'var(--ah-accent)' }}>{panelInfo.avg}%</b><span>Avg progress</span></div>
              </div>

              <div>
                <h4 className="ah-h">Courses</h4>
                <div className="ah-search" style={{ margin: '0.6rem 0 0.4rem' }}>
                  <Search size={16} />
                  <input
                    className="ah-field"
                    type="text"
                    placeholder="Filter courses"
                    aria-label="Filter courses"
                    value={courseSearch}
                    onChange={e => setCourseSearch(e.target.value)}
                  />
                </div>

                {panelCourses.map(course => {
                  const item = panelInfo.assigned.find(a => a.course.id === course.id);
                  const enrolled = Boolean(item);
                  const busy = assigningMap[`${panelUser.email}-${course.id}`];
                  const lessonTotal = course.lessons?.length || 0;
                  const lessonsDone = item?.prog?.completedLessons?.length || 0;

                  return (
                    <div className="ah-course" key={course.id}>
                      <div className="ah-course-main">
                        <div className="ah-course-title" title={course.title}>
                          <span>{course.code || 'CRS'}</span>
                          {course.title}
                        </div>
                        {item ? (
                          <>
                            <div className="ah-bar-bg">
                              <div
                                className={`ah-bar-fill ${item.isCompleted ? 'ah-bar-fill--done' : ''}`}
                                style={{ width: `${item.progressPercent}%` }}
                              />
                            </div>
                            <div className="ah-course-meta">
                              {item.isCompleted ? 'Completed' : `${item.progressPercent}% complete`}
                              {lessonTotal > 0 && ` · ${lessonsDone}/${lessonTotal} lessons`}
                              {item.prog?.quizScore !== undefined && ` · Quiz ${item.prog.quizScore}%`}
                              {item.overdue && !item.isCompleted && <span className="ah-flag"> · Overdue</span>}
                            </div>
                          </>
                        ) : (
                          <div className="ah-course-meta">
                            {[course.category, course.level, lessonTotal > 0 ? `${lessonTotal} lessons` : null]
                              .filter(Boolean)
                              .join(' · ')}
                          </div>
                        )}
                      </div>

                      <button
                        className={`ah-btn ${enrolled ? '' : 'ah-btn--solid'}`}
                        style={{ minWidth: 96 }}
                        disabled={busy}
                        onClick={() => toggleAssignment(course.id, panelUser.email)}
                        aria-label={`${enrolled ? 'Unassign' : 'Assign'} ${course.title}`}
                      >
                        {busy ? (
                          <RotateCcw size={14} className="ah-spin" />
                        ) : enrolled ? (
                          'Unassign'
                        ) : (
                          <><Plus size={14} /> Assign</>
                        )}
                      </button>
                    </div>
                  );
                })}

                {panelCourses.length === 0 && <div className="ah-empty">No courses match your filter.</div>}
              </div>
            </div>
          </aside>
        </>
      )}
    </div>
  );
};