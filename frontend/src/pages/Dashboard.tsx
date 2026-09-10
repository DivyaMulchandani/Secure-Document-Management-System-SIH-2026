import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { AgencyBadge } from '../components/ClassificationBadge';
import {
  FileTextIcon, ShieldIcon, FlaskIcon, ScaleIcon,
  UsersIcon, BuildingIcon, PlusIcon, SearchIcon, ActivityIcon, ArrowRight
} from '../components/Icons';

export const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const isMaster = user?.roleId === 'MASTER_ADMIN' || user?.roleId === 'SYSTEM_MASTER_ADMIN';
  const isAdmin = isMaster || user?.isLayerAdmin || (user?.roleId && user.roleId.includes('ADMIN'));

  useEffect(() => {
    api.get<any>('/system/stats')
      .then(res => setStats(res))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl font-bold tracking-tight text-primary-text">
              Operational Command Dashboard
            </h1>
            {user && <AgencyBadge branch={user.agencyBranch} />}
          </div>
          <p className="text-xs text-muted-text font-mono">
            Active Scope: {user?.organizationName} ({user?.organizationCode}) • Role: {user?.roleName}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {user?.permissions.includes('CASE_CREATE') && (
            <button
              onClick={() => navigate('/cases?new=true')}
              className="btn-primary"
            >
              <PlusIcon className="w-3.5 h-3.5" />
              <span>Register New FIR</span>
            </button>
          )}
          <button
            onClick={() => navigate('/search')}
            className="btn-secondary"
          >
            <SearchIcon className="w-3.5 h-3.5" />
            <span>Search Records</span>
          </button>
        </div>
      </div>

      {/* ADMINISTRATOR COMMAND CENTER (ADMINISTRATORS ONLY) */}
      {isAdmin && (
        <div className="glass-card p-5 border border-border space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border">
            <div className="flex items-center gap-2">
              <ShieldIcon className="w-5 h-5 text-accent" />
              <div>
                <h2 className="text-sm font-bold text-primary-text uppercase tracking-wider font-mono">
                  Administrator Command Center
                </h2>
                <p className="text-xs text-muted-text font-mono">
                  Sovereign Tree Delegated Authority • Subtree Reach
                </p>
              </div>
            </div>

            {/* Fast Action Buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => navigate('/organizations')}
                className="px-2.5 py-1.5 rounded bg-surface hover:bg-surface-hover text-primary-text border border-border font-mono text-xs flex items-center gap-1.5 transition-colors"
              >
                <BuildingIcon className="w-3.5 h-3.5 text-accent" />
                <span>Manage Organization</span>
              </button>
              <button
                onClick={() => navigate('/users?filterTier=ADMINS')}
                className="px-2.5 py-1.5 rounded bg-surface hover:bg-surface-hover text-primary-text border border-border font-mono text-xs flex items-center gap-1.5 transition-colors"
              >
                <ShieldIcon className="w-3.5 h-3.5 text-blue-700" />
                <span>Manage Administrators</span>
              </button>
              <button
                onClick={() => navigate('/users')}
                className="px-2.5 py-1.5 rounded bg-surface hover:bg-surface-hover text-primary-text border border-border font-mono text-xs flex items-center gap-1.5 transition-colors"
              >
                <UsersIcon className="w-3.5 h-3.5 text-accent" />
                <span>Manage Users</span>
              </button>
              <button
                onClick={() => navigate('/users')}
                className="px-2.5 py-1.5 rounded bg-surface hover:bg-surface-hover text-primary-text border border-border font-mono text-xs flex items-center gap-1.5 transition-colors"
              >
                <span>View Roles</span>
              </button>
              <button
                onClick={() => navigate('/audit')}
                className="px-2.5 py-1.5 rounded bg-accent/15 text-accent hover:bg-accent/25 border border-accent/30 font-mono text-xs flex items-center gap-1.5 transition-colors"
              >
                <ActivityIcon className="w-3.5 h-3.5" />
                <span>Audit Logs</span>
              </button>
            </div>
          </div>

          {/* Scope & Hierarchy Telemetry */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs font-mono">
            <div className="p-3 bg-surface rounded border border-border">
              <span className="text-muted-text block text-[10px] uppercase font-bold">My Organization</span>
              <span className="font-semibold text-primary-text mt-0.5 block truncate">
                {user?.organizationName}
              </span>
              <span className="text-[10px] text-accent mt-0.5 block">
                {user?.organizationCode}
              </span>
            </div>
            <div className="p-3 bg-surface rounded border border-border">
              <span className="text-muted-text block text-[10px] uppercase font-bold">Administrative Scope</span>
              <span className="font-semibold text-accent mt-0.5 block truncate">
                {user?.organizationName} (SUBTREE)
              </span>
              <span className="text-[10px] text-muted-darker mt-0.5 block">
                Full Downward Hierarchy Reach
              </span>
            </div>
            <div className="p-3 bg-surface rounded border border-border">
              <span className="text-muted-text block text-[10px] uppercase font-bold">Child Nodes</span>
              <span className="font-semibold text-primary-text mt-0.5 text-base block">
                {stats?.orgsCount ? Math.max(0, stats.orgsCount - 1) : 0}
              </span>
              <span className="text-[10px] text-muted-text mt-0.5 block">Subordinate Units</span>
            </div>
            <div className="p-3 bg-surface rounded border border-border">
              <span className="text-muted-text block text-[10px] uppercase font-bold">Subordinate Admins</span>
              <span className="font-semibold text-blue-700 mt-0.5 text-base block">
                {stats?.agencyBodies?.[user?.agencyBranch]?.layerAdmins ?? 1}
              </span>
              <span className="text-[10px] text-muted-text mt-0.5 block">Layer Administrators</span>
            </div>
            <div className="p-3 bg-surface rounded border border-border col-span-2 sm:col-span-1">
              <span className="text-muted-text block text-[10px] uppercase font-bold">Users in Scope</span>
              <span className="font-semibold text-emerald-700 mt-0.5 text-base block">
                {stats?.usersCount || 1}
              </span>
              <span className="text-[10px] text-muted-text mt-0.5 block">Total Personnel</span>
            </div>
          </div>
        </div>
      )}

      {/* Core Telemetry Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="glass-card p-4 border border-border">
          <div className="flex items-center justify-between text-muted-text mb-2">
            <span className="text-xs font-mono font-bold text-slate-700">TOTAL CASES</span>
            <FileTextIcon className="w-4 h-4 text-blue-700" />
          </div>
          <div className="text-2xl font-bold text-primary-text font-mono">
            {loading ? '...' : stats?.cases?.total_cases || 0}
          </div>
          <div className="text-[11px] text-muted-text mt-1 flex items-center gap-2">
            <span className="text-amber-700 font-bold font-mono">{stats?.cases?.under_investigation || 0}</span> investigating
            <span>•</span>
            <span className="text-blue-700 font-bold font-mono">{stats?.cases?.chargesheeted || 0}</span> chargesheeted
          </div>
        </div>

        <div className="glass-card p-4 border border-border">
          <div className="flex items-center justify-between text-muted-text mb-2">
            <span className="text-xs font-mono font-bold text-slate-700">EVIDENCE IN CUSTODY</span>
            <ShieldIcon className="w-4 h-4 text-blue-700" />
          </div>
          <div className="text-2xl font-bold text-primary-text font-mono">
            {loading ? '...' : stats?.evidence?.total_evidence || 0}
          </div>
          <div className="text-[11px] text-muted-text mt-1 flex items-center gap-2">
            <span className="text-blue-700 font-bold font-mono">{stats?.evidence?.in_police_custody || 0}</span> police
            <span>•</span>
            <span className="text-indigo-700 font-bold font-mono">{stats?.evidence?.in_forensic_lab || 0}</span> in lab
          </div>
        </div>

        <div className="glass-card p-4 border border-border">
          <div className="flex items-center justify-between text-muted-text mb-2">
            <span className="text-xs font-mono font-bold text-slate-700">FORENSIC EXAMS</span>
            <FlaskIcon className="w-4 h-4 text-indigo-700" />
          </div>
          <div className="text-2xl font-bold text-primary-text font-mono">
            {loading ? '...' : stats?.forensics?.total_submissions || 0}
          </div>
          <div className="text-[11px] text-muted-text mt-1 flex items-center gap-2">
            <span className="text-amber-700 font-bold font-mono">{stats?.forensics?.pending_examination || 0}</span> pending
            <span>•</span>
            <span className="text-emerald-700 font-bold font-mono">{stats?.forensics?.reports_sealed || 0}</span> sealed
          </div>
        </div>

        <div className="glass-card p-4 border border-border">
          <div className="flex items-center justify-between text-muted-text mb-2">
            <span className="text-xs font-mono font-bold text-slate-700">COURT ADJUDICATIONS</span>
            <ScaleIcon className="w-4 h-4 text-emerald-700" />
          </div>
          <div className="text-2xl font-bold text-primary-text font-mono">
            {loading ? '...' : stats?.court?.total_court_cases || 0}
          </div>
          <div className="text-[11px] text-muted-text mt-1 flex items-center gap-2">
            <span className="text-emerald-700 font-bold font-mono">{stats?.court?.pending_trials || 0}</span> in trial
            <span>•</span>
            <span className="text-success font-mono">{stats?.court?.disposed_trials || 0}</span> disposed
          </div>
        </div>
      </div>

      {/* 3-BODY INSTITUTIONAL GOVERNANCE (MASTER ADMIN ONLY) */}
      {isMaster && (
        <div className="glass-card p-5 border border-border">
          <div className="flex items-center justify-between pb-3 mb-4 border-b border-border">
            <div className="flex items-center gap-2">
              <BuildingIcon className="w-4 h-4 text-accent" />
              <h2 className="text-sm font-bold text-primary-text uppercase tracking-wider font-mono">
                Multi-Agency Governance & Hierarchical Administration Matrix
              </h2>
            </div>
            <button
              onClick={() => navigate('/users')}
              className="text-xs text-accent hover:underline font-mono flex items-center gap-1"
            >
              <span>Manage Layer Admins & Personnel</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Police Command Card */}
            <div
              onClick={() => navigate('/users?body=POLICE')}
              className="p-4 rounded-lg border border-blue-500/30 bg-blue-950/20 hover:border-blue-500/60 transition-all cursor-pointer group"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <ShieldIcon className="w-4 h-4 text-blue-400" />
                  <span className="font-bold text-xs uppercase tracking-wider text-blue-300">Police Command</span>
                </div>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                  POLICE
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                <div className="p-2 rounded bg-surface/40 border border-border">
                  <div className="text-muted-text text-[10px]">STATIONS & HUBS</div>
                  <div className="text-lg font-bold text-primary-text mt-0.5">
                    {stats?.agencyBodies?.POLICE?.totalNodes ?? 0}
                  </div>
                </div>
                <div className="p-2 rounded bg-surface/40 border border-border">
                  <div className="text-muted-text text-[10px]">LAYER ADMINS</div>
                  <div className="text-lg font-bold text-accent mt-0.5">
                    {stats?.agencyBodies?.POLICE?.layerAdmins ?? 0}
                  </div>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between text-[11px] text-muted-text">
                <span>{stats?.agencyBodies?.POLICE?.activePersonnel ?? 0} Enrolled Personnel</span>
                <span className="text-blue-400 group-hover:translate-x-0.5 transition-transform">Configure →</span>
              </div>
            </div>

            {/* Forensic Command Card */}
            <div
              onClick={() => navigate('/users?body=FORENSICS')}
              className="p-4 rounded-lg border border-purple-500/30 bg-purple-950/20 hover:border-purple-500/60 transition-all cursor-pointer group"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <FlaskIcon className="w-4 h-4 text-purple-400" />
                  <span className="font-bold text-xs uppercase tracking-wider text-purple-300">Forensics (DFSS)</span>
                </div>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  FORENSICS
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                <div className="p-2 rounded bg-surface/40 border border-border">
                  <div className="text-muted-text text-[10px]">LABS & UNITS</div>
                  <div className="text-lg font-bold text-primary-text mt-0.5">
                    {stats?.agencyBodies?.FORENSICS?.totalNodes ?? 0}
                  </div>
                </div>
                <div className="p-2 rounded bg-surface/40 border border-border">
                  <div className="text-muted-text text-[10px]">LAB DIRECTORS</div>
                  <div className="text-lg font-bold text-purple-400 mt-0.5">
                    {stats?.agencyBodies?.FORENSICS?.layerAdmins ?? 0}
                  </div>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between text-[11px] text-muted-text">
                <span>{stats?.agencyBodies?.FORENSICS?.activePersonnel ?? 0} Scientific Examiners</span>
                <span className="text-purple-400 group-hover:translate-x-0.5 transition-transform">Configure →</span>
              </div>
            </div>

            {/* Judicial Registry Card */}
            <div
              onClick={() => navigate('/users?body=JUDICIARY')}
              className="p-4 rounded-lg border border-amber-500/30 bg-amber-950/20 hover:border-amber-500/60 transition-all cursor-pointer group"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <ScaleIcon className="w-4 h-4 text-amber-400" />
                  <span className="font-bold text-xs uppercase tracking-wider text-amber-300">Judicial Registry</span>
                </div>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  JUDICIARY
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                <div className="p-2 rounded bg-surface/40 border border-border">
                  <div className="text-muted-text text-[10px]">COURTS & BENCHES</div>
                  <div className="text-lg font-bold text-primary-text mt-0.5">
                    {stats?.agencyBodies?.JUDICIARY?.totalNodes ?? 0}
                  </div>
                </div>
                <div className="p-2 rounded bg-surface/40 border border-border">
                  <div className="text-muted-text text-[10px]">REGISTRARS / ADM</div>
                  <div className="text-lg font-bold text-amber-400 mt-0.5">
                    {stats?.agencyBodies?.JUDICIARY?.layerAdmins ?? 0}
                  </div>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between text-[11px] text-muted-text">
                <span>{stats?.agencyBodies?.JUDICIARY?.activePersonnel ?? 0} Judges & Registrars</span>
                <span className="text-amber-400 group-hover:translate-x-0.5 transition-transform">Configure →</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Two Column Section: Live Activity Feed + Institutional Scope Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Activity Feed (2 Cols) */}
        <div className="lg:col-span-2 glass-card p-5 border border-border">
          <div className="flex items-center justify-between pb-3 mb-4 border-b border-border-light">
            <div className="flex items-center gap-2">
              <ActivityIcon className="w-4 h-4 text-accent" />
              <h2 className="text-sm font-bold text-primary-text uppercase tracking-wider font-mono">
                Recent Cross-Agency Activity Ledger
              </h2>
            </div>
            <span className="text-[11px] text-muted-text font-mono">Synchronous Real-Time Feed</span>
          </div>

          {loading ? (
            <div className="p-8 text-center text-xs text-muted-text">Loading activity feed...</div>
          ) : !stats?.recentEvents || stats.recentEvents.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted-text">No recent activity recorded in your scope.</div>
          ) : (
            <div className="space-y-3">
              {stats.recentEvents.map((evt: any) => (
                <div key={evt.id} className="p-3 rounded bg-bg/50 border border-border hover:border-border-light transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-bold text-primary-text">{evt.title}</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-surface border border-border text-accent">
                          FIR: {evt.fir_number}
                        </span>
                        <AgencyBadge branch={evt.agency_branch} className="text-[9px] px-1.5 py-0" />
                      </div>
                      <p className="text-xs text-muted-text">{evt.description}</p>
                    </div>
                    <span className="text-[10.5px] font-mono text-muted-darker shrink-0">
                      {new Date(evt.occurred_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Institutional Jurisdictional Overview (1 Col) */}
        <div className="glass-card p-5 border border-border flex flex-col justify-between">
          <div>
            <div className="pb-3 mb-4 border-b border-border-light">
              <h2 className="text-sm font-bold text-primary-text uppercase tracking-wider font-mono">
                Jurisdictional Envelope
              </h2>
              <p className="text-xs text-muted-text mt-0.5">Hierarchical Boundary Verification</p>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded bg-bg/60 border border-border">
                <div className="text-muted-darker font-mono text-[10.5px] uppercase">Primary Node</div>
                <div className="font-semibold text-primary-text mt-0.5">{user?.organizationName}</div>
                <div className="text-[11px] font-mono text-muted-text mt-0.5">Code: {user?.organizationCode}</div>
              </div>

              <div className="p-3 rounded bg-bg/60 border border-border">
                <div className="text-muted-darker font-mono text-[10.5px] uppercase">Subtree Reach</div>
                <div className="font-semibold text-primary-text mt-0.5 font-mono">
                  {stats?.orgsCount || 1} Subordinate Units • {stats?.usersCount || 1} Registered Personnel
                </div>
                <div className="text-[11px] text-muted-text mt-0.5">
                  Descendant traversal active. Sibling isolation enforced.
                </div>
              </div>

              <div className="p-3 rounded bg-bg/60 border border-border">
                <div className="text-muted-darker font-mono text-[10.5px] uppercase">Operational Acts Enforced</div>
                <div className="text-primary-text font-medium mt-0.5">
                  Bharatiya Nyaya Sanhita, 2023 (BNS)
                </div>
                <div className="text-[11px] text-muted-text mt-0.5">
                  Bharatiya Nagarik Suraksha Sanhita, 2023 (BNSS)
                </div>
              </div>
            </div>
          </div>

          <div className="pt-4 mt-4 border-t border-border-light">
            <button
              onClick={() => navigate('/cases')}
              className="w-full btn-secondary py-2 justify-between"
            >
              <span>Explore Case Workspaces</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
