import React, { useState, useEffect } from 'react';
import {
  Search,
  BookOpen,
  CheckCircle2,
  Clock,
  Plus,
  X,
  Copy,
  Check,
  LayoutGrid,
  List,
  AlertCircle,
  TrendingUp,
  Send,
  ChevronRight,
  UserCheck,
  RotateCcw
} from 'lucide-react';
import { dbService, type Course, type DatabaseUser, type UserProgress, type Department } from '../../services/db';
import { LoadingModal } from '../LoadingModal';

export interface AdminAssignmentsViewProps {
  users: DatabaseUser[];
  courses: Course[];
  handleAssignCourse: (courseId: string, userEmail: string) => Promise<void>;
  teamProgress?: Record<string, UserProgress[]>;
  departments?: Department[];
}

const roleLabel: Record<string, string> = {
  employee: 'Employee',
  trainer: 'Trainer',
  team_leader: 'Team Leader',
  admin: 'Administrator'
};

// Deterministic avatar gradient generator
const getAvatarGradient = (name: string = '') => {
  const gradients = [
    'linear-gradient(135deg, #a31555 0%, #e11d48 100%)',
    'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
    'linear-gradient(135deg, #0284c7 0%, #2563eb 100%)',
    'linear-gradient(135deg, #059669 0%, #10b981 100%)',
    'linear-gradient(135deg, #d97706 0%, #f59e0b 100%)',
    'linear-gradient(135deg, #7c3aed 0%, #c084fc 100%)'
  ];
  let sum = 0;
  for (let i = 0; i < name.length; i++) {
    sum += name.charCodeAt(i);
  }
  return gradients[sum % gradients.length];
};

const getInitials = (name: string = '') => {
  if (!name) return 'U';
  const parts = name.trim().split(' ');
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.substring(0, 2).toUpperCase();
};

