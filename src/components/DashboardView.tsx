import React, { useState, useRef, useEffect } from 'react';
import {
  Award,
  LogOut,
  CheckCircle, Menu,
  Download,
  Folder,
  Grid2X2,
  List
} from 'lucide-react';
import type { UserSessionData, UserRole } from '../services/auth';
import { dbService, calculateCourseLearningHours, type Course, type Lesson, type QuizQuestion, type UserProgress, type Badge, type PracticalSubmission, type Department, type SystemSettings, type RolePermissions, type DatabaseUser, type Notification } from '../services/db';
import { AdminSuite } from './admin/AdminSuite';
import { LoadingModal } from './LoadingModal';
import { CourseStudyView } from './courses/CourseStudyView';
import { CourseCard } from './courses/CourseCard';
import { CertificateView } from './courses/CertificateView';
import { LearningPathView } from './courses/LearningPathView';
import { Sidebar } from './Sidebar';
import { Header, HeaderActions } from './Header';
import { UnderDevelopment } from './UnderDevelopment';
import { KorunaHomeView } from './koruna/KorunaHomeView';
import { KorunaAcademyDashboard } from './koruna/KorunaAcademyDashboard';
import { KnowledgeHubView } from './koruna/KnowledgeHubView';
import { can, canManageCourse, safeTab } from '../services/authorization';
import { learningPathService } from '../services/learningPaths';
import { missingPrerequisites } from '../services/learningPathRules';

