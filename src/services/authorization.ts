export const USER_ROLES = ['employee', 'team_leader', 'trainer', 'admin'] as const;
export type UserRole = typeof USER_ROLES[number];
export type Capability = 'viewDashboard' | 'studyCourses' | 'viewTeamReports' | 'assignCourses' | 'approveAssessments' | 'editCourses' | 'manageUsers' | 'systemSettings';

const LEARNING_TABS = new Set(['dashboard', 'home', 'learn', 'catalog', 'catalog_courses', 'knowledge_base', 'feed', 'rewards', 'engage', 'career', 'career_path', 'my_koruna', 'learning_path', 'progress', 'certificates', 'skills', 'notifications', 'settings', 'profile']);
const ADMIN_TABS = new Set(['overview', 'creator', 'inventory', 'document_inventory', 'certificate_templates', 'assignments', 'learning_paths', 'skill_catalogue', 'teams', 'users', 'permissions', 'settings']);
const TRAINER_TABS = new Set(['creator', 'inventory', 'certificate_templates', 'assignments', 'learning_paths']);

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && (USER_ROLES as readonly string[]).includes(value);
}

export function profileRole(value: unknown): UserRole {
  // Only pass the database profile role here. User metadata is never authority.
  return isUserRole(value) ? value : 'employee';
}

export function can(role: unknown, capability: Capability): boolean {
  if (!isUserRole(role)) return false;
  if (role === 'admin') return true;
  if (capability === 'viewDashboard' || capability === 'studyCourses') return true;
  if (capability === 'viewTeamReports' || capability === 'assignCourses' || capability === 'approveAssessments') return role === 'trainer' || role === 'team_leader';
  if (capability === 'editCourses') return role === 'trainer';
  return false;
}

export function rolePermissions(role: UserRole): Record<Capability, boolean> {
  return Object.fromEntries((['viewDashboard', 'studyCourses', 'viewTeamReports', 'assignCourses', 'approveAssessments', 'editCourses', 'manageUsers', 'systemSettings'] as Capability[]).map(key => [key, can(role, key)])) as Record<Capability, boolean>;
}

export function canAccessTab(role: unknown, tab: string): boolean {
  if (!isUserRole(role)) return false;
  if (tab === 'admin_suite') return role === 'admin' || role === 'trainer';
  if (tab === 'team_reports') return can(role, 'viewTeamReports');
  return LEARNING_TABS.has(tab);
}

export function safeTab(role: UserRole, tab: string | null): string {
  if (tab && canAccessTab(role, tab)) return tab;
  return role === 'admin' || role === 'trainer' ? 'admin_suite' : 'dashboard';
}

export function defaultTab(role: UserRole,savedTab: string | null): string {
  const workspace = role==='team_leader' ? 'team_reports' : role==='admin' || role==='trainer' ? 'admin_suite' : 'dashboard';
  return savedTab && savedTab!=='dashboard' && canAccessTab(role,savedTab) ? savedTab : workspace;
}

export function canAccessAdminTab(role: unknown, tab: string): boolean {
  return role === 'admin' ? ADMIN_TABS.has(tab) : role === 'trainer' && TRAINER_TABS.has(tab);
}

export function canManageCourse(role: unknown, userId: string | undefined, ownerId: string | null | undefined): boolean {
  return role === 'admin' || (role === 'trainer' && Boolean(userId) && userId === ownerId);
}
