import { formatCertificateIssueDate } from '../../services/certificateDate';
import React from 'react';
import {
  Award,
  Clock,
  Zap,
  BookOpen,
  Search,
  Flame
} from 'lucide-react';
import type { UserSessionData } from '../../services/auth';
import type { Course, DatabaseUser, UserProgress } from '../../services/db';
import { CourseBannerHeader } from '../courses/CourseCard';
import { isCourseAssigned } from '../../services/courseAccess';
import { dashboardLearningStats } from '../../services/dashboardLearningStats';
import { AssignedLearningPaths } from '../courses/AssignedLearningPaths';
import { RecommendedCourses } from './RecommendedCourses';
import { loadLearningStreak } from '../../services/learningStreak';

export interface KorunaAcademyDashboardProps {
  view?: 'dashboard' | 'my_courses';
  userSession: UserSessionData;
  courses: Course[];
  users: DatabaseUser[];
  userProgress: UserProgress[];
  onStartStudy: (course: Course, applicationId?: number) => void;
  onTabChange: (tab: string) => void;
  searchQuery?: string;
  setSearchQuery?: (q: string) => void;
}

export const KorunaAcademyDashboard: React.FC<KorunaAcademyDashboardProps> = ({
  view = 'dashboard',
  userSession,
  courses,
  users,
  userProgress,
  onStartStudy,
  onTabChange,
  searchQuery = '',
  setSearchQuery
}) => {
  const userName = userSession.name || 'Jessica Timon';
  const [completionFilter, setCompletionFilter] = React.useState<'all' | 'incomplete' | 'completed'>('all');
  const [streak,setStreak] = React.useState<number | null>(null);
  React.useEffect(() => {
    let active = true;
    setStreak(null);
    loadLearningStreak().then(value => { if (active) setStreak(value); }).catch(() => { if (active) setStreak(null); });
    return () => { active = false; };
  },[userSession.id,userProgress]);


  // Continue Learning must show a course the signed-in learner actually opened.
  // Do not fall back to assigned or catalogue courses: those have not necessarily
  // been started by this learner.
  const currentUserEmail = (userSession?.email || '').trim().toLowerCase();

  // Find user progress entries ONLY for courses that actually exist in courses array
  // and ONLY for the logged-in user
  const account = users.find(user => user.email.trim().toLowerCase() === currentUserEmail);
  const { userProgress: userProgs, earnedCourses, overallProgress } = dashboardLearningStats(
    courses, userProgress, currentUserEmail,
    [userSession.id || '', account?.id || '', String(account?.userId || '')],
  );

  const recentUndoneProgress = userProgs
    .filter((progress) => {
      if (progress.progressPercent >= 100 || !progress.lastViewedAt) return false;
      return !Number.isNaN(new Date(progress.lastViewedAt).getTime());
    })
    .sort((a, b) => new Date(b.lastViewedAt!).getTime() - new Date(a.lastViewedAt!).getTime())
    .find((progress) => courses.some((course) => course.id === progress.courseId));
  const recentUndoneCourse = recentUndoneProgress
    ? courses.find((course) => course.id === recentUndoneProgress.courseId) || null
    : null;
  const recentCourseCreator = recentUndoneCourse?.createdBy
    ? users.find((user) =>
      user.id === recentUndoneCourse.createdBy ||
      user.email.toLowerCase() === recentUndoneCourse.createdBy!.toLowerCase()
    )
    : undefined;
  const recentCourseCreatorName = recentCourseCreator?.name || recentUndoneCourse?.trainer || 'Koruna Academy';


  // Calculate total user learning hours dynamically from stored database progress
  const totalUserLearningHours = userProgs.reduce((sum, p) => {
    if (p.learningHours !== undefined && p.learningHours !== null) {
      return sum + p.learningHours;
    }
    const course = courses.find(c => c.id === p.courseId);
    if (course && p.progressPercent > 0) {
      const courseTotalHours = course.lessons?.length ? Math.max(course.lessons.length * 0.5, 0.5) : 1.0;
      return sum + Number(((p.progressPercent / 100) * courseTotalHours).toFixed(1));
    }
    return sum;
  }, 0);

  const parseDateOnly = (value: string) => {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, (month || 1) - 1, day || 1);
  };

  const getStartOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

  const upcomingDeadlines = userProgs
    .filter((progress) => progress.dueDate && progress.progressPercent < 100)
    .map((progress) => {
      const course = courses.find((item) => item.id === progress.courseId);
      if (!course || !progress.dueDate) return null;

      const dueDate = parseDateOnly(progress.dueDate);
      const today = getStartOfDay(new Date());
      const daysUntilDue = Math.round((getStartOfDay(dueDate).getTime() - today.getTime()) / (24 * 60 * 60 * 1000));

      let status: 'overdue' | 'due_soon' | 'upcoming' = 'upcoming';
      if (daysUntilDue < 0) {
        status = 'overdue';
      } else if (daysUntilDue <= 3) {
        status = 'due_soon';
      }

      return { course, progress, dueDate, daysUntilDue, status };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
    .slice(0, 4);

  const formatDeadlineMeta = (daysUntilDue: number) => {
    const absDays = Math.abs(daysUntilDue);
    if (daysUntilDue < 0) return `Overdue by ${absDays} ${absDays === 1 ? 'day' : 'days'}`;
    if (daysUntilDue === 0) return 'Due today';
    if (daysUntilDue === 1) return 'Due tomorrow';
    return `Due in ${daysUntilDue} days`;
  };

  const deadlineBadgeStyle = (status: 'overdue' | 'due_soon' | 'upcoming') => {
    if (status === 'overdue') return { label: 'Overdue', backgroundColor: '#ffe4e6', color: '#e11d48' };
    if (status === 'due_soon') return { label: 'Due soon', backgroundColor: '#ffedd5', color: '#c2410c' };
    return { label: 'Upcoming', backgroundColor: '#cffaff', color: '#0891b2' };
  };

  const formatDueDate = (value?: string) => {
    if (!value) return null;
    return parseDateOnly(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const recentCertificates = earnedCourses
    .map((course) => {
      const progress = userProgs.filter(item => item.courseId === course.id && item.progressPercent >= 100)
        .sort((a, b) => new Date(b.completedAt || 0).getTime() - new Date(a.completedAt || 0).getTime())[0];
      const issuedAt = new Date(progress.completedAt || 0);
      const certificateId = `CERT-${course.id.toUpperCase()}-${progress.applicationId || issuedAt.getFullYear()}`;
      return { course, progress, issuedAt, certificateId };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .sort((a, b) => b.issuedAt.getTime() - a.issuedAt.getTime())
    .slice(0, 3);

  const renderAssignedCourses = (completion?: 'incomplete' | 'completed') => {
          // Only assignments belonging to the signed-in learner appear here.
          const assignedCourses = courses.filter((c) => {
            const prog = userProgress.find(
              (p) => p.courseId === c.id && (
                currentUserEmail && p.userEmail.toLowerCase().trim() === currentUserEmail
              )
            );

            const isAssigned = isCourseAssigned(c, [currentUserEmail, userSession.id || '', account?.id || '', String(account?.userId || '')], userProgs);
            const isComplete = !!prog && prog.progressPercent >= 100;
            if (completion === 'completed' && !isComplete) return false;
            if (completion === 'incomplete' && isComplete) return false;
            return isAssigned;
          });

          if (assignedCourses.length === 0) {
            return (
              <div style={{
                backgroundColor: '#ffffff',
                borderRadius: '16px',
                border: '1px dashed #cbd5e1',
                padding: '2.5rem 1.5rem',
                textAlign: 'center',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
              }}>
                <BookOpen size={32} style={{ color: '#be185d', marginBottom: '0.75rem', opacity: 0.6 }} />
                <h4 style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a', margin: '0 0 0.35rem 0' }}>
                  {completion === 'completed' ? 'No Completed Courses' : completion === 'incomplete' ? 'No Incomplete Courses' : 'No Assigned Courses'}
                </h4>
                <p style={{ fontSize: '0.85rem', color: '#64748b', margin: 0 }}>
                  {completion === 'completed' ? 'Your finished courses will appear here.' : completion === 'incomplete' ? 'You have no assigned courses left to finish.' : 'You currently have no courses assigned to you.'}
                </p>
              </div>
            );
          }

          return (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.25rem' }}>
              {(view === 'dashboard' ? assignedCourses.slice(0, 3) : assignedCourses).map((course) => {
                const prog = userProgress.find((p) => p.courseId === course.id && (currentUserEmail && p.userEmail.toLowerCase().trim() === currentUserEmail));
                const percent = prog ? prog.progressPercent : 0;
                const isStarted = percent > 0;
                const isComplete = percent >= 100;
                const dueDateText = formatDueDate(prog?.dueDate);

                return (
                  <div
                    key={course.id}
                    style={{
                      backgroundColor: '#ffffff',
                      borderRadius: '16px',
                      border: '1px solid #e2e8f0',
                      padding: '1.25rem',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                      display: 'flex',
                      flexDirection: 'column'
                    }}
                  >
                    <CourseBannerHeader
                      course={{ ...course, imageUrl: undefined }}
                      height="110px"
                      borderRadius="12px"
                      style={{ marginBottom: '1rem' }}
                    >
                      <span style={{ position: 'absolute', top: '0.65rem', left: '0.65rem', border: '1px solid #fda4af', color: '#be185d', backgroundColor: '#ffffff', fontSize: '0.65rem', fontWeight: 800, padding: '0.2rem 0.5rem', borderRadius: '4px', textTransform: 'uppercase' }}>
                        {course.level || 'INTERMEDIATE'}
                      </span>
                    </CourseBannerHeader>

                    <div style={{ marginBottom: '0.5rem' }}>
                      <span style={{ backgroundColor: '#fce7f3', color: '#be185d', fontSize: '0.68rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: '50px' }}>
                        {course.category || 'General'}
                      </span>
                    </div>

                    <h4 style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0f172a', margin: '0 0 0.85rem 0', lineHeight: 1.35, height: '2.7em', overflow: 'hidden' }}>
                      {course.title}
                    </h4>

                    {isComplete && (
                      <span style={{ alignSelf: 'flex-start', marginBottom: '0.85rem', padding: '0.25rem 0.6rem', borderRadius: '50px', backgroundColor: '#dcfce7', color: '#166534', fontSize: '0.75rem', fontWeight: 700 }}>
                        Completed
                      </span>
                    )}

                    {dueDateText && (
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: '0.75rem',
                          marginBottom: '1rem',
                          padding: '0.55rem 0.7rem',
                          borderRadius: '8px',
                          backgroundColor: prog?.overdue ? '#fef2f2' : '#f8fafc',
                          color: prog?.overdue ? '#b91c1c' : '#475569',
                          fontSize: '0.78rem'
                        }}
                      >
                        <span style={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          Due
                        </span>
                        <strong style={{ color: prog?.overdue ? '#b91c1c' : '#202124', fontWeight: 800 }}>
                          {dueDateText}
                        </strong>
                      </div>
                    )}

                    <div style={{ marginTop: 'auto' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                        <div style={{ flex: 1, height: '5px', backgroundColor: '#e2e8f0', borderRadius: '50px', overflow: 'hidden' }}>
                          <div style={{ width: `${percent}%`, height: '100%', backgroundColor: '#be185d', borderRadius: '50px' }} />
                        </div>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b' }}>{percent}%</span>
                      </div>

                      <button
                        onClick={() => {
                          onStartStudy(course, prog?.applicationId);
                        }}
                        style={{
                          width: '100%',
                          backgroundColor: isStarted ? '#be185d' : '#ffffff',
                          color: isStarted ? '#ffffff' : '#0f172a',
                          border: isStarted ? 'none' : '1px solid #cbd5e1',
                          borderRadius: '8px',
                          padding: '0.6rem 0',
                          fontSize: '0.85rem',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        {isComplete ? 'Review' : isStarted ? 'Continue' : 'Start'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          );

  };

  if (view === 'my_courses') {
    return (
      <div className="koruna-subview-wrapper">
        <h1>My Courses</h1>
        <p style={{ color: '#64748b', marginBottom: '1.5rem' }}>Your assigned courses, deadlines, and learning progress.</p>
        <div role="group" aria-label="Filter courses by completion" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.5rem' }}>
          {(['all', 'incomplete', 'completed'] as const).map(filter => (
            <button key={filter} type="button" className={completionFilter === filter ? 'btn-catalogue-action-solid' : 'btn-catalogue-action-outline'} aria-pressed={completionFilter === filter} onClick={() => setCompletionFilter(filter)}>
              {{ all: 'All Assigned', incomplete: 'To Do', completed: 'Completed' }[filter]}
            </button>
          ))}
        </div>
        {renderAssignedCourses(completionFilter === 'all' ? undefined : completionFilter)}
      </div>
    );
  }

  return (
    <div style={{ padding: '1.75rem 2rem 3rem 2rem', backgroundColor: '#f8fafc', minHeight: '100%' }}>
      {/* HEADER ROW */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.75rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.65rem', fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-0.02em' }}>
            Welcome back, {userName.split(' ')[0]}
          </h1>
          <p style={{ fontSize: '0.875rem', color: '#64748b', margin: '0.25rem 0 0 0', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            {streak === null ? 'Learning streak unavailable' : streak === 0 ? 'Start learning today to build your streak.' : <>You're on a <span style={{ color: '#be185d', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}><Flame size={15} fill="#be185d" /> {streak}-day</span> learning streak!</>}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ position: 'relative', minWidth: '320px' }}>
            <Search size={17} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input
              type="text"
              placeholder="Search courses, skills, certificates..."
              value={searchQuery}
              onChange={(e) => setSearchQuery?.(e.target.value)}
              style={{
                width: '100%',
                padding: '0.55rem 1rem 0.55rem 2.35rem',
                fontSize: '0.85rem',
                borderRadius: '50px',
                border: '1px solid #e2e8f0',
                backgroundColor: '#ffffff',
                outline: 'none',
                boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
              }}
            />
          </div>
        </div>
      </div>

      {/* STATS OVERVIEW CARDS ROW */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 0.8fr 0.9fr 0.8fr', gap: '1rem', marginBottom: '1.75rem' }}>
        {/* Card 1: OVERALL PROGRESS */}
        <div style={{
          backgroundColor: '#be185d',
          background: 'linear-gradient(135deg, #be185d 0%, #9d174d 100%)',
          borderRadius: '16px',
          padding: '1.25rem 1.5rem',
          color: '#ffffff',
          boxShadow: '0 4px 12px rgba(190, 24, 93, 0.25)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center'
        }}>
          <div style={{ fontSize: '2.5rem', fontWeight: 800, lineHeight: 1 }}>{overallProgress}%</div>
          <div style={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: '0.5rem', opacity: 0.9 }}>
            OVERALL PROGRESS
          </div>
        </div>

        {/* Card 2: CURRENT COURSE */}
        <div style={{
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          padding: '1.15rem 1.25rem',
          border: '1px solid #cbd5e1',
          boxShadow: '0 4px 16px rgba(15, 23, 42, 0.08), 0 1px 3px rgba(0,0,0,0.04)',
          display: 'flex',
          alignItems: 'center',
          gap: '1rem'
        }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '10px', backgroundColor: '#fce7f3', color: '#be185d', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <BookOpen size={22} />
          </div>
          <div style={{ overflow: 'hidden' }}>
            <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {recentUndoneCourse ? recentUndoneCourse.title : 'None'}
            </div>
            <div style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.06em', marginTop: '0.15rem' }}>
              CURRENT COURSE
            </div>
          </div>
        </div>

        {/* Card 3: CERTIFICATES */}
        <div style={{
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          padding: '1.15rem 1.25rem',
          border: '1px solid #cbd5e1',
          boxShadow: '0 4px 16px rgba(15, 23, 42, 0.08), 0 1px 3px rgba(0,0,0,0.04)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.85rem'
        }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '10px', backgroundColor: '#fce7f3', color: '#be185d', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Award size={22} />
          </div>
          <div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>{earnedCourses.length}</div>
            <div style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.06em', marginTop: '0.2rem' }}>
              CERTIFICATES
            </div>
          </div>
        </div>

        {/* Card 4: LEARNING HOURS */}
        <div style={{
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          padding: '1.15rem 1.25rem',
          border: '1px solid #cbd5e1',
          boxShadow: '0 4px 16px rgba(15, 23, 42, 0.08), 0 1px 3px rgba(0,0,0,0.04)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.85rem'
        }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '10px', backgroundColor: '#fce7f3', color: '#be185d', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Clock size={22} />
          </div>
          <div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>
              {totalUserLearningHours > 0 ? `${totalUserLearningHours.toFixed(1)}h` : '0.0h'}
            </div>
            <div style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.06em', marginTop: '0.2rem' }}>
              LEARNING HOURS
            </div>
          </div>
        </div>

        {/* Card 5: XP */}
        <div style={{
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          padding: '1.15rem 1.25rem',
          border: '1px solid #cbd5e1',
          boxShadow: '0 4px 16px rgba(15, 23, 42, 0.08), 0 1px 3px rgba(0,0,0,0.04)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.85rem'
        }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '10px', backgroundColor: '#fce7f3', color: '#be185d', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Zap size={22} />
          </div>
          <div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>3,240</div>
            <div style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.06em', marginTop: '0.2rem' }}>
              XP
            </div>
          </div>
        </div>
      </div>

      {/* CONTINUE LEARNING CARD */}
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', marginBottom: '1rem', letterSpacing: '-0.01em' }}>
          Continue Learning
        </h2>

        {recentUndoneCourse ? (
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            border: '1px solid #cbd5e1',
            padding: '1.25rem',
            boxShadow: '0 4px 16px rgba(15, 23, 42, 0.08), 0 1px 3px rgba(0,0,0,0.04)',
            display: 'flex',
            alignItems: 'center',
            gap: '1.5rem',
            flexWrap: 'wrap'
          }}>
            {/* Course color banner */}
            <CourseBannerHeader
              course={{ ...recentUndoneCourse, imageUrl: undefined }}
              height="85px"
              borderRadius="12px"
              style={{ width: '130px', flexShrink: 0 }}
            />

            {/* Details */}
            <div style={{ flex: 1, minWidth: '240px' }}>
              <span style={{
                backgroundColor: '#fef3c7',
                color: '#d97706',
                fontSize: '0.7rem',
                fontWeight: 700,
                padding: '0.2rem 0.6rem',
                borderRadius: '50px',
                display: 'inline-block',
                marginBottom: '0.4rem'
              }}>
                {recentUndoneProgress && recentUndoneProgress.progressPercent > 0 ? 'In Progress' : 'Not Started'}
              </span>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', margin: '0 0 0.5rem 0' }}>
                {recentUndoneCourse.title}
              </h3>

              {/* Progress bar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', maxWidth: '420px', marginBottom: '0.4rem' }}>
                <div style={{ flex: 1, height: '6px', backgroundColor: '#e2e8f0', borderRadius: '50px', overflow: 'hidden' }}>
                  <div style={{ width: `${recentUndoneProgress ? recentUndoneProgress.progressPercent : 0}%`, height: '100%', backgroundColor: '#be185d', borderRadius: '50px' }} />
                </div>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748b' }}>
                  {recentUndoneProgress ? recentUndoneProgress.progressPercent : 0}%
                </span>
              </div>

              <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                Created by: {recentCourseCreatorName}
              </div>
            </div>

            {/* Action Button */}
            <div>
              <button
                onClick={() => recentUndoneCourse && onStartStudy(recentUndoneCourse, recentUndoneProgress?.applicationId)}
                style={{
                  backgroundColor: '#be185d',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '10px',
                  padding: '0.75rem 1.5rem',
                  fontSize: '0.875rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(190, 24, 93, 0.25)',
                  transition: 'all 0.15s ease'
                }}
              >
                {recentUndoneProgress && recentUndoneProgress.progressPercent > 0 ? 'Continue Course' : 'Start Course'}
              </button>
            </div>
          </div>
        ) : (
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            border: '1px dashed #cbd5e1',
            padding: '2rem 1.5rem',
            textAlign: 'center',
            color: '#64748b'
          }}>
            <p style={{ margin: 0, fontWeight: 600, fontSize: '0.9rem' }}>
              Open a course to continue learning from where you left off.
            </p>
          </div>
        )}
      </div>

      {/* ASSIGNED COURSES SECTION */}
      <div style={{ marginBottom: '2.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-0.01em' }}>
            Assigned Courses
          </h2>
          <button
            onClick={() => onTabChange('my_courses')}
            style={{ border: 'none', background: 'none', color: '#be185d', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer' }}
          >
            View all
          </button>
        </div>

        {renderAssignedCourses('incomplete')}
      </div>

      <AssignedLearningPaths userSession={userSession} onOpen={() => onTabChange('learning_path')}/>

      {/* BOTTOM TWO-COLUMN LAYOUT */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem' }}>
        <RecommendedCourses userSession={userSession} courses={courses} users={users} progress={userProgress} onStartStudy={onStartStudy} onBrowse={() => onTabChange('catalog_courses')} />

        {/* RIGHT COLUMN: UPCOMING DEADLINES & RECENT CERTIFICATES */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Upcoming Deadlines */}
          <div style={{ backgroundColor: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a', margin: '0 0 1rem 0' }}>
              Upcoming Deadlines
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {upcomingDeadlines.length > 0 ? (
                upcomingDeadlines.map(({ course, progress, daysUntilDue, status }) => {
                  const badge = deadlineBadgeStyle(status);
                  return (
                    <button
                      key={`${course.id}-${progress.applicationId || progress.dueDate}`}
                      type="button"
                      onClick={() => onStartStudy(course, progress.applicationId)}
                      style={{
                        width: '100%',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        gap: '0.75rem',
                        border: 'none',
                        background: 'transparent',
                        padding: 0,
                        textAlign: 'left',
                        cursor: 'pointer'
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {course.title}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.1rem' }}>
                          {formatDeadlineMeta(daysUntilDue)} · {progress.progressPercent}% complete
                        </div>
                      </div>
                      <span style={{
                        backgroundColor: badge.backgroundColor,
                        color: badge.color,
                        fontSize: '0.65rem',
                        fontWeight: 700,
                        padding: '0.15rem 0.45rem',
                        borderRadius: '50px',
                        whiteSpace: 'nowrap',
                        flexShrink: 0
                      }}>
                        {badge.label}
                      </span>
                    </button>
                  );
                })
              ) : (
                <div style={{
                  border: '1px dashed #cbd5e1',
                  borderRadius: '12px',
                  padding: '1rem',
                  color: '#64748b',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  textAlign: 'center',
                  backgroundColor: '#f8fafc'
                }}>
                  No upcoming deadlines.
                </div>
              )}
            </div>
          </div>

          {/* Recent Certificates (Magenta card background) */}
          <div style={{
            backgroundColor: '#be185d',
            background: 'linear-gradient(135deg, #be185d 0%, #9d174d 100%)',
            borderRadius: '16px',
            padding: '1.25rem',
            color: '#ffffff',
            boxShadow: '0 4px 12px rgba(190, 24, 93, 0.25)'
          }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 800, margin: '0 0 1rem 0' }}>
              Recent Certificates
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {recentCertificates.length > 0 ? (
                recentCertificates.map(({ course, progress, certificateId }, index) => (
                  <button
                    key={certificateId}
                    type="button"
                    onClick={() => onTabChange('certificates')}
                    style={{
                      width: '100%',
                      border: 'none',
                      borderTop: index === 0 ? 'none' : '1px solid rgba(255,255,255,0.15)',
                      padding: index === 0 ? 0 : '0.65rem 0 0 0',
                      background: 'transparent',
                      color: '#ffffff',
                      textAlign: 'left',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem'
                    }}
                  >
                    <div style={{
                      width: '78px',
                      aspectRatio: '1.42 / 1',
                      borderRadius: '6px',
                      overflow: 'hidden',
                      backgroundColor: '#ffffff',
                      position: 'relative',
                      flexShrink: 0,
                      boxShadow: '0 6px 16px rgba(0,0,0,0.18)'
                    }}>
                      <img
                        src="/Certificate.png"
                        alt={`${course.title} certificate`}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                      />
                      <span style={{
                        position: 'absolute',
                        top: '33%',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        width: '68%',
                        color: '#b8185c',
                        background: '#ffffff',
                        fontSize: '0.24rem',
                        lineHeight: 1,
                        fontWeight: 800,
                        textAlign: 'center',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}>
                        {userName}
                      </span>
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {course.title}
                      </div>
                      <div style={{ fontSize: '0.75rem', opacity: 0.85, marginTop: '0.1rem' }}>
                        Issued {formatCertificateIssueDate(progress)}
                      </div>
                      <div style={{ fontSize: '0.65rem', opacity: 0.7, marginTop: '0.1rem', fontWeight: 700 }}>
                        {certificateId}
                      </div>
                    </div>
                  </button>
                ))
              ) : (
                <div style={{
                  border: '1px dashed rgba(255,255,255,0.35)',
                  borderRadius: '12px',
                  padding: '1rem',
                  textAlign: 'center',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  color: 'rgba(255,255,255,0.9)'
                }}>
                  No earned certificates yet.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
