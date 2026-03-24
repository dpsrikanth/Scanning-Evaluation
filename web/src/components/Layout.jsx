import { Outlet, NavLink } from 'react-router-dom';
import {
  LayoutDashboard, FileText, Settings, Users,
  ClipboardList, ChevronRight, Clock, BookOpen, PenTool,
} from 'lucide-react';
import Header from './Header';
import { api } from '../services/api';
import './Layout.css';

function useCurrentUser() {
  try {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    if (user.roloName != null && user.roleName == null) user.roleName = user.roloName;
    return user;
  } catch { return {}; }
}

function canSeeScanAdmin(user) {
  const r = (user?.roleName || '').trim();
  return r === 'Admin' || r === 'ScanAdmin' || r.toLowerCase() === 'admin';
}

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { to: '/profile', label: 'My Profile', icon: Users },
  { to: '/reports/time', label: 'Time Analytics', icon: Clock },
];

const scannedBookletsItem = { to: '/admin/scanned-booklets', label: 'Scanned booklets', icon: ClipboardList };

const adminItems = [
  { to: '/admin/settings',        label: 'Admin Settings',        icon: Settings  },
  { to: '/admin/question-papers', label: 'Question Papers',       icon: BookOpen  },
  { to: '/admin/answer-sheets',   label: 'Answer Sheet Designer', icon: PenTool   },
];

const headItems = [
  { to: '/head-eval/assign', label: 'Assign Booklets', icon: ClipboardList },
];

export default function Layout() {
  const user = useCurrentUser();

  return (
    <div className="layout">
      <Header />
      <div className="layout-body">
        {/* Sidebar */}
        <nav className="sidebar">
          <div className="sidebar-section">
            <p className="sidebar-label">Navigation</p>
            {navItems.map(({ to, label, icon: Icon, exact }) => (
              <NavLink
                key={to}
                to={to}
                end={exact}
                className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
              >
                <Icon size={16} />
                <span>{label}</span>
                <ChevronRight size={12} className="sidebar-chevron" />
              </NavLink>
            ))}
          </div>

            <div className="sidebar-section">
              <p className="sidebar-label">Management</p>
              {canSeeScanAdmin(user) && (
                <>
                  {adminItems.map(({ to, label, icon: Icon }) => (
                    <NavLink
                      key={to} to={to}
                      className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
                    >
                      <Icon size={16} /><span>{label}</span>
                      <ChevronRight size={12} className="sidebar-chevron" />
                    </NavLink>
                  ))}
                  <NavLink
                    key={scannedBookletsItem.to}
                    to={scannedBookletsItem.to}
                    className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
                  >
                    <ClipboardList size={16} /><span>{scannedBookletsItem.label}</span>
                    <ChevronRight size={12} className="sidebar-chevron" />
                  </NavLink>
                </>
              )}
              {headItems.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to} to={to}
                  className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
                >
                  <Icon size={16} /><span>{label}</span>
                  <ChevronRight size={12} className="sidebar-chevron" />
                </NavLink>
              ))}
          </div>
        </nav>

        <main className="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
