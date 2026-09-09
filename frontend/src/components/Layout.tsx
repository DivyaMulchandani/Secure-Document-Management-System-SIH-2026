import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { AgencyBadge } from './ClassificationBadge';
import {
  ShieldIcon, ScaleIcon, FlaskIcon, FileTextIcon, UsersIcon,
  BuildingIcon, SearchIcon, LockIcon, ActivityIcon, LogOutIcon, KeyIcon
} from './Icons';
import { toggleTheme, getStoredThemeName } from '../themePresets';

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, logout, hasPermission } = useAuth();
  const navigate = useNavigate();
  const [currentTheme, setCurrentTheme] = useState(getStoredThemeName());

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const handleThemeToggle = () => {
    const next = toggleTheme();
    setCurrentTheme(next);
  };

  const navItems = [
    { name: 'Dashboard', path: '/dashboard', icon: ActivityIcon, visible: true },
    { name: 'Cases & FIRs', path: '/cases', icon: FileTextIcon, visible: hasPermission('CASE_READ') },
    { name: 'Evidence & Custody', path: '/evidence', icon: ShieldIcon, visible: hasPermission('EVIDENCE_READ') },
    { name: 'Forensic Lab', path: '/forensics', icon: FlaskIcon, visible: hasPermission('FORENSIC_EXAMINE') || user?.agencyBranch === 'FORENSICS' || user?.agencyBranch === 'MASTER' },
    { name: 'Court & Adjudication', path: '/court', icon: ScaleIcon, visible: hasPermission('COURT_CREATE') || user?.agencyBranch === 'JUDICIARY' || user?.agencyBranch === 'MASTER' },
    { name: 'Hierarchy Explorer', path: '/organizations', icon: BuildingIcon, visible: hasPermission('ORG_READ') || user?.roleId === 'MASTER_ADMIN' || user?.roleId === 'POLICE_ADMIN' },
    { name: 'User Management', path: '/users', icon: UsersIcon, visible: hasPermission('USER_READ') || user?.roleId === 'MASTER_ADMIN' },
    { name: 'Temporary Delegations', path: '/delegations', icon: KeyIcon, visible: hasPermission('DELEGATION_MANAGE') || user?.roleId === 'MASTER_ADMIN' },
    { name: 'Global Scoped Search', path: '/search', icon: SearchIcon, visible: true },
    { name: 'Immutable Audit Vault', path: '/audit', icon: LockIcon, visible: hasPermission('AUDIT_READ') || user?.roleId === 'MASTER_ADMIN' },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-bg text-primary-text">
      {/* Top Header */}
      <header className="glass-nav sticky top-0 z-50 h-14 px-5 flex items-center justify-between border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-accent/15 border border-accent/30 flex items-center justify-center text-accent">
            <ShieldIcon className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[13px] font-bold tracking-tight text-primary-text flex items-center gap-2">
              <span>SECURE MULTI-AGENCY JUSTICE PLATFORM</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-surface border border-border text-muted-text">
                GUJARAT LEA
              </span>
            </div>
            <div className="text-[11px] text-muted-text truncate max-w-md">
              {user?.organizationName} ({user?.organizationCode})
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {user && <AgencyBadge branch={user.agencyBranch} />}

          <button
            onClick={handleThemeToggle}
            className="px-2.5 py-1 text-[11.5px] font-mono rounded border border-border bg-surface text-muted-text hover:text-primary-text hover:border-accent transition-colors"
            title="Toggle Theme"
          >
            {currentTheme.includes('Light') ? '☀ Light' : '☾ Dark'}
          </button>

          {user && (
            <div className="flex items-center gap-3 pl-2 border-l border-border">
              <div className="text-right hidden sm:block">
                <div className="text-[12.5px] font-semibold text-primary-text leading-tight">
                  {user.displayName}
                </div>
                <div className="text-[11px] text-muted-text font-mono">
                  {user.roleName} {user.badgeNumber ? `• ${user.badgeNumber}` : ''}
                </div>
              </div>

              <button
                onClick={handleLogout}
                className="p-1.5 text-muted-text hover:text-danger rounded hover:bg-danger-light transition-colors"
                title="Sign Out"
              >
                <LogOutIcon className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main Workspace Layout */}
      <div className="flex-1 flex">
        {/* Sidebar */}
        <aside className="w-60 shrink-0 border-r border-border bg-surface flex flex-col justify-between p-3 hidden md:flex">
          <nav className="space-y-1">
            <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-muted-darker px-2.5 py-1.5">
              Justice Workspaces
            </div>
            {navItems.filter(i => i.visible).map(item => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] font-medium transition-all ${
                      isActive
                        ? 'bg-accent text-white shadow-sm'
                        : 'text-muted-text hover:text-primary-text hover:bg-bg/70'
                    }`
                  }
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.name}</span>
                </NavLink>
              );
            })}
          </nav>

          <div className="pt-4 border-t border-border-light text-[11px] font-mono text-muted-darker px-2">
            <div>Jurisdiction: Gujarat / India</div>
            <div>AuthZ Engine: 9-Point RBAC</div>
          </div>
        </aside>

        {/* Main Content Body */}
        <main className="flex-1 p-6 overflow-y-auto bg-bg">
          {children}
        </main>
      </div>
    </div>
  );
};