interface DashboardViewProps {
  userSession: UserSessionData;
  activeTab: string;
  onTabChange: (tab: any) => void;
  onSignOut: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  userSession,
  activeTab: requestedTab,
  onTabChange,
  onSignOut
}) => {
  const activeTab = safeTab(userSession.role, requestedTab);
  // --- CORE SYSTEM STATE ---
  const [courses, setCourses] = useState<Course[]>([]);
  const [userProgress, setUserProgress] = useState<UserProgress[]>([]);
  const [teamProgress, setTeamProgress] = useState<Record<string, UserProgress[]>>({});
  const [, setBadges] = useState<Badge[]>([]);
  const [practicals, setPracticals] = useState<PracticalSubmission[]>([]);
  const [users, setUsers] = useState<DatabaseUser[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [settings, setSettings] = useState<SystemSettings>(dbService.getSettings());
  const [permissions, setPermissions] = useState<RolePermissions[]>(dbService.getPermissions());

  // --- UI INTERACTION STATE ---
  const [_showProfileMenu, setShowProfileMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [catalogueView, setCatalogueView] = useState<'grid' | 'list'>('grid');
  const [selectedCatalogueLob, setSelectedCatalogueLob] = useState('All');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);

  // Navigation & Sub-tabs
  const [activeInnerTab, setActiveInnerTabState] = useState<string>(() => {
    try {
      return localStorage.getItem('koruna_active_inner_tab') || 'overview';
    } catch (e) {
      return 'overview';
    }
  });

  const setActiveInnerTab = (tab: string) => {
    setActiveInnerTabState(tab);
    try {
      localStorage.setItem('koruna_active_inner_tab', tab);
    } catch (e) {
      // Ignore
    }
  };

  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isLoadingAcademy, setIsLoadingAcademy] = useState(false);
  const [completedCourseModal, setCompletedCourseModal] = useState<{ title: string } | null>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const notificationsMenuRef = useRef<HTMLDivElement>(null);

  const handleTabChange = (tab: any) => {
    const academyTabs = [
      'catalog',
      'catalog_courses',
      'learning_path',
      'progress',
      'certificates',
      'skills',
      'career_path'
    ];
    const isAcademyTab = academyTabs.includes(tab);
    const isCurrentAcademy = academyTabs.includes(activeTab);

    if (tab === 'catalog' || (isAcademyTab && !isCurrentAcademy)) {
      setIsLoadingAcademy(true);
      onTabChange(tab);
      setTimeout(() => {
        setIsLoadingAcademy(false);
      }, 1200);
    } else {
      onTabChange(tab);
    }
  };

  // Active Studying state
  const [studyingCourse, setStudyingCourseState] = useState<Course | null>(null);

  const setStudyingCourse = (course: Course | null) => {
    setStudyingCourseState(course);
    try {
      if (course) {
        localStorage.setItem('koruna_studying_course_id', course.id);
      } else {
        localStorage.removeItem('koruna_studying_course_id');
      }
    } catch (e) {
      // Ignore
    }
  };

  const [studyingAssignmentId, setStudyingAssignmentId] = useState<number | null>(null);
  const [activeLessonIdx, setActiveLessonIdx] = useState<number>(0);
  const [quizAnswers, setQuizAnswers] = useState<Record<number, number>>({});
  const [quizTextAnswers, setQuizTextAnswers] = useState<Record<number, string>>({});
  const [quizSubmitted, setQuizSubmitted] = useState<boolean>(false);
  const [quizScore, setQuizScore] = useState<number>(0);
  const [quizPassed, setQuizPassed] = useState<boolean>(false);
  const [practicalText, setPracticalText] = useState<string>('');

  // Certificate view state
  const [viewingCertificate, setViewingCertificate] = useState<{ course: Course; date: string; id: string } | null>(null);

  // Nudged tracker
  const [nudgedUsers, setNudgedUsers] = useState<Record<string, boolean>>({});

  // Trainer & Admin forms state
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);
  const [assignedUserEmails, setAssignedUserEmails] = useState<string[]>([]);
  const getDefaultAssignmentDueDate = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const [assignmentDueDate, setAssignmentDueDate] = useState<string>(() => getDefaultAssignmentDueDate());
  const [courseForm, setCourseForm] = useState({
    title: '',
    category: 'Mortgage',
    code: '',
    level: 'Beginner' as 'Beginner' | 'Intermediate' | 'Advanced',
    description: '',
    imgBg: '#e0f2fe',
    imageUrl: '',
    trainer: userSession.name || '',
    attachments: [] as { name: string; url: string; size: number }[],
    contentType: 'course' as 'course' | 'document',
    requiresCertification: true,
    documentContent: '',
    acknowledgmentText: 'I have read, understood, and agree to the policies and terms outlined in this document.'
  });
  const [courseLessons, setCourseLessons] = useState<(Omit<Lesson, 'id'> & { id?: string })[]>([
    { title: 'Lesson 1: Introduction', content: 'Enter lesson text here.' }
  ]);
  const [courseQuiz, setCourseQuiz] = useState<QuizQuestion[]>([]);
  const [courseModules, setCourseModules] = useState<{ id: string; title: string }[]>([
    { id: 'm1', title: 'Introduction' }
  ]);


  // Admin user form
  const [adminUserForm, setAdminUserForm] = useState({
    name: '',
    email: '',
    role: 'employee' as any,
    department: 'Software Engineering'
  });
  const [newDeptName, setNewDeptName] = useState('');

  // Auto-close profile and notification menus
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setShowProfileMenu(false);
      }
      if (notificationsMenuRef.current && !notificationsMenuRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch all states from dbService
  const loadPlatformData = async () => {
    try {
      const loadedCourses = await dbService.getCourses();
      const loadedProgress = await dbService.getUserProgress(userSession.email);
      const loadedBadges = await dbService.getUserBadges(userSession.email);
      const loadedPracticals = await dbService.getPracticalSubmissions();
      const loadedUsers = await dbService.getUsers();
      const loadedDeps = dbService.getDepartments();
      const loadedSettings = dbService.getSettings();
      const loadedPerms = dbService.getPermissions();
      const loadedNotifs = await dbService.getNotifications(userSession.email);

      setCourses(loadedCourses);
      setUserProgress(loadedProgress);
      setBadges(loadedBadges);
      setPracticals(loadedPracticals);
      setUsers(loadedUsers);
      setDepartments(loadedDeps);
      setSettings(loadedSettings);
      setPermissions(loadedPerms);
      setNotifications(loadedNotifs);

      try {
        const savedCourseId = localStorage.getItem('koruna_studying_course_id');
        if (savedCourseId) {
          const found = loadedCourses.find(c => c.id === savedCourseId);
          if (found) {
            setStudyingCourseState(found);
          }
        }
      } catch (e) { }

      const employees = loadedUsers.filter(u => Boolean(u.email));
      const teamProgMap: Record<string, UserProgress[]> = {};
      await Promise.all(
        employees.map(async (emp) => {
          const prog = await dbService.getUserProgress(emp.email);
          teamProgMap[emp.email.toLowerCase()] = prog;
        })
      );
      setTeamProgress(teamProgMap);
    } catch (error) {
      setCourses([]);
      setUsers([]);
      setPracticals([]);
      setTeamProgress({});
      setUserProgress([]);
      setNotifications([]);
      setToastMessage(error instanceof Error ? error.message : 'Unable to load authorized platform data.');
    }
  };

  useEffect(() => {
    loadPlatformData();

    // Subscribe to realtime course updates (Supabase Postgres Realtime + Cross-tab Pub/Sub)
    const unsubscribe = dbService.subscribeToCourses((updatedCourses) => {
      setCourses(updatedCourses);

      setStudyingCourseState((prev) => {
        if (!prev) return null;
        const matching = updatedCourses.find(c => c.id === prev.id);
        return matching || prev;
      });
    });

    return () => {
      unsubscribe();
    };
  }, [userSession.email]);

  // Toast notifier helper
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  };

  // --- NOTIFICATION HANDLERS ---
  const formatNotificationTime = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}h ago`;
      const diffDays = Math.floor(diffHours / 24);
      if (diffDays === 1) return 'Yesterday';
      if (diffDays < 7) return `${diffDays}d ago`;
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch (e) {
      return '';
    }
  };

  const handleNotificationClick = async (notif: Notification) => {
    if (!notif.isRead) {
      await dbService.markNotificationAsRead(notif.id);
      setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, isRead: true } : n));
    }
    setShowNotifications(false);

    if (notif.courseId) {
      const course = courses.find(c => c.id === notif.courseId);
      if (course) {
        setStudyingCourse(course);
        onTabChange('learning');
      }
    }
  };

  const handleMarkAllNotificationsAsRead = async () => {
    if (!notifications.some(n => !n.isRead)) return;
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    await dbService.markAllNotificationsAsRead(userSession.email);
  };

  const handleDeleteNotification = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await dbService.deleteNotification(id);
    setNotifications(prev => prev.filter(n => n.id !== id));
  };


  // Find dynamic permissions for current role
  const userPerms = permissions.find(p => p.role === userSession.role)?.permissions;

  // Custom mapping of role names
  const roleDisplayNames: Record<UserRole, string> = {
    employee: 'Employee',
    team_leader: 'Team Leader',
    trainer: 'Trainer',
    admin: 'Administrator'
  };

  // Initials generator
  const getUserInitials = (name: string) => {
    if (!name) return 'KU';
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };
  const userInitials = getUserInitials(userSession.name);

  const getCourseLob = (course: Course) => {
    const category = course.category.toLowerCase();
    if (category.includes('mortgage') || category.includes('loan processing')) return 'MB';
    if (category.includes('lending') || category.includes('financial product')) return 'FP';
    if (category.includes('onboarding') || category.includes('operation') || category.includes('ai') || category.includes('compliance') || category.includes('leadership') || category.includes('policy')) return 'General';
    return 'Other';
  };

  const catalogueLobs = ['All', ...Array.from(new Set(courses.map(getCourseLob))).sort((a, b) => {
    const order = ['MB', 'FP', 'General', 'Other'];
    return order.indexOf(a) - order.indexOf(b);
  })];

  // Filter catalog courses
  const filteredCourses = courses.filter(c =>
    c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.code.toLowerCase().includes(searchQuery.toLowerCase())
  ).filter(c => selectedCatalogueLob === 'All' || getCourseLob(c) === selectedCatalogueLob);

  const activeUserEmail = userSession.email.toLowerCase();
  const currentUserProgress = userProgress.filter((progress) => (
    !progress.userEmail || progress.userEmail.toLowerCase().trim() === activeUserEmail
  ));
  const assignedCourseCount = currentUserProgress.length;
  const completedProgress = currentUserProgress.filter((progress) => progress.progressPercent >= 100);
  const completedCourseCount = completedProgress.length;
  const overallProgressPercent = assignedCourseCount > 0
    ? Math.round(currentUserProgress.reduce((sum, progress) => sum + progress.progressPercent, 0) / assignedCourseCount)
    : 0;
  const currentYear = new Date().getFullYear();
  const certificateCount = completedProgress.filter((progress) => {
    const course = courses.find((item) => item.id === progress.courseId);
    if (course?.requiresCertification === false) return false;
    const issuedDateValue = progress.lastViewedAt || progress.dueDate;
    if (!issuedDateValue) return true;
    const issuedDate = new Date(issuedDateValue);
    return Number.isNaN(issuedDate.getTime()) || issuedDate.getFullYear() === currentYear;
  }).length;
  const learningHours = currentUserProgress.reduce((sum, progress) => {
    if (typeof progress.learningHours === 'number') return sum + progress.learningHours;
    const course = courses.find((item) => item.id === progress.courseId);
    if (!course || progress.progressPercent <= 0) return sum;
    const courseHours = course.lessons?.length ? Math.max(course.lessons.length * 0.5, 0.5) : 1;
    return sum + Number(((progress.progressPercent / 100) * courseHours).toFixed(1));
  }, 0);
  const learningHoursTarget = 80;
  const assignedCompletionPercent = assignedCourseCount > 0
    ? Math.round((completedCourseCount / assignedCourseCount) * 100)
    : 0;

  const getProgressCourse = (progress: UserProgress) => courses.find((course) => course.id === progress.courseId);
  const averageProgressScore = (matcher: (course: Course) => boolean) => {
    const matchedProgress = currentUserProgress.filter((progress) => {
      const course = getProgressCourse(progress);
      return course ? matcher(course) : false;
    });
    if (matchedProgress.length === 0) return 0;
    return Math.round(matchedProgress.reduce((sum, progress) => sum + progress.progressPercent, 0) / matchedProgress.length);
  };
  const textMatches = (course: Course, terms: string[]) => {
    const haystack = `${course.title} ${course.category} ${course.code} ${course.description}`.toLowerCase();
    return terms.some((term) => haystack.includes(term));
  };
  const skillScores = [
    {
      label: 'Mortgage Processing',
      percent: averageProgressScore((course) => textMatches(course, ['mortgage', 'loan', 'lending']))
    },
    {
      label: 'Client Communication',
      percent: averageProgressScore((course) => textMatches(course, ['client', 'communication', 'service', 'leadership']))
    },
    {
      label: 'Regulatory Compliance',
      percent: averageProgressScore((course) => textMatches(course, ['regulatory', 'compliance', 'policy', 'document']))
    },
    {
      label: 'AI',
      percent: averageProgressScore((course) => textMatches(course, ['ai', 'automation', 'technology', 'tech']))
    }
  ].map((skill) => ({
    ...skill,
    value: Math.round(skill.percent / 10)
  }));

  const monthFormatter = new Intl.DateTimeFormat('en-US', { month: 'short' });
  const monthStart = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);
  const currentMonthStart = monthStart(new Date());
  const monthlyActivity = Array.from({ length: 6 }, (_, index) => {
    const monthDate = new Date(currentMonthStart.getFullYear(), currentMonthStart.getMonth() - (5 - index), 1);
    const monthKey = `${monthDate.getFullYear()}-${monthDate.getMonth()}`;
    const activity = currentUserProgress.reduce((sum, progress) => {
      const activityDateValue = progress.lastViewedAt || progress.dueDate;
      if (!activityDateValue) return sum;
      const activityDate = new Date(activityDateValue);
      if (Number.isNaN(activityDate.getTime())) return sum;
      const progressMonthKey = `${activityDate.getFullYear()}-${activityDate.getMonth()}`;
      if (progressMonthKey !== monthKey) return sum;
      return sum + Math.max(progress.completedLessons.length, progress.progressPercent > 0 ? 1 : 0);
    }, 0);
    return {
      month: monthFormatter.format(monthDate),
      activity,
      active: monthKey === `${currentMonthStart.getFullYear()}-${currentMonthStart.getMonth()}`
    };
  });
  const maxMonthlyActivity = Math.max(...monthlyActivity.map((item) => item.activity), 1);
  const monthlyActivityBars = monthlyActivity.map((item) => ({
    ...item,
    height: item.activity > 0 ? Math.max(18, Math.round((item.activity / maxMonthlyActivity) * 92)) : 8
  }));

  // ==========================================
  // EMPLOYEE CAPABILITIES & EVENTS
  // ==========================================

  const handleStartStudy = async (course: Course, applicationId?: number) => {
    try {
      const progressList = await dbService.getUserProgress(userSession.email);
      const prerequisites = await learningPathService.prerequisites();
      const missing = missingPrerequisites(course.id,prerequisites,progressList);
      if (missing.length) {
        showToast(`Complete these courses first: ${missing.map(id => courses.find(c => c.id === id)?.title || id).join(', ')}.`);
        return;
      }
      const existing = progressList.find(p => p.courseId === course.id &&
        (applicationId === undefined || (p.applicationId || 0) === applicationId));
      const prog: UserProgress = existing || {
        userEmail: userSession.email.toLowerCase(), courseId: course.id,
        applicationId: applicationId || 0, progressPercent: 0, completedLessons: [],
        quizAttempts: 0, practicalStatus: 'none', overdue: false
      };
      prog.lastViewedAt = new Date().toISOString();
      await dbService.saveUserProgress(prog);
      await loadPlatformData();
      setStudyingCourse(course);
      setStudyingAssignmentId(prog.applicationId || 0);
      setActiveLessonIdx(-1);
      setQuizAnswers({});
      setQuizTextAnswers({});
      setQuizSubmitted(false);
      setPracticalText('');
    } catch (err) {
      console.error('Unable to start course:', err);
      showToast(err instanceof Error ? err.message : 'Unable to save course progress. Please try again.');
    }
  };

  const handleMarkLessonComplete = async (lessonId: string) => {
    if (!studyingCourse) return;
    const progressList = await dbService.getUserProgress(userSession.email);
    const prog = progressList.find(p => p.courseId === studyingCourse.id && (studyingAssignmentId === null || p.applicationId === studyingAssignmentId));
    if (!prog) throw new Error('Unable to find course progress. Please reopen the course.');
    if (prog) {
      if (!prog.completedLessons.includes(lessonId)) {
        prog.completedLessons.push(lessonId);
      }

      // Calculate progress: if course has a quiz, lessons = 70% and quiz = 30%. Otherwise lessons = 100%.
      const totalLessons = studyingCourse.lessons.length;
      const completedCount = prog.completedLessons.length;
      const hasQuiz = Boolean(studyingCourse.quiz && studyingCourse.quiz.length > 0);

      let calculatedProgress = 0;
      if (hasQuiz) {
        calculatedProgress = Math.round((completedCount / totalLessons) * 70);
        const threshold = settings.quizPassingThreshold;
        if (prog.quizScore && prog.quizScore >= threshold) {
          calculatedProgress += 30;
        }
      } else {
        calculatedProgress = Math.round((completedCount / totalLessons) * 100);
      }

      prog.progressPercent = Math.min(calculatedProgress, 100);
      prog.learningHours = calculateCourseLearningHours(studyingCourse, prog.progressPercent);

      await dbService.saveUserProgress(prog);
      await loadPlatformData();
      showToast(`Lesson completed: "${studyingCourse.lessons.find(l => l.id === lessonId)?.title}"`);
    }
  };

  const handleMarkCourseComplete = async (courseId?: string) => {
    try {
      const targetId = courseId || studyingCourse?.id;
      if (!targetId) return;
      const progressList = await dbService.getUserProgress(userSession.email);
      const prog = progressList.find(p => p.courseId === targetId && (studyingAssignmentId === null || p.applicationId === studyingAssignmentId));
      if (!prog) throw new Error('Unable to find course progress. Please reopen the course.');
      if (prog) {
        const c = studyingCourse || courses.find(item => item.id === targetId);
        const hasCourseActivity = prog.progressPercent > 0 ||
          prog.completedLessons.length > 0 ||
          prog.quizAttempts > 0 ||
          prog.quizScore !== undefined ||
          prog.practicalStatus !== 'none';

        if (c?.contentType !== 'document' && !hasCourseActivity) {
          throw new Error('Start the course before marking it as done.');
        }

        prog.progressPercent = 100;
        if (c) {
          prog.learningHours = calculateCourseLearningHours(c, 100);
        }
        await dbService.saveUserProgress(prog);
        await loadPlatformData();
        setCompletedCourseModal({ title: c?.title || 'Course' });
      }
    } catch (err) {
      showToast('Unable to complete course. Please check your progress and try again.');
      throw err;
    }
  };

  const handleQuizAnswer = (questionIdx: number, optionIdx: number) => {
    setQuizAnswers(prev => ({ ...prev, [questionIdx]: optionIdx }));
  };

  const handleQuizTextAnswer = (questionIdx: number, text: string) => {
    setQuizTextAnswers(prev => ({ ...prev, [questionIdx]: text }));
  };

  const handleQuizSubmit = async () => {
    if (!studyingCourse || !studyingCourse.quiz) return;

    let correctCount = 0;
    studyingCourse.quiz.forEach((q, idx) => {
      const qType = q.type || (q.options?.length === 2 && (q.options[0]?.toLowerCase() === 'true') ? 'true_false' : (!q.options || q.options.length === 0 || q.answerText) ? 'short_answer' : 'multiple_choice');

      if (qType === 'short_answer') {
        const userText = (quizTextAnswers[idx] || '').trim().toLowerCase();
        const keyText = (q.answerText || q.options?.[0] || '').trim().toLowerCase();
        if (userText && keyText && (userText === keyText || userText.includes(keyText) || keyText.includes(userText))) {
          correctCount++;
        }
      } else {
        if (quizAnswers[idx] === q.correctAnswer) {
          correctCount++;
        }
      }
    });

    const score = Math.round((correctCount / studyingCourse.quiz.length) * 100);
    const threshold = settings.quizPassingThreshold;
    const passed = score >= threshold;

    try {

      // Save progress
      const progressList = await dbService.getUserProgress(userSession.email);
      const prog = progressList.find(p => p.courseId === studyingCourse.id && (studyingAssignmentId === null || p.applicationId === studyingAssignmentId));
      if (!prog) throw new Error('Missing course progress');
      if (prog) {
        prog.quizAttempts += 1;
        prog.quizScore = Math.max(prog.quizScore || 0, score);

        // Re-calculate overall course progress percentage
        const totalLessons = studyingCourse.lessons.length;
        const completedCount = prog.completedLessons.length;
        let calculatedProgress = Math.round((completedCount / totalLessons) * 70);

        if (prog.quizScore >= threshold) {
          calculatedProgress += 30;
          // If there's no practical assessment required (default c2 compliance has none, c1 underwriting has one)
          if (studyingCourse.id === 'c2') {
            prog.progressPercent = 100;
          } else {
            prog.progressPercent = Math.min(calculatedProgress, 90); // Practical gets them to 100
          }
        } else {
          prog.progressPercent = Math.min(calculatedProgress, 70);
        }

        prog.learningHours = calculateCourseLearningHours(studyingCourse, prog.progressPercent);

        await dbService.saveUserProgress(prog);
        await loadPlatformData();
        setQuizScore(score);
        setQuizPassed(passed);
        setQuizSubmitted(true);
        showToast(`Quiz completed: Scored ${score}% (${passed ? 'PASSED' : 'FAILED'})`);
      }
    } catch (err) {
      console.error('Unable to save quiz:', err);
      showToast('Unable to save quiz results. Please try again.');
    }
  };

  const handlePracticalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studyingCourse || !practicalText.trim()) return;

    await dbService.submitPractical({
      userEmail: userSession.email,
      userName: userSession.name,
      courseId: studyingCourse.id,
      courseTitle: studyingCourse.title,
      submissionText: practicalText
    });

    showToast('Practical assessment submitted to your Team Leader for review!');
    setPracticalText('');
    await loadPlatformData();
  };

  const handleSignOutClick = () => {
    setShowProfileMenu(false);
    setIsMobileSidebarOpen(false);
    setShowSignOutConfirm(true);
  };


  // Get date and cert ID for earned certificates
  const getCertData = (courseId: string) => {
    return { date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }), id: `CERT-${courseId.toUpperCase()}-${Math.floor(10000 + Math.random() * 90000)}` };
  };

  // ==========================================
  // TEAM LEADER EVENTS
  // ==========================================

  const handleAssignCourse = async (courseId: string, email: string) => {
    if (!can(userSession.role, 'assignCourses')) { showToast('You do not have permission to assign courses.'); return; }
    const empProg = teamProgress[email.toLowerCase()] || [];
    const isCurrentlyAssigned = empProg.some(p => p.courseId === courseId && p.dueDate);
    const u = users.find(user => user.email === email);
    const c = courses.find(course => course.id === courseId);

    if (isCurrentlyAssigned) {
      await dbService.unassignCourseFromUser(courseId, email);
      showToast(`Unassigned "${c?.title || courseId}" from ${u?.name || email}`);
    } else {
      await dbService.assignCourseToUser(courseId, email, userSession.name);
      showToast(`Assigned "${c?.title || courseId}" to ${u?.name || email}`);
    }
    await loadPlatformData();
  };

  const handleReviewPractical = async (subId: string, status: 'approved' | 'rejected') => {
    if (!can(userSession.role, 'approveAssessments')) { showToast('You do not have permission to review assessments.'); return; }
    await dbService.reviewPractical(subId, status);
    const sub = practicals.find(p => p.id === subId);
    showToast(`Practical assessment by ${sub?.userName} has been ${status.toUpperCase()}`);
    await loadPlatformData();
  };

  const handleNudgeUser = (email: string, courseCode: string) => {
    setNudgedUsers(prev => ({ ...prev, [`${email}-${courseCode}`]: true }));
    showToast(`Sent urgent learning reminder nudge to ${email}!`);
  };

  // ==========================================
  // TRAINER EVENTS
  // ==========================================

  const handleSaveCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!can(userSession.role, 'editCourses') || (editingCourseId && !canManageCourse(userSession.role, userSession.id, courses.find(c => c.id === editingCourseId)?.createdBy))) {
      showToast('You do not have permission to edit this course.');
      return;
    }
    if (!courseForm.title || !courseForm.code) {
      alert('Course Title and Course Code are required.');
      return;
    }
    if (assignedUserEmails.length > 0 && !assignmentDueDate) {
      alert('Please choose an assignment deadline before publishing.');
      return;
    }

    const isDocument = courseForm.contentType === 'document';
    const lessonsWithIds: Lesson[] = isDocument
      ? [{
        id: courses.find(c => c.id === editingCourseId)?.lessons[0]?.id || crypto.randomUUID(),
        title: courseForm.title,
        content: courseForm.documentContent || courseForm.description || 'Document Acknowledgment Content',
        moduleId: 'm1',
        moduleTitle: 'Document'
      }]
      : courseLessons.map((l) => {
        const currentModule = courseModules.find(m => m.id === (l.moduleId || 'm1')) || courseModules[0] || { id: 'm1', title: 'Introduction' };
        return {
          ...l,
          id: l.id || crypto.randomUUID(),
          moduleId: currentModule.id,
          moduleTitle: currentModule.title
        };
      });

    let saved: Course;
    try {
      saved = await dbService.saveCourse({
        id: editingCourseId || `c-${Date.now()}`,
        createdBy: editingCourseId ? courses.find(c => c.id === editingCourseId)?.createdBy ?? null : userSession.id,
        title: courseForm.title,
        category: courseForm.category,
        rating: editingCourseId ? (courses.find(c => c.id === editingCourseId)?.rating || 4.5) : 4.5,
        code: courseForm.code,
        level: courseForm.level,
        description: courseForm.description,
        imgBg: courseForm.imgBg,
        imageUrl: courseForm.imageUrl,
        // The display trainer is set from the authenticated creator for new
        // courses.  A form value must not accidentally carry over another
        // user's name (for example, "Admin Francis").
        trainer: editingCourseId
          ? courses.find(c => c.id === editingCourseId)?.trainer || userSession.name || ''
          : userSession.name || '',
        lessons: lessonsWithIds,
        quiz: isDocument ? [] : courseQuiz,
        attachments: courseForm.attachments,
        contentType: courseForm.contentType,
        requiresCertification: courseForm.requiresCertification,
        documentContent: courseForm.documentContent,
        acknowledgmentText: courseForm.acknowledgmentText
      });

    } catch (error) { showToast(error instanceof Error ? error.message : 'Unable to save the course.'); return; }

    // Process assignments
    const employees = users.filter(u => Boolean(u.email));
    await Promise.all(
      employees.map(async (emp) => {
        const empProgList = await dbService.getUserProgress(emp.email);
        const prog = empProgList.find(p => p.courseId === saved.id);
        const shouldBeAssigned = assignedUserEmails.includes(emp.email);
        const isCurrentlyAssigned = !!(prog && prog.dueDate);

        if (shouldBeAssigned && !isCurrentlyAssigned) {
          await dbService.assignCourseToUser(saved.id, emp.email, userSession.name, assignmentDueDate);
        } else if (shouldBeAssigned && isCurrentlyAssigned && prog && prog.dueDate !== assignmentDueDate) {
          prog.dueDate = assignmentDueDate;
          prog.overdue = false;
          await dbService.saveManagedUserProgress(prog);
        } else if (!shouldBeAssigned && isCurrentlyAssigned) {
          await dbService.unassignCourseFromUser(saved.id, emp.email);
        }
      })
    );

    showToast(editingCourseId ? `Updated Content: "${saved.title}"` : `Created New Content: "${saved.title}"`);
    setEditingCourseId(null);
    setCourseForm({
      title: '',
      category: 'Mortgage',
      code: '',
      level: 'Beginner',
      description: '',
      imgBg: '#e0f2fe',
      imageUrl: '',
      trainer: userSession.name || '',
      attachments: [],
      contentType: 'course',
      requiresCertification: true,
      documentContent: '',
      acknowledgmentText: 'I have read, understood, and agree to the policies and terms outlined in this document.'
    });
    setCourseLessons([{ title: 'Lesson 1: Introduction', content: 'Enter lesson text here.', moduleId: 'm1', moduleTitle: 'Introduction' }]);
    setCourseQuiz([]);
    setCourseModules([{ id: 'm1', title: 'Introduction' }]);
    setAssignedUserEmails([]);
    setAssignmentDueDate(getDefaultAssignmentDueDate());

    await loadPlatformData();
  };

  const handleStartEditCourse = (course: Course) => {
    if (!canManageCourse(userSession.role, userSession.id, course.createdBy)) { showToast('You do not have permission to edit this course.'); return; }
    setEditingCourseId(course.id);
    setCourseForm({
      title: course.title,
      category: course.category,
      code: course.code,
      level: course.level,
      description: course.description,
      imgBg: course.imgBg,
      imageUrl: course.imageUrl || '',
      trainer: course.trainer || userSession.name || 'Koruna Academy Trainer',
      attachments: course.attachments || [],
      contentType: course.contentType || 'course',
      requiresCertification: course.requiresCertification !== undefined ? course.requiresCertification : true,
      documentContent: course.documentContent || '',
      acknowledgmentText: course.acknowledgmentText || 'I have read, understood, and agree to the policies and terms outlined in this document.'
    });
    setCourseLessons(course.lessons.map(l => ({ ...l })));
    setCourseQuiz(course.quiz || []);

    const existingModules: { id: string; title: string }[] = [];
    const seenModuleIds = new Set<string>();
    course.lessons.forEach(l => {
      const mid = l.moduleId || 'm1';
      const mtitle = l.moduleTitle || 'Introduction';
      if (!seenModuleIds.has(mid)) {
        seenModuleIds.add(mid);
        existingModules.push({ id: mid, title: mtitle });
      }
    });
    if (existingModules.length === 0) {
      existingModules.push({ id: 'm1', title: 'Introduction' });
    }
    setCourseModules(existingModules);


    // Find all users who are currently assigned this course
    const currentlyAssigned: string[] = [];
    const assignedDueDates: string[] = [];
    users.filter(u => Boolean(u.email)).forEach(emp => {
      const empProgList = teamProgress[emp.email.toLowerCase()] || [];
      const assignedProgress = empProgList.find(p => p.courseId === course.id && p.dueDate);
      if (assignedProgress) {
        currentlyAssigned.push(emp.email);
        if (assignedProgress.dueDate) {
          assignedDueDates.push(assignedProgress.dueDate);
        }
      }
    });
    setAssignedUserEmails(currentlyAssigned);
    setAssignmentDueDate(assignedDueDates.sort()[0] || getDefaultAssignmentDueDate());

    setActiveInnerTab('creator');
  };

  const handleDeleteCourse = async (id: string) => {
    if (!canManageCourse(userSession.role, userSession.id, courses.find(c => c.id === id)?.createdBy)) { showToast('You do not have permission to delete this course.'); return; }
    await dbService.deleteCourse(id);
    showToast('Course successfully deleted.');
    await loadPlatformData();
  };



  const addQuizQuestionField = () => {
    setCourseQuiz(prev => [...prev, { type: 'multiple_choice', question: '', options: ['', '', '', ''], correctAnswer: 0, answerText: '' }]);
  };

  const removeQuizQuestionField = (idx: number) => {
    setCourseQuiz(prev => prev.filter((_, i) => i !== idx));
  };

  // ==========================================
  // ADMIN EVENTS
  // ==========================================

  const handleUpdateUserRole = async (email: string, role: UserRole) => {
    if (!can(userSession.role, 'manageUsers')) { showToast('Administrator access is required.'); return; }
    const user = users.find(u => u.email === email);
    if (user) {
      try {
        await dbService.changeUserRole(user.id, role);
        showToast(`Updated role of ${user.name} to ${roleDisplayNames[role]}`);
        await loadPlatformData();
      } catch (error) { showToast(error instanceof Error ? error.message : 'Unable to update the role.'); }
    }
  };

  const handleUpdateUserDept = async (email: string, dept: string) => {
    if (!can(userSession.role, 'manageUsers')) { showToast('Administrator access is required.'); return; }
    const user = users.find(u => u.email === email);
    if (user) {
      try {
        await dbService.saveUser({ ...user, department: dept });
        showToast(`Updated department of ${user.name} to ${dept}`);
        await loadPlatformData();
      } catch (error) { showToast(error instanceof Error ? error.message : 'Unable to update the department.'); }
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!can(userSession.role, 'manageUsers')) { showToast('Administrator access is required.'); return; }
    if (userSession.id && !userSession.id.startsWith('u-')) { showToast('Ask the user to sign up first. Account invitations are not implemented yet.'); return; }
    if (!adminUserForm.name || !adminUserForm.email) return;

    await dbService.saveUser({
      id: `u-${Date.now()}`,
      name: adminUserForm.name,
      email: adminUserForm.email,
      role: adminUserForm.role,
      department: adminUserForm.department,
      createdAt: new Date().toISOString().split('T')[0]
    });

    showToast(`Created account for ${adminUserForm.name}!`);
    setAdminUserForm({ name: '', email: '', role: 'employee', department: 'Software Engineering' });
    loadPlatformData();
  };

  const handleDeleteUser = async (email: string) => {
    if (!can(userSession.role, 'manageUsers')) { showToast('Administrator access is required.'); return; }
    if (confirm(`Are you sure you want to permanently delete user ${email}?`)) {
      try {
        await dbService.deleteUser(email);
        showToast(`Profile for ${email} removed. Authentication account removal requires Supabase administration.`);
        await loadPlatformData();
      } catch (error) { showToast(error instanceof Error ? error.message : 'Unable to remove the profile.'); }
    }
  };

  const handleAddDept = (e: React.FormEvent) => {
    e.preventDefault();
    if (!can(userSession.role, 'manageUsers')) { showToast('Administrator access is required.'); return; }
    if (!newDeptName.trim()) return;
    dbService.addDepartment(newDeptName.trim());
    showToast(`Department "${newDeptName.trim()}" added successfully.`);
    setNewDeptName('');
    loadPlatformData();
  };

  const handlePermissionToggle = (_role: UserRole, _permissionKey: keyof RolePermissions['permissions']) => {
    showToast('Permissions are enforced by database policies and cannot be overridden in this browser.');
  };

  const handleSaveSettings = (updatedSettings: Partial<SystemSettings>) => {
    if (!can(userSession.role, 'systemSettings')) { showToast('Administrator access is required.'); return; }
    const n = { ...settings, ...updatedSettings };
    setSettings(n);
    dbService.saveSettings(n);
    showToast('System configuration saved.');
  };

  const isImmersivePlayer = !!(studyingCourse && activeLessonIdx >= 0);

  return (
    <div className="koruna-dashboard-layout">
      {/* Dynamic Alert Banner/Toast */}
      {toastMessage && (
        <div style={{ position: 'fixed', top: '20px', right: '20px', background: 'var(--koruna-dark-bg)', color: '#ffffff', borderLeft: '4px solid var(--koruna-primary)', padding: '1rem 1.5rem', borderRadius: '8px', zIndex: 10000, display: 'flex', alignItems: 'center', gap: '0.75rem', boxShadow: 'var(--shadow-lg)', fontWeight: 600, animation: 'fadeIn 0.2s ease' }}>
          <CheckCircle size={18} style={{ color: 'var(--koruna-primary)' }} />
          <span>{toastMessage}</span>
        </div>
      )}

      {completedCourseModal && (
        <div className="koruna-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="course-complete-title">
          <div
            className="koruna-modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: '420px',
              padding: '2rem',
              textAlign: 'center',
              borderRadius: '16px',
              boxShadow: '0 24px 60px rgba(15, 23, 42, 0.24)'
            }}
          >
            <div style={{
              width: '64px',
              height: '64px',
              margin: '0 auto 1rem',
              borderRadius: '50%',
              background: '#dcfce7',
              color: '#15803d',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 8px 24px rgba(22, 163, 74, 0.18)'
            }}>
              <Award size={34} />
            </div>
            <h2 id="course-complete-title" style={{
              margin: '0 0 0.5rem',
              color: '#14532d',
              fontSize: '1.45rem',
              fontWeight: 800,
              fontFamily: 'var(--font-heading)'
            }}>
              Congratulations!
            </h2>
            <p style={{
              margin: '0 auto 1.5rem',
              maxWidth: '320px',
              color: '#475569',
              fontSize: '0.95rem',
              lineHeight: 1.5
            }}>
              You have successfully completed <strong>{completedCourseModal.title}</strong>.
            </p>
            <button
              type="button"
              className="btn-koruna-solid"
              onClick={() => setCompletedCourseModal(null)}
              style={{
                minWidth: '150px',
                height: '42px',
                borderRadius: '8px',
                fontWeight: 700
              }}
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {/* MOBILE TOP BAR */}
      {!isImmersivePlayer && (
        <div className="koruna-mobile-top-bar">
          <button className="koruna-hamburger-btn" onClick={() => setIsMobileSidebarOpen(true)} title="Open Menu">
            <Menu size={22} />
          </button>
          <div className="koruna-mobile-logo" onClick={() => { setStudyingCourse(null); handleTabChange('dashboard'); setIsMobileSidebarOpen(false); }}>
            <img
              src="/Wkorunalogo.png"
              alt="Koruna Academy Logo"
              style={{ height: '32px', width: 'auto', display: 'block' }}
              onError={(e) => {
                const img = e.currentTarget;
                if (img.src.endsWith('/korunalogo.png')) {
                  img.src = '/logo.svg';
                }
              }}
            />
          </div>
          <HeaderActions
            userSession={userSession}
            userInitials={userInitials}
            notifications={notifications}
            onMarkAllNotificationsAsRead={handleMarkAllNotificationsAsRead}
            onNotificationClick={handleNotificationClick}
            onDeleteNotification={handleDeleteNotification}
            onTabChange={handleTabChange}
            onSignOutClick={handleSignOutClick}
            formatNotificationTime={formatNotificationTime}
            showNotifications={showNotifications}
            setShowNotifications={setShowNotifications}
          />
        </div>
      )}

      {/* 1. LEFT SIDEBAR DRAWER */}
      {!isImmersivePlayer && (
        <Sidebar
          isMobileSidebarOpen={isMobileSidebarOpen}
          setIsMobileSidebarOpen={setIsMobileSidebarOpen}
          userSession={userSession}
          activeTab={activeTab}
          onTabChange={handleTabChange}
          studyingCourse={studyingCourse}
          setStudyingCourse={setStudyingCourse}
          setActiveInnerTab={setActiveInnerTab}
          activeInnerTab={activeInnerTab}
          userPerms={userPerms}
          handleSignOutClick={handleSignOutClick}
        />
      )}

      {/* 2. MAIN CONTENT AREA */}
      <main className="koruna-dashboard-content" style={{ overflowY: 'auto', padding: 0 }}>

        {/* COMMON TOP HEADER */}
        <Header
          userSession={userSession}
          userInitials={userInitials}
          notifications={notifications}
          onMarkAllNotificationsAsRead={handleMarkAllNotificationsAsRead}
          onNotificationClick={handleNotificationClick}
          onDeleteNotification={handleDeleteNotification}
          onTabChange={handleTabChange}
          onSignOutClick={handleSignOutClick}
          formatNotificationTime={formatNotificationTime}
          isImmersivePlayer={isImmersivePlayer}
          studyingCourse={studyingCourse}
          activeLessonIdx={activeLessonIdx}
          onBackFromStudy={() => setActiveLessonIdx(-1)}
          showNotifications={showNotifications}
          setShowNotifications={setShowNotifications}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          activeTab={activeTab}
          setActiveInnerTab={setActiveInnerTab}
        />

        {studyingCourse ? (
          isImmersivePlayer ? (
            <div style={{ padding: '2rem 2.5rem 3rem 2.5rem' }}>
              <CourseStudyView
                studyingCourse={studyingCourse}
                activeLessonIdx={activeLessonIdx}
                setActiveLessonIdx={setActiveLessonIdx}
                quizAnswers={quizAnswers}
                quizTextAnswers={quizTextAnswers}
                handleQuizAnswer={handleQuizAnswer}
                handleQuizTextAnswer={handleQuizTextAnswer}
                quizSubmitted={quizSubmitted}
                handleQuizSubmit={handleQuizSubmit}
                quizPassed={quizPassed}
                quizScore={quizScore}
                setQuizAnswers={setQuizAnswers}
                setQuizTextAnswers={setQuizTextAnswers}
                setQuizSubmitted={setQuizSubmitted}
                practicalText={practicalText}
                setPracticalText={setPracticalText}
                handlePracticalSubmit={handlePracticalSubmit}
                userProgress={userProgress}
                handleMarkLessonComplete={handleMarkLessonComplete}
                handleMarkCourseComplete={handleMarkCourseComplete}
                setStudyingCourse={setStudyingCourse}
                settings={settings}
                users={users}
                teamProgress={teamProgress}
                userSession={userSession}
                loadPlatformData={loadPlatformData}
                showToast={showToast}
              />
            </div>
          ) : (
            <CourseStudyView
              studyingCourse={studyingCourse}
              activeLessonIdx={activeLessonIdx}
              setActiveLessonIdx={setActiveLessonIdx}
              quizAnswers={quizAnswers}
              quizTextAnswers={quizTextAnswers}
              handleQuizAnswer={handleQuizAnswer}
              handleQuizTextAnswer={handleQuizTextAnswer}
              quizSubmitted={quizSubmitted}
              handleQuizSubmit={handleQuizSubmit}
              quizPassed={quizPassed}
              quizScore={quizScore}
              setQuizAnswers={setQuizAnswers}
              setQuizTextAnswers={setQuizTextAnswers}
              setQuizSubmitted={setQuizSubmitted}
              practicalText={practicalText}
              setPracticalText={setPracticalText}
              handlePracticalSubmit={handlePracticalSubmit}
              userProgress={userProgress}
              handleMarkLessonComplete={handleMarkLessonComplete}
              handleMarkCourseComplete={handleMarkCourseComplete}
              setStudyingCourse={setStudyingCourse}
              settings={settings}
              users={users}
              teamProgress={teamProgress}
              userSession={userSession}
              loadPlatformData={loadPlatformData}
              showToast={showToast}
            />
          )
        ) : (
          /* REGULAR TAB ROUTING */
          <>
            {/* TAB 1: MAIN DASHBOARD / HOME */}
            {(activeTab === 'dashboard' || activeTab === 'home') && (
              <KorunaHomeView
                userSession={userSession}
                onTabChange={handleTabChange}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
              />
            )}

            {/* TAB 2: KORUNA ACADEMY DASHBOARD */}
            {activeTab === 'catalog' && (
              <KorunaAcademyDashboard
                userSession={userSession}
                courses={courses}
                users={users}
                userProgress={userProgress}
                onStartStudy={handleStartStudy}
                onTabChange={handleTabChange}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
              />
            )}

            {/* TAB 2B: COURSE CATALOGUE */}
            {activeTab === 'catalog_courses' && (
              <div className="koruna-subview-wrapper">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
                  <div>
                    <h2 className="koruna-section-title" style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      Course Catalogue
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        padding: '0.2rem 0.65rem',
                        borderRadius: '9999px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        background: 'rgba(16, 185, 129, 0.1)',
                        color: '#10b981',
                        border: '1px solid rgba(16, 185, 129, 0.25)'
                      }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981', display: 'inline-block', boxShadow: '0 0 6px #10b981' }}></span>
                        Realtime Live
                      </span>
                    </h2>
                    <p style={{ color: 'var(--koruna-text-muted)', fontSize: '0.9rem' }}>
                      Browse all available training across every department.
                    </p>
                  </div>
                  {userPerms?.editCourses && (
                    <button
                      className="btn-koruna-solid"
                      style={{ height: '40px', padding: '0 1.25rem', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
                      onClick={() => {
                        setEditingCourseId(null);
                        setCourseForm({
                          title: '',
                          category: 'Mortgage',
                          code: '',
                          level: 'Beginner',
                          description: '',
                          imgBg: '#e0f2fe',
                          imageUrl: '',
                          trainer: userSession.name || '',
                          attachments: [],
                          contentType: 'course',
                          requiresCertification: true,
                          documentContent: '',
                          acknowledgmentText: 'I have read, understood, and agree to the policies and terms outlined in this document.'
                        });
                        setCourseLessons([{ title: 'Lesson 1: Introduction', content: 'Enter lesson text here.' }]);
                        setCourseQuiz([{ question: 'What is the correct answer?', options: ['Option A', 'Option B', 'Option C', 'Option D'], correctAnswer: 0 }]);
                        setAssignedUserEmails([]);
                        onTabChange('admin_suite');
                        setActiveInnerTab('creator');
                      }}
                    >
                      + Create New Course
                    </button>
                  )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
                  <div role="tablist" aria-label="Filter courses by line of business" style={{ display: 'flex', alignItems: 'flex-end', gap: '0.7rem', flexWrap: 'wrap', paddingTop: '7px' }}>
                    {catalogueLobs.map((lob) => {
                      const selected = selectedCatalogueLob === lob;
                      const count = lob === 'All' ? courses.length : courses.filter((course) => getCourseLob(course) === lob).length;
                      return (
                        <button
                          key={lob}
                          type="button"
                          role="tab"
                          aria-selected={selected}
                          onClick={() => setSelectedCatalogueLob(lob)}
                          style={{
                            position: 'relative', display: 'inline-flex', alignItems: 'center', gap: '0.45rem', minWidth: '98px', padding: '0.68rem 0.9rem', borderRadius: '4px 10px 10px 10px',
                            border: selected ? '1px solid #b12b67' : '1px solid #cbd5e1', background: selected ? '#fce7f3' : '#f8fafc',
                            color: selected ? '#8f174c' : '#475569', fontWeight: 750, fontSize: '0.82rem', cursor: 'pointer', boxShadow: selected ? '0 5px 12px rgba(163, 21, 85, 0.16)' : '0 1px 2px rgba(15, 23, 42, 0.05)',
                            transition: 'transform 0.15s ease, box-shadow 0.15s ease'
                          }}
                        >
                          <span aria-hidden="true" style={{ position: 'absolute', left: '-1px', top: '-7px', width: '38px', height: '9px', borderRadius: '7px 7px 0 0', border: selected ? '1px solid #b12b67' : '1px solid #cbd5e1', borderBottom: 0, background: selected ? '#fce7f3' : '#f8fafc' }} />
                          <Folder size={16} fill={selected ? '#f9a8d4' : '#e2e8f0'} strokeWidth={2.25} />
                          <span>{lob}</span> <span style={{ opacity: 0.7, fontSize: '0.75rem' }}>({count})</span>
                        </button>
                      );
                    })}
                  </div>
                  <div aria-label="Catalogue display style" style={{ display: 'inline-flex', padding: '3px', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#fff' }}>
                    <button type="button" aria-label="Grid view" aria-pressed={catalogueView === 'grid'} onClick={() => setCatalogueView('grid')} style={{ width: '34px', height: '32px', border: 0, borderRadius: '5px', display: 'grid', placeItems: 'center', cursor: 'pointer', background: catalogueView === 'grid' ? '#fdf2f8' : 'transparent', color: catalogueView === 'grid' ? '#a31555' : '#64748b' }}><Grid2X2 size={17} /></button>
                    <button type="button" aria-label="List view" aria-pressed={catalogueView === 'list'} onClick={() => setCatalogueView('list')} style={{ width: '34px', height: '32px', border: 0, borderRadius: '5px', display: 'grid', placeItems: 'center', cursor: 'pointer', background: catalogueView === 'list' ? '#fdf2f8' : 'transparent', color: catalogueView === 'list' ? '#a31555' : '#64748b' }}><List size={18} /></button>
                  </div>
                </div>

                <div style={{ display: catalogueView === 'grid' ? 'grid' : 'flex', flexDirection: catalogueView === 'grid' ? undefined : 'column', gridTemplateColumns: catalogueView === 'grid' ? 'repeat(auto-fill, minmax(280px, 1fr))' : undefined, gap: catalogueView === 'grid' ? '1.5rem' : '0.75rem' }}>
                  {filteredCourses.length > 0 ? (
                    filteredCourses.map((c) => {
                      const prog = userProgress.find(p => p.courseId === c.id);
                      const isEnrolled = !!prog;
                      const isAssigned = !!prog?.dueDate;
                      if (catalogueView === 'list') {
                        const progress = prog?.progressPercent ?? 0;
                        return (
                          <article key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem 1.25rem', border: '1px solid #e2e8f0', borderRadius: '12px', background: '#ffffff', flexWrap: 'wrap' }}>
                            <div style={{ width: '38px', height: '38px', borderRadius: '9px', display: 'grid', placeItems: 'center', background: '#fdf2f8', color: '#a31555', fontSize: '0.76rem', fontWeight: 800 }}>{getCourseLob(c)}</div>
                            <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                              <h3 style={{ margin: 0, color: '#1e293b', fontSize: '0.98rem' }}>{c.title}</h3>
                              <div style={{ marginTop: '0.28rem', color: '#64748b', fontSize: '0.8rem' }}>{c.code} · {c.category} · {c.level}</div>
                            </div>
                            <div style={{ flex: '0 1 150px', minWidth: '130px' }} aria-label={`${progress}% complete`}>
                              <div style={{ height: '6px', borderRadius: '999px', background: '#e2e8f0', overflow: 'hidden' }}><div style={{ height: '100%', width: `${progress}%`, background: progress === 100 ? '#16a34a' : '#a31555' }} /></div>
                              <div style={{ marginTop: '0.3rem', color: '#64748b', fontSize: '0.75rem', fontWeight: 600 }}>{progress}% complete</div>
                            </div>
                            <button type="button" className={progress > 0 && progress < 100 ? 'btn-catalogue-action-solid' : 'btn-catalogue-action-outline'} style={{ minWidth: '100px' }} onClick={() => handleStartStudy(c)}>{progress === 100 ? 'Review' : progress > 0 ? 'Continue' : 'Start'}</button>
                          </article>
                        );
                      }
                      return (
                        <CourseCard
                          key={c.id}
                          course={c}
                          variant="catalogue"
                          isEnrolled={isEnrolled}
                          isAssigned={isAssigned}
                          percent={prog ? prog.progressPercent : 0}
                          isOverdue={prog ? prog.overdue : false}
                          onActionClick={() => handleStartStudy(c)}
                        />
                      );
                    })
                  ) : (
                    <div style={{ gridColumn: '1 / -1', padding: '3rem', textAlign: 'center', color: 'var(--koruna-text-muted)' }}>
                      No courses found matching your query.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 3: LEARNING PATH */}
            {activeTab === 'learning_path' && (
              <LearningPathView
                userSession={userSession}
                courses={courses}
                userProgress={userProgress}
                onStartStudy={handleStartStudy}
              />
            )}
            {/* TAB 4: MY PROGRESS DETAIL */}
            {activeTab === 'progress' && (
              <div className="koruna-progress-page">
                <section className="koruna-progress-hero" aria-labelledby="progress-title">
                  <h2 id="progress-title">My Progress</h2>
                  <p>A full breakdown of your learning activity and growth.</p>
                </section>

                <section className="koruna-progress-stats" aria-label="Progress summary">
                  <article className="koruna-progress-stat-card koruna-progress-stat-card-featured">
                    <span>Overall %</span>
                    <strong>{overallProgressPercent}%</strong>
                    <div className="koruna-progress-mini-track" aria-hidden="true">
                      <div style={{ width: `${overallProgressPercent}%` }} />
                    </div>
                    <p>Across all assigned courses</p>
                  </article>

                  <article className="koruna-progress-stat-card">
                    <span>Completed Courses</span>
                    <strong>{completedCourseCount} / {assignedCourseCount}</strong>
                    <p>{assignedCompletionPercent}% of assigned courses</p>
                  </article>

                  <article className="koruna-progress-stat-card">
                    <span>Certificates</span>
                    <strong>{certificateCount}</strong>
                    <p>Earned this year</p>
                  </article>

                  <article className="koruna-progress-stat-card">
                    <span>Learning Hours</span>
                    <strong>{learningHours.toFixed(1)}h</strong>
                    <p>Of {learningHoursTarget}h yearly target</p>
                  </article>
                </section>

                <section className="koruna-progress-insights">
                  <div className="koruna-skills-panel">
                    <h3>Skills Progress</h3>
                    {skillScores.map((skill) => (
                      <div className="koruna-skill-row" key={skill.label}>
                        <div className="koruna-skill-label-row">
                          <span>{skill.label}</span>
                        </div>
                        <div className="koruna-skill-meter-row">
                          <div className="koruna-skill-track">
                            <div style={{ width: `${skill.percent}%` }} />
                          </div>
                          <span>{skill.value}/10</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="koruna-activity-panel">
                    <h3>Monthly Activity</h3>
                    <div className="koruna-monthly-chart" aria-label="Monthly activity chart">
                      {monthlyActivityBars.map((item) => (
                        <div className="koruna-month-bar-group" key={item.month}>
                          <div
                            className={`koruna-month-bar ${item.active ? 'active' : ''}`}
                            style={{ height: `${item.height}%` }}
                            title={`${item.activity} learning ${item.activity === 1 ? 'activity' : 'activities'}`}
                            aria-hidden="true"
                          />
                          <span>{item.month}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>
              </div>
            )}

            {/* TAB 5: MY CERTIFICATES */}
            {activeTab === 'certificates' && (
              <div className="koruna-subview-wrapper">
                <h2 className="koruna-section-title" style={{ marginBottom: '1.5rem' }}>My Earned Certificates</h2>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.5rem' }}>
                  {userProgress
                    .filter(p => {
                      const course = courses.find(c => c.id === p.courseId);
                      return p.progressPercent === 100 && course?.requiresCertification !== false;
                    })
                    .map((p) => {
                      const course = courses.find(c => c.id === p.courseId);
                      if (!course) return null;
                      const cert = getCertData(p.courseId);
                      return (
                        <div key={p.courseId} style={{ border: '1px solid var(--koruna-border-color)', borderRadius: '12px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', position: 'relative', boxShadow: 'var(--koruna-card-shadow)', background: '#ffffff' }}>
                          <Award size={36} style={{ color: 'var(--koruna-primary)' }} />
                          <div>
                            <h4 style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--koruna-text-dark)', marginBottom: '0.25rem' }}>{course.title}</h4>
                            <p style={{ fontSize: '0.8rem', color: 'var(--koruna-text-muted)' }}>Issued: {cert.date} • ID: {cert.id}</p>
                          </div>
                          <div style={{ marginTop: 'auto', display: 'flex', gap: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--koruna-border-color)' }}>
                            <button
                              className="btn-koruna-outline"
                              style={{ flex: 1, padding: '0.4rem 0.75rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem' }}
                              onClick={() => setViewingCertificate({ course, date: cert.date, id: cert.id })}
                            >
                              <Download size={14} /> View Certificate
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  {userProgress.filter(p => {
                    const course = courses.find(c => c.id === p.courseId);
                    return p.progressPercent === 100 && course?.requiresCertification !== false;
                  }).length === 0 && (
                    <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '3rem', color: 'var(--koruna-text-muted)' }}>
                      Complete your enrolled training courses to earn official certificates.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 6: SKILLS DASHBOARD */}
            {activeTab === 'skills' && (
              <div className="koruna-subview-wrapper">
                <h2 className="koruna-section-title" style={{ marginBottom: '1rem' }}>Enterprise Competency & Skills Inventory</h2>
                <p style={{ color: 'var(--koruna-text-muted)', fontSize: '0.9rem', marginBottom: '2rem' }}>
                  Your skill scores mapped from completed course lessons, trainer assessments, and practical drills.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  {courses.length > 0 ? (
                    courses.map((course, i) => {
                      const prog = userProgress.find(p => p.courseId === course.id);
                      const palette = ['var(--koruna-primary)', '#0ea5e9', '#8b5cf6', '#10b981', '#f59e0b'];
                      const itemColor = palette[i % palette.length];
                      const val = prog?.progressPercent || 0;
                      return (
                        <div key={course.id} style={{ border: '1px solid var(--koruna-border-color)', borderRadius: '12px', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', background: '#ffffff' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                              <h4 style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--koruna-text-dark)' }}>{course.title}</h4>
                              <span style={{ fontSize: '0.75rem', color: 'var(--koruna-text-muted)' }}>{course.category}</span>
                            </div>
                            <span style={{ fontWeight: 800, color: val > 0 ? itemColor : '#a1a1aa', fontSize: '1.1rem' }}>{val}%</span>
                          </div>
                          <div style={{ height: '8px', backgroundColor: '#e4e4e7', borderRadius: '4px', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${val}%`, backgroundColor: itemColor, borderRadius: '4px', transition: 'width 0.3s ease' }}></div>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div style={{ border: '1px dashed var(--koruna-border-color)', borderRadius: '12px', padding: '2.5rem', textAlign: 'center', color: 'var(--koruna-text-muted)', fontSize: '0.9rem', background: '#fafafa' }}>
                      No courses created yet. Create a course to start tracking competency metrics!
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 7: CAREER PATH */}
            {(activeTab === 'career' || activeTab === 'career_path') && (
              <div className="koruna-subview-wrapper">
                <h2 className="koruna-section-title" style={{ marginBottom: '1rem' }}>My Career & Promotional Progression</h2>
                <p style={{ color: 'var(--koruna-text-muted)', fontSize: '0.9rem', marginBottom: '2.5rem' }}>
                  Review the qualifications and courses needed to achieve your next career rank inside Koruna.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', position: 'relative' }}>
                  <div style={{ position: 'absolute', top: '1rem', bottom: '1rem', left: '1.5rem', width: '2px', backgroundColor: '#e4e4e7', zIndex: 1 }}></div>

                  {[
                    { rank: '1. Junior Operations Officer', status: 'Completed', detail: 'Completed onboarding training and basic regulatory compliance courses.', current: false, color: '#16a34a' },
                    { rank: '2. Associate Loan Consultant', status: 'Active (Current Rank)', detail: 'Working on Mortgage Underwriting Level 2 courses. Requires 40 hours of study time.', current: true, color: 'var(--koruna-primary)' },
                    { rank: '3. Senior Underwriting Specialist', status: 'Locked', detail: 'Requires completion of "Senior Mortgage: VA Loan Specialist", 95% quiz average, and Trainer recommendation.', current: false, color: '#a1a1aa' },
                    { rank: '4. Regional Operations Manager', status: 'Locked', detail: 'Requires completion of "Agile Leadership & Cross-Functional Project Management" and 2 years of active tenure.', current: false, color: '#a1a1aa' }
                  ].map((step, i) => (
                    <div key={i} style={{ display: 'flex', gap: '1.5rem', zIndex: 2, position: 'relative' }}>
                      <div
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '50%',
                          backgroundColor: step.current ? 'var(--koruna-primary)' : step.status === 'Completed' ? '#16a34a' : '#ffffff',
                          border: `2px solid ${step.current ? 'var(--koruna-primary)' : step.status === 'Completed' ? '#16a34a' : '#d1d5db'}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: step.status === 'Locked' ? '#9ca3af' : '#ffffff',
                          fontWeight: 800,
                          fontSize: '0.8rem',
                          flexShrink: 0
                        }}
                      >
                        {i + 1}
                      </div>

                      <div style={{ border: `1px solid ${step.current ? 'var(--koruna-primary)' : 'var(--koruna-border-color)'}`, borderRadius: '12px', padding: '1.25rem', flex: 1, backgroundColor: '#ffffff' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.4rem' }}>
                          <h4 style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--koruna-text-dark)' }}>{step.rank}</h4>
                          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: step.color, background: step.current ? 'var(--koruna-primary-light)' : step.status === 'Completed' ? '#dcfce7' : '#f3f4f6', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
                            {step.status}
                          </span>
                        </div>
                        <p style={{ fontSize: '0.85rem', color: 'var(--koruna-text-muted)' }}>{step.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TAB 8: KNOWLEDGE BASE */}
            {activeTab === 'knowledge_base' && (
              <KnowledgeHubView />
            )}

            {/* TAB 9: TEAM REPORTS (TEAM LEADER) */}
            {activeTab === 'team_reports' && can(userSession.role, 'viewTeamReports') && (
              <div className="koruna-subview-wrapper">
                <div style={{ marginBottom: '2rem' }}>
                  <h2 className="koruna-section-title" style={{ marginBottom: '0.5rem' }}>
                    Team Progress & Operations Console
                  </h2>
                  <p style={{ color: 'var(--koruna-text-muted)', fontSize: '0.95rem' }}>
                    Review quiz metrics, assign training plans, audit practical risk reviews, and monitor timelines.
                  </p>
                </div>

                {/* Sub tabs for Team Leader */}
                <div className="koruna-inner-tab-bar">
                  <button className={`koruna-inner-tab ${activeInnerTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveInnerTab('overview')}>
                    Team Progress Overview
                  </button>
                  <button className={`koruna-inner-tab ${activeInnerTab === 'assignments' ? 'active' : ''}`} onClick={() => setActiveInnerTab('assignments')}>
                    Course Assignments
                  </button>
                  <button className={`koruna-inner-tab ${activeInnerTab === 'practicals' ? 'active' : ''}`} onClick={() => setActiveInnerTab('practicals')}>
                    Practical Reviews ({practicals.filter(p => p.status === 'pending').length})
                  </button>
                </div>

                {/* SECTION 9.1: OVERVIEW */}
                {activeInnerTab === 'overview' && (
                  <div>
                    {/* Performance metrics */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem', marginBottom: '2.5rem' }}>
                      <div style={{ border: '1px solid var(--koruna-border-color)', padding: '1.25rem', background: '#f9fafb', borderRadius: '12px' }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--koruna-text-muted)' }}>TEAM AVERAGE PROGRESS</div>
                        <div style={{ fontSize: '2rem', fontWeight: 800, color: '#16a34a', marginTop: '0.25rem' }}>
                          {users.length > 0 ? '56.2%' : '0%'}
                        </div>
                      </div>

                      <div style={{ border: '1px solid var(--koruna-border-color)', padding: '1.25rem', background: '#f9fafb', borderRadius: '12px' }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--koruna-text-muted)' }}>OVERDUE COMPLIANCE ITEMS</div>
                        <div style={{ fontSize: '2rem', fontWeight: 800, color: '#ea4335', marginTop: '0.25rem' }}>
                          2 Employees
                        </div>
                      </div>

                      <div style={{ border: '1px solid var(--koruna-border-color)', padding: '1.25rem', background: '#f9fafb', borderRadius: '12px' }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--koruna-text-muted)' }}>PENDING SUBMISSIONS</div>
                        <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--koruna-primary)', marginTop: '0.25rem' }}>
                          {practicals.filter(p => p.status === 'pending').length} Cases
                        </div>
                      </div>
                    </div>

                    {/* Team overview listings */}
                    <div style={{ border: '1px solid var(--koruna-border-color)', borderRadius: '12px', padding: '1.5rem', backgroundColor: '#ffffff' }}>
                      <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--koruna-text-dark)', marginBottom: '1rem' }}>Employee Standings & Quiz Scores</h3>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {users.filter(u => Boolean(u.email)).map((emp) => {
                          const userProgList = teamProgress[emp.email.toLowerCase()] || [];
                          return (
                            <div key={emp.email} style={{ padding: '1rem', border: '1px solid var(--koruna-border-color)', borderRadius: '8px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
                                <div>
                                  <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{emp.name}</div>
                                  <div style={{ fontSize: '0.75rem', color: 'var(--koruna-text-muted)' }}>Dept: {emp.department} • {emp.email}</div>
                                </div>
                              </div>

                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                                {userProgList.map(p => {
                                  const course = courses.find(c => c.id === p.courseId);
                                  if (!course) return null;
                                  return (
                                    <div key={p.courseId} style={{ background: '#f8fafc', padding: '0.75rem', borderRadius: '6px', fontSize: '0.8rem' }}>
                                      <div style={{ fontWeight: 700, display: 'flex', justifyContent: 'space-between' }}>
                                        <span>{course.code}</span>
                                        <span style={{ color: p.progressPercent === 100 ? '#16a34a' : 'var(--koruna-primary)' }}>{p.progressPercent}%</span>
                                      </div>
                                      <div className="koruna-progress-bar-track" style={{ margin: '0.5rem 0', height: '4px' }}>
                                        <div className="koruna-progress-bar-fill" style={{ width: `${p.progressPercent}%` }}></div>
                                      </div>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--koruna-text-muted)' }}>
                                        <span>Quiz Score: {p.quizScore !== undefined ? `${p.quizScore}%` : 'N/A'}</span>
                                        <span>Attempts: {p.quizAttempts}</span>
                                      </div>
                                      {p.overdue && (
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem', borderTop: '1px solid var(--koruna-border-color)', paddingTop: '0.4rem' }}>
                                          <span style={{ color: '#ef4444', fontWeight: 700 }}>Overdue!</span>
                                          <button
                                            className="btn-koruna-outline"
                                            style={{ padding: '0.15rem 0.5rem', fontSize: '0.7rem', height: '22px' }}
                                            disabled={nudgedUsers[`${emp.email}-${course.code}`]}
                                            onClick={() => handleNudgeUser(emp.email, course.code)}
                                          >
                                            {nudgedUsers[`${emp.email}-${course.code}`] ? 'Reminded' : 'Send Nudge'}
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* SECTION 9.2: ASSIGNMENTS */}
                {activeInnerTab === 'assignments' && (
                  <div style={{ border: '1px solid var(--koruna-border-color)', borderRadius: '12px', padding: '1.5rem', backgroundColor: '#ffffff' }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--koruna-text-dark)', marginBottom: '1rem' }}>Assign Training Plan</h3>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      {users.filter(u => Boolean(u.email)).map((emp) => (
                        <div key={emp.email} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', border: '1px solid var(--koruna-border-color)', borderRadius: '8px', flexWrap: 'wrap', gap: '1rem' }}>
                          <div>
                            <div style={{ fontWeight: 700 }}>{emp.name}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--koruna-text-muted)' }}>{emp.email} • Dept: {emp.department}</div>
                          </div>

                          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '0.8rem', color: 'var(--koruna-text-muted)' }}>Quick Assign:</span>
                            {courses.map(course => {
                              const empProg = teamProgress[emp.email.toLowerCase()] || [];
                              const alreadyHas = empProg.some(p => p.courseId === course.id && (p.progressPercent > 0 || p.dueDate));
                              return (
                                <button
                                  key={course.id}
                                  className={alreadyHas ? 'btn-koruna-outline' : 'btn-koruna-solid'}
                                  style={{ padding: '0.25rem 0.5rem', fontSize: '0.7rem', height: '28px' }}
                                  onClick={() => handleAssignCourse(course.id, emp.email)}
                                >
                                  {course.code} {alreadyHas ? '✓' : '+'}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* SECTION 9.3: PRACTICAL REVIEWS */}
                {activeInnerTab === 'practicals' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    {practicals.filter(p => p.status === 'pending').map((sub) => (
                      <div key={sub.id} style={{ border: '1px solid var(--koruna-border-color)', borderRadius: '12px', padding: '1.5rem', backgroundColor: '#ffffff', boxShadow: 'var(--koruna-card-shadow)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--koruna-border-color)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>
                          <div>
                            <span style={{ fontWeight: 800, color: 'var(--koruna-primary)' }}>{sub.courseTitle}</span>
                            <div style={{ fontSize: '0.8rem', color: 'var(--koruna-text-muted)' }}>Submitted by: {sub.userName} ({sub.userEmail}) • Date: {sub.dateSubmitted}</div>
                          </div>
                        </div>
                        <div style={{ fontSize: '0.9rem', color: 'var(--koruna-text-dark)', lineHeight: 1.5, marginBottom: '1.5rem', background: '#f8fafc', padding: '1rem', borderRadius: '8px', borderLeft: '3px solid var(--koruna-primary)' }}>
                          "{sub.submissionText}"
                        </div>
                        <div style={{ display: 'flex', gap: '0.75rem' }}>
                          <button className="btn-koruna-solid" style={{ background: '#16a34a', borderColor: '#16a34a' }} onClick={() => handleReviewPractical(sub.id, 'approved')}>
                            Approve & Certify
                          </button>
                          <button className="btn-koruna-outline" style={{ color: '#ef4444', borderColor: '#ef4444' }} onClick={() => handleReviewPractical(sub.id, 'rejected')}>
                            Reject / Request Changes
                          </button>
                        </div>
                      </div>
                    ))}
                    {practicals.filter(p => p.status === 'pending').length === 0 && (
                      <div style={{ border: '1px solid var(--koruna-border-color)', borderRadius: '12px', padding: '3rem', textAlign: 'center', color: 'var(--koruna-text-muted)', backgroundColor: '#ffffff' }}>
                        No pending practical assessments requiring your review.
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* TAB 10: ADMIN & CONTENT SUITE */}
            {activeTab === 'admin_suite' && can(userSession.role, 'editCourses') && (
              <AdminSuite
                userSession={userSession}
                userPerms={userPerms}
                activeInnerTab={activeInnerTab}
                setActiveInnerTab={setActiveInnerTab}
                courses={courses.filter(course => canManageCourse(userSession.role, userSession.id, course.createdBy))}
                allCourses={courses}
                users={users}
                departments={departments}
                permissions={permissions}
                settings={settings}
                teamProgress={teamProgress}
                editingCourseId={editingCourseId}
                assignedUserEmails={assignedUserEmails}
                setAssignedUserEmails={setAssignedUserEmails}
                assignmentDueDate={assignmentDueDate}
                setAssignmentDueDate={setAssignmentDueDate}
                courseForm={courseForm}
                setCourseForm={setCourseForm}
                courseLessons={courseLessons}
                setCourseLessons={setCourseLessons}
                courseQuiz={courseQuiz}
                setCourseQuiz={setCourseQuiz}
                courseModules={courseModules}
                setCourseModules={setCourseModules}
                adminUserForm={adminUserForm}
                setAdminUserForm={setAdminUserForm}
                newDeptName={newDeptName}
                setNewDeptName={setNewDeptName}
                handleSaveCourse={handleSaveCourse}
                handleStartEditCourse={handleStartEditCourse}
                handleDeleteCourse={handleDeleteCourse}
                handleAssignCourse={handleAssignCourse}
                handleCreateUser={handleCreateUser}
                handleAddDept={handleAddDept}
                handleUpdateUserDept={handleUpdateUserDept}
                handleUpdateUserRole={handleUpdateUserRole}
                handleDeleteUser={handleDeleteUser}
                handlePermissionToggle={handlePermissionToggle}
                handleSaveSettings={handleSaveSettings}
                addQuizQuestionField={addQuizQuestionField}
                removeQuizQuestionField={removeQuizQuestionField}
                setEditingCourseId={setEditingCourseId}
                showToast={showToast}
                loadPlatformData={loadPlatformData}
              />
            )}

            {/* FALLBACK FOR UNIMPLEMENTED STUB TABS */}
            {['feed', 'rewards', 'engage', 'my_koruna', 'notifications', 'settings'].includes(activeTab) && (
              <UnderDevelopment
                title={
                  activeTab === 'feed' ? 'Koruna Feed' :
                    activeTab === 'rewards' ? 'Recognition & Rewards' :
                      activeTab === 'engage' ? 'Clubs & Engagement' :
                        activeTab === 'my_koruna' ? 'My Koruna' :
                          activeTab === 'notifications' ? 'Notifications Center' :
                            activeTab === 'settings' ? 'Account Settings' :
                              'Module Under Development'
                }
                description="This module is currently under active development and will be available in an upcoming release."
              />
            )}
          </>
        )}
      </main>

      {/* 3. CERTIFICATE PRESENTATION VIEW */}
      {viewingCertificate && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 999, background: '#f8fafc', overflowY: 'auto' }}>
          <CertificateView
            course={viewingCertificate.course}
            userSession={userSession}
            issueDate={viewingCertificate.date}
            certificateId={viewingCertificate.id}
            trainerName={viewingCertificate.course.trainer}
            onBack={() => setViewingCertificate(null)}
            showToast={showToast}
          />
        </div>
      )}

      {/* SIGN-OUT CONFIRMATION MODAL */}
      {showSignOutConfirm && (
        <div className="koruna-modal-overlay" onClick={() => setShowSignOutConfirm(false)}>
          <div className="koruna-modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '450px', padding: '1.75rem' }}>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
              <div style={{ background: '#fef2f2', color: '#dc2626', width: '40px', height: '40px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <LogOut size={20} />
              </div>
              <div>
                <h3 className="koruna-placeholder-title" style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>Confirm Portal Sign Out</h3>
                <p style={{ fontSize: '0.875rem', color: 'var(--koruna-text-muted)', lineHeight: '1.45' }}>
                  Are you sure you want to sign out of Koruna Academy? Your learning progress and study streak will be safely saved.
                </p>
              </div>
            </div>

            <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button className="btn-koruna-outline" onClick={() => setShowSignOutConfirm(false)}>
                Cancel
              </button>
              <button
                className="btn-koruna-solid"
                style={{ background: '#dc2626', borderColor: '#dc2626', color: '#ffffff' }}
                onClick={async () => {
                  setShowSignOutConfirm(false);
                  setIsSigningOut(true);
                  setTimeout(() => {
                    onSignOut();
                  }, 2200);
                }}
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ACADEMY LOADING SCREEN MODAL */}
      {isLoadingAcademy && (
        <LoadingModal type="academy" />
      )}

      {/* LOGOUT LOADING SCREEN MODAL */}
      {isSigningOut && (
        <LoadingModal type="logout" />
      )}
    </div>
  );
};

export default DashboardView;

