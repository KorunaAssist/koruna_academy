import { formatCertificateIssueDate } from '../services/certificateDate';
import React, { useState, useRef, useEffect } from 'react';
import { isQuizAnswerCorrect } from '../services/quizAnswers';
import {
  LogOut,
  CheckCircle, Menu,
  Folder,
  Grid2X2,
  List
} from 'lucide-react';
import type { UserSessionData, UserRole } from '../services/auth';
import { dbService, calculateCourseLearningHours, type Course, type Lesson, type QuizQuestion, type UserProgress, type Badge, type Department, type SystemSettings, type RolePermissions, type DatabaseUser, type Notification } from '../services/db';
import { AdminSuite } from './admin/AdminSuite';
import { LoadingModal } from './LoadingModal';
import { CourseStudyView } from './courses/CourseStudyView';
import { CourseCard } from './courses/CourseCard';
import { CertificateView } from './courses/CertificateView';
import { CompletionCelebration } from './courses/CompletionCelebration';
import { EarnedCertificates } from './courses/EarnedCertificates';
import { MyProgress } from './courses/MyProgress';
import { LearningPathView } from './courses/LearningPathView';
import { SkillsDashboard } from './courses/SkillsDashboard';
import { CareerPathView } from './career/CareerPathView';
import { TeamReportsView } from './reports/TeamReportsView';
import { Sidebar } from './Sidebar';
import { Header, HeaderActions } from './Header';
import { ProfileView } from './ProfileView';
import { UnderDevelopment } from './UnderDevelopment';
import { KorunaHomeView } from './koruna/KorunaHomeView';
import { KorunaAcademyDashboard } from './koruna/KorunaAcademyDashboard';
import { KnowledgeHubView } from './koruna/KnowledgeHubView';
import { can, canAccessAdminTab, canManageCourse, safeTab } from '../services/authorization';
import { learningPathService } from '../services/learningPaths';
import { isCourseAssigned } from '../services/courseAccess';
import { missingPrerequisites } from '../services/learningPathRules';
import { courseSurveyService,type CourseSurvey } from '../services/courseSurveys';

