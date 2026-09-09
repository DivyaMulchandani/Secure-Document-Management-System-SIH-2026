import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { AgencyBadge } from '../components/ClassificationBadge';
import {
  UsersIcon, SearchIcon, PlusIcon, LockIcon, CheckIcon,
  ShieldIcon, FlaskIcon, ScaleIcon, BuildingIcon, EyeIcon
} from '../components/Icons';

type AgencyBranch = 'POLICE' | 'FORENSICS' | 'JUDICIARY' | 'MASTER';

interface UserRecord {
  id: string;
  username: string;
  email: string;
  display_name: string;
  badge_number?: string;
  phone_number?: string;
  designation?: string;
  department_wing?: string;
  clearance_level: string;
  is_layer_admin: boolean;
  status: 'ACTIVE' | 'LOCKED' | 'SUSPENDED';
  failed_login_count: number;
  locked_until?: string;
  last_login_at?: string;
  created_at: string;
  role_id: string;
  role_name: string;
  agency_branch: AgencyBranch;
  org_id: string;
  org_name: string;
  org_code: string;
  org_path: string;
  org_level: number;
}

export const Users: React.FC = () => {
  const { user, hasPermission } = useAuth();
  const isMaster = user?.roleId === 'MASTER_ADMIN';

  // Active body tab selection (defaults to user's branch if not master)
  const [activeBody, setActiveBody] = useState<AgencyBranch>(
    isMaster ? 'POLICE' : ((user?.agencyBranch as AgencyBranch) || 'POLICE')
  );

  const [usersList, setUsersList] = useState<UserRecord[]>([]);
  const [rolesList, setRolesList] = useState<any[]>([]);
  const [orgsList, setOrgsList] = useState<any[]>([]);
  const [hierarchySummary, setHierarchySummary] = useState<any[]>([]);
  const [assignableRoles, setAssignableRoles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOrgFilter, setSelectedOrgFilter] = useState('');
  const [filterTier, setFilterTier] = useState<'ALL' | 'ADMINS' | 'OFFICERS'>('ALL');

  const [searchParams] = useSearchParams();
  const orgParam = searchParams.get('orgId');

  // Modals
  const [showBodyAdminModal, setShowBodyAdminModal] = useState(false);
  const [bodyAdminForm, setBodyAdminForm] = useState({
    bodyId: 'POLICE' as 'POLICE' | 'JUDICIARY' | 'FORENSICS',
    username: '',
    email: '',
    displayName: '',
    badgeNumber: '',
    phoneNumber: '',
    designation: '',
    departmentWing: '',
    password: 'Gov@Secure2026!',
  });

  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [isEnrollingAdmin, setIsEnrollingAdmin] = useState(false);
  const [selectedUserDetail, setSelectedUserDetail] = useState<UserRecord | null>(null);
  const [isEditingUser, setIsEditingUser] = useState(false);

  // Enrollment Form State
  const [enrollForm, setEnrollForm] = useState({
    username: '',
    email: '',
    displayName: '',
    badgeNumber: '',
    phoneNumber: '',
    designation: '',
    departmentWing: '',
    clearanceLevel: 'CONFIDENTIAL',
    isLayerAdmin: false,
    password: '',
    primaryRoleId: '',
    primaryOrganizationId: '',
  });

  // Edit Form State
  const [editForm, setEditForm] = useState({
    displayName: '',
    badgeNumber: '',
    phoneNumber: '',
    designation: '',
    departmentWing: '',
    clearanceLevel: 'CONFIDENTIAL',
    isLayerAdmin: false,
    primaryRoleId: '',
    primaryOrganizationId: '',
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [uRes, rRes, oRes, sumRes] = await Promise.all([
        api.get<{ users: UserRecord[] }>('/users'),
        api.get<{ roles: any[] }>('/users/roles'),
        api.get<{ organizations: any[] }>('/organizations'),
        api.get<{ summary: any[] }>('/users/hierarchy-summary'),
      ]);
      setUsersList(uRes.users || []);
      setRolesList(rRes.roles || []);
      setOrgsList(oRes.organizations || []);
      setHierarchySummary(sumRes.summary || []);
    } catch (err) {
      console.error('Failed to load user management data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (orgParam) {
      setSelectedOrgFilter(orgParam);
      const matchedOrg = orgsList.find((o: any) => o.id === orgParam);
      if (matchedOrg && matchedOrg.agency_branch) {
        setActiveBody(matchedOrg.agency_branch);
      }
    }
  }, [orgParam, orgsList]);

  // Filter orgs & roles applicable to active body
  const bodyOrgs = orgsList.filter((o: any) => o.agency_branch === activeBody);
  const bodyRoles = rolesList.filter((r: any) => r.agency_branch === activeBody);

  // Filter users by active body, tier, org, and search
  const filteredUsers = usersList.filter(u => {
    if (u.agency_branch !== activeBody) return false;
    if (selectedOrgFilter && u.org_id !== selectedOrgFilter) return false;
    if (filterTier === 'ADMINS' && !u.is_layer_admin && !u.role_id.endsWith('_ADMIN')) return false;
    if (filterTier === 'OFFICERS' && (u.is_layer_admin || u.role_id.endsWith('_ADMIN'))) return false;
    if (!searchQuery) return true;

    const q = searchQuery.toLowerCase();
    return (
      u.display_name?.toLowerCase().includes(q) ||
      u.username?.toLowerCase().includes(q) ||
      u.badge_number?.toLowerCase().includes(q) ||
      u.designation?.toLowerCase().includes(q) ||
      u.department_wing?.toLowerCase().includes(q) ||
      u.phone_number?.toLowerCase().includes(q) ||
      u.org_name?.toLowerCase().includes(q)
    );
  });

  // Calculate stats for active body
  const activeBodyUsers = usersList.filter(u => u.agency_branch === activeBody);
  const activeBodyAdmins = activeBodyUsers.filter(u => u.is_layer_admin || u.role_id.endsWith('_ADMIN'));
  const activeBodyNodes = orgsList.filter((o: any) => o.agency_branch === activeBody);

  const isNodeAuthorized = (org: any) => {
    if (isMaster) return true;
    if (org.agency_branch !== user?.agencyBranch) return false;
    if (!user?.organizationPath) return false;
    return org.hierarchy_path === user.organizationPath || org.hierarchy_path?.startsWith(user.organizationPath + '.');
  };

  const openEnrollModal = (asAdmin: boolean, initialOrgId?: string) => {
    setIsEnrollingAdmin(asAdmin);
    const targetOrgId = initialOrgId || selectedOrgFilter || (bodyOrgs.find((o: any) => isNodeAuthorized(o))?.id || bodyOrgs[0]?.id || '');
    const defaultRole = asAdmin ? 'NODE_ADMIN' : 'POLICE_OFFICER';
    setEnrollForm({
      username: '',
      email: '',
      displayName: '',
      badgeNumber: '',
      phoneNumber: '',
      designation: asAdmin ? 'Commanding Officer / Node Administrator' : '',
      departmentWing: '',
      clearanceLevel: asAdmin ? 'TOP_SECRET' : 'CONFIDENTIAL',
      isLayerAdmin: asAdmin,
      password: '',
      primaryRoleId: defaultRole,
      primaryOrganizationId: targetOrgId,
    });
    setShowEnrollModal(true);
  };

  // Dynamic role filtering based on target organization node
  useEffect(() => {
    if (enrollForm.primaryOrganizationId) {
      api.get<{ roles: any[] }>(`/users/assignable-roles?nodeId=${enrollForm.primaryOrganizationId}`)
        .then(res => {
          const list = res.roles || [];
          setAssignableRoles(list);
          if (list.length > 0) {
            if (isEnrollingAdmin) {
              const adminRole = list.find((r: any) => r.id === 'NODE_ADMIN') || list.find((r: any) => r.id.includes('ADMIN'));
              if (adminRole) {
                setEnrollForm(prev => ({ ...prev, primaryRoleId: adminRole.id }));
                return;
              }
            }
            if (!list.some((r: any) => r.id === enrollForm.primaryRoleId)) {
              setEnrollForm(prev => ({ ...prev, primaryRoleId: list[0].id }));
            }
          }
        })
        .catch(console.error);
    }
  }, [enrollForm.primaryOrganizationId, isEnrollingAdmin]);

  // Handle URL search params for quick enrollment
  useEffect(() => {
    const asAdmin = searchParams.get('asAdmin') === 'true';
    const org = searchParams.get('orgId');
    if (asAdmin && org && orgsList.length > 0) {
      openEnrollModal(true, org);
    } else if (org && orgsList.length > 0 && searchParams.get('new') === 'true') {
      openEnrollModal(false, org);
    }
  }, [searchParams, orgsList]);

  const handleEnrollSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/users', {
        ...enrollForm,
        isLayerAdmin: isEnrollingAdmin || enrollForm.isLayerAdmin,
      });
      setShowEnrollModal(false);
      fetchData();
    } catch (err: any) {
      alert(err.message || 'Failed to enroll user');
    }
  };

  const handleBodyAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/users/body-admin', bodyAdminForm);
      setShowBodyAdminModal(false);
      setBodyAdminForm({
        bodyId: 'POLICE',
        username: '',
        email: '',
        displayName: '',
        badgeNumber: '',
        phoneNumber: '',
        designation: '',
        departmentWing: '',
        password: 'Gov@Secure2026!',
      });
      fetchData();
    } catch (err: any) {
      alert(err.message || 'Failed to provision Sovereign Body Administrator');
    }
  };

  const handleOpenDetail = (u: UserRecord) => {
    setSelectedUserDetail(u);
    setEditForm({
      displayName: u.display_name,
      badgeNumber: u.badge_number || '',
      phoneNumber: u.phone_number || '',
      designation: u.designation || '',
      departmentWing: u.department_wing || '',
      clearanceLevel: u.clearance_level || 'CONFIDENTIAL',
      isLayerAdmin: u.is_layer_admin,
      primaryRoleId: u.role_id,
      primaryOrganizationId: u.org_id,
    });
    setIsEditingUser(false);
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserDetail) return;
    try {
      await api.put(`/users/${selectedUserDetail.id}`, editForm);
      setIsEditingUser(false);
      fetchData();
      // Update selected modal view
      setSelectedUserDetail({
        ...selectedUserDetail,
        display_name: editForm.displayName,
        badge_number: editForm.badgeNumber,
        phone_number: editForm.phoneNumber,
        designation: editForm.designation,
        department_wing: editForm.departmentWing,
        clearance_level: editForm.clearanceLevel,
        is_layer_admin: editForm.isLayerAdmin,
        role_id: editForm.primaryRoleId,
        org_id: editForm.primaryOrganizationId,
      });
    } catch (err: any) {
      alert(err.message || 'Failed to update user profile');
    }
  };

  const handleUpdateStatus = async (userId: string, newStatus: 'ACTIVE' | 'LOCKED') => {
    try {
      await api.put(`/users/${userId}/status`, { status: newStatus });
      fetchData();
      if (selectedUserDetail && selectedUserDetail.id === userId) {
        setSelectedUserDetail({ ...selectedUserDetail, status: newStatus });
      }
    } catch (err: any) {
      alert(err.message || 'Failed to update user status');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl font-bold tracking-tight text-primary-text flex items-center gap-2">
              <UsersIcon className="w-5 h-5 text-accent" />
              <span>Multi-Agency Personnel & Hierarchical Admin Governance</span>
            </h1>
            {user && <AgencyBadge branch={user.agencyBranch} />}
          </div>
          <p className="text-xs text-muted-text font-mono">
            Subtree Sibling Isolation & Same-Layer/Below-Layer Admin Authority • Logged in as: {user?.displayName} ({user?.roleName})
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isMaster && (
            <button
              onClick={() => setShowBodyAdminModal(true)}
              className="px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors"
            >
              <ShieldIcon className="w-3.5 h-3.5" />
              <span>👑 Provision Body Admin</span>
            </button>
          )}
          {hasPermission('USER_CREATE') && (
            <>
              <button
                onClick={() => openEnrollModal(true)}
                className="btn-secondary text-xs border-accent/40 text-accent hover:bg-accent/10"
              >
                <ShieldIcon className="w-3.5 h-3.5 text-accent" />
                <span>Provision Layer Admin</span>
              </button>
              <button
                onClick={() => openEnrollModal(false)}
                className="btn-primary text-xs"
              >
                <PlusIcon className="w-3.5 h-3.5" />
                <span>Enroll Personnel</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* 3-BODY INSTITUTIONAL GOVERNANCE SWITCHER TABS */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        {/* Police Body Tab */}
        <button
          onClick={() => (isMaster || user?.agencyBranch === 'POLICE') && setActiveBody('POLICE')}
          disabled={!isMaster && user?.agencyBranch !== 'POLICE'}
          className={`p-4 rounded-lg border text-left transition-all ${
            activeBody === 'POLICE'
              ? 'bg-blue-950/40 border-blue-500/80 shadow-lg shadow-blue-500/10'
              : !isMaster && user?.agencyBranch !== 'POLICE'
              ? 'opacity-40 cursor-not-allowed bg-surface/30 border-border'
              : 'glass-card border-border hover:border-blue-500/40'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldIcon className="w-4 h-4 text-blue-400" />
              <span className="font-bold text-xs uppercase tracking-wider text-blue-300">Police Department</span>
            </div>
            {activeBody === 'POLICE' && <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />}
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-xl font-bold font-mono text-primary-text">
              {usersList.filter(u => u.agency_branch === 'POLICE').length}
            </span>
            <span className="text-[11px] text-muted-text font-mono">
              {orgsList.filter((o: any) => o.agency_branch === 'POLICE').length} Stations/Hubs
            </span>
          </div>
          <div className="text-[10px] text-muted-text mt-1">
            Law Enforcement & Criminal Investigation
          </div>
        </button>

        {/* Forensics Body Tab */}
        <button
          onClick={() => (isMaster || user?.agencyBranch === 'FORENSICS') && setActiveBody('FORENSICS')}
          disabled={!isMaster && user?.agencyBranch !== 'FORENSICS'}
          className={`p-4 rounded-lg border text-left transition-all ${
            activeBody === 'FORENSICS'
              ? 'bg-purple-950/40 border-purple-500/80 shadow-lg shadow-purple-500/10'
              : !isMaster && user?.agencyBranch !== 'FORENSICS'
              ? 'opacity-40 cursor-not-allowed bg-surface/30 border-border'
              : 'glass-card border-border hover:border-purple-500/40'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FlaskIcon className="w-4 h-4 text-purple-400" />
              <span className="font-bold text-xs uppercase tracking-wider text-purple-300">Forensics (DFSS)</span>
            </div>
            {activeBody === 'FORENSICS' && <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />}
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-xl font-bold font-mono text-primary-text">
              {usersList.filter(u => u.agency_branch === 'FORENSICS').length}
            </span>
            <span className="text-[11px] text-muted-text font-mono">
              {orgsList.filter((o: any) => o.agency_branch === 'FORENSICS').length} Labs & Units
            </span>
          </div>
          <div className="text-[10px] text-muted-text mt-1">
            Scientific Analysis & Sealed Reports
          </div>
        </button>

        {/* Judiciary Body Tab */}
        <button
          onClick={() => (isMaster || user?.agencyBranch === 'JUDICIARY') && setActiveBody('JUDICIARY')}
          disabled={!isMaster && user?.agencyBranch !== 'JUDICIARY'}
          className={`p-4 rounded-lg border text-left transition-all ${
            activeBody === 'JUDICIARY'
              ? 'bg-amber-950/40 border-amber-500/80 shadow-lg shadow-amber-500/10'
              : !isMaster && user?.agencyBranch !== 'JUDICIARY'
              ? 'opacity-40 cursor-not-allowed bg-surface/30 border-border'
              : 'glass-card border-border hover:border-amber-500/40'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ScaleIcon className="w-4 h-4 text-amber-400" />
              <span className="font-bold text-xs uppercase tracking-wider text-amber-300">Judicial Courts</span>
            </div>
            {activeBody === 'JUDICIARY' && <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />}
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-xl font-bold font-mono text-primary-text">
              {usersList.filter(u => u.agency_branch === 'JUDICIARY').length}
            </span>
            <span className="text-[11px] text-muted-text font-mono">
              {orgsList.filter((o: any) => o.agency_branch === 'JUDICIARY').length} Courts & Registries
            </span>
          </div>
          <div className="text-[10px] text-muted-text mt-1">
            Trials, Order Sheets & Pronouncements
          </div>
        </button>

        {/* Universal Apex Tab (Master Admin Only) */}
        {isMaster && (
          <button
            onClick={() => setActiveBody('MASTER')}
            className={`p-4 rounded-lg border text-left transition-all ${
              activeBody === 'MASTER'
                ? 'bg-emerald-950/40 border-emerald-500/80 shadow-lg shadow-emerald-500/10'
                : 'glass-card border-border hover:border-emerald-500/40'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BuildingIcon className="w-4 h-4 text-emerald-400" />
                <span className="font-bold text-xs uppercase tracking-wider text-emerald-300">Master Governance</span>
              </div>
              {activeBody === 'MASTER' && <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />}
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-xl font-bold font-mono text-primary-text">
                {usersList.filter(u => u.agency_branch === 'MASTER').length}
              </span>
              <span className="text-[11px] text-muted-text font-mono">
                Apex Directorate
              </span>
            </div>
            <div className="text-[10px] text-muted-text mt-1">
              Statewide Oversight & Institutional Audit
            </div>
          </button>
        )}
      </div>

      {/* Layer Governance Scope Card */}
      <div className="glass-card p-4 border border-border flex flex-col md:flex-row md:items-center justify-between gap-4 bg-surface/30">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-surface border border-border text-accent">
            <BuildingIcon className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-semibold text-primary-text flex items-center gap-2">
              <span>Jurisdictional Layer Scope:</span>
              <span className="font-mono text-accent font-bold">
                {activeBody} BRANCH • {activeBodyNodes.length} Nodes Covered
              </span>
            </div>
            <p className="text-[11px] text-muted-text font-mono mt-0.5">
              Active Scope: {user?.organizationName} • {activeBodyAdmins.length} Layer Administrators designated • {activeBodyUsers.length} Enrolled Personnel
            </p>
          </div>
        </div>

        {/* Tier Switcher Pills */}
        <div className="flex items-center bg-surface/80 p-1 rounded-lg border border-border text-xs">
          <button
            onClick={() => setFilterTier('ALL')}
            className={`px-3 py-1 rounded font-medium transition-colors ${
              filterTier === 'ALL' ? 'bg-accent text-white shadow-sm' : 'text-muted-text hover:text-primary-text'
            }`}
          >
            All Personnel ({activeBodyUsers.length})
          </button>
          <button
            onClick={() => setFilterTier('ADMINS')}
            className={`px-3 py-1 rounded font-medium transition-colors flex items-center gap-1.5 ${
              filterTier === 'ADMINS' ? 'bg-accent text-white shadow-sm' : 'text-muted-text hover:text-primary-text'
            }`}
          >
            <span>Layer Admins</span>
            <span className="text-[10px] px-1 py-0.2 rounded bg-black/30 font-mono">
              {activeBodyAdmins.length}
            </span>
          </button>
          <button
            onClick={() => setFilterTier('OFFICERS')}
            className={`px-3 py-1 rounded font-medium transition-colors ${
              filterTier === 'OFFICERS' ? 'bg-accent text-white shadow-sm' : 'text-muted-text hover:text-primary-text'
            }`}
          >
            Field / Staff ({activeBodyUsers.length - activeBodyAdmins.length})
          </button>
        </div>
      </div>

      {/* Search & Hierarchy Node Filter Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-1 items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <SearchIcon className="w-4 h-4 text-muted-text absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search by name, badge, username, rank, phone..."
              className="input-field pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <select
            className="input-field max-w-xs text-xs"
            value={selectedOrgFilter}
            onChange={(e) => setSelectedOrgFilter(e.target.value)}
          >
            <option value="">All {activeBody} Establishments</option>
            {bodyOrgs.map((o: any) => (
              <option key={o.id} value={o.id}>
                {o.name} (L{o.level} - {o.code})
              </option>
            ))}
          </select>
        </div>

        <div className="text-xs text-muted-text font-mono">
          Showing {filteredUsers.length} of {activeBodyUsers.length} records
        </div>
      </div>

      {/* Personnel Roster Table */}
      <div className="glass-card overflow-hidden border border-border">
        {loading ? (
          <div className="p-12 text-center text-xs text-muted-text font-mono">
            Loading {activeBody} personnel and administrative hierarchy...
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-12 text-center text-xs text-muted-text">
            <UsersIcon className="w-10 h-10 text-muted-darker mx-auto mb-2" />
            <h3 className="text-sm font-semibold text-primary-text">No Personnel Found</h3>
            <p className="mt-1">No records match your filter criteria in the {activeBody} jurisdiction.</p>
          </div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="bg-surface border-b border-border text-[11px] font-mono uppercase text-muted-text">
              <tr>
                <th className="py-3 px-4">Officer / User Profile</th>
                <th className="py-3 px-4">Rank & Administrative Tier</th>
                <th className="py-3 px-4">Station / Lab / Registry</th>
                <th className="py-3 px-4">Contact & Clearance</th>
                <th className="py-3 px-4">Security Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredUsers.map((u) => {
                const isUserAdmin = u.is_layer_admin || u.role_id.endsWith('_ADMIN');
                return (
                  <tr key={u.id} className="hover:bg-surface/50 transition-colors">
                    {/* User Profile */}
                    <td className="py-3 px-4">
                      <div className="font-bold text-primary-text flex items-center gap-1.5">
                        <span>{u.display_name}</span>
                        {isUserAdmin && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            COMMAND ADMIN
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-text font-mono mt-0.5">
                        @{u.username} {u.badge_number ? `• Badge: ${u.badge_number}` : ''}
                      </div>
                    </td>

                    {/* Rank & Role */}
                    <td className="py-3 px-4">
                      <div className="font-semibold text-primary-text">
                        {u.designation || u.role_name}
                      </div>
                      <div className="text-[11px] text-muted-text font-mono">
                        {u.department_wing || u.role_name}
                      </div>
                    </td>

                    {/* Org & Layer Level */}
                    <td className="py-3 px-4 font-mono text-[11px]">
                      <div className="font-semibold text-primary-text">{u.org_name}</div>
                      <div className="text-muted-darker">
                        Level {u.org_level} • {u.org_code}
                      </div>
                    </td>

                    {/* Contact & Clearance */}
                    <td className="py-3 px-4 font-mono text-[11px]">
                      <div className="text-primary-text">{u.phone_number || 'N/A'}</div>
                      <div className="mt-1">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          u.clearance_level === 'TOP_SECRET' ? 'bg-amber-950/60 text-amber-300 border border-amber-500/40' :
                          u.clearance_level === 'SECRET' ? 'bg-purple-950/60 text-purple-300 border border-purple-500/40' :
                          u.clearance_level === 'CONFIDENTIAL' ? 'bg-blue-950/60 text-blue-300 border border-blue-500/40' :
                          'bg-gray-800 text-gray-300 border border-gray-700'
                        }`}>
                          {u.clearance_level || 'CONFIDENTIAL'}
                        </span>
                      </div>
                    </td>

                    {/* Status */}
                    <td className="py-3 px-4 font-mono text-[11px]">
                      <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                        u.status === 'ACTIVE' ? 'bg-success-light text-success border border-success/30' :
                        u.status === 'LOCKED' ? 'bg-danger-light text-danger border border-danger/30' :
                        'bg-warning-light text-warning border border-warning/30'
                      }`}>
                        {u.status}
                      </span>
                      {u.failed_login_count > 0 && (
                        <div className="text-warning text-[10px] mt-0.5">
                          {u.failed_login_count} Failed Logins
                        </div>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-4 text-right space-x-2">
                      <button
                        onClick={() => handleOpenDetail(u)}
                        className="text-xs text-accent hover:underline font-semibold"
                      >
                        Inspect / Edit
                      </button>

                      {hasPermission('USER_DEACTIVATE') && u.id !== user?.userId && (
                        <>
                          {u.status === 'ACTIVE' ? (
                            <button
                              onClick={() => handleUpdateStatus(u.id, 'LOCKED')}
                              className="text-xs text-danger hover:underline font-semibold"
                            >
                              Lock
                            </button>
                          ) : (
                            <button
                              onClick={() => handleUpdateStatus(u.id, 'ACTIVE')}
                              className="text-xs text-success hover:underline font-semibold"
                            >
                              Unlock
                            </button>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ENROLL USER / LAYER ADMIN MODAL */}
      {showEnrollModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="glass-card p-6 border border-border w-full max-w-xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div>
                <h3 className="text-sm font-bold text-primary-text flex items-center gap-2">
                  <ShieldIcon className="w-4 h-4 text-accent" />
                  <span>
                    {isEnrollingAdmin
                      ? `Provision Subordinate Layer Administrator (${activeBody})`
                      : `Enroll Justice Personnel (${activeBody})`}
                  </span>
                </h3>
                <p className="text-xs text-muted-text font-mono mt-0.5">
                  Authority Model: Same-layer or below-layer provisioning within {user?.organizationName}
                </p>
              </div>
              <button
                onClick={() => setShowEnrollModal(false)}
                className="text-muted-text hover:text-primary-text text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleEnrollSubmit} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-muted-text mb-1">Official Username *</label>
                  <input
                    required
                    type="text"
                    placeholder="e.g. sho.stationA or io.patel"
                    className="input-field font-mono"
                    value={enrollForm.username}
                    onChange={(e) => setEnrollForm({ ...enrollForm, username: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-muted-text mb-1">Official Email Address *</label>
                  <input
                    required
                    type="email"
                    placeholder="officer@gujarat.gov.in"
                    className="input-field"
                    value={enrollForm.email}
                    onChange={(e) => setEnrollForm({ ...enrollForm, email: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-muted-text mb-1">Full Legal Name & Honors *</label>
                  <input
                    required
                    type="text"
                    placeholder="e.g. Inspector H. M. Desai"
                    className="input-field"
                    value={enrollForm.displayName}
                    onChange={(e) => setEnrollForm({ ...enrollForm, displayName: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-muted-text mb-1">Badge / Service Number</label>
                  <input
                    type="text"
                    placeholder="e.g. PI-SURAT-559"
                    className="input-field font-mono"
                    value={enrollForm.badgeNumber}
                    onChange={(e) => setEnrollForm({ ...enrollForm, badgeNumber: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-muted-text mb-1">Official Phone Contact</label>
                  <input
                    type="text"
                    placeholder="+91-261-2422000"
                    className="input-field font-mono"
                    value={enrollForm.phoneNumber}
                    onChange={(e) => setEnrollForm({ ...enrollForm, phoneNumber: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-muted-text mb-1">Official Rank / Designation</label>
                  <input
                    type="text"
                    placeholder="e.g. Police Inspector / Station House Officer"
                    className="input-field"
                    value={enrollForm.designation}
                    onChange={(e) => setEnrollForm({ ...enrollForm, designation: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-muted-text mb-1">Department / Specialized Wing</label>
                  <input
                    type="text"
                    placeholder="e.g. Crime Branch, Ballistics, Registry"
                    className="input-field"
                    value={enrollForm.departmentWing}
                    onChange={(e) => setEnrollForm({ ...enrollForm, departmentWing: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-muted-text mb-1">Security Clearance Level *</label>
                  <select
                    className="input-field font-mono"
                    value={enrollForm.clearanceLevel}
                    onChange={(e) => setEnrollForm({ ...enrollForm, clearanceLevel: e.target.value })}
                  >
                    <option value="RESTRICTED">RESTRICTED</option>
                    <option value="CONFIDENTIAL">CONFIDENTIAL</option>
                    <option value="SECRET">SECRET</option>
                    <option value="TOP_SECRET">TOP_SECRET</option>
                  </select>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-muted-text font-medium">Target Organization Node * (Visual Sovereign Tree)</label>
                    <span className="text-[10.5px] font-mono text-muted-darker">Select authorized node within subtree</span>
                  </div>
                  <select
                    required
                    className="input-field font-mono text-xs"
                    value={enrollForm.primaryOrganizationId}
                    onChange={(e) => setEnrollForm({ ...enrollForm, primaryOrganizationId: e.target.value })}
                  >
                    <option value="">Select Organization Node / Unit...</option>
                    {bodyOrgs.map((o: any) => {
                      const authorized = isNodeAuthorized(o);
                      const indent = '— '.repeat(Math.max(0, (o.level || 1) - 1));
                      return (
                        <option
                          key={o.id}
                          value={o.id}
                          disabled={!authorized}
                          className={authorized ? 'text-primary-text font-sans' : 'text-muted-darker bg-surface/50 italic'}
                        >
                          {indent}{o.name} [{o.type_name || o.type_id} • L{o.level} • {o.code}]{!authorized ? ' — ⛔ OUTSIDE SCOPE' : ''}
                        </option>
                      );
                    })}
                  </select>

                  {/* Visual Node Inspection Banner */}
                  {(() => {
                    const selOrg = bodyOrgs.find((o: any) => o.id === enrollForm.primaryOrganizationId);
                    if (!selOrg) return null;
                    const authorized = isNodeAuthorized(selOrg);
                    return (
                      <div className={`mt-2 p-2.5 rounded border text-xs font-mono flex items-center justify-between ${
                        authorized ? 'bg-surface/70 border-border text-primary-text' : 'bg-danger-light border-danger/30 text-danger'
                      }`}>
                        <div>
                          <div className="font-bold flex items-center gap-1.5">
                            <span>{selOrg.name}</span>
                            <span className="text-[10px] text-accent">({selOrg.code})</span>
                          </div>
                          <div className="text-[10.5px] text-muted-text mt-0.5 space-x-2">
                            <span>Body: <strong>{selOrg.body_id || selOrg.agency_branch}</strong></span>
                            <span>•</span>
                            <span>Type: <strong>{selOrg.type_name || selOrg.type_id}</strong></span>
                            <span>•</span>
                            <span>Depth: <strong>Level {selOrg.level}</strong></span>
                          </div>
                        </div>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ml-2 ${
                          authorized ? 'bg-success-light text-success border border-success/30' : 'bg-danger-light text-danger border border-danger/30'
                        }`}>
                          {authorized ? '✓ AUTHORIZED SCOPE' : '⛔ SIBLING / OUTSIDE SCOPE'}
                        </span>
                      </div>
                    );
                  })()}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-muted-text font-medium">
                      Assigned Institutional Role * (Dynamic Scope Filtered)
                    </label>
                    <span className="text-[10.5px] font-mono text-accent">
                      {assignableRoles.length} Permitted Roles
                    </span>
                  </div>
                  <select
                    required
                    className="input-field font-mono text-xs"
                    value={enrollForm.primaryRoleId}
                    onChange={(e) => setEnrollForm({ ...enrollForm, primaryRoleId: e.target.value })}
                  >
                    <option value="">Select Permitted Role...</option>
                    {(assignableRoles.length > 0 ? assignableRoles : bodyRoles).map((r: any) => (
                      <option key={r.id} value={r.id}>
                        {r.name} ({r.id})
                      </option>
                    ))}
                  </select>
                  <p className="text-[10.5px] text-muted-text mt-1">
                    Roles are dynamically evaluated against node type, sovereign body, and your administrative delegation.
                  </p>
                </div>
              </div>

              <div className="p-3 rounded-lg border border-border bg-surface/40 flex items-center justify-between">
                <div>
                  <div className="font-bold text-primary-text">Designate as Command Layer Administrator</div>
                  <div className="text-[11px] text-muted-text">
                    Authorizes this officer to manage same-layer personnel and subordinate node admins.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={isEnrollingAdmin || enrollForm.isLayerAdmin}
                  onChange={(e) => setEnrollForm({ ...enrollForm, isLayerAdmin: e.target.checked })}
                  disabled={isEnrollingAdmin}
                  className="w-4 h-4 accent-accent"
                />
              </div>

              <div>
                <label className="block text-muted-text mb-1">Initial Temporary Password *</label>
                <input
                  required
                  type="password"
                  placeholder="Min 8 chars with uppercase, number & symbol"
                  className="input-field font-mono"
                  value={enrollForm.password}
                  onChange={(e) => setEnrollForm({ ...enrollForm, password: e.target.value })}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-border">
                <button type="button" onClick={() => setShowEnrollModal(false)} className="btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  {isEnrollingAdmin ? 'Provision Layer Administrator' : 'Enroll Officer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* USER DETAIL INSPECTOR & EDIT MODAL */}
      {selectedUserDetail && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="glass-card p-6 border border-border w-full max-w-xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div>
                <h3 className="text-sm font-bold text-primary-text flex items-center gap-2">
                  <UsersIcon className="w-4 h-4 text-accent" />
                  <span>Personnel Profile & Authority Envelope</span>
                </h3>
                <p className="text-xs text-muted-text font-mono mt-0.5">
                  UID: {selectedUserDetail.id}
                </p>
              </div>
              <button
                onClick={() => setSelectedUserDetail(null)}
                className="text-muted-text hover:text-primary-text text-sm"
              >
                ✕
              </button>
            </div>

            {!isEditingUser ? (
              /* VIEW MODE */
              <div className="space-y-4 text-xs">
                <div className="flex items-center justify-between p-3 rounded-lg bg-surface/50 border border-border">
                  <div>
                    <div className="text-base font-bold text-primary-text">{selectedUserDetail.display_name}</div>
                    <div className="text-muted-text font-mono">@{selectedUserDetail.username} • {selectedUserDetail.email}</div>
                  </div>
                  <div className="text-right">
                    <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                      selectedUserDetail.status === 'ACTIVE' ? 'bg-success-light text-success border border-success/30' :
                      'bg-danger-light text-danger border border-danger/30'
                    }`}>
                      {selectedUserDetail.status}
                    </span>
                    {selectedUserDetail.is_layer_admin && (
                      <div className="text-[10px] text-amber-400 font-bold font-mono mt-1">
                        👑 COMMAND ADMIN
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-2.5 rounded bg-surface/30 border border-border">
                    <div className="text-muted-text text-[11px]">Rank & Designation</div>
                    <div className="font-semibold text-primary-text mt-0.5">{selectedUserDetail.designation || 'Not specified'}</div>
                  </div>
                  <div className="p-2.5 rounded bg-surface/30 border border-border">
                    <div className="text-muted-text text-[11px]">Department / Wing</div>
                    <div className="font-semibold text-primary-text mt-0.5">{selectedUserDetail.department_wing || 'General Wing'}</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-2.5 rounded bg-surface/30 border border-border">
                    <div className="text-muted-text text-[11px]">Official Phone</div>
                    <div className="font-mono text-primary-text mt-0.5">{selectedUserDetail.phone_number || 'N/A'}</div>
                  </div>
                  <div className="p-2.5 rounded bg-surface/30 border border-border">
                    <div className="text-muted-text text-[11px]">Badge / Service ID</div>
                    <div className="font-mono text-primary-text mt-0.5">{selectedUserDetail.badge_number || 'N/A'}</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-2.5 rounded bg-surface/30 border border-border">
                    <div className="text-muted-text text-[11px]">Security Clearance</div>
                    <div className="font-mono font-bold text-accent mt-0.5">{selectedUserDetail.clearance_level || 'CONFIDENTIAL'}</div>
                  </div>
                  <div className="p-2.5 rounded bg-surface/30 border border-border">
                    <div className="text-muted-text text-[11px]">Assigned Role</div>
                    <div className="font-semibold text-primary-text mt-0.5">{selectedUserDetail.role_name}</div>
                  </div>
                </div>

                <div className="p-2.5 rounded bg-surface/30 border border-border">
                  <div className="text-muted-text text-[11px]">Station / Establishment Node</div>
                  <div className="font-semibold text-primary-text mt-0.5">{selectedUserDetail.org_name} ({selectedUserDetail.org_code})</div>
                  <div className="text-[10px] text-muted-darker font-mono mt-0.5">Path: {selectedUserDetail.org_path} (Level {selectedUserDetail.org_level})</div>
                </div>

                <div className="flex justify-between items-center pt-2 border-t border-border">
                  <div>
                    {selectedUserDetail.id !== user?.userId && (
                      <button
                        onClick={() => handleUpdateStatus(
                          selectedUserDetail.id,
                          selectedUserDetail.status === 'ACTIVE' ? 'LOCKED' : 'ACTIVE'
                        )}
                        className={`text-xs font-semibold hover:underline ${
                          selectedUserDetail.status === 'ACTIVE' ? 'text-danger' : 'text-success'
                        }`}
                      >
                        {selectedUserDetail.status === 'ACTIVE' ? 'Lock Account' : 'Unlock Account'}
                      </button>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setSelectedUserDetail(null)} className="btn-secondary">
                      Close
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsEditingUser(true)}
                      className="btn-primary"
                    >
                      Edit Profile
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              /* EDIT MODE */
              <form onSubmit={handleUpdateProfile} className="space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-muted-text mb-1">Full Legal Name *</label>
                    <input
                      required
                      type="text"
                      className="input-field"
                      value={editForm.displayName}
                      onChange={(e) => setEditForm({ ...editForm, displayName: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-muted-text mb-1">Badge / Service Number</label>
                    <input
                      type="text"
                      className="input-field font-mono"
                      value={editForm.badgeNumber}
                      onChange={(e) => setEditForm({ ...editForm, badgeNumber: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-muted-text mb-1">Official Phone Contact</label>
                    <input
                      type="text"
                      className="input-field font-mono"
                      value={editForm.phoneNumber}
                      onChange={(e) => setEditForm({ ...editForm, phoneNumber: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-muted-text mb-1">Designation / Rank</label>
                    <input
                      type="text"
                      className="input-field"
                      value={editForm.designation}
                      onChange={(e) => setEditForm({ ...editForm, designation: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-muted-text mb-1">Department Wing</label>
                    <input
                      type="text"
                      className="input-field"
                      value={editForm.departmentWing}
                      onChange={(e) => setEditForm({ ...editForm, departmentWing: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-muted-text mb-1">Clearance Level</label>
                    <select
                      className="input-field font-mono"
                      value={editForm.clearanceLevel}
                      onChange={(e) => setEditForm({ ...editForm, clearanceLevel: e.target.value })}
                    >
                      <option value="RESTRICTED">RESTRICTED</option>
                      <option value="CONFIDENTIAL">CONFIDENTIAL</option>
                      <option value="SECRET">SECRET</option>
                      <option value="TOP_SECRET">TOP_SECRET</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-muted-text mb-1">Assigned Role</label>
                    <select
                      className="input-field"
                      value={editForm.primaryRoleId}
                      onChange={(e) => setEditForm({ ...editForm, primaryRoleId: e.target.value })}
                    >
                      {bodyRoles.map((r: any) => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-muted-text mb-1">Organization Node</label>
                    <select
                      className="input-field"
                      value={editForm.primaryOrganizationId}
                      onChange={(e) => setEditForm({ ...editForm, primaryOrganizationId: e.target.value })}
                    >
                      {bodyOrgs.map((o: any) => (
                        <option key={o.id} value={o.id}>{o.name} ({o.code})</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="p-2.5 rounded bg-surface border border-border flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-primary-text">Command Layer Administrator Designation</div>
                    <div className="text-[10px] text-muted-text">Grants administrative oversight over this layer and child nodes.</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={editForm.isLayerAdmin}
                    onChange={(e) => setEditForm({ ...editForm, isLayerAdmin: e.target.checked })}
                    className="w-4 h-4 accent-accent"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-border">
                  <button
                    type="button"
                    onClick={() => setIsEditingUser(false)}
                    className="btn-secondary"
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary">
                    Save Profile Changes
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Provision Sovereign Body Administrator Modal (Master Admin Only) */}
      {showBodyAdminModal && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="glass-card p-6 border border-emerald-500/40 w-full max-w-lg space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <ShieldIcon className="w-5 h-5 text-emerald-400" />
                <div>
                  <h3 className="text-sm font-bold text-primary-text uppercase tracking-wider font-mono">
                    Provision Sovereign Body Administrator
                  </h3>
                  <p className="text-[11px] text-muted-text">
                    Apex Governance: Assigns commanding administrator to Body Root
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowBodyAdminModal(false)}
                className="text-muted-text hover:text-primary-text font-mono text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleBodyAdminSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-muted-text font-semibold mb-1">Target Sovereign Body *</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setBodyAdminForm({ ...bodyAdminForm, bodyId: 'POLICE' })}
                    className={`p-2.5 rounded border text-center font-mono text-xs transition-colors ${
                      bodyAdminForm.bodyId === 'POLICE'
                        ? 'bg-blue-600/30 border-blue-500 text-blue-300 font-bold'
                        : 'bg-surface border-border text-muted-text hover:border-blue-500/40'
                    }`}
                  >
                    🛡️ POLICE
                  </button>
                  <button
                    type="button"
                    onClick={() => setBodyAdminForm({ ...bodyAdminForm, bodyId: 'JUDICIARY' })}
                    className={`p-2.5 rounded border text-center font-mono text-xs transition-colors ${
                      bodyAdminForm.bodyId === 'JUDICIARY'
                        ? 'bg-amber-600/30 border-amber-500 text-amber-300 font-bold'
                        : 'bg-surface border-border text-muted-text hover:border-amber-500/40'
                    }`}
                  >
                    ⚖️ JUDICIARY
                  </button>
                  <button
                    type="button"
                    onClick={() => setBodyAdminForm({ ...bodyAdminForm, bodyId: 'FORENSICS' })}
                    className={`p-2.5 rounded border text-center font-mono text-xs transition-colors ${
                      bodyAdminForm.bodyId === 'FORENSICS'
                        ? 'bg-purple-600/30 border-purple-500 text-purple-300 font-bold'
                        : 'bg-surface border-border text-muted-text hover:border-purple-500/40'
                    }`}
                  >
                    🔬 FORENSICS
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-muted-text mb-1">Official Identifier (Username) *</label>
                  <input
                    required
                    type="text"
                    placeholder="e.g. police_admin"
                    className="input-field font-mono"
                    value={bodyAdminForm.username}
                    onChange={(e) => setBodyAdminForm({ ...bodyAdminForm, username: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-muted-text mb-1">Official Institutional Email *</label>
                  <input
                    required
                    type="email"
                    placeholder="admin.police@gujarat.gov.in"
                    className="input-field"
                    value={bodyAdminForm.email}
                    onChange={(e) => setBodyAdminForm({ ...bodyAdminForm, email: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-muted-text mb-1">Display Name & Rank *</label>
                  <input
                    required
                    type="text"
                    placeholder="e.g. DGP / Chief Administrator"
                    className="input-field"
                    value={bodyAdminForm.displayName}
                    onChange={(e) => setBodyAdminForm({ ...bodyAdminForm, displayName: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-muted-text mb-1">Badge / Order Number</label>
                  <input
                    type="text"
                    placeholder="e.g. IPS-GJ-101"
                    className="input-field font-mono"
                    value={bodyAdminForm.badgeNumber}
                    onChange={(e) => setBodyAdminForm({ ...bodyAdminForm, badgeNumber: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-muted-text mb-1">Official Contact Phone</label>
                  <input
                    type="text"
                    placeholder="+91-79-..."
                    className="input-field font-mono"
                    value={bodyAdminForm.phoneNumber}
                    onChange={(e) => setBodyAdminForm({ ...bodyAdminForm, phoneNumber: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-muted-text mb-1">Temporary Cryptographic Password *</label>
                  <input
                    required
                    type="text"
                    placeholder="Gov@Secure2026!"
                    className="input-field font-mono"
                    value={bodyAdminForm.password}
                    onChange={(e) => setBodyAdminForm({ ...bodyAdminForm, password: e.target.value })}
                  />
                </div>
              </div>

              <div className="p-2.5 rounded bg-surface border border-border text-[11px] text-muted-text font-mono">
                Assigned Authority: <strong>TOP_SECRET</strong> clearance • Command Layer Administrator at Body Root.
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowBodyAdminModal(false)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-xs font-bold shadow-md transition-colors"
                >
                  Confirm & Provision Body Admin
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
