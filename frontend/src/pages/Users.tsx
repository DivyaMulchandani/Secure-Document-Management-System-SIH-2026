import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { AgencyBadge } from '../components/ClassificationBadge';
import { CompulsoryTicketModal, TicketSummaryItem } from '../components/CompulsoryTicketModal';
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
  government_id?: string;
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
  const isMaster = user?.roleId === 'MASTER_ADMIN' || user?.roleId === 'SYSTEM_MASTER_ADMIN';

  // Active body tab selection (defaults to user's branch if not master)
  const [activeBody, setActiveBody] = useState<AgencyBranch>(
    isMaster ? 'POLICE' : ((user?.agencyBranch as AgencyBranch) || 'POLICE')
  );

  const [usersList, setUsersList] = useState<UserRecord[]>([]);
  const [rolesList, setRolesList] = useState<any[]>([]);
  const [orgsList, setOrgsList] = useState<any[]>([]);
  const [hierarchySummary, setHierarchySummary] = useState<any[]>([]);
  const [assignableRoles, setAssignableRoles] = useState<any[]>([]);
  const [officePositions, setOfficePositions] = useState<Record<string, any[]>>({
    POLICE: [],
    JUDICIARY: [],
    FORENSICS: [],
    ALL: []
  });
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
    governmentId: '',
    badgeNumber: '',
    phoneNumber: '',
    designation: '',
    departmentWing: '',
  });

  // Office-First Admin & User Enrollment Modals
  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [isEnrollingAdmin, setIsEnrollingAdmin] = useState(false);
  const [selectedUserDetail, setSelectedUserDetail] = useState<UserRecord | null>(null);
  const [isEditingUser, setIsEditingUser] = useState(false);
  const [userToDelete, setUserToDelete] = useState<UserRecord | null>(null);

  // Office-First Admin Creation State
  const [adminOfficeMode, setAdminOfficeMode] = useState<'EXISTING' | 'CREATE_FIRST'>('EXISTING');
  const [newOfficeForm, setNewOfficeForm] = useState({
    name: '',
    typeId: '',
    code: '',
    jurisdictionArea: '',
    parentId: '',
  });

  // Enrollment Form State (Government ID + Email Passwordless)
  const [enrollForm, setEnrollForm] = useState({
    username: '',
    email: '',
    displayName: '',
    governmentId: '',
    badgeNumber: '',
    phoneNumber: '',
    designation: '',
    departmentWing: '',
    clearanceLevel: 'CONFIDENTIAL',
    isLayerAdmin: false,
    primaryRoleId: '',
    primaryOrganizationId: '',
  });

  // Edit Form State
  const [editForm, setEditForm] = useState({
    displayName: '',
    governmentId: '',
    badgeNumber: '',
    phoneNumber: '',
    designation: '',
    departmentWing: '',
    clearanceLevel: 'CONFIDENTIAL',
    isLayerAdmin: false,
    primaryRoleId: '',
    primaryOrganizationId: '',
  });

  // Compulsory Ticket State
  const [ticketModalConfig, setTicketModalConfig] = useState<{
    isOpen: boolean;
    title: string;
    actionType: any;
    targetResourceType: 'ORGANIZATION_NODE' | 'ORG' | 'USER' | 'OFFICE_POSITION';
    targetResourceId?: string;
    payload: any;
    summaryItems: TicketSummaryItem[];
    onSuccess: (result: any) => void;
  }>({
    isOpen: false,
    title: '',
    actionType: 'CREATE_USER',
    targetResourceType: 'USER',
    payload: {},
    summaryItems: [],
    onSuccess: () => {},
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [uRes, rRes, oRes, sumRes, posRes] = await Promise.all([
        api.get<{ users: UserRecord[] }>('/users'),
        api.get<{ roles: any[] }>('/users/roles'),
        api.get<{ organizations: any[] }>('/organizations'),
        api.get<{ summary: any[] }>('/users/hierarchy-summary'),
        api.get<{ positions: any[]; grouped: Record<string, any[]> }>('/organizations/office-positions'),
      ]);
      setUsersList(uRes.users || []);
      setRolesList(rRes.roles || []);
      setOrgsList(oRes.organizations || []);
      setHierarchySummary(sumRes.summary || []);
      if (posRes.grouped) {
        setOfficePositions(posRes.grouped);
      }
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
  const bodyOfficePositions = officePositions[activeBody] || [];

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
      u.government_id?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.badge_number?.toLowerCase().includes(q) ||
      u.designation?.toLowerCase().includes(q) ||
      u.department_wing?.toLowerCase().includes(q) ||
      u.phone_number?.toLowerCase().includes(q) ||
      u.org_name?.toLowerCase().includes(q)
    );
  });

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
    setAdminOfficeMode('EXISTING');
    const targetOrgId = initialOrgId || selectedOrgFilter || (bodyOrgs.find((o: any) => isNodeAuthorized(o))?.id || bodyOrgs[0]?.id || '');
    const defaultRole = asAdmin ? 'NODE_ADMIN' : 'POLICE_OFFICER';

    setEnrollForm({
      username: '',
      email: '',
      displayName: '',
      governmentId: '',
      badgeNumber: '',
      phoneNumber: '',
      designation: asAdmin ? 'Commanding Officer / Node Administrator' : '',
      departmentWing: '',
      clearanceLevel: asAdmin ? 'TOP_SECRET' : 'CONFIDENTIAL',
      isLayerAdmin: asAdmin,
      primaryRoleId: defaultRole,
      primaryOrganizationId: targetOrgId,
    });

    setNewOfficeForm({
      name: '',
      typeId: bodyOfficePositions[0]?.id || 'POLICE_STATION',
      code: '',
      jurisdictionArea: '',
      parentId: targetOrgId,
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

  // 1. Trigger Compulsory Ticket on Enroll User / Admin
  const handleInitiateEnroll = (e: React.FormEvent) => {
    e.preventDefault();

    if (!enrollForm.governmentId.trim()) {
      alert('Government ID is mandatory for law enforcement personnel enrollment.');
      return;
    }
    if (!enrollForm.email.trim()) {
      alert('Official Email Address is mandatory for passwordless OTP authentication.');
      return;
    }

    setShowEnrollModal(false);

    // If Admin creation with "Create Office First"
    if (isEnrollingAdmin && adminOfficeMode === 'CREATE_FIRST') {
      setTicketModalConfig({
        isOpen: true,
        title: `Compulsory Ticket: Establish Office First (${newOfficeForm.name})`,
        actionType: 'CREATE_OFFICE',
        targetResourceType: 'ORGANIZATION_NODE',
        payload: {
          parentId: newOfficeForm.parentId || enrollForm.primaryOrganizationId,
          typeId: newOfficeForm.typeId,
          name: newOfficeForm.name,
          code: newOfficeForm.code,
          jurisdictionArea: newOfficeForm.jurisdictionArea,
        },
        summaryItems: [
          { label: 'Stage 1 Action', value: 'Establish Designated Administrative Office' },
          { label: 'New Office Name', value: newOfficeForm.name },
          { label: 'Office Position', value: bodyOfficePositions.find(p => p.id === newOfficeForm.typeId)?.name || newOfficeForm.typeId },
          { label: 'Designated Admin', value: `${enrollForm.displayName} (${enrollForm.governmentId})` },
          { label: 'Admin Email', value: enrollForm.email },
        ],
        onSuccess: async (createdOffice: any) => {
          // Once office is created, chain the admin enrollment ticket into this newly established office!
          const createdOrgId = createdOffice?.id;
          setTicketModalConfig({
            isOpen: true,
            title: `Compulsory Ticket: Provision Admin in ${newOfficeForm.name}`,
            actionType: 'CREATE_USER',
            targetResourceType: 'USER',
            payload: {
              ...enrollForm,
              primaryOrganizationId: createdOrgId,
              organizationId: createdOrgId,
              roleId: enrollForm.primaryRoleId,
              isLayerAdmin: true,
            },
            summaryItems: [
              { label: 'Administrator', value: enrollForm.displayName },
              { label: 'Government ID', value: enrollForm.governmentId },
              { label: 'Official Email', value: enrollForm.email },
              { label: 'Designated Office', value: newOfficeForm.name },
              { label: 'Scope', value: 'Station Personnel + Subordinate Admins' },
            ],
            onSuccess: async () => {
              await fetchData();
            }
          });
        }
      });
      return;
    }

    // Direct User / Admin Enrollment
    const targetOrg = bodyOrgs.find(o => o.id === enrollForm.primaryOrganizationId);
    setTicketModalConfig({
      isOpen: true,
      title: `Compulsory Ticket: Enroll ${isEnrollingAdmin ? 'Layer Administrator' : 'Justice Personnel'}`,
      actionType: 'CREATE_USER',
      targetResourceType: 'USER',
      payload: {
        ...enrollForm,
        organizationId: enrollForm.primaryOrganizationId,
        roleId: enrollForm.primaryRoleId,
        isLayerAdmin: isEnrollingAdmin || enrollForm.isLayerAdmin,
      },
      summaryItems: [
        { label: 'Full Legal Name', value: enrollForm.displayName },
        { label: 'Government ID', value: enrollForm.governmentId },
        { label: 'Official Email', value: enrollForm.email },
        { label: 'Official Username', value: `@${enrollForm.username}` },
        { label: 'Assigned Office', value: targetOrg?.name || 'Selected Office' },
        { label: 'Assigned Role', value: assignableRoles.find(r => r.id === enrollForm.primaryRoleId)?.name || enrollForm.primaryRoleId },
      ],
      onSuccess: async () => {
        await fetchData();
      }
    });
  };

  // 2. Trigger Compulsory Ticket on Body Admin Provisioning
  const handleInitiateBodyAdmin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!bodyAdminForm.governmentId.trim()) {
      alert('Government ID is mandatory for Body Administrator provisioning.');
      return;
    }
    setShowBodyAdminModal(false);

    // Call body-admin API directly or via ticket
    api.post('/users/body-admin', bodyAdminForm)
      .then(() => {
        setBodyAdminForm({
          bodyId: 'POLICE',
          username: '',
          email: '',
          displayName: '',
          governmentId: '',
          badgeNumber: '',
          phoneNumber: '',
          designation: '',
          departmentWing: '',
        });
        fetchData();
      })
      .catch((err) => {
        alert(err.message || 'Failed to provision Body Administrator');
      });
  };

  const handleOpenDetail = (u: UserRecord) => {
    setSelectedUserDetail(u);
    setEditForm({
      displayName: u.display_name,
      governmentId: u.government_id || '',
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

  // 3. Trigger Compulsory Ticket on Profile Update
  const handleInitiateUpdateProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserDetail) return;

    setIsEditingUser(false);
    setTicketModalConfig({
      isOpen: true,
      title: `Compulsory Ticket: Modify User Profile (@${selectedUserDetail.username})`,
      actionType: 'UPDATE_USER',
      targetResourceType: 'USER',
      targetResourceId: selectedUserDetail.id,
      payload: {
        ...editForm,
        roleId: editForm.primaryRoleId,
        organizationId: editForm.primaryOrganizationId,
      },
      summaryItems: [
        { label: 'Target User', value: selectedUserDetail.display_name },
        { label: 'Username', value: `@${selectedUserDetail.username}` },
        { label: 'Government ID', value: editForm.governmentId || selectedUserDetail.government_id || 'N/A' },
        { label: 'Updated Rank', value: editForm.designation || 'Default' },
        { label: 'Station Node', value: bodyOrgs.find(o => o.id === editForm.primaryOrganizationId)?.name || 'Default' },
      ],
      onSuccess: async () => {
        await fetchData();
        setSelectedUserDetail(null);
      }
    });
  };

  // 4. Trigger Compulsory Ticket on Lock / Unlock User Status
  const handleInitiateUpdateStatus = (u: UserRecord, newStatus: 'ACTIVE' | 'LOCKED') => {
    setTicketModalConfig({
      isOpen: true,
      title: `Compulsory Ticket: ${newStatus === 'LOCKED' ? 'Lock Account' : 'Unlock Account'} (@${u.username})`,
      actionType: 'UPDATE_USER_STATUS',
      targetResourceType: 'USER',
      targetResourceId: u.id,
      payload: { status: newStatus },
      summaryItems: [
        { label: 'Official Name', value: u.display_name },
        { label: 'Username', value: `@${u.username}` },
        { label: 'Government ID', value: u.government_id || 'N/A' },
        { label: 'Action', value: `Transition status to ${newStatus}` },
      ],
      onSuccess: async () => {
        await fetchData();
        if (selectedUserDetail && selectedUserDetail.id === u.id) {
          setSelectedUserDetail({ ...selectedUserDetail, status: newStatus });
        }
      }
    });
  };

  // 5. Trigger Compulsory Ticket on Permanent Deletion
  const handleInitiateDeleteUser = () => {
    if (!userToDelete) return;
    const target = userToDelete;
    setUserToDelete(null);

    setTicketModalConfig({
      isOpen: true,
      title: `Compulsory Ticket: De-enroll Personnel (@${target.username})`,
      actionType: 'DELETE_USER',
      targetResourceType: 'USER',
      targetResourceId: target.id,
      payload: {},
      summaryItems: [
        { label: 'Personnel Name', value: target.display_name },
        { label: 'Official Username', value: `@${target.username}` },
        { label: 'Government ID', value: target.government_id || 'N/A' },
        { label: 'Office Node', value: target.org_name },
      ],
      onSuccess: async () => {
        if (selectedUserDetail && selectedUserDetail.id === target.id) {
          setSelectedUserDetail(null);
        }
        await fetchData();
      }
    });
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
            Subtree Sibling Isolation & Same-Layer/Below-Layer Admin Scope • Passwordless Email/OTP Authentication • Compulsory Update Tickets
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isMaster && (
            <button
              onClick={() => setShowBodyAdminModal(true)}
              className="px-3 py-1.5 rounded-md bg-emerald-700 hover:bg-emerald-600 text-white font-mono text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <ShieldIcon className="w-3.5 h-3.5" />
              <span>Provision Body Admin</span>
            </button>
          )}
          {hasPermission('USER_CREATE') && (
            <>
              <button
                onClick={() => openEnrollModal(true)}
                className="btn-secondary text-xs border-accent/40 text-accent hover:bg-accent/10"
              >
                <ShieldIcon className="w-3.5 h-3.5 text-accent" />
                <span>Office-First Admin Provision</span>
              </button>
              <button
                onClick={() => openEnrollModal(false)}
                className="btn-primary text-xs"
              >
                <PlusIcon className="w-3.5 h-3.5" />
                <span>Enroll Officer</span>
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
              ? 'bg-blue-950/50 border-blue-600/90'
              : !isMaster && user?.agencyBranch !== 'POLICE'
              ? 'opacity-40 cursor-not-allowed bg-surface/30 border-border'
              : 'glass-card border-border hover:border-blue-600/40'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldIcon className="w-4 h-4 text-blue-400" />
              <span className="font-bold text-xs uppercase tracking-wider text-blue-300">Police Department</span>
            </div>
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
              ? 'bg-purple-950/50 border-purple-600/90'
              : !isMaster && user?.agencyBranch !== 'FORENSICS'
              ? 'opacity-40 cursor-not-allowed bg-surface/30 border-border'
              : 'glass-card border-border hover:border-purple-600/40'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FlaskIcon className="w-4 h-4 text-purple-400" />
              <span className="font-bold text-xs uppercase tracking-wider text-purple-300">Forensics (DFSS)</span>
            </div>
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
              ? 'bg-amber-950/50 border-amber-600/90'
              : !isMaster && user?.agencyBranch !== 'JUDICIARY'
              ? 'opacity-40 cursor-not-allowed bg-surface/30 border-border'
              : 'glass-card border-border hover:border-amber-600/40'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ScaleIcon className="w-4 h-4 text-amber-400" />
              <span className="font-bold text-xs uppercase tracking-wider text-amber-300">Judicial Courts</span>
            </div>
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
                ? 'bg-emerald-950/50 border-emerald-600/90'
                : 'glass-card border-border hover:border-emerald-600/40'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BuildingIcon className="w-4 h-4 text-emerald-400" />
                <span className="font-bold text-xs uppercase tracking-wider text-emerald-300">Master Governance</span>
              </div>
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

      {/* Scope Info Callout */}
      <div className="glass-card p-4 border border-border flex flex-col md:flex-row md:items-center justify-between gap-4 bg-surface/30">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-surface border border-border text-accent">
            <BuildingIcon className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-semibold text-primary-text flex items-center gap-2">
              <span>Jurisdictional Scope:</span>
              <span className="font-mono text-accent font-bold">
                {activeBody} BRANCH • {activeBodyNodes.length} Nodes Covered
              </span>
            </div>
            <p className="text-[11px] text-muted-text font-mono mt-0.5">
              Active Scope: {user?.organizationName} • {activeBodyAdmins.length} Layer Administrators • {activeBodyUsers.length} Enrolled Personnel
            </p>
          </div>
        </div>

        {/* Tier Switcher Pills */}
        <div className="flex items-center bg-surface/80 p-1 rounded-lg border border-border text-xs">
          <button
            onClick={() => setFilterTier('ALL')}
            className={`px-3 py-1 rounded font-medium transition-colors ${
              filterTier === 'ALL' ? 'bg-accent text-white font-bold' : 'text-muted-text hover:text-primary-text'
            }`}
          >
            All Personnel ({activeBodyUsers.length})
          </button>
          <button
            onClick={() => setFilterTier('ADMINS')}
            className={`px-3 py-1 rounded font-medium transition-colors flex items-center gap-1.5 ${
              filterTier === 'ADMINS' ? 'bg-accent text-white font-bold' : 'text-muted-text hover:text-primary-text'
            }`}
          >
            <span>Layer Admins</span>
            <span className="text-[10px] px-1 py-0.2 rounded bg-black/40 font-mono">
              {activeBodyAdmins.length}
            </span>
          </button>
          <button
            onClick={() => setFilterTier('OFFICERS')}
            className={`px-3 py-1 rounded font-medium transition-colors ${
              filterTier === 'OFFICERS' ? 'bg-accent text-white font-bold' : 'text-muted-text hover:text-primary-text'
            }`}
          >
            Field / Staff ({activeBodyUsers.length - activeBodyAdmins.length})
          </button>
        </div>
      </div>

      {/* Search & Filter Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-1 items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <SearchIcon className="w-4 h-4 text-muted-text absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search by name, Government ID, email, badge, rank..."
              className="input-field pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <select
            className="input-field max-w-xs text-xs font-mono"
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
                <th className="py-3 px-4">Officer Profile & Identification</th>
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
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-amber-900/40 text-amber-300 border border-amber-700/50">
                            COMMAND ADMIN
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-text font-mono mt-0.5 space-x-1.5">
                        <span className="text-blue-400 font-semibold">{u.government_id || 'GOV-ID: PENDING'}</span>
                        <span>•</span>
                        <span>{u.email}</span>
                      </div>
                      <div className="text-[10px] text-muted-darker font-mono">
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
                          u.clearance_level === 'TOP_SECRET' ? 'bg-amber-950/60 text-amber-300 border border-amber-700/40' :
                          u.clearance_level === 'SECRET' ? 'bg-purple-950/60 text-purple-300 border border-purple-700/40' :
                          u.clearance_level === 'CONFIDENTIAL' ? 'bg-blue-950/60 text-blue-300 border border-blue-700/40' :
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
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-4 text-right space-x-2.5">
                      <button
                        onClick={() => handleOpenDetail(u)}
                        className="text-xs text-accent hover:underline font-semibold font-mono"
                      >
                        Inspect / Edit
                      </button>

                      {hasPermission('USER_DEACTIVATE') && u.id !== user?.userId && (
                        <>
                          {u.status === 'ACTIVE' ? (
                            <button
                              onClick={() => handleInitiateUpdateStatus(u, 'LOCKED')}
                              className="text-xs text-amber-400 hover:underline font-semibold font-mono"
                            >
                              Lock
                            </button>
                          ) : (
                            <button
                              onClick={() => handleInitiateUpdateStatus(u, 'ACTIVE')}
                              className="text-xs text-success hover:underline font-semibold font-mono"
                            >
                              Unlock
                            </button>
                          )}

                          {u.role_id !== 'MASTER_ADMIN' && (
                            <button
                              onClick={() => setUserToDelete(u)}
                              className="text-xs text-red-400 hover:text-red-300 hover:underline font-semibold font-mono"
                              title="Permanently purge user via compulsory ticket"
                            >
                              Delete
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

      {/* ======================= MODAL: ENROLL USER / OFFICE-FIRST ADMIN ======================= */}
      {showEnrollModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-[#0b1320] border border-slate-700 rounded-lg w-full max-w-xl space-y-4 max-h-[90vh] overflow-y-auto p-6 shadow-xl text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-700">
              <div>
                <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2 font-mono">
                  <ShieldIcon className="w-4 h-4 text-accent" />
                  <span>
                    {isEnrollingAdmin
                      ? `Office-First Layer Admin Provisioning (${activeBody})`
                      : `Enroll Justice Personnel (${activeBody})`}
                  </span>
                </h3>
                <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                  Mandatory Government ID & Official Email • Passwordless Authentication • Compulsory Ticket
                </p>
              </div>
              <button
                onClick={() => setShowEnrollModal(false)}
                className="text-slate-400 hover:text-slate-200 font-mono text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleInitiateEnroll} className="space-y-4">
              {/* OFFICE-FIRST ADMIN PROVISIONING WORKFLOW SELECTION */}
              {isEnrollingAdmin && (
                <div className="p-3.5 rounded bg-slate-50 border border-slate-200 space-y-3 font-mono">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-blue-700 uppercase tracking-wider text-[11px]">
                      Step 1: Administrative Office Designation
                    </span>
                    <div className="flex bg-white p-0.5 rounded border border-slate-200 text-[10.5px]">
                      <button
                        type="button"
                        onClick={() => setAdminOfficeMode('EXISTING')}
                        className={`px-2.5 py-1 rounded transition-colors ${
                          adminOfficeMode === 'EXISTING' ? 'bg-[#1D4ED8] text-white font-bold' : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Assign to Existing Office
                      </button>
                      <button
                        type="button"
                        onClick={() => setAdminOfficeMode('CREATE_FIRST')}
                        className={`px-2.5 py-1 rounded transition-colors ${
                          adminOfficeMode === 'CREATE_FIRST' ? 'bg-[#1D4ED8] text-white font-bold' : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        + Create That Office First
                      </button>
                    </div>
                  </div>

                  {/* Mode A: Existing Office */}
                  {adminOfficeMode === 'EXISTING' ? (
                    <div>
                      <label className="block text-slate-300 mb-1">Target Existing Office Node *</label>
                      <select
                        required
                        className="input-field font-mono text-xs"
                        value={enrollForm.primaryOrganizationId}
                        onChange={(e) => setEnrollForm({ ...enrollForm, primaryOrganizationId: e.target.value })}
                      >
                        <option value="">Select Office Node...</option>
                        {bodyOrgs.map((o: any) => (
                          <option key={o.id} value={o.id} disabled={!isNodeAuthorized(o)}>
                            {o.name} [{o.code} • Level {o.level}]{!isNodeAuthorized(o) ? ' — ⛔ OUTSIDE SCOPE' : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    /* Mode B: Create Office First */
                    <div className="space-y-3 pt-2 border-t border-slate-700">
                      <div>
                        <label className="block text-slate-300 mb-1">Parent Office in Hierarchy *</label>
                        <select
                          required
                          className="input-field font-mono text-xs"
                          value={newOfficeForm.parentId}
                          onChange={(e) => setNewOfficeForm({ ...newOfficeForm, parentId: e.target.value })}
                        >
                          <option value="">Select Parent Supervisory Office...</option>
                          {bodyOrgs.filter(o => isNodeAuthorized(o)).map((o: any) => (
                            <option key={o.id} value={o.id}>
                              {o.name} ({o.code} • Level {o.level})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-slate-300 mb-1">Office Name *</label>
                          <input
                            required
                            type="text"
                            placeholder="e.g. Ellisbridge Sub-Divisional Office"
                            className="input-field"
                            value={newOfficeForm.name}
                            onChange={(e) => setNewOfficeForm({ ...newOfficeForm, name: e.target.value })}
                          />
                        </div>
                        <div>
                          <label className="block text-slate-300 mb-1">Office Position / Tier *</label>
                          <select
                            required
                            className="input-field font-mono"
                            value={newOfficeForm.typeId}
                            onChange={(e) => setNewOfficeForm({ ...newOfficeForm, typeId: e.target.value })}
                          >
                            {bodyOfficePositions.map((pos: any) => (
                              <option key={pos.id} value={pos.id}>
                                {pos.name} ({pos.code})
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-slate-300 mb-1">Office Code *</label>
                          <input
                            required
                            type="text"
                            placeholder="e.g. GUJ-POL-AMD-SDPO-WEST"
                            className="input-field font-mono uppercase"
                            value={newOfficeForm.code}
                            onChange={(e) => setNewOfficeForm({ ...newOfficeForm, code: e.target.value.toUpperCase() })}
                          />
                        </div>
                        <div>
                          <label className="block text-slate-300 mb-1">Jurisdiction Area</label>
                          <input
                            type="text"
                            placeholder="e.g. West Ahmedabad Sector"
                            className="input-field"
                            value={newOfficeForm.jurisdictionArea}
                            onChange={(e) => setNewOfficeForm({ ...newOfficeForm, jurisdictionArea: e.target.value })}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Authority Scope Explanation */}
                  <div className="text-[11px] text-slate-400 font-sans leading-relaxed bg-[#080d16] p-2.5 rounded border border-slate-800">
                    <span className="font-bold text-blue-300 font-mono">ADMINISTRATIVE SCOPE:</span> This Administrator operates this office and manages:
                    (1) All officers and staff enrolled in this office.
                    (2) Administrators and personnel of all subordinate offices below this unit in the tree hierarchy.
                  </div>
                </div>
              )}

              {/* STEP 2: ADMINISTRATOR / PERSONNEL PROFILE */}
              <div className="space-y-3">
                <div className="text-[11px] font-bold text-slate-200 uppercase font-mono tracking-wider border-b border-slate-700 pb-1">
                  {isEnrollingAdmin ? 'Step 2: Administrator Identity Credentials' : 'Officer Identity Credentials'}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 mb-1 font-mono">
                      Government ID Number *
                    </label>
                    <input
                      required
                      type="text"
                      placeholder="e.g. GJ-GOV-987654 or POL-GJ-2026-88"
                      className="input-field font-mono uppercase"
                      value={enrollForm.governmentId}
                      onChange={(e) => setEnrollForm({ ...enrollForm, governmentId: e.target.value.toUpperCase() })}
                    />
                    <span className="text-[10px] text-slate-400 font-mono mt-0.5 block">Official state service identity</span>
                  </div>
                  <div>
                    <label className="block text-slate-300 mb-1 font-mono">
                      Official Institutional Email *
                    </label>
                    <input
                      required
                      type="email"
                      placeholder="officer@gujarat.gov.in"
                      className="input-field"
                      value={enrollForm.email}
                      onChange={(e) => setEnrollForm({ ...enrollForm, email: e.target.value })}
                    />
                    <span className="text-[10px] text-slate-400 font-mono mt-0.5 block">Used for passwordless OTP login</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 mb-1 font-mono">Official Username *</label>
                    <input
                      required
                      type="text"
                      placeholder="e.g. sho.west or io.patel"
                      className="input-field font-mono"
                      value={enrollForm.username}
                      onChange={(e) => setEnrollForm({ ...enrollForm, username: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 mb-1 font-mono">Full Legal Name & Rank *</label>
                    <input
                      required
                      type="text"
                      placeholder="e.g. Inspector H. M. Desai"
                      className="input-field"
                      value={enrollForm.displayName}
                      onChange={(e) => setEnrollForm({ ...enrollForm, displayName: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 mb-1 font-mono">Badge / Service Number</label>
                    <input
                      type="text"
                      placeholder="e.g. PI-SURAT-559"
                      className="input-field font-mono"
                      value={enrollForm.badgeNumber}
                      onChange={(e) => setEnrollForm({ ...enrollForm, badgeNumber: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 mb-1 font-mono">Official Contact Phone</label>
                    <input
                      type="text"
                      placeholder="+91-79-..."
                      className="input-field font-mono"
                      value={enrollForm.phoneNumber}
                      onChange={(e) => setEnrollForm({ ...enrollForm, phoneNumber: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 mb-1 font-mono">Official Designation / Title</label>
                    <input
                      type="text"
                      placeholder="e.g. Sub-Divisional Police Officer"
                      className="input-field"
                      value={enrollForm.designation}
                      onChange={(e) => setEnrollForm({ ...enrollForm, designation: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 mb-1 font-mono">Security Clearance Level *</label>
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

                {!isEnrollingAdmin && (
                  <div>
                    <label className="block text-slate-300 mb-1 font-mono">Station Office Node *</label>
                    <select
                      required
                      className="input-field font-mono text-xs"
                      value={enrollForm.primaryOrganizationId}
                      onChange={(e) => setEnrollForm({ ...enrollForm, primaryOrganizationId: e.target.value })}
                    >
                      <option value="">Select Office Node...</option>
                      {bodyOrgs.map((o: any) => (
                        <option key={o.id} value={o.id} disabled={!isNodeAuthorized(o)}>
                          {o.name} [{o.code} • Level {o.level}]{!isNodeAuthorized(o) ? ' — ⛔ OUTSIDE SCOPE' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-slate-300 mb-1 font-mono">Assigned Institutional Role *</label>
                  <select
                    required
                    className="input-field font-mono text-xs"
                    value={enrollForm.primaryRoleId}
                    onChange={(e) => setEnrollForm({ ...enrollForm, primaryRoleId: e.target.value })}
                  >
                    <option value="">Select Role...</option>
                    {(assignableRoles.length > 0 ? assignableRoles : bodyRoles).map((r: any) => (
                      <option key={r.id} value={r.id}>
                        {r.name} ({r.id})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Passwordless Notice */}
              <div className="p-3 rounded bg-blue-50 border border-blue-200 text-[11px] text-blue-900 font-mono">
                <span className="font-bold text-blue-800">PASSWORDLESS CREDENTIAL:</span> No password entry is required. Authentication is passwordless using the officer&apos;s registered email and 6-digit cryptographic OTP.
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <button type="button" onClick={() => setShowEnrollModal(false)} className="btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Proceed to Compulsory Ticket Authorization →
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================= MODAL: INSPECT & EDIT USER PROFILE ======================= */}
      {selectedUserDetail && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-lg w-full max-w-xl space-y-4 max-h-[90vh] overflow-y-auto p-6 shadow-xl text-xs text-slate-900">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 font-mono">
                  <UsersIcon className="w-4 h-4 text-blue-700" />
                  <span>Personnel Profile & Authority Envelope</span>
                </h3>
                <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                  Gov ID: {selectedUserDetail.government_id || 'PENDING'} • UID: {selectedUserDetail.id}
                </p>
              </div>
              <button
                onClick={() => setSelectedUserDetail(null)}
                className="text-slate-400 hover:text-slate-700 font-mono text-base px-1"
              >
                ✕
              </button>
            </div>

            {!isEditingUser ? (
              /* VIEW MODE */
              <div className="space-y-4 font-mono">
                <div className="flex items-center justify-between p-3 rounded bg-slate-50 border border-slate-200">
                  <div>
                    <div className="text-base font-bold text-slate-900">{selectedUserDetail.display_name}</div>
                    <div className="text-slate-500 text-[11px]">@{selectedUserDetail.username} • {selectedUserDetail.email}</div>
                    <div className="text-blue-700 font-bold text-xs mt-0.5">Gov ID: {selectedUserDetail.government_id || 'N/A'}</div>
                  </div>
                  <div className="text-right">
                    <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                      selectedUserDetail.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' :
                      'bg-red-50 text-red-800 border border-red-200'
                    }`}>
                      {selectedUserDetail.status}
                    </span>
                    {selectedUserDetail.is_layer_admin && (
                      <div className="text-[10px] text-blue-700 font-bold mt-1">
                        COMMAND ADMIN
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="p-2.5 rounded bg-slate-50 border border-slate-200">
                    <div className="text-slate-500 text-[11px]">Rank & Designation</div>
                    <div className="font-semibold text-slate-800 mt-0.5">{selectedUserDetail.designation || 'Not specified'}</div>
                  </div>
                  <div className="p-2.5 rounded bg-slate-50 border border-slate-200">
                    <div className="text-slate-500 text-[11px]">Assigned Role</div>
                    <div className="font-semibold text-slate-800 mt-0.5">{selectedUserDetail.role_name}</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="p-2.5 rounded bg-slate-50 border border-slate-200">
                    <div className="text-slate-500 text-[11px]">Official Contact</div>
                    <div className="text-slate-800 mt-0.5">{selectedUserDetail.phone_number || 'N/A'}</div>
                  </div>
                  <div className="p-2.5 rounded bg-slate-50 border border-slate-200">
                    <div className="text-slate-500 text-[11px]">Badge / Service Number</div>
                    <div className="text-slate-800 mt-0.5">{selectedUserDetail.badge_number || 'N/A'}</div>
                  </div>
                </div>

                <div className="p-2.5 rounded bg-slate-50 border border-slate-200 text-xs">
                  <div className="text-slate-500 text-[11px]">Station / Office Node</div>
                  <div className="font-semibold text-slate-800 mt-0.5">{selectedUserDetail.org_name} ({selectedUserDetail.org_code})</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Path: {selectedUserDetail.org_path} (Level {selectedUserDetail.org_level})</div>
                </div>

                <div className="flex justify-between items-center pt-2 border-t border-slate-200">
                  <div className="flex items-center gap-3">
                    {selectedUserDetail.id !== user?.userId && (
                      <button
                        onClick={() => handleInitiateUpdateStatus(
                          selectedUserDetail,
                          selectedUserDetail.status === 'ACTIVE' ? 'LOCKED' : 'ACTIVE'
                        )}
                        className={`text-xs font-semibold hover:underline font-mono ${
                          selectedUserDetail.status === 'ACTIVE' ? 'text-amber-700' : 'text-emerald-700'
                        }`}
                      >
                        {selectedUserDetail.status === 'ACTIVE' ? 'Lock Account' : 'Unlock Account'}
                      </button>
                    )}
                    {selectedUserDetail.id !== user?.userId && selectedUserDetail.role_id !== 'MASTER_ADMIN' && hasPermission('USER_DEACTIVATE') && (
                      <button
                        type="button"
                        onClick={() => setUserToDelete(selectedUserDetail)}
                        className="text-xs text-red-600 hover:text-red-800 font-semibold hover:underline font-mono"
                      >
                        De-enroll
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
              <form onSubmit={handleInitiateUpdateProfile} className="space-y-3 font-mono">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Full Legal Name *</label>
                    <input
                      required
                      type="text"
                      className="input-field"
                      value={editForm.displayName}
                      onChange={(e) => setEditForm({ ...editForm, displayName: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Government ID Number</label>
                    <input
                      type="text"
                      className="input-field font-mono uppercase"
                      value={editForm.governmentId}
                      onChange={(e) => setEditForm({ ...editForm, governmentId: e.target.value.toUpperCase() })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Badge Number</label>
                    <input
                      type="text"
                      className="input-field font-mono"
                      value={editForm.badgeNumber}
                      onChange={(e) => setEditForm({ ...editForm, badgeNumber: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Official Phone</label>
                    <input
                      type="text"
                      className="input-field font-mono"
                      value={editForm.phoneNumber}
                      onChange={(e) => setEditForm({ ...editForm, phoneNumber: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Designation / Rank</label>
                    <input
                      type="text"
                      className="input-field"
                      value={editForm.designation}
                      onChange={(e) => setEditForm({ ...editForm, designation: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Security Clearance</label>
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
                    <label className="block text-slate-700 font-semibold mb-1">Assigned Role</label>
                    <select
                      className="input-field font-mono"
                      value={editForm.primaryRoleId}
                      onChange={(e) => setEditForm({ ...editForm, primaryRoleId: e.target.value })}
                    >
                      {bodyRoles.map((r: any) => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Station Node</label>
                    <select
                      className="input-field font-mono"
                      value={editForm.primaryOrganizationId}
                      onChange={(e) => setEditForm({ ...editForm, primaryOrganizationId: e.target.value })}
                    >
                      {bodyOrgs.map((o: any) => (
                        <option key={o.id} value={o.id}>{o.name} ({o.code})</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => setIsEditingUser(false)}
                    className="btn-secondary"
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary">
                    Proceed to Compulsory Ticket →
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ======================= MODAL: PROVISION BODY ADMIN ======================= */}
      {showBodyAdminModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-lg w-full max-w-lg p-6 space-y-4 shadow-xl text-xs text-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <ShieldIcon className="w-5 h-5 text-blue-700" />
                <div>
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider font-mono">
                    Provision Sovereign Body Administrator
                  </h3>
                  <p className="text-[11px] text-slate-500 font-mono">
                    Apex Governance: Assign commanding administrator to Body Root
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowBodyAdminModal(false)}
                className="text-slate-400 hover:text-slate-700 font-mono text-base px-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleInitiateBodyAdmin} className="space-y-3.5 font-mono">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Target Sovereign Body *</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setBodyAdminForm({ ...bodyAdminForm, bodyId: 'POLICE' })}
                    className={`p-2.5 rounded border text-center font-mono text-xs transition-colors ${
                      bodyAdminForm.bodyId === 'POLICE'
                        ? 'bg-blue-50 border-blue-600 text-blue-800 font-bold'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-blue-400'
                    }`}
                  >
                    POLICE
                  </button>
                  <button
                    type="button"
                    onClick={() => setBodyAdminForm({ ...bodyAdminForm, bodyId: 'JUDICIARY' })}
                    className={`p-2.5 rounded border text-center font-mono text-xs transition-colors ${
                      bodyAdminForm.bodyId === 'JUDICIARY'
                        ? 'bg-amber-50 border-amber-600 text-amber-800 font-bold'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-amber-400'
                    }`}
                  >
                    JUDICIARY
                  </button>
                  <button
                    type="button"
                    onClick={() => setBodyAdminForm({ ...bodyAdminForm, bodyId: 'FORENSICS' })}
                    className={`p-2.5 rounded border text-center font-mono text-xs transition-colors ${
                      bodyAdminForm.bodyId === 'FORENSICS'
                        ? 'bg-purple-50 border-purple-600 text-purple-800 font-bold'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-purple-400'
                    }`}
                  >
                    FORENSICS
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Government ID *</label>
                  <input
                    required
                    type="text"
                    placeholder="e.g. GJ-APEX-001"
                    className="input-field font-mono uppercase"
                    value={bodyAdminForm.governmentId}
                    onChange={(e) => setBodyAdminForm({ ...bodyAdminForm, governmentId: e.target.value.toUpperCase() })}
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Official Email *</label>
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
                  <label className="block text-slate-700 font-semibold mb-1">Official Identifier (Username) *</label>
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
                  <label className="block text-slate-700 font-semibold mb-1">Display Name & Rank *</label>
                  <input
                    required
                    type="text"
                    placeholder="e.g. DGP / Chief Administrator"
                    className="input-field"
                    value={bodyAdminForm.displayName}
                    onChange={(e) => setBodyAdminForm({ ...bodyAdminForm, displayName: e.target.value })}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowBodyAdminModal(false)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-md bg-[#1D4ED8] hover:bg-[#1E40AF] text-white font-mono text-xs font-bold transition-colors shadow-sm"
                >
                  Provision Body Admin
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================= MODAL: CONFIRM DE-ENROLLMENT ======================= */}
      {userToDelete && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-lg w-full max-w-lg p-6 space-y-4 shadow-xl text-slate-900">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded bg-red-50 border border-red-200 flex items-center justify-center text-red-600 font-bold">
                  ⚠️
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider font-mono">
                    CONFIRM PERSONNEL DE-ENROLLMENT
                  </h3>
                  <p className="text-[10px] text-red-600 font-mono font-semibold">
                    CRITICAL // IRREVERSIBLE OPERATION // COMPULSORY TICKET REQUIRED
                  </p>
                </div>
              </div>
              <button
                onClick={() => setUserToDelete(null)}
                className="text-slate-400 hover:text-slate-700 font-mono text-base px-1"
              >
                ✕
              </button>
            </div>

            <div className="p-3.5 rounded bg-slate-50 border border-slate-200 space-y-2 text-xs font-mono">
              <div className="flex items-center justify-between">
                <div className="font-bold text-slate-900 text-sm">{userToDelete.display_name}</div>
                <span className="text-[10px] px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-700 font-bold">
                  {userToDelete.role_name}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-slate-600">
                <div>Username: <span className="text-slate-900 font-semibold">@{userToDelete.username}</span></div>
                <div>Gov ID: <span className="text-slate-900 font-semibold">{userToDelete.government_id || 'N/A'}</span></div>
                <div>Station: <span className="text-blue-600 font-semibold">{userToDelete.org_name}</span></div>
                <div>Level: <span className="text-amber-600 font-semibold">Level {userToDelete.org_level}</span></div>
              </div>
            </div>

            <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setUserToDelete(null)}
                className="btn-secondary text-xs"
              >
                Abort / Cancel
              </button>
              <button
                type="button"
                onClick={handleInitiateDeleteUser}
                className="px-4 py-1.5 rounded bg-red-700 hover:bg-red-600 text-white font-mono text-xs font-bold"
              >
                Proceed to Authorization OTP →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================= COMPULSORY UPDATE TICKET MODAL ======================= */}
      <CompulsoryTicketModal
        isOpen={ticketModalConfig.isOpen}
        onClose={() => setTicketModalConfig(prev => ({ ...prev, isOpen: false }))}
        title={ticketModalConfig.title}
        actionType={ticketModalConfig.actionType}
        targetResourceType={ticketModalConfig.targetResourceType}
        targetResourceId={ticketModalConfig.targetResourceId}
        payload={ticketModalConfig.payload}
        summaryItems={ticketModalConfig.summaryItems}
        onSuccess={ticketModalConfig.onSuccess}
      />
    </div>
  );
};
