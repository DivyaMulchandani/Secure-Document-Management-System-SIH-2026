import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { AgencyBadge } from './ClassificationBadge';
import {
  ShieldIcon, ScaleIcon, FlaskIcon, FileTextIcon, UsersIcon,
  BuildingIcon, SearchIcon, LockIcon, ActivityIcon, LogOutIcon, KeyIcon
} from './Icons';

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, logout, hasPermission } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const coreItems = [
    { name: 'Command Center', path: '/dashboard', icon: ActivityIcon, visible: true },
    { name: 'Cases & FIRs', path: '/cases', icon: FileTextIcon, visible: hasPermission('CASE_READ') },
    { name: 'Evidence & Custody', path: '/evidence', icon: ShieldIcon, visible: hasPermission('EVIDENCE_READ') },
    { name: 'Forensic Lab', path: '/forensics', icon: FlaskIcon, visible: hasPermission('FORENSIC_EXAMINE') || user?.agencyBranch === 'FORENSICS' || user?.agencyBranch === 'MASTER' },
    { name: 'Court & Adjudication', path: '/court', icon: ScaleIcon, visible: hasPermission('COURT_CREATE') || user?.agencyBranch === 'JUDICIARY' || user?.agencyBranch === 'MASTER' },
  ];

  const adminItems = [
    { name: 'Hierarchy Explorer', path: '/organizations', icon: BuildingIcon, visible: hasPermission('ORG_READ') || user?.roleId === 'MASTER_ADMIN' || user?.roleId === 'POLICE_ADMIN' },
    { name: 'Admin Levels & Mapping', path: '/admin-hierarchy', icon: ShieldIcon, visible: hasPermission('ORG_READ') || user?.roleId === 'MASTER_ADMIN' || user?.isLayerAdmin },
    { name: 'Personnel & Admins', path: '/users', icon: UsersIcon, visible: hasPermission('USER_READ') || user?.roleId === 'MASTER_ADMIN' },
    { name: 'Temporary Delegations', path: '/delegations', icon: KeyIcon, visible: hasPermission('DELEGATION_MANAGE') || user?.roleId === 'MASTER_ADMIN' },
  ];

  const auditItems = [
    { name: 'Action & Update Tickets', path: '/tickets', icon: FileTextIcon, visible: true },
    { name: 'Global Scoped Search', path: '/search', icon: SearchIcon, visible: true },
    { name: 'Immutable Audit Vault', path: '/audit', icon: LockIcon, visible: hasPermission('AUDIT_READ') || user?.roleId === 'MASTER_ADMIN' },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-slate-900 selection:bg-blue-700 selection:text-white">
      {/* Turtleneck Top Announcement Bar in Executive Royal Blue */}
      <div className="bg-[#1E40AF] text-white text-xs px-5 py-1.5 flex items-center justify-between border-b border-blue-900 font-mono tracking-wide">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          <span className="font-semibold">STATE OF GUJARAT</span>
          <span className="text-blue-200">•</span>
          <span className="text-blue-100 hidden sm:inline">INTER-OPERABLE CRIMINAL JUSTICE SYSTEM // CCTNS-HSM GATEWAY</span>
        </div>
        <div className="text-[11px] text-blue-200 flex items-center gap-3">
          <span className="hidden md:inline">OFFICIAL LEA USE ONLY</span>
          <span className="text-blue-400">•</span>
          <span className="font-mono text-white/90">RESTRICTED PROVISIONING</span>
        </div>
      </div>

      {/* Main Header */}
      <header className="bg-white sticky top-0 z-50 h-16 px-5 flex items-center justify-between border-b border-slate-200 shadow-xs">
        <div className="flex items-center gap-3.5">
          {/* LEA Insignia Shield */}
          <div className="w-9 h-9 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-700 shadow-xs">
            <ShieldIcon className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold tracking-wider text-slate-900 uppercase">
                GUJARAT LAW ENFORCEMENT & JUDICIAL PLATFORM
              </span>
              <span className="text-[9.5px] font-mono font-bold px-1.5 py-0.5 rounded bg-blue-50 border border-blue-200 text-blue-700">
                SECURE INSTANCE
              </span>
            </div>
            <div className="text-[11px] font-mono text-slate-500 flex items-center gap-2 mt-0.5">
              <span className="text-blue-700 font-semibold">{user?.organizationName}</span>
              <span className="text-slate-400">[{user?.organizationCode}]</span>
              <span className="text-slate-300">•</span>
              <span className="text-emerald-700 flex items-center gap-1 font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 inline-block" />
                HSM ACTIVE
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {user && <AgencyBadge branch={user.agencyBranch} />}

          {user && (
            <div className="flex items-center gap-3 pl-3 border-l border-slate-200">
              <div className="text-right hidden sm:block">
                <div className="text-[12.5px] font-bold text-slate-900 flex items-center justify-end gap-1.5">
                  <span>{user.displayName}</span>
                  {user.isLayerAdmin && (
                    <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200">
                      ADMIN
                    </span>
                  )}
                </div>
                <div className="text-[10.5px] text-slate-500 font-mono">
                  {user.roleName} {user.badgeNumber ? `• BADGE #${user.badgeNumber}` : ''}
                </div>
              </div>

              <button
                onClick={handleLogout}
                className="p-2 text-slate-500 hover:text-red-700 rounded-lg hover:bg-red-50 transition-colors border border-transparent hover:border-red-200"
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
        {/* Tactical Sidebar */}
        <aside className="w-64 shrink-0 border-r border-slate-200 bg-white flex flex-col justify-between p-3 hidden md:flex">
          <div className="space-y-4">
            {/* Casework Section */}
            <div>
              <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 px-3 py-1 flex items-center justify-between">
                <span>Operational Casework</span>
                <span className="text-[9px] text-blue-700 font-normal">POL // COURT</span>
              </div>
              <nav className="space-y-0.5 mt-1">
                {coreItems.filter(i => i.visible).map(item => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      className={({ isActive }) =>
                        `flex items-center gap-2.5 px-3 py-2 text-[12.5px] transition-colors rounded-md ${
                          isActive
                            ? 'bg-blue-50 text-blue-800 font-semibold border-l-2 border-[#1D4ED8] rounded-l-none'
                            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 font-medium'
                        }`
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-blue-700' : 'text-slate-500'}`} />
                          <span>{item.name}</span>
                        </>
                      )}
                    </NavLink>
                  );
                })}
              </nav>
            </div>

            {/* Hierarchy & Command Section */}
            {adminItems.some(i => i.visible) && (
              <div>
                <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 px-3 py-1 flex items-center justify-between">
                  <span>Command & Governance</span>
                  <span className="text-[9px] text-blue-700 font-normal">HIERARCHY</span>
                </div>
                <nav className="space-y-0.5 mt-1">
                  {adminItems.filter(i => i.visible).map(item => {
                    const Icon = item.icon;
                    return (
                      <NavLink
                        key={item.path}
                        to={item.path}
                        className={({ isActive }) =>
                          `flex items-center gap-2.5 px-3 py-2 text-[12.5px] transition-colors rounded-md ${
                            isActive
                              ? 'bg-blue-50 text-blue-800 font-semibold border-l-2 border-[#1D4ED8] rounded-l-none'
                              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 font-medium'
                          }`
                        }
                      >
                        {({ isActive }) => (
                          <>
                            <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-blue-700' : 'text-slate-500'}`} />
                            <span>{item.name}</span>
                          </>
                        )}
                      </NavLink>
                    );
                  })}
                </nav>
              </div>
            )}

            {/* Audit & Security Section */}
            <div>
              <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 px-3 py-1 flex items-center justify-between">
                <span>Security & Audit Vault</span>
                <span className="text-[9px] text-blue-700 font-normal">APPEND-ONLY</span>
              </div>
              <nav className="space-y-0.5 mt-1">
                {auditItems.filter(i => i.visible).map(item => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      className={({ isActive }) =>
                        `flex items-center gap-2.5 px-3 py-2 text-[12.5px] transition-colors rounded-md ${
                          isActive
                            ? 'bg-blue-50 text-blue-800 font-semibold border-l-2 border-[#1D4ED8] rounded-l-none'
                            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 font-medium'
                        }`
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-blue-700' : 'text-slate-500'}`} />
                          <span>{item.name}</span>
                        </>
                      )}
                    </NavLink>
                  );
                })}
              </nav>
            </div>
          </div>

          {/* Sidebar Telemetry Footer */}
          <div className="pt-3 border-t border-slate-200 font-mono text-[10.5px] text-slate-500 px-2 space-y-1">
            <div className="flex items-center justify-between">
              <span>JURISDICTION:</span>
              <span className="text-slate-700 font-semibold">GUJARAT // IN</span>
            </div>
            <div className="flex items-center justify-between">
              <span>AUTH MODEL:</span>
              <span className="text-blue-700 font-semibold">9-PT CRYPTO RBAC</span>
            </div>
            <div className="flex items-center justify-between">
              <span>ISOLATION:</span>
              <span className="text-emerald-700 font-semibold">SUBTREE STRICT</span>
            </div>
          </div>
        </aside>

        {/* Main Content Body */}
        <main className="flex-1 p-6 overflow-y-auto bg-[#F8FAFC]">
          {children}
        </main>
      </div>
    </div>
  );
};

