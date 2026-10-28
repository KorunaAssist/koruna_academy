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
  LibraryBig,
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
  { id: 'creator', label: 'Course Creator', icon: PlusCircle },
  { id: 'inventory', label: 'Course Inventory', icon: BookOpen },
  { id: 'learning_paths', label: 'Learning Paths', icon: Route },
  { id: 'knowledge_hub', label: 'Knowledge Hub', icon: LibraryBig },
  { id: 'document_inventory', label: 'Document Inventory', icon: FileText },
  { id: 'certificate_templates', label: 'Certificate Templates', icon: Award },
  { id: 'assignments', label: 'Assignments', icon: UserCheck },
  { id: 'users', label: 'User Directory', icon: Users },
  { id: 'permissions', label: 'Permissions Matrix', icon: Shield },
  { id: 'settings', label: 'Platform Settings', icon: Settings },
];

const TRAINER_NAV_ITEMS: AdminNavItem[] = [
  { id: 'learning_paths', label: 'Learning Paths', icon: Route },
  { id: 'create_courses', label: 'Create courses', icon: PlusCircle, targetTab: 'creator' },
  { id: 'create_certificates', label: 'Create certificates', icon: Award, targetTab: 'certificate_templates' },
  { id: 'view_reports', label: 'View reports', icon: BarChart3, targetTab: 'assignments' },
];

export const AdminSidebar: React.FC<AdminSidebarProps> = ({
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
    item => (item.targetTab || item.id) === activeInnerTab
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
      {navItems.map((item) => {
        const IconComponent = item.icon;
        const isActive = selectedItemId === item.id;

        return (
          <button
            key={item.id}
            type="button"
            className={`koruna-sidebar-item admin-sidebar-item ${isActive ? 'active' : ''}`}
            style={isActive ? { backgroundColor: '#af1f6081', color: '#ffffff', fontWeight: 700 } : undefined}
            onClick={() => handleNavClick(item)}
            aria-current={isActive ? 'page' : undefined}
          >
            <IconComponent size={18} className="koruna-sidebar-item-icon" />
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
};