interface DashboardViewProps {
  userSession: UserSessionData;
  activeTab: string;
  onTabChange: (tab: any) => void;
  onSignOut: () => void;
  onProfileUpdated: (user: UserSessionData) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  userSession,
  activeTab: requestedTab,
  onTabChange,
  onSignOut,
  onProfileUpdated
}) => {
  const activeTab = safeTab(userSession.role, requestedTab);
  // --- CORE SYSTEM STATE ---
  const [courses, setCourses] = useState<Course[]>([]);
  const [userProgress, setUserProgress] = useState<UserProgress[]>([]);
  const [teamProgress, setTeamProgress] = useState<Record<string, UserProgress[]>>({});
  const [, setBadges] = useState<Badge[]>([]);
  const [users, setUsers] = useState<DatabaseUser[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [settings, setSettings] = useState<SystemSettings>(dbService.getSettings());
  const [permissions, setPermissions] = useState<RolePermissions[]>(dbService.getPermissions());

  // --- UI INTERACTION STATE ---
  const [_showProfileMenu, setShowProfileMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [openingCourseTitle, setOpeningCourseTitle] = useState<string | null>(null);
  const openingCourseRef = useRef(false);
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
    // Admin Suite sections are client-side tabs, so save them as individual
    // browser-history entries just like employee pages.
    if (typeof window !== 'undefined') {
      const account = userSession.id || userSession.email;
      const current = window.history.state?.korunaAdminInner;
      if (current?.account !== account || current?.tab !== tab) {
        const url = new URL(window.location.href);
        url.searchParams.set('page','admin_suite');
        url.searchParams.set('adminTab',tab);
        window.history.pushState({ ...window.history.state,korunaPage:{ account,tab:'admin_suite' },korunaAdminInner:{ account,tab } },'',url);
      }
    }
  };

  useEffect(() => {
    const account = userSession.id || userSession.email;
    const restoreAdminTab = (event: PopStateEvent) => {
      const saved = event.state?.korunaAdminInner;
      if (saved?.account === account && typeof saved.tab === 'string' && canAccessAdminTab(userSession.role,saved.tab)) {
        setActiveInnerTabState(saved.tab);
        try { localStorage.setItem('koruna_active_inner_tab',saved.tab); } catch { /* Ignore storage errors. */ }
      }
    };
    window.addEventListener('popstate',restoreAdminTab);
    return () => window.removeEventListener('popstate',restoreAdminTab);
  },[userSession.email,userSession.id,userSession.role]);

  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isLoadingAcademy, setIsLoadingAcademy] = useState(false);
  const [completedCourseModal, setCompletedCourseModal] = useState<{ title: string } | null>(null);
  const [pendingSurvey,setPendingSurvey] = useState<{ course: Course; survey: CourseSurvey; required: boolean } | null>(null);
  const [surveyAnswers,setSurveyAnswers] = useState<Record<string,string | number>>({});
  const [surveyError,setSurveyError] = useState('');
  const [submittingSurvey,setSubmittingSurvey] = useState(false);
  const [submitSurveyAnonymously,setSubmitSurveyAnonymously] = useState(false);
  const [certificateAfterSurvey,setCertificateAfterSurvey] = useState<{ course: Course; date: string; id: string } | null>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const notificationsMenuRef = useRef<HTMLDivElement>(null);

  const handleTabChange = (tab: any) => {
    const academyTabs = [
      'catalog',
      'catalog_courses',
      'my_courses',
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
  const studyReturnTabRef = useRef('catalog_courses');

  const setStudyingCourse = (course: Course | null) => {
    if (course && !canManageCourse(userSession.role, userSession.id, course.createdBy) && !isAssignedToCurrentUser(course)) {
      showToast('This course has not been assigned to you.');
      return;
    }
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

  // Trainer & Admin forms state
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);
  const [assignedUserEmails, setAssignedUserEmails] = useState<string[]>([]);
  const getDefaultAssignmentDueDate = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const [assignmentDueDate, setAssignmentDueDate] = useState<string>(() => getDefaultAssignmentDueDate());
  const [courseForm, setCourseForm] = useState<Omit<Course, 'id' | 'createdBy' | 'rating' | 'lessons'> & { creatorId?: string }>({
    title: '',
    category: 'Mortgage',
    code: '',
    level: 'Beginner' as 'Beginner' | 'Intermediate' | 'Advanced',
    description: '',
    imgBg: '#e0f2fe',
    imageUrl: '',
    trainer: userSession.name || '',
    creatorId: userSession.id || '',
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
      const loadedUsers = await dbService.getUsers();
      const loadedDeps = dbService.getDepartments();
      const loadedSettings = dbService.getSettings();
      const loadedPerms = dbService.getPermissions();
      const loadedNotifs = await dbService.getNotifications(userSession.email);

      setCourses(loadedCourses);
      setUserProgress(loadedProgress);
      setBadges(loadedBadges);
      setUsers(loadedUsers);
      setDepartments(loadedDeps);
      setSettings(loadedSettings);
      setPermissions(loadedPerms);
      setNotifications(loadedNotifs);

      try {
        const savedCourseId = localStorage.getItem('koruna_studying_course_id');
        if (savedCourseId) {
          const found = loadedCourses.find(c => c.id === savedCourseId);
          if (found && (canManageCourse(userSession.role, userSession.id, found.createdBy) || isAssignedToCurrentUser(found, loadedProgress, loadedUsers))) {
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
      // Polling returns fresh objects even when the catalogue has not changed.
      // Preserve the array reference so dependent views do not reload every poll.
      setCourses(previous => JSON.stringify(previous) === JSON.stringify(updatedCourses) ? previous : updatedCourses);

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

  const getCourseLob = (course: Course) => course.category.trim() || 'Uncategorized';

  const catalogueLobs = ['All', ...Array.from(new Set(courses.map(getCourseLob)))
    .filter(category => category !== 'All').sort((a, b) => a.localeCompare(b))];

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
  function isAssignedToCurrentUser(course: Course, progress = userProgress, accounts = users) {
    const account = accounts.find(user => user.email.trim().toLowerCase() === userSession.email.trim().toLowerCase());
    return isCourseAssigned(course, [userSession.email, userSession.id || '', account?.id || '', String(account?.userId || '')], progress);
  }
  const catalogueSections = [
    { title: 'Assigned Courses', courses: filteredCourses.filter(course => isAssignedToCurrentUser(course) && !currentUserProgress.some(p => p.courseId === course.id && p.progressPercent >= 100)) },
    { title: 'Done Courses', courses: filteredCourses.filter(course => currentUserProgress.some(p => p.courseId === course.id && p.progressPercent >= 100)) },
    { title: 'All Courses ? Not Assigned', courses: filteredCourses.filter(course => !isAssignedToCurrentUser(course) && !currentUserProgress.some(p => p.courseId === course.id && p.progressPercent >= 100)) }
  ];
  // ==========================================
  // EMPLOYEE CAPABILITIES & EVENTS
  // ==========================================

  const handleStartStudy = async (course: Course, applicationId?: number) => {
    if (openingCourseRef.current) return;
    openingCourseRef.current = true;
    setOpeningCourseTitle(course.title);
    try {
      const progressList = await dbService.getUserProgress(userSession.email);
      const existing = progressList.find(p => p.courseId === course.id &&
        (applicationId === undefined || (p.applicationId || 0) === applicationId));
      if (existing && existing.progressPercent >= 100) {
        studyReturnTabRef.current = ['career', 'career_path', 'my_courses'].includes(activeTab) ? activeTab : 'catalog_courses';
        setStudyingCourse(course);
        setStudyingAssignmentId(existing.applicationId || 0);
        setActiveLessonIdx(-1);
        setQuizAnswers({});
        setQuizTextAnswers({});
        setQuizSubmitted(false);
        setPracticalText('');
        setViewingCertificate(null);
        return;
      }
      if (!isAssignedToCurrentUser(course, progressList)) {
        showToast('This course has not been assigned to you.');
        return;
      }
      const prerequisites = await learningPathService.prerequisites();
      const missing = missingPrerequisites(course.id,prerequisites,progressList);
      if (missing.length) {
        showToast(`Complete these courses first: ${missing.map(id => courses.find(c => c.id === id)?.title || id).join(', ')}.`);
        return;
      }
      const prog: UserProgress = existing || {
        userEmail: userSession.email.toLowerCase(), courseId: course.id,
        applicationId: applicationId || 0, progressPercent: 0, completedLessons: [],
        quizAttempts: 0, practicalStatus: 'none', overdue: false
      };
      prog.lastViewedAt = new Date().toISOString();
      await dbService.saveUserProgress(prog);
      await loadPlatformData();
      studyReturnTabRef.current = ['career', 'career_path', 'my_courses'].includes(activeTab) ? activeTab : 'catalog_courses';
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
    } finally {
      openingCourseRef.current = false;
      setOpeningCourseTitle(null);
    }
  };

  const returnToCourseCatalogue = () => {
    const returnTab = studyReturnTabRef.current;
    studyReturnTabRef.current = 'catalog_courses';
    setStudyingCourse(null);
    setStudyingAssignmentId(null);
    setQuizSubmitted(false);
    setViewingCertificate(null);
    handleTabChange(returnTab);
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
        // Use the requested course first. A learner may complete a course from
        // an assessment/lesson flow while another course remains in view.
        const c = courses.find(item => item.id === targetId) || studyingCourse;
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
        if (c) {
          const status = await courseSurveyService.status(c.id);
          if (status.enabled && !status.submitted) {
            const survey = await courseSurveyService.load(c.id);
            setSurveyAnswers({}); setSurveyError(''); setSubmitSurveyAnonymously(false); setPendingSurvey({ course:c,survey,required:status.required_for_certificate });
            return;
          }
        }
        setCompletedCourseModal({ title: c?.title || 'Course' });
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to complete course. Please check your progress and try again.');
      throw err;
    }
  };

  const submitPendingSurvey = async () => {
    if (!pendingSurvey) return;
    setSubmittingSurvey(true); setSurveyError('');
    try {
      await courseSurveyService.submit(pendingSurvey.course.id,surveyAnswers,submitSurveyAnonymously);
      const title = pendingSurvey.course.title;
      setPendingSurvey(null);
      if (certificateAfterSurvey) { setViewingCertificate(certificateAfterSurvey); setCertificateAfterSurvey(null); }
      else setCompletedCourseModal({ title });
    } catch (error) { setSurveyError(error instanceof Error ? error.message : 'Unable to submit feedback.'); }
    finally { setSubmittingSurvey(false); }
  };

  const skipPendingSurvey = () => {
    if (!pendingSurvey) return;
    const title = pendingSurvey.course.title;
    const required = pendingSurvey.required;
    const wasOpeningCertificate = !!certificateAfterSurvey;
    setPendingSurvey(null);
    setCertificateAfterSurvey(null);
    if (wasOpeningCertificate && required) {
      showToast('Feedback is required before the certificate can be viewed. You can submit it later.');
      return;
    }
    setCompletedCourseModal({ title });
  };

  const openCertificate = async (course: Course) => {
    const cert = getCertData(course.id);
    try {
      const status = await courseSurveyService.status(course.id);
      if (status.enabled && status.required_for_certificate && !status.submitted) {
        const survey = await courseSurveyService.load(course.id);
        setSurveyAnswers({}); setSurveyError(''); setSubmitSurveyAnonymously(false); setCertificateAfterSurvey({ course,date:cert.date,id:cert.id });
        setPendingSurvey({ course,survey,required:true });
        return;
      }
    } catch (error) { showToast(error instanceof Error ? error.message : 'Unable to check certificate feedback requirements.'); return; }
    setViewingCertificate({ course,date:cert.date,id:cert.id });
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
      if (isQuizAnswerCorrect(q, quizAnswers[idx], quizTextAnswers[idx])) {
        correctCount++;
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
        const wasCompleted = prog.progressPercent === 100;
        prog.quizAttempts += 1;
        prog.quizHistory = [...(prog.quizHistory || []), { attempt: prog.quizAttempts, score, submittedAt: new Date().toISOString() }];
        prog.quizScore = Math.max(prog.quizScore || 0, score);

        // Re-calculate overall course progress percentage
        const totalLessons = studyingCourse.lessons.length;
        const completedCount = prog.completedLessons.length;
        let calculatedProgress = totalLessons > 0
          ? Math.round((completedCount / totalLessons) * 70)
          : 70;

        if (prog.quizScore >= threshold) {
          calculatedProgress += 30;
          prog.progressPercent = Math.min(calculatedProgress, 100);
        } else {
          prog.progressPercent = Math.min(calculatedProgress, 70);
        }

        // Retaking a quiz must not undo an already completed course.
        if (wasCompleted) prog.progressPercent = 100;
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
      showToast(err instanceof Error ? err.message : 'Unable to save quiz results. Please try again.');
    }
  };

  const handlePracticalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studyingCourse || !practicalText.trim()) return;

    try {
      await dbService.submitPractical({
        userEmail: userSession.email,
        userName: userSession.name,
        courseId: studyingCourse.id,
        courseTitle: studyingCourse.title,
        submissionText: practicalText
      });

      showToast('Practical assessment submitted for review.');
      setPracticalText('');
      await loadPlatformData();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to submit practical work. Please retry.');
    }
  };

  const handleSignOutClick = () => {
    setShowProfileMenu(false);
    setIsMobileSidebarOpen(false);
    setShowSignOutConfirm(true);
  };


  // Get date and cert ID for earned certificates
  const getCertData = (courseId: string) => {
    const progress = userProgress.filter(p => p.courseId === courseId && p.progressPercent >= 100).sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''))[0];
    return { date: formatCertificateIssueDate(progress), id: `CERT-${courseId.toUpperCase()}-${progress?.applicationId || 0}` };
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

  // ==========================================
  // TRAINER EVENTS
  // ==========================================

  const handleSaveCourse = async (e: React.FormEvent, survey?: CourseSurvey) => {
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

    // Keep the database owner and the displayed certificate signatory tied to
    // the same selected account. This avoids a stale trainer form value from
    // falling back to the staff member who clicked Publish.
    const existingCourse = editingCourseId ? courses.find(course => course.id === editingCourseId) : undefined;
    const selectedCreatorId = courseForm.creatorId || existingCourse?.createdBy || userSession.id;
    const selectedCreator = users.find(user => user.id === selectedCreatorId);
    const selectedTrainerName = selectedCreator?.name || courseForm.trainer || userSession.name || '';

    let saved: Course;
    try {
      saved = await dbService.saveCourse({
        id: editingCourseId || `c-${Date.now()}`,
        createdBy: selectedCreatorId,
        title: courseForm.title,
        category: courseForm.category,
        rating: editingCourseId ? (courses.find(c => c.id === editingCourseId)?.rating || 4.5) : 4.5,
        code: courseForm.code,
        level: courseForm.level,
        description: courseForm.description,
        imgBg: courseForm.imgBg,
        imageUrl: courseForm.imageUrl,
        trainer: selectedTrainerName,
        lessons: lessonsWithIds,
        quiz: isDocument ? [] : courseQuiz,
        attachments: courseForm.attachments,
        contentType: courseForm.contentType,
        requiresCertification: courseForm.requiresCertification,
        documentContent: courseForm.documentContent,
        acknowledgmentText: courseForm.acknowledgmentText,
        skillIds: isDocument ? [] : courseForm.skillIds || []
      });

      if (survey) await courseSurveyService.save(saved.id,survey);
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
      creatorId: userSession.id || '',
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
      creatorId: course.createdBy || userSession.id || '',
      attachments: course.attachments || [],
      contentType: course.contentType || 'course',
      requiresCertification: course.requiresCertification !== undefined ? course.requiresCertification : true,
      documentContent: course.documentContent || '',
      acknowledgmentText: course.acknowledgmentText || 'I have read, understood, and agree to the policies and terms outlined in this document.',
      skillIds: course.skillIds || []
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

      {pendingSurvey && (
        <div className="koruna-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="course-survey-title">
          <div className="koruna-modal-content" style={{ maxWidth: '620px', padding: '2rem', borderRadius: '16px', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 id="course-survey-title" style={{ marginTop: 0 }}>Course feedback</h2>
            <p style={{ color: '#475569' }}>You completed this course. Your feedback helps improve KA Acad.</p>
            <p style={{ margin: '-0.5rem 0 0', color: '#334155', fontWeight: 700 }}>Course: {pendingSurvey.course.title}</p>
            <div style={{ display: 'grid', gap: '1rem', marginTop: '1.25rem' }}>{pendingSurvey.survey.questions.map((question,index) => <label key={question.id} style={{ display: 'grid', gap: '0.45rem', fontWeight: 650 }}><span>{index+1}. {question.question}{question.required ? ' *' : ''}</span>{question.kind === 'rating' ? <select value={surveyAnswers[question.id] ?? ''} onChange={event => setSurveyAnswers(current => ({ ...current,[question.id]:Number(event.target.value) }))}><option value="">Choose a rating (1–5)</option>{Array.from({length:5},(_,value) => <option key={value+1} value={value+1}>{value+1}</option>)}</select> : question.kind === 'choice' ? <select value={surveyAnswers[question.id] ?? ''} onChange={event => setSurveyAnswers(current => ({ ...current,[question.id]:event.target.value }))}><option value="">Choose an answer</option>{question.options.map(option => <option key={option} value={option}>{option}</option>)}</select> : <textarea rows={3} value={String(surveyAnswers[question.id] ?? '')} onChange={event => setSurveyAnswers(current => ({ ...current,[question.id]:event.target.value }))} placeholder="Share your feedback" />}</label>)}</div>
            <label style={{ display: 'flex', gap: '0.55rem', alignItems: 'center', marginTop: '1rem', color: '#475569' }}><input type="checkbox" checked={submitSurveyAnonymously} onChange={event => setSubmitSurveyAnonymously(event.target.checked)}/> Submit this feedback anonymously</label>
            {surveyError && <p role="alert" style={{ color: '#b42318' }}>{surveyError}</p>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}><button type="button" className="btn-koruna-outline" disabled={submittingSurvey} onClick={skipPendingSurvey}>Skip for now</button><button type="button" className="btn-koruna-solid" disabled={submittingSurvey} onClick={() => void submitPendingSurvey()}>{submittingSurvey ? 'Submitting…' : 'Submit feedback'}</button></div>
          </div>
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
            <CompletionCelebration />
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
                key={studyingCourse.id}
                onReturnToCatalogue={returnToCourseCatalogue}
                returnLabel={studyReturnTabRef.current==='career' || studyReturnTabRef.current==='career_path' ? 'My Career' : undefined}
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
                key={studyingCourse.id}
                onReturnToCatalogue={returnToCourseCatalogue}
                returnLabel={studyReturnTabRef.current==='career' || studyReturnTabRef.current==='career_path' ? 'My Career' : undefined}
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
            {(activeTab === 'catalog' || activeTab === 'my_courses') && (
              <KorunaAcademyDashboard
                key={activeTab}
                view={activeTab === 'my_courses' ? 'my_courses' : 'dashboard'}
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
                          creatorId: userSession.id || '',
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
                  <div role="tablist" aria-label="Filter courses by category" style={{ display: 'flex', alignItems: 'flex-end', gap: '0.7rem', flexWrap: 'wrap', paddingTop: '7px' }}>
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

                {catalogueSections.map(section => (
                  <section key={section.title} style={{ marginBottom: '2rem' }}>
                    <h2 style={{ fontSize: '1.15rem', marginBottom: '1rem' }}>{section.title} ({section.courses.length})</h2>
                <div style={{ display: catalogueView === 'grid' ? 'grid' : 'flex', flexDirection: catalogueView === 'grid' ? undefined : 'column', gridTemplateColumns: catalogueView === 'grid' ? 'repeat(auto-fill, minmax(280px, 1fr))' : undefined, gap: catalogueView === 'grid' ? '1.5rem' : '0.75rem' }}>
                  {section.courses.length > 0 ? (
                    section.courses.map((c) => {
                      const prog = currentUserProgress.find(p => p.courseId === c.id);
                      const isEnrolled = !!prog;
                      const isAssigned = isAssignedToCurrentUser(c);
                      if (catalogueView === 'list') {
                        const progress = prog?.progressPercent ?? 0;
                        return (
                          <article key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem 1.25rem', border: '1px solid #e2e8f0', borderRadius: '12px', background: '#ffffff', flexWrap: 'wrap' }}>
                            <div style={{ width: '38px', height: '38px', borderRadius: '9px', display: 'grid', placeItems: 'center', background: '#fdf2f8', color: '#a31555', flexShrink: 0 }} title={getCourseLob(c)}><Folder size={18} /></div>
                            <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                              <h3 style={{ margin: 0, color: '#1e293b', fontSize: '0.98rem' }}>{c.title}</h3>
                              <div style={{ marginTop: '0.28rem', color: '#64748b', fontSize: '0.8rem' }}>{c.code} · {c.category} · {c.level}</div>
                            </div>
                            <div style={{ flex: '0 1 150px', minWidth: '130px' }} aria-label={`${progress}% complete`}>
                              <div style={{ height: '6px', borderRadius: '999px', background: '#e2e8f0', overflow: 'hidden' }}><div style={{ height: '100%', width: `${progress}%`, background: progress === 100 ? '#16a34a' : '#a31555' }} /></div>
                              <div style={{ marginTop: '0.3rem', color: '#64748b', fontSize: '0.75rem', fontWeight: 600 }}>{progress}% complete</div>
                            </div>
                            <button type="button" className={progress > 0 && progress < 100 ? 'btn-catalogue-action-solid' : 'btn-catalogue-action-outline'} style={{ minWidth: '100px', opacity: isAssigned ? 1 : 0.55 }} disabled={!isAssigned} onClick={() => handleStartStudy(c)}>{!isAssigned ? 'Not Assigned' : progress === 100 ? 'Review' : progress > 0 ? 'Continue' : 'Start'}</button>
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
                          actionDisabled={!isAssigned}
                          percent={prog ? prog.progressPercent : 0}
                          isOverdue={prog ? prog.overdue : false}
                          onActionClick={() => handleStartStudy(c)}
                        />
                      );
                    })
                  ) : (
                    <div style={{ gridColumn: '1 / -1', padding: '3rem', textAlign: 'center', color: 'var(--koruna-text-muted)' }}>
                      No courses in this list match your filters.
                    </div>
                  )}
                </div>
                  </section>
                ))}
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
              <MyProgress
                courses={courses}
                progress={currentUserProgress}
                isAssigned={isAssignedToCurrentUser}
                onStudy={handleStartStudy}
                onBrowse={() => handleTabChange('catalog_courses')}
                onCertificate={(course) => { void openCertificate(course); }}
              />
            )}
            {/* TAB 5: MY CERTIFICATES */}
            {activeTab === 'certificates' && (
              <EarnedCertificates
                courses={courses}
                progress={userProgress}
                learnerName={userSession.name}
                getIssueDate={(course) => getCertData(course.id).date}
                onBrowse={() => handleTabChange('catalog_courses')}
                onView={(course) => { void openCertificate(course); }}
              />
            )}

            {/* TAB 6: SKILLS DASHBOARD */}
            {activeTab === 'skills' && (
              <SkillsDashboard key={userSession.id || userSession.email} userId={userSession.id} courses={courses} userProgress={userProgress} onStartStudy={handleStartStudy} />
            )}

            {/* TAB 7: CAREER PATH */}
            {(activeTab === 'career' || activeTab === 'career_path') && (
              <CareerPathView key={userSession.id || userSession.email} userSession={userSession} courses={courses} userProgress={userProgress} assignedCourseIds={courses.filter(course => isAssignedToCurrentUser(course)).map(course => course.id)} onStartStudy={handleStartStudy} onTabChange={handleTabChange}/>
            )}

            {/* TAB 8: KNOWLEDGE BASE */}
            {activeTab === 'knowledge_base' && (
              <KnowledgeHubView />
            )}

            {/* TEAM REPORTS */}
            {activeTab === 'team_reports' && can(userSession.role, 'viewTeamReports') && (
              <TeamReportsView key={userSession.id || userSession.email} userSession={userSession} onChanged={loadPlatformData} />
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

            {(activeTab === 'profile' || activeTab === 'settings') && <ProfileView userSession={userSession} onProfileUpdated={onProfileUpdated} onNavigate={handleTabChange}/>}
            {/* FALLBACK FOR UNIMPLEMENTED STUB TABS */}
            {['feed', 'rewards', 'engage', 'my_koruna', 'notifications'].includes(activeTab) && (
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
      {openingCourseTitle !== null && (
        <LoadingModal variant="modal" message={`Opening ${openingCourseTitle}...`} />
      )}

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