export const AdminAssignmentsView: React.FC<AdminAssignmentsViewProps> = ({
  users,
  courses,
  handleAssignCourse,
  teamProgress = {},
  departments = []
}) => {
  // State management
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDept, setSelectedDept] = useState<string>('all');
  const [selectedRole, setSelectedRole] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'assigned' | 'unassigned' | 'completed'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  // Interactive UI state
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null);
  const [quickEnrollUser, setQuickEnrollUser] = useState<DatabaseUser | null>(null);
  const [viewDetailsUser, setViewDetailsUser] = useState<DatabaseUser | null>(null);
  const [nudgedUsers, setNudgedUsers] = useState<Record<string, boolean>>({});
  const [assigningMap, setAssigningMap] = useState<Record<string, boolean>>({});
  const [activeAssignment, setActiveAssignment] = useState<{
    action: 'assign' | 'unassign';
    courseTitle: string;
    userName: string;
  } | null>(null);
  const [modalCourseSearch, setModalCourseSearch] = useState('');

  // Local user progress store to allow real-time interactive updates
  const [userProgressMap, setUserProgressMap] = useState<Record<string, UserProgress[]>>(teamProgress);

  // Sync external teamProgress prop or load from dbService on mount
  useEffect(() => {
    setUserProgressMap(teamProgress);
  }, [teamProgress]);

  // Load progress if userProgressMap is missing data for users
  useEffect(() => {
    let isMounted = true;
    const loadMissingProgress = async () => {
      const map: Record<string, UserProgress[]> = { ...userProgressMap };
      let changed = false;

      for (const u of users) {
        const key = u.email.toLowerCase();
        if (!map[key]) {
          try {
            const prog = await dbService.getUserProgress(u.email);
            map[key] = prog;
            changed = true;
          } catch (e) {
            console.error('Error fetching progress for', u.email, e);
          }
        }
      }
      if (changed && isMounted) {
        setUserProgressMap(map);
      }
    };

    loadMissingProgress();
    return () => { isMounted = false; };
  }, [users]);

  // Helper to get assigned courses & completion info for a given user
  const getUserAssignmentsInfo = (user: DatabaseUser) => {
    const key = user.email.toLowerCase();
    const userProgs = userProgressMap[key] || [];
    const userAssignmentIds = new Set(
      [user.email, user.id, user.userId !== undefined ? String(user.userId) : undefined]
        .filter((value): value is string => Boolean(value))
        .map(value => value.toLowerCase().trim())
    );

    // Filter courses that are assigned to this user
    const assigned = courses.map(course => {
      const prog = userProgs.find(p => p.courseId === course.id);
      const hasAssignedProgress = Boolean(
        prog && (prog.dueDate || prog.assignedBy || (prog.applicationId !== undefined && prog.applicationId > 0))
      );
      const hasAssignedCourseFlag = Boolean(
        course.assignedUsers?.some(a => userAssignmentIds.has(String(a.userId).toLowerCase().trim()))
      );
      const isAssigned = hasAssignedProgress || hasAssignedCourseFlag;
      const progressPercent = prog ? prog.progressPercent : 0;
      const isCompleted = progressPercent >= 100;
      const overdue = prog ? prog.overdue : false;

      return {
        course,
        prog,
        isAssigned,
        progressPercent,
        isCompleted,
        overdue
      };
    }).filter(item => item.isAssigned);

    const totalAssigned = assigned.length;
    const completedCount = assigned.filter(a => a.isCompleted).length;
    const inProgressCount = assigned.filter(a => !a.isCompleted && a.progressPercent > 0).length;
    const notStartedCount = assigned.filter(a => a.progressPercent === 0).length;

    const avgProgress = totalAssigned > 0
      ? Math.round(assigned.reduce((acc, curr) => acc + curr.progressPercent, 0) / totalAssigned)
      : 0;

    return {
      assigned,
      totalAssigned,
      completedCount,
      inProgressCount,
      notStartedCount,
      avgProgress
    };
  };

  // Filter users based on search query, department, role, and assignment status
  const q = (s: string) => s.toLowerCase();
  const filteredUsers = users.filter(u => {
    const matchesSearch = q(u.name).includes(q(searchQuery)) || q(u.email).includes(q(searchQuery));
    const matchesDept = selectedDept === 'all' || (u.department || 'General') === selectedDept;
    const matchesRole = selectedRole === 'all' || u.role === selectedRole;

    if (!matchesSearch || !matchesDept || !matchesRole) return false;

    const info = getUserAssignmentsInfo(u);
    if (statusFilter === 'assigned') return info.totalAssigned > 0;
    if (statusFilter === 'unassigned') return info.totalAssigned === 0;
    if (statusFilter === 'completed') return info.totalAssigned > 0 && info.completedCount === info.totalAssigned;

    return true;
  });

  // Calculate platform summary stats across filtered employees
  const totalEmployeesCount = filteredUsers.length;
  let aggregateAssignedCourses = 0;
  let aggregateCompletedCourses = 0;
  let sumAvgProgress = 0;

  filteredUsers.forEach(u => {
    const info = getUserAssignmentsInfo(u);
    aggregateAssignedCourses += info.totalAssigned;
    aggregateCompletedCourses += info.completedCount;
    sumAvgProgress += info.avgProgress;
  });

  const globalAvgProgress = totalEmployeesCount > 0 ? Math.round(sumAvgProgress / totalEmployeesCount) : 0;

  // Handle course assignment/unassignment with interactive feedback
  const onToggleCourseAssignment = async (courseId: string, userEmail: string) => {
    const lockKey = `${userEmail}-${courseId}`;
    if (assigningMap[lockKey]) return;

    const course = courses.find(c => c.id === courseId);
    const user = users.find(u => u.email.toLowerCase() === userEmail.toLowerCase());
    const userInfo = user ? getUserAssignmentsInfo(user) : null;
    const isCurrentlyAssigned = Boolean(userInfo?.assigned.some(item => item.course.id === courseId));

    setAssigningMap(prev => ({ ...prev, [lockKey]: true }));
    setActiveAssignment({
      action: isCurrentlyAssigned ? 'unassign' : 'assign',
      courseTitle: course?.title || 'course',
      userName: user?.name || userEmail
    });
    try {
      await handleAssignCourse(courseId, userEmail);

      // Refresh local user progress state
      const freshProg = await dbService.getUserProgress(userEmail);
      setUserProgressMap(prev => ({
        ...prev,
        [userEmail.toLowerCase()]: freshProg
      }));
    } catch (err) {
      console.error('Failed to toggle course assignment:', err);
    } finally {
      setAssigningMap(prev => ({ ...prev, [lockKey]: false }));
      setActiveAssignment(null);
    }
  };

  // Handle email clipboard copy
  const handleCopyEmail = (email: string) => {
    navigator.clipboard.writeText(email);
    setCopiedEmail(email);
    setTimeout(() => setCopiedEmail(null), 2000);
  };

  // Handle nudge employee reminder
  const handleNudge = (userEmail: string) => {
    setNudgedUsers(prev => ({ ...prev, [userEmail]: true }));
    setTimeout(() => {
      setNudgedUsers(prev => ({ ...prev, [userEmail]: false }));
    }, 4000);
  };

  // Get department list for filter
  const deptList = Array.from(new Set([
    ...departments.map(d => d.name),
    ...users.map(u => u.department || 'General')
  ])).filter(Boolean);

  return (
    <div className="as-assign-hub">
      {/* Dynamic Scoped CSS Styles for Interactive Employee Cards */}
      <style>{`
        .as-assign-hub {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
          width: 100%;
        }

        /* Metrics Bar */
        .as-metrics-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
          gap: 1rem;
        }

        .as-metric-card {
          background: #ffffff;
          border: 1px solid var(--line, #e5e7eb);
          border-radius: 14px;
          padding: 1.15rem 1.25rem;
          display: flex;
          align-items: center;
          gap: 1rem;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.02);
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }

        .as-metric-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(0, 0, 0, 0.06);
        }

        .as-metric-icon {
          width: 44px;
          height: 44px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .as-metric-icon--primary { background: #fbeef4; color: #a31555; }
        .as-metric-icon--info { background: #eff6ff; color: #2563eb; }
        .as-metric-icon--success { background: #f0fdf4; color: #16a34a; }
        .as-metric-icon--warning { background: #fffbeb; color: #d97706; }

        .as-metric-val {
          font-size: 1.5rem;
          font-weight: 700;
          line-height: 1.2;
          color: #111827;
        }

        .as-metric-lbl {
          font-size: 0.8125rem;
          color: #6b7280;
          font-weight: 500;
          margin-top: 2px;
        }

        /* Filter Controls */
        .as-controls-card {
          background: #ffffff;
          border: 1px solid var(--line, #e5e7eb);
          border-radius: 14px;
          padding: 1rem 1.25rem;
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
        }

        .as-controls-left {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.75rem;
          flex: 1;
          min-width: 280px;
        }

        .as-controls-right {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .as-filter-select {
          height: 38px;
          padding: 0 0.85rem;
          font-size: 0.84rem;
          font-weight: 500;
          color: #374151;
          background: #ffffff;
          border: 1px solid #d1d5db;
          border-radius: 8px;
          cursor: pointer;
          outline: none;
          transition: border-color 0.15s ease;
        }

        .as-filter-select:focus {
          border-color: #a31555;
          box-shadow: 0 0 0 3px rgba(163, 21, 85, 0.12);
        }

        .as-view-btn {
          height: 38px;
          width: 38px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 8px;
          border: 1px solid #d1d5db;
          background: #ffffff;
          color: #6b7280;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .as-view-btn.is-active, .as-view-btn:hover {
          background: #fbeef4;
          border-color: #a31555;
          color: #a31555;
        }

        /* Cards Grid Layout */
        .as-employee-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
          gap: 1.25rem;
        }

        /* Interactive Employee Card */
        .as-emp-card {
          background: #ffffff;
          border: 1px solid #e5e7eb;
          border-radius: 16px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.03);
          transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.22s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.22s ease;
          position: relative;
        }

        .as-emp-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 12px 24px -6px rgba(0, 0, 0, 0.08), 0 4px 10px -4px rgba(0, 0, 0, 0.03);
          border-color: #f43f5e;
        }

        /* Card Top Banner / Header */
        .as-emp-head {
          padding: 1.25rem 1.25rem 1rem;
          display: flex;
          align-items: flex-start;
          gap: 1rem;
          border-bottom: 1px solid #f3f4f6;
          background: linear-gradient(180deg, #ffffff 0%, #fafafa 100%);
        }

        .as-emp-avatar {
          width: 52px;
          height: 52px;
          border-radius: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #ffffff;
          font-weight: 700;
          font-size: 1.15rem;
          letter-spacing: -0.02em;
          box-shadow: 0 4px 10px rgba(0, 0, 0, 0.12);
          flex-shrink: 0;
          position: relative;
        }

        .as-emp-details {
          flex: 1;
          min-width: 0;
        }

        .as-emp-name-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.5rem;
        }

        .as-emp-name {
          font-size: 1.05rem;
          font-weight: 700;
          color: #111827;
          line-height: 1.3;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .as-emp-email-wrap {
          display: flex;
          align-items: center;
          gap: 0.35rem;
          margin-top: 2px;
        }

        .as-emp-email {
          font-size: 0.8125rem;
          color: #6b7280;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .as-copy-btn {
          border: none;
          background: transparent;
          color: #9ca3af;
          cursor: pointer;
          padding: 2px;
          border-radius: 4px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          transition: color 0.15s, background 0.15s;
        }

        .as-copy-btn:hover {
          color: #a31555;
          background: #fbeef4;
        }

        .as-emp-badges {
          display: flex;
          flex-wrap: wrap;
          gap: 0.35rem;
          margin-top: 0.6rem;
        }

        .as-pill {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          padding: 2px 8px;
          border-radius: 999px;
          font-size: 0.725rem;
          font-weight: 600;
          line-height: 1.4;
        }

        .as-pill--dept { background: #f3f4f6; color: #4b5563; }
        .as-pill--employee { background: #fbeef4; color: #a31555; }
        .as-pill--trainer { background: #fffbeb; color: #b45309; }
        .as-pill--admin { background: #fef2f2; color: #b91c1c; }
        .as-pill--team_leader { background: #eff6ff; color: #1d4ed8; }

        /* Card Section: Assigned Courses */
        .as-emp-body {
          padding: 1rem 1.25rem;
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 0.85rem;
        }

        .as-section-hdr {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 0.785rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: #6b7280;
        }

        .as-course-chips {
          display: flex;
          flex-direction: column;
          gap: 0.6rem;
        }

        .as-course-chip {
          background: #f9fafb;
          border: 1px solid #e5e7eb;
          border-radius: 10px;
          padding: 0.65rem 0.85rem;
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
          transition: border-color 0.15s ease, background 0.15s ease;
        }

        .as-course-chip:hover {
          background: #ffffff;
          border-color: #cbd5e1;
        }

        .as-course-chip-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.5rem;
        }

        .as-course-title-lbl {
          font-size: 0.85rem;
          font-weight: 600;
          color: #1f2937;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .as-unassign-btn {
          border: none;
          background: transparent;
          color: #9ca3af;
          cursor: pointer;
          border-radius: 4px;
          padding: 2px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          transition: all 0.15s ease;
        }

        .as-unassign-btn:hover {
          color: #dc2626;
          background: #fef2f2;
        }

        .as-mini-progress-bg {
          height: 5px;
          width: 100%;
          background: #e5e7eb;
          border-radius: 999px;
          overflow: hidden;
        }

        .as-mini-progress-fill {
          height: 100%;
          border-radius: 999px;
          background: linear-gradient(90deg, #a31555 0%, #f43f5e 100%);
          transition: width 0.4s ease;
        }

        .as-mini-progress-fill--completed {
          background: linear-gradient(90deg, #10b981 0%, #059669 100%);
        }

        .as-chip-foot {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 0.725rem;
          color: #6b7280;
        }

        .as-empty-courses {
          padding: 1.25rem 1rem;
          text-align: center;
          border: 1px dashed #d1d5db;
          border-radius: 10px;
          background: #fafafa;
          color: #6b7280;
          font-size: 0.8125rem;
        }

        /* Quick Course Selector in Card */
        .as-quick-assign-row {
          display: flex;
          gap: 0.5rem;
          margin-top: 0.25rem;
        }

        .as-card-foot {
          padding: 0.85rem 1.25rem;
          background: #f9fafb;
          border-top: 1px solid #f3f4f6;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.5rem;
        }

        .as-footer-btn {
          font-size: 0.8125rem;
          font-weight: 600;
          color: #4b5563;
          background: #ffffff;
          border: 1px solid #d1d5db;
          border-radius: 8px;
          padding: 0.4rem 0.75rem;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          transition: all 0.15s ease;
        }

        .as-footer-btn:hover {
          background: #fbeef4;
          border-color: #a31555;
          color: #a31555;
        }

        .as-footer-btn--primary {
          background: #a31555;
          color: #ffffff;
          border-color: #a31555;
        }

        .as-footer-btn--primary:hover {
          background: #85104a;
          color: #ffffff;
        }

        /* Modal Styles */
        .as-assign-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(17, 24, 39, 0.55);
          backdrop-filter: blur(4px);
          z-index: 999;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1.5rem;
          animation: fadeIn 0.2s ease;
        }

        .as-assign-modal {
          background: #ffffff;
          border-radius: 18px;
          width: 100%;
          max-width: 640px;
          max-height: 85vh;
          display: flex;
          flex-direction: column;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
          overflow: hidden;
          animation: scaleUp 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .as-modal-hdr {
          padding: 1.25rem 1.5rem;
          border-bottom: 1px solid #e5e7eb;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .as-modal-body {
          padding: 1.25rem 1.5rem;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .as-modal-course-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.85rem 1rem;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          background: #ffffff;
          transition: border-color 0.15s, background 0.15s;
        }

        .as-modal-course-item:hover {
          border-color: #a31555;
          background: #fcf6f9;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scaleUp {
          from { opacity: 0; transform: scale(0.96); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>

      {activeAssignment && (
        <LoadingModal
          type="academy"
          variant="modal"
          message={`${activeAssignment.action === 'assign' ? 'Assigning' : 'Unassigning'} "${activeAssignment.courseTitle}" for ${activeAssignment.userName}...`}
        />
      )}

      {/* 1. TOP METRICS DASHBOARD */}
      <div className="as-metrics-grid">
        <div className="as-metric-card">
          <div className="as-metric-icon as-metric-icon--primary">
            <UserCheck size={22} />
          </div>
          <div>
            <div className="as-metric-val">{totalEmployeesCount}</div>
            <div className="as-metric-lbl">Total Employees</div>
          </div>
        </div>

        <div className="as-metric-card">
          <div className="as-metric-icon as-metric-icon--info">
            <BookOpen size={22} />
          </div>
          <div>
            <div className="as-metric-val">{aggregateAssignedCourses}</div>
            <div className="as-metric-lbl">Active Enrollments</div>
          </div>
        </div>

        <div className="as-metric-card">
          <div className="as-metric-icon as-metric-icon--success">
            <CheckCircle2 size={22} />
          </div>
          <div>
            <div className="as-metric-val">{aggregateCompletedCourses}</div>
            <div className="as-metric-lbl">Completed Courses</div>
          </div>
        </div>

        <div className="as-metric-card">
          <div className="as-metric-icon as-metric-icon--warning">
            <TrendingUp size={22} />
          </div>
          <div>
            <div className="as-metric-val">{globalAvgProgress}%</div>
            <div className="as-metric-lbl">Avg Completion Rate</div>
          </div>
        </div>
      </div>

      {/* 2. CONTROLS & FILTER TOOLBAR */}
      <div className="as-controls-card">
        <div className="as-controls-left">
          <div className="as-search" style={{ maxWidth: '260px' }}>
            <Search size={15} />
            <input
              type="text"
              className="as-input"
              placeholder="Search employee or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <select
            className="as-filter-select"
            value={selectedDept}
            onChange={(e) => setSelectedDept(e.target.value)}
          >
            <option value="all">All Departments</option>
            {deptList.map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>

          <select
            className="as-filter-select"
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value)}
          >
            <option value="all">All Roles</option>
            <option value="employee">Employee</option>
            <option value="trainer">Trainer</option>
            <option value="team_leader">Team Leader</option>
            <option value="admin">Administrator</option>
          </select>

          <select
            className="as-filter-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
          >
            <option value="all">All Statuses</option>
            <option value="assigned">Has Enrolled Courses</option>
            <option value="unassigned">Needs Courses</option>
            <option value="completed">All Courses Completed</option>
          </select>
        </div>

        <div className="as-controls-right">
          <button
            className={`as-view-btn ${viewMode === 'grid' ? 'is-active' : ''}`}
            onClick={() => setViewMode('grid')}
            title="Interactive Grid Cards View"
            aria-label="Grid View"
          >
            <LayoutGrid size={18} />
          </button>
          <button
            className={`as-view-btn ${viewMode === 'table' ? 'is-active' : ''}`}
            onClick={() => setViewMode('table')}
            title="Compact Table View"
            aria-label="Table View"
          >
            <List size={18} />
          </button>
        </div>
      </div>

      {/* 3. INTERACTIVE CARDS GRID VIEW */}
      {viewMode === 'grid' && (
        <div className="as-employee-grid">
          {filteredUsers.map(user => {
            const info = getUserAssignmentsInfo(user);
            const isNudged = nudgedUsers[user.email];

            return (
              <div className="as-emp-card" key={user.email}>
                {/* Employee Card Header */}
                <div className="as-emp-head">
                  <div
                    className="as-emp-avatar"
                    style={{ background: getAvatarGradient(user.name) }}
                  >
                    {getInitials(user.name)}
                  </div>

                  <div className="as-emp-details">
                    <div className="as-emp-name-row">
                      <h4 className="as-emp-name" title={user.name}>{user.name}</h4>
                    </div>

                    <div className="as-emp-email-wrap">
                      <span className="as-emp-email">{user.email}</span>
                      <button
                        className="as-copy-btn"
                        onClick={() => handleCopyEmail(user.email)}
                        title="Copy Email"
                      >
                        {copiedEmail === user.email ? <Check size={12} style={{ color: '#10b981' }} /> : <Copy size={12} />}
                      </button>
                    </div>

                    <div className="as-emp-badges">
                      <span className={`as-pill as-pill--${user.role}`}>
                        {roleLabel[user.role] || user.role}
                      </span>
                      <span className="as-pill as-pill--dept">
                        {user.department || 'General'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card Body: Enrolled Courses */}
                <div className="as-emp-body">
                  <div className="as-section-hdr">
                    <span>Assigned Courses ({info.totalAssigned})</span>
                    {info.totalAssigned > 0 && (
                      <span style={{ color: info.avgProgress === 100 ? '#10b981' : '#a31555' }}>
                        {info.avgProgress}% Overall
                      </span>
                    )}
                  </div>

                  {info.assigned.length > 0 ? (
                    <div className="as-course-chips">
                      {info.assigned.map(({ course, progressPercent, isCompleted }) => {
                        const lockKey = `${user.email}-${course.id}`;
                        const isProcessing = assigningMap[lockKey];

                        return (
                          <div className="as-course-chip" key={course.id}>
                            <div className="as-course-chip-top">
                              <div className="as-course-title-lbl" title={course.title}>
                                <span style={{ fontWeight: 700, color: '#a31555', marginRight: '4px' }}>
                                  {course.code || 'CRS'}:
                                </span>
                                {course.title}
                              </div>
                              <button
                                className="as-unassign-btn"
                                disabled={isProcessing}
                                onClick={() => onToggleCourseAssignment(course.id, user.email)}
                                title={`Unassign ${course.title}`}
                              >
                                {isProcessing ? <RotateCcw size={14} className="animate-spin" /> : <X size={14} />}
                              </button>
                            </div>

                            <div className="as-mini-progress-bg">
                              <div
                                className={`as-mini-progress-fill ${isCompleted ? 'as-mini-progress-fill--completed' : ''}`}
                                style={{ width: `${progressPercent}%` }}
                              />
                            </div>

                            <div className="as-chip-foot">
                              <span>
                                {isCompleted ? (
                                  <span style={{ color: '#10b981', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                    <CheckCircle2 size={12} /> Completed
                                  </span>
                                ) : progressPercent > 0 ? (
                                  <span style={{ color: '#d97706', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                    <Clock size={12} /> In Progress ({progressPercent}%)
                                  </span>
                                ) : (
                                  <span>Pending Start</span>
                                )}
                              </span>
                              <span>{course.lessons?.length || 0} Lessons</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="as-empty-courses">
                      No active courses assigned yet. Select a course below to enroll.
                    </div>
                  )}

                  {/* Inline Quick Enroll Selector */}
                  <div className="as-quick-assign-row">
                    <select
                      className="as-select"
                      aria-label={`Enroll ${user.name} in a course`}
                      defaultValue=""
                      onChange={async (e) => {
                        const courseId = e.target.value;
                        if (courseId) {
                          await onToggleCourseAssignment(courseId, user.email);
                          e.target.value = '';
                        }
                      }}
                    >
                      <option value="">+ Enroll in a course...</option>
                      {courses.map(c => {
                        const isAlreadyAssigned = info.assigned.some(a => a.course.id === c.id);
                        return (
                          <option key={c.id} value={c.id}>
                            {isAlreadyAssigned ? '✓ ' : ''}{c.code}: {c.title}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                </div>

                {/* Card Footer Actions */}
                <div className="as-card-foot">
                  <button
                    className="as-footer-btn"
                    onClick={() => setQuickEnrollUser(user)}
                  >
                    <Plus size={14} /> Quick Catalog
                  </button>

                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <button
                      className="as-footer-btn"
                      onClick={() => handleNudge(user.email)}
                      title="Send learning reminder"
                    >
                      {isNudged ? <Check size={14} style={{ color: '#10b981' }} /> : <Send size={14} />}
                      {isNudged ? 'Nudged!' : 'Nudge'}
                    </button>

                    <button
                      className="as-footer-btn as-footer-btn--primary"
                      onClick={() => setViewDetailsUser(user)}
                      title="View Progress Details"
                    >
                      Details <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {filteredUsers.length === 0 && (
            <div
              className="as-card"
              style={{
                gridColumn: '1 / -1',
                padding: '3rem 2rem',
                textAlign: 'center',
                color: '#6b7280'
              }}
            >
              <AlertCircle size={36} style={{ color: '#9ca3af', margin: '0 auto 0.75rem' }} />
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#111827' }}>No accounts found</h3>
              <p style={{ fontSize: '0.875rem', marginTop: '0.25rem' }}>
                Try adjusting your search keywords or filter criteria.
              </p>
            </div>
          )}
        </div>
      )}

      {/* 4. COMPACT TABLE VIEW */}
      {viewMode === 'table' && (
        <div className="as-card">
          <div className="as-table-wrap">
            <table className="as-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Department</th>
                  <th>Role</th>
                  <th>Assigned Courses & Progress</th>
                  <th className="as-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map(user => {
                  const info = getUserAssignmentsInfo(user);
                  return (
                    <tr key={user.email}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <div
                            className="as-emp-avatar"
                            style={{
                              width: '36px',
                              height: '36px',
                              fontSize: '0.85rem',
                              borderRadius: '10px',
                              background: getAvatarGradient(user.name)
                            }}
                          >
                            {getInitials(user.name)}
                          </div>
                          <div>
                            <div className="as-cell-name">{user.name}</div>
                            <div className="as-cell-sub">{user.email}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="as-badge">{user.department || 'General'}</span>
                      </td>
                      <td>
                        <span className={`as-badge as-badge--${user.role}`}>
                          {roleLabel[user.role] || user.role}
                        </span>
                      </td>
                      <td>
                        {info.assigned.length > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', maxWidth: '320px' }}>
                            {info.assigned.map(({ course, progressPercent, isCompleted }) => (
                              <div
                                key={course.id}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  gap: '0.5rem',
                                  fontSize: '0.785rem',
                                  background: '#f9fafb',
                                  padding: '3px 8px',
                                  borderRadius: '6px',
                                  border: '1px solid #e5e7eb'
                                }}
                              >
                                <span style={{ fontWeight: 600, color: '#1f2937', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {course.code}: {course.title}
                                </span>
                                <span style={{ fontWeight: 700, color: isCompleted ? '#10b981' : '#a31555' }}>
                                  {progressPercent}%
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="as-cell-sub">No courses assigned</span>
                        )}
                      </td>
                      <td className="as-right">
                        <div style={{ display: 'inline-flex', gap: '0.5rem' }}>
                          <select
                            className="as-select as-select--inline"
                            aria-label={`Enroll ${user.name} in a course`}
                            defaultValue=""
                            onChange={async (e) => {
                              const selectedCourseId = e.target.value;
                              if (selectedCourseId) {
                                await onToggleCourseAssignment(selectedCourseId, user.email);
                                e.target.value = '';
                              }
                            }}
                          >
                            <option value="">Enroll course…</option>
                            {courses.map(c => (
                              <option key={c.id} value={c.id}>{c.code}: {c.title}</option>
                            ))}
                          </select>
                          <button
                            className="as-footer-btn"
                            onClick={() => setQuickEnrollUser(user)}
                            title="Catalog Modal"
                          >
                            Catalog
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredUsers.length === 0 && (
                  <tr>
                    <td colSpan={5} className="as-center as-cell-sub" style={{ padding: '2.5rem' }}>
                      No accounts match your search criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 5. MODAL: QUICK CATALOG ENROLLMENT FOR SPECIFIC EMPLOYEE */}
      {quickEnrollUser && (
        <div className="as-assign-backdrop" onClick={() => setQuickEnrollUser(null)}>
          <div className="as-assign-modal" onClick={(e) => e.stopPropagation()}>
            <div className="as-modal-hdr">
              <div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#111827' }}>
                  Course Catalog for {quickEnrollUser.name}
                </h3>
                <p style={{ fontSize: '0.8125rem', color: '#6b7280', marginTop: '2px' }}>
                  Click any course to immediately assign or unassign it for this employee.
                </p>
              </div>
              <button className="as-icon-btn" onClick={() => setQuickEnrollUser(null)}>
                <X size={18} />
              </button>
            </div>

            <div className="as-modal-body">
              <div className="as-search" style={{ maxWidth: '100%' }}>
                <Search size={15} />
                <input
                  type="text"
                  className="as-input"
                  placeholder="Filter available courses..."
                  value={modalCourseSearch}
                  onChange={(e) => setModalCourseSearch(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                {courses
                  .filter(c => q(c.title).includes(q(modalCourseSearch)) || q(c.code || '').includes(q(modalCourseSearch)))
                  .map(course => {
                    const info = getUserAssignmentsInfo(quickEnrollUser);
                    const isEnrolled = info.assigned.some(a => a.course.id === course.id);
                    const lockKey = `${quickEnrollUser.email}-${course.id}`;
                    const isProcessing = assigningMap[lockKey];

                    return (
                      <div className="as-modal-course-item" key={course.id}>
                        <div style={{ flex: 1, minWidth: 0, paddingRight: '1rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontWeight: 700, color: '#a31555', fontSize: '0.85rem' }}>
                              {course.code || 'CRS'}
                            </span>
                            <span className="as-badge">{course.category}</span>
                            {course.level && (
                              <span className="as-badge">{course.level}</span>
                            )}
                          </div>
                          <div style={{ fontWeight: 600, color: '#111827', fontSize: '0.95rem', marginTop: '2px' }}>
                            {course.title}
                          </div>
                          <div style={{ fontSize: '0.785rem', color: '#6b7280', marginTop: '2px' }}>
                            {course.lessons?.length || 0} Lessons • {course.quiz?.length || 0} Quiz Questions
                          </div>
                        </div>

                        <button
                          className={`as-btn ${isEnrolled ? 'as-btn--secondary' : 'as-btn--primary'}`}
                          disabled={isProcessing}
                          onClick={() => onToggleCourseAssignment(course.id, quickEnrollUser.email)}
                          style={{ minWidth: '105px' }}
                        >
                          {isProcessing ? (
                            <RotateCcw size={14} className="animate-spin" />
                          ) : isEnrolled ? (
                            <>
                              <Check size={14} style={{ color: '#10b981' }} /> Enrolled
                            </>
                          ) : (
                            <>
                              <Plus size={14} /> Enroll
                            </>
                          )}
                        </button>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 6. MODAL: EMPLOYEE PROGRESS & DETAILS */}
      {viewDetailsUser && (() => {
        const info = getUserAssignmentsInfo(viewDetailsUser);

        return (
          <div className="as-assign-backdrop" onClick={() => setViewDetailsUser(null)}>
            <div className="as-assign-modal" onClick={(e) => e.stopPropagation()}>
              <div className="as-modal-hdr">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                  <div
                    className="as-emp-avatar"
                    style={{
                      width: '44px',
                      height: '44px',
                      fontSize: '1rem',
                      borderRadius: '12px',
                      background: getAvatarGradient(viewDetailsUser.name)
                    }}
                  >
                    {getInitials(viewDetailsUser.name)}
                  </div>
                  <div>
                    <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#111827' }}>
                      {viewDetailsUser.name}
                    </h3>
                    <p style={{ fontSize: '0.8125rem', color: '#6b7280' }}>
                      {viewDetailsUser.email} • {viewDetailsUser.department || 'General'}
                    </p>
                  </div>
                </div>
                <button className="as-icon-btn" onClick={() => setViewDetailsUser(null)}>
                  <X size={18} />
                </button>
              </div>

              <div className="as-modal-body">
                {/* Employee Stats Overview */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', background: '#f9fafb', padding: '1rem', borderRadius: '12px', border: '1px solid #e5e7eb' }}>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 600 }}>ENROLLED COURSES</div>
                    <div style={{ fontSize: '1.35rem', fontWeight: 700, color: '#111827', marginTop: '2px' }}>{info.totalAssigned}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 600 }}>COMPLETED</div>
                    <div style={{ fontSize: '1.35rem', fontWeight: 700, color: '#10b981', marginTop: '2px' }}>{info.completedCount}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 600 }}>AVG PROGRESS</div>
                    <div style={{ fontSize: '1.35rem', fontWeight: 700, color: '#a31555', marginTop: '2px' }}>{info.avgProgress}%</div>
                  </div>
                </div>

                <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#374151', marginTop: '0.5rem' }}>
                  Detailed Course Progress
                </h4>

                {info.assigned.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {info.assigned.map(({ course, prog, progressPercent, isCompleted }) => (
                      <div key={course.id} style={{ border: '1px solid #e5e7eb', borderRadius: '12px', padding: '1rem', background: '#ffffff' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <span style={{ fontWeight: 700, color: '#a31555', fontSize: '0.85rem' }}>{course.code}: </span>
                            <span style={{ fontWeight: 600, color: '#111827' }}>{course.title}</span>
                          </div>
                          <span style={{ fontWeight: 700, color: isCompleted ? '#10b981' : '#a31555' }}>
                            {progressPercent}% Complete
                          </span>
                        </div>

                        <div className="as-mini-progress-bg" style={{ marginTop: '0.6rem', height: '6px' }}>
                          <div
                            className={`as-mini-progress-fill ${isCompleted ? 'as-mini-progress-fill--completed' : ''}`}
                            style={{ width: `${progressPercent}%` }}
                          />
                        </div>

                        <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.6rem', fontSize: '0.785rem', color: '#6b7280' }}>
                          <span>Completed Lessons: {prog?.completedLessons?.length || 0} / {course.lessons?.length || 0}</span>
                          {prog?.quizScore !== undefined && (
                            <span>Quiz Score: <strong>{prog.quizScore}%</strong></span>
                          )}
                          {prog?.learningHours !== undefined && (
                            <span>Learning Hours: <strong>{prog.learningHours}h</strong></span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="as-empty-courses">
                    This employee currently has no courses assigned.
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
