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
} from 'lucide-react';
import type { UserRole } from '../../services/auth';
import type { Course } from '../../services/db';

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
  { id: 'document_inventory', label: 'Document Inventory', icon: FileText },
  { id: 'certificate_templates', label: 'Certificate Templates', icon: Award },
  { id: 'assignments', label: 'Assignments', icon: UserCheck },
  { id: 'users', label: 'User Directory', icon: Users },
  { id: 'permissions', label: 'Permissions Matrix', icon: Shield },
  { id: 'settings', label: 'Platform Settings', icon: Settings },
];

const TRAINER_NAV_ITEMS: AdminNavItem[] = [
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
  const navItems = userRole === 'trainer' ? TRAINER_NAV_ITEMS : ADMIN_NAV_ITEMS;
  const getSelectedItemId = React.useCallback((innerTab: string) => (
    navItems.find((item) => item.id === innerTab)?.id ||
    navItems.find((item) => item.targetTab === innerTab)?.id ||
    navItems[0]?.id ||
    innerTab
  ), [navItems]);

  const [selectedItemId, setSelectedItemId] = React.useState(getSelectedItemId(activeInnerTab));

  React.useEffect(() => {
    const selectedItem = navItems.find((item) => item.id === selectedItemId);
    if (selectedItem?.targetTab === activeInnerTab) return;
    setSelectedItemId(getSelectedItemId(activeInnerTab));
  }, [activeInnerTab, getSelectedItemId, navItems, selectedItemId]);

  const handleNavClick = (item: AdminNavItem) => {
    const targetTab = item.targetTab || item.id;
    setSelectedItemId(item.id);
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
