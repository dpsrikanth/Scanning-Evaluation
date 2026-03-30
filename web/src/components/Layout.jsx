import { Outlet, NavLink, Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, FileText, Settings, Users,
  ClipboardList, ChevronRight, Clock, BookOpen, PenTool,
  Monitor, Layers, Printer, FolderOpen, ShieldCheck,
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

/** Sidebar links under “Scan settings” — must match AdminSettings VALID_SCAN_SUBTABS / SCAN_SUB_TABS ids */
const scanSettingsSubLinks = [
  { subtab: 'exams', label: 'Exams', Icon: BookOpen },
  { subtab: 'papers', label: 'Papers', Icon: FileText },
  { subtab: 'workstations', label: 'Workstations', Icon: Monitor },
  { subtab: 'scanUsers', label: 'Scan users', Icon: Users },
  { subtab: 'templates', label: 'Scan templates', Icon: Layers },
  { subtab: 'printers', label: 'Printer profiles', Icon: Printer },
  { subtab: 'booklets', label: 'Scanned booklets', Icon: ClipboardList },
  { subtab: 'outputPaths', label: 'Scan output paths', Icon: FolderOpen },
  { subtab: 'scanQc', label: 'Scan QC flags', Icon: ShieldCheck },
];

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
  const location = useLocation();
  const adminSearch = location.pathname === '/admin/settings' ? new URLSearchParams(location.search) : null;

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
                      key={to}
                      to={to}
                      className={({ isActive }) => {
                        if (to !== '/admin/settings') {
                          return `sidebar-link ${isActive ? 'active' : ''}`;
                        }
                        const p = new URLSearchParams(location.search);
                        const onScanSettings = p.get('tab') === 'scanner';
                        return `sidebar-link ${isActive && !onScanSettings ? 'active' : ''}`;
                      }}
                    >
                      <Icon size={16} /><span>{label}</span>
                      <ChevronRight size={12} className="sidebar-chevron" />
                    </NavLink>
                  ))}
                  <p className="sidebar-label">Scan settings</p>
                  {scanSettingsSubLinks.map(({ subtab, label, Icon }) => {
                    const to = `/admin/settings?tab=scanner&subtab=${subtab}`;
                    const active =
                      adminSearch?.get('tab') === 'scanner' && adminSearch?.get('subtab') === subtab;
                    return (
                      <Link
                        key={subtab}
                        to={to}
                        className={`sidebar-link sidebar-sublink ${active ? 'active' : ''}`}
                      >
                        <Icon size={15} />
                        <span>{label}</span>
                        <ChevronRight size={12} className="sidebar-chevron" />
                      </Link>
                    );
                  })}
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
