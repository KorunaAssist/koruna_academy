import React from 'react';
import {
  LayoutDashboard,
  Users,
  PlusCircle,
  BookOpen,
  FileText,
  Award,
  UserCheck,
  Shield,
  Settings,
  BarChart3,
  Route,
  SlidersHorizontal,
} from 'lucide-react';
import type { UserRole } from '../../services/auth';
import type { Course } from '../../services/db';
import { canAccessAdminTab } from '../../services/authorization';

export interface AdminSidebarProps {
  activeTab: string;
  activeInnerTab: string;
  setStudyingCourse: (course: Course | null) => void;
  onTabChange: (tab: any) => void;
  setActiveInnerTab?: (tab: string) => void;
  setIsMobileSidebarOpen: (open: boolean) => void;
  userRole: UserRole;
}

interface AdminNavItem {
  id: string;
  label: string;
  icon: React.ElementType;
  targetTab?: string;
}

const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  { id: 'overview', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'quiz_scores', label: 'Employee Quiz Scores', icon: FileText },
  { id: 'team_reports', label: 'Team Reports', icon: BarChart3 },
  { id: 'teams', label: 'Manage Teams', icon: Users },
  { id: 'creator', label: 'Course Creator', icon: PlusCircle },
  { id: 'inventory', label: 'Course Inventory', icon: BookOpen },
  { id: 'learning_paths', label: 'Learning Paths', icon: Route },
  { id: 'career_paths', label: 'Career Paths', icon: Route },
  { id: 'skill_catalogue', label: 'Skills Catalogue', icon: SlidersHorizontal },
  { id: 'document_inventory', label: 'Document Inventory', icon: FileText },
  { id: 'certificate_templates', label: 'Certificate Templates', icon: Award },
  { id: 'assignments', label: 'Assignments', icon: UserCheck },
  { id: 'users', label: 'User Directory', icon: Users },
  { id: 'permissions', label: 'Permissions Matrix', icon: Shield },
  { id: 'settings', label: 'Platform Settings', icon: Settings },
];

const NAV_GROUPS = [
  { id: 'insights', label: 'Overview & reports', items: ['overview', 'quiz_scores', 'team_reports', 'view_reports'] },
  { id: 'learning', label: 'Learning & content', items: ['creator', 'create_courses', 'inventory', 'learning_paths', 'career_paths', 'skill_catalogue', 'document_inventory', 'certificate_templates', 'create_certificates'] },
  { id: 'people', label: 'People & assignments', items: ['teams', 'assignments', 'users'] },
  { id: 'administration', label: 'Administration', items: ['permissions', 'settings'] },
];

const TRAINER_NAV_ITEMS: AdminNavItem[] = [
  { id: 'learning_paths', label: 'Learning Paths', icon: Route },
  { id: 'career_paths', label: 'Career Paths', icon: Route },
  { id: 'create_courses', label: 'Create courses', icon: PlusCircle, targetTab: 'creator' },
  { id: 'create_certificates', label: 'Create certificates', icon: Award, targetTab: 'certificate_templates' },
  { id: 'view_reports', label: 'Team Reports', icon: BarChart3, targetTab: 'team_reports' },
];

export const AdminSidebar: React.FC<AdminSidebarProps> = ({
  activeTab,
  activeInnerTab,
  setStudyingCourse,
  onTabChange,
  setActiveInnerTab,
  setIsMobileSidebarOpen,
  userRole,
}) => {
  const navItems = (userRole === 'trainer' ? TRAINER_NAV_ITEMS : ADMIN_NAV_ITEMS)
    .filter(item => canAccessAdminTab(userRole, item.targetTab || item.id));
  const selectedItemId = navItems.find(
    item => activeTab === 'admin_suite' && (item.targetTab || item.id) === activeInnerTab
  )?.id;

  const handleNavClick = (item: AdminNavItem) => {
    const targetTab = item.targetTab || item.id;
    setStudyingCourse(null);
    onTabChange('admin_suite');
    setActiveInnerTab?.(targetTab);
    setIsMobileSidebarOpen(false);
  };

  return (
    <div className="admin-sidebar-shell">
      {NAV_GROUPS.map((group) => {
        const items = navItems.filter(item => group.items.includes(item.id));
        if (items.length === 0) return null;
        return (
          <section key={group.id} className="admin-sidebar-group" aria-labelledby={`admin-nav-${group.id}`}>
            <h2 id={`admin-nav-${group.id}`} className="admin-sidebar-group-label">{group.label}</h2>
            <div className="admin-sidebar-group-items">
              {items.map((item) => {
                const IconComponent = item.icon;
                const isActive = selectedItemId === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`koruna-sidebar-item admin-sidebar-item ${isActive ? 'active' : ''}`}
                    onClick={() => handleNavClick(item)}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    <IconComponent size={18} className="koruna-sidebar-item-icon" aria-hidden="true" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
};
