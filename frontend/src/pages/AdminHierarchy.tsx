import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { AgencyBadge } from '../components/ClassificationBadge';
import {
  BuildingIcon, ShieldIcon, PlusIcon,
  SearchIcon, AlertTriangle as AlertTriangleIcon, CheckIcon, ActivityIcon,
  EyeIcon, ClockIcon, UsersIcon, LockIcon, RefreshIcon, ChevronRightIcon
} from '../components/Icons';
import { CompulsoryTicketModal, TicketSummaryItem } from '../components/CompulsoryTicketModal';
import { AdminAnalyticsDashboard } from '../components/admin/AdminAnalyticsDashboard';
import { AdminBulkHierarchyImporter } from '../components/admin/AdminBulkHierarchyImporter';
import { AdminSmtpConfigPanel } from '../components/admin/AdminSmtpConfigPanel';

interface AdminLevel {
  id: string;
  level_number: number;
  body_id: string;
  name: string;
  description: string;
  clearance_required: string;
  can_manage_subordinates: boolean;
  body_name?: string;
  mapped_office_count?: number;
  admin_count?: number;
  office_type_id?: string;
  office_type_name?: string;
  default_role_id?: string;
  default_role_name?: string;
  manages_office_users?: boolean;
  manages_subordinate_admins?: boolean;
  can_create_sub_offices?: boolean;
  can_approve_tickets?: boolean;
  max_clearance_allowed?: string;
}

interface OfficeTrackingData {
  office: {
    id: string;
    parent_id: string | null;
    body_id: string;
    agency_branch: string;
    type_id: string;
    name: string;
    code: string;
    hierarchy_path: string;
    level: number;
    jurisdiction_area: string;
    status: string;
    admin_level_name?: string;
    admin_level_number?: number;
    parent_name?: string;
    parent_code?: string;
    manages_office_users?: boolean;
    manages_subordinate_admins?: boolean;
    can_create_sub_offices?: boolean;
    can_approve_tickets?: boolean;
    max_clearance_allowed?: string;
  };
  governance: {
    directAdministrators: Array<{
      id: string;
      username: string;
      display_name: string;
      badge_number?: string;
      government_id?: string;
      designation?: string;
      phone_number?: string;
      email: string;
      status: string;
      is_layer_admin: boolean;
      role_id: string;
      role_name: string;
    }>;
    supervisingAdministrators: Array<{
      id: string;
      username: string;
      display_name: string;
      badge_number?: string;
      government_id?: string;
      designation?: string;
      phone_number?: string;
      email: string;
      status: string;
      is_layer_admin: boolean;
      role_id: string;
      role_name: string;
      office_id: string;
      office_name: string;
      office_code: string;
      office_level: number;
      admin_level_name?: string;
      admin_level_number?: number;
    }>;
    masterAdministrators: Array<{
      id: string;
      username: string;
      display_name: string;
      badge_number?: string;
      government_id?: string;
      designation?: string;
      email: string;
      status: string;
      role_id: string;
      role_name: string;
    }>;
    rules: {
      targetOffice: any;
      directAdminPrivileges: any;
      supervisoryChainPrivileges: any;
      isolationRules: Array<{ rule: string; description: string }>;
    };
  };
  tickets: Array<{
    id: string;
    ticket_number: string;
    action_type: string;
    target_resource_type: string;
    target_resource_id: string;
    requester_email: string;
    requester_government_id?: string;
    requester_name?: string;
    requester_display_name?: string;
    requester_badge?: string;
    requester_role_name?: string;
    justification: string;
    payload: any;
    before_state?: any;
    status: string;
    verified_at?: string;
    executed_at?: string;
    created_at: string;
  }>;
  adminActivity: Array<{
    id: string;
    timestamp: string;
    action: string;
    resource_type: string;
    resource_id: string;
    result: string;
    actor_id?: string;
    actor_name?: string;
    actor_badge?: string;
    actor_government_id?: string;
    actor_role_name?: string;
    ticket_number?: string;
    justification?: string;
    ip_address?: string;
    metadata?: any;
    before_value?: any;
    after_value?: any;
  }>;
  userActivity: Array<{
    id: string;
    timestamp: string;
    action: string;
    resource_type: string;
    resource_id: string;
    result: string;
    user_id?: string;
    user_name?: string;
    user_badge?: string;
    user_government_id?: string;
    user_role_name?: string;
    case_fir?: string;
    ip_address?: string;
  }>;
  stats: {
    activeUsers: number;
    activeAdmins: number;
    immediateChildren: number;
    descendantOffices: number;
    totalTickets: number;
  };
}

interface OrgTag {
  id: string;
  name: string;
  slug: string;
  color: string;
  body_id?: string;
  category: string;
  description: string;
  office_count?: number;
}

interface OfficeNode {
  id: string;
  parent_id: string | null;
  body_id: string;
  agency_branch: string;
  name: string;
  code: string;
  level: number;
  status: string;
  admin_level_id?: string;
  admin_level_name?: string;
  admin_level_number?: number;
  child_count?: number;
  user_count?: number;
  admin_count?: number;
  tags?: Array<{ id: string; name: string; slug: string; color: string; category: string }>;
}

export const AdminHierarchy: React.FC = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'ANALYTICS' | 'BULK_IMPORT' | 'SMTP_CONFIG' | 'MAPPING' | 'LEVELS' | 'TAGS'>('MAPPING');

  // Admin Levels State
  const [adminLevels, setAdminLevels] = useState<AdminLevel[]>([]);
  const [loadingLevels, setLoadingLevels] = useState(false);
  const [levelFilterBody, setLevelFilterBody] = useState<string>('ALL');

  // Offices & Mapping State
  const [offices, setOffices] = useState<OfficeNode[]>([]);
  const [loadingOffices, setLoadingOffices] = useState(false);
  const [officeSearch, setOfficeSearch] = useState('');
  const [officeFilterBody, setOfficeFilterBody] = useState<string>('ALL');
  const [officeFilterLevel, setOfficeFilterLevel] = useState<string>('ALL');
  const [mappingOfficeId, setMappingOfficeId] = useState<string | null>(null);
  const [selectedAdminLevelId, setSelectedAdminLevelId] = useState<string>('');

  // Tags State
  const [tags, setTags] = useState<OrgTag[]>([]);
  const [loadingTags, setLoadingTags] = useState(false);
  const [showCreateTagModal, setShowCreateTagModal] = useState(false);
  const [tagForm, setTagForm] = useState({
    name: '',
    color: 'blue',
    category: 'OFFICE',
    description: '',
    bodyId: '',
  });

  // Modal: Create Admin Level
  const [showCreateLevelModal, setShowCreateLevelModal] = useState(false);
  const [levelForm, setLevelForm] = useState({
    bodyId: 'POLICE',
    levelNumber: 3,
    name: '',
    description: '',
    clearanceRequired: 'SECRET',
    officeTypeId: 'POLICE_STATION',
    defaultRoleId: 'POLICE_ADMIN',
    managesOfficeUsers: true,
    managesSubordinateAdmins: true,
    canCreateSubOffices: true,
    canApproveTickets: false,
    maxClearanceAllowed: 'SECRET',
  });

  // Office Tracking Modal State
  const [trackingModalOpen, setTrackingModalOpen] = useState(false);
  const [trackingOffice, setTrackingOffice] = useState<OfficeNode | null>(null);
  const [trackingData, setTrackingData] = useState<OfficeTrackingData | null>(null);
  const [loadingTracking, setLoadingTracking] = useState(false);
  const [trackingSubTab, setTrackingSubTab] = useState<'GOVERNANCE' | 'ADMIN_TICKETS' | 'USER_ACTIVITY'>('GOVERNANCE');
  const [trackingError, setTrackingError] = useState<string | null>(null);

  // Office Delete Modal
  const [officeToDelete, setOfficeToDelete] = useState<OfficeNode | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Tag Assignment to Office Modal
  const [tagAssignmentOffice, setTagAssignmentOffice] = useState<OfficeNode | null>(null);

  // Modal: Ticket-First Establish Office Node
  const [showEstablishOfficeModal, setShowEstablishOfficeModal] = useState(false);
  const [officeModalStage, setOfficeModalStage] = useState<'JUSTIFICATION' | 'ACTIVE_TICKET' | 'COMPLETED'>('JUSTIFICATION');
  const [establishForm, setEstablishForm] = useState({
    bodyId: 'POLICE' as 'POLICE' | 'JUDICIARY' | 'FORENSICS',
    adminLevelId: '',
    justification: '',
    parentId: '',
    name: '',
    code: '',
    jurisdictionArea: '',
    otp: '',
  });
  const [generatedTicket, setGeneratedTicket] = useState<{
    id: string;
    ticketNumber: string;
    devOtpPreview?: string;
    message?: string;
  } | null>(null);
  const [modalSubmitting, setModalSubmitting] = useState(false);
  const [modalError, setModalError] = useState('');
  const [modalSuccess, setModalSuccess] = useState('');

  const handleOpenEstablishOfficeModal = (initialBody?: 'POLICE' | 'JUDICIARY' | 'FORENSICS') => {
    const targetBody = initialBody || (officeFilterBody !== 'ALL' && ['POLICE', 'JUDICIARY', 'FORENSICS'].includes(officeFilterBody) ? officeFilterBody as 'POLICE' | 'JUDICIARY' | 'FORENSICS' : 'POLICE');
    const availableLayers = adminLevels.filter(al => al.body_id === targetBody);
    const initialLayer = availableLayers[0]?.id || '';
    const initialParent = offices.filter(o => o.body_id === targetBody && (availableLayers[0]?.level_number ? o.level < availableLayers[0].level_number : true))[0]?.id || '';
    
    setEstablishForm({
      bodyId: targetBody,
      adminLevelId: initialLayer,
      justification: '',
      parentId: initialParent,
      name: '',
      code: '',
      jurisdictionArea: '',
      otp: '',
    });
    setOfficeModalStage('JUSTIFICATION');
    setGeneratedTicket(null);
    setModalError('');
    setModalSuccess('');
    setShowEstablishOfficeModal(true);
  };

  const handleGenerateOfficeTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError('');
    if (!establishForm.adminLevelId) {
      setModalError('Please select a defined governance layer.');
      return;
    }
    if (!establishForm.justification || establishForm.justification.trim().length < 10) {
      setModalError('Operational justification must be at least 10 characters.');
      return;
    }

    setModalSubmitting(true);
    try {
      const res = await api.post<{
        success: boolean;
        ticketId: string;
        ticketNumber: string;
        devOtpPreview?: string;
        message?: string;
      }>('/tickets/request-otp', {
        actionType: 'CREATE_OFFICE',
        targetResourceType: 'ORGANIZATION_NODE',
        justification: establishForm.justification.trim(),
        payload: {
          adminLevelId: establishForm.adminLevelId,
          bodyId: establishForm.bodyId,
        }
      });

      if (res.success) {
        setGeneratedTicket({
          id: res.ticketId,
          ticketNumber: res.ticketNumber,
          devOtpPreview: res.devOtpPreview,
          message: res.message,
        });
        if (res.devOtpPreview) {
          setEstablishForm(prev => ({ ...prev, otp: res.devOtpPreview || '' }));
        }
        setOfficeModalStage('ACTIVE_TICKET');
      } else {
        setModalError('Failed to generate compulsory update ticket.');
      }
    } catch (err: any) {
      setModalError(err.message || 'Ticket generation failed');
    } finally {
      setModalSubmitting(false);
    }
  };

  const handleExecuteEstablishOffice = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError('');
    if (!generatedTicket) {
      setModalError('No active ticket found. Please initiate ticket first.');
      return;
    }
    if (!establishForm.name.trim() || !establishForm.code.trim()) {
      setModalError('Office Name and Official Identifier Code are required.');
      return;
    }
    if (!establishForm.otp.trim()) {
      setModalError('Enter the 6-digit authorization OTP.');
      return;
    }

    const selectedLayer = adminLevels.find(al => al.id === establishForm.adminLevelId);
    if (selectedLayer && selectedLayer.level_number > 1 && !establishForm.parentId) {
      setModalError(`Parent office node is required for Level ${selectedLayer.level_number} offices.`);
      return;
    }

    setModalSubmitting(true);
    try {
      const res = await api.post<{
        success: boolean;
        ticketNumber: string;
        result: any;
      }>('/tickets/execute-with-otp', {
        ticketId: generatedTicket.id,
        otp: establishForm.otp.trim(),
        payload: {
          parentId: selectedLayer && selectedLayer.level_number > 1 ? establishForm.parentId : null,
          adminLevelId: establishForm.adminLevelId,
          name: establishForm.name.trim(),
          code: establishForm.code.trim().toUpperCase(),
          jurisdictionArea: establishForm.jurisdictionArea.trim(),
        }
      });

      if (res.success) {
        setModalSuccess(`Office node '${establishForm.name}' established successfully under Ticket ${res.ticketNumber}!`);
        setOfficeModalStage('COMPLETED');
        await fetchOffices();
        await fetchAdminLevels();
        setTimeout(() => {
          setShowEstablishOfficeModal(false);
        }, 1200);
      } else {
        setModalError('Failed to execute office establishment.');
      }
    } catch (err: any) {
      setModalError(err.message || 'Office establishment failed');
    } finally {
      setModalSubmitting(false);
    }
  };

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
    actionType: 'UPDATE_OFFICE',
    targetResourceType: 'ORGANIZATION_NODE',
    payload: {},
    summaryItems: [],
    onSuccess: () => {},
  });

  // Fetch Admin Levels
  const fetchAdminLevels = async () => {
    setLoadingLevels(true);
    try {
      const res = await api.get<{ adminLevels: AdminLevel[] }>('/organizations/admin-levels');
      setAdminLevels(res.adminLevels || []);
    } catch (err) {
      console.error('Failed to load admin levels:', err);
    } finally {
      setLoadingLevels(false);
    }
  };

  // Fetch Tags
  const fetchTags = async () => {
    setLoadingTags(true);
    try {
      const res = await api.get<{ tags: OrgTag[] }>('/organizations/tags');
      setTags(res.tags || []);
    } catch (err) {
      console.error('Failed to load tags:', err);
    } finally {
      setLoadingTags(false);
    }
  };

  // Fetch Offices Tree/List
  const fetchOffices = async () => {
    setLoadingOffices(true);
    try {
      const res = await api.get<{ organizations: OfficeNode[] }>('/organizations/tree');
      setOffices(res.organizations || []);
    } catch (err) {
      console.error('Failed to load offices:', err);
    } finally {
      setLoadingOffices(false);
    }
  };

  useEffect(() => {
    fetchAdminLevels();
    fetchTags();
    fetchOffices();
  }, []);

  // Save Admin Level Mapping on an Office
  const handleApplyAdminLevel = async (office: OfficeNode, newLevelId: string) => {
    try {
      await api.put(`/organizations/nodes/${office.id}/admin-level`, { adminLevelId: newLevelId || null });
      setMappingOfficeId(null);
      await fetchOffices();
      await fetchAdminLevels();
    } catch (err: any) {
      alert(`Failed to update admin level: ${err.message}`);
    }
  };

  // Toggle Office Status (Active / Disabled) with Ticket
  const handleToggleOfficeStatus = (office: OfficeNode) => {
    const isCurrentlyActive = (office.status || 'ACTIVE') === 'ACTIVE';
    const newStatus = isCurrentlyActive ? 'DISABLED' : 'ACTIVE';

    setTicketModalConfig({
      isOpen: true,
      title: `${newStatus === 'DISABLED' ? 'Disable' : 'Activate'} Office: ${office.name}`,
      actionType: 'UPDATE_OFFICE_STATUS',
      targetResourceType: 'ORGANIZATION_NODE',
      targetResourceId: office.id,
      payload: { status: newStatus },
      summaryItems: [
        { label: 'Target Office', value: `${office.name} (${office.code})` },
        { label: 'Office Level', value: `Level ${office.level}` },
        { label: 'Current Status', value: office.status || 'ACTIVE' },
        { label: 'New Status', value: newStatus, highlight: true },
      ],
      onSuccess: () => {
        fetchOffices();
      },
    });
  };

  // Initiate Office Delete
  const handleInitiateDeleteOffice = (office: OfficeNode) => {
    setDeleteError(null);
    setOfficeToDelete(office);
  };

  // Execute Office Delete with Ticket
  const handleConfirmDeleteOffice = () => {
    if (!officeToDelete) return;

    if (officeToDelete.child_count && officeToDelete.child_count > 0) {
      setDeleteError(`Cannot delete office: ${officeToDelete.child_count} subordinate child office(s) exist under this node. Delete or reassign child offices first.`);
      return;
    }

    if (officeToDelete.user_count && officeToDelete.user_count > 0) {
      setDeleteError(`Cannot delete office: ${officeToDelete.user_count} personnel are currently assigned to this office. Reassign personnel first.`);
      return;
    }

    const targetOffice = officeToDelete;
    setOfficeToDelete(null);

    setTicketModalConfig({
      isOpen: true,
      title: `Decommission & Delete Office: ${targetOffice.name}`,
      actionType: 'DELETE_OFFICE',
      targetResourceType: 'ORGANIZATION_NODE',
      targetResourceId: targetOffice.id,
      payload: { officeId: targetOffice.id },
      summaryItems: [
        { label: 'Office to Delete', value: `${targetOffice.name} (${targetOffice.code})`, highlight: true },
        { label: 'Office Hierarchy Level', value: `Level ${targetOffice.level}` },
        { label: 'Sovereign Agency', value: targetOffice.agency_branch },
        { label: 'Child Office Dependencies', value: '0 (Clean)' },
        { label: 'Assigned Personnel', value: '0 (Clean)' },
      ],
      onSuccess: () => {
        fetchOffices();
        fetchAdminLevels();
      },
    });
  };

  // Create Tag
  const handleCreateTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tagForm.name.trim()) return;

    try {
      await api.post('/organizations/tags', tagForm);
      setShowCreateTagModal(false);
      setTagForm({ name: '', color: 'blue', category: 'OFFICE', description: '', bodyId: '' });
      await fetchTags();
    } catch (err: any) {
      alert(`Failed to create tag: ${err.message}`);
    }
  };

  // Delete Tag
  const handleDeleteTag = async (tag: OrgTag) => {
    if (!confirm(`Are you sure you want to delete tag '${tag.name}'?`)) return;
    try {
      await api.delete(`/organizations/tags/${tag.id}`);
      await fetchTags();
      await fetchOffices();
    } catch (err: any) {
      alert(`Failed to delete tag: ${err.message}`);
    }
  };

  // Toggle Tag on Office
  const handleToggleOfficeTag = async (officeId: string, tagId: string, isAttached: boolean) => {
    try {
      if (isAttached) {
        await api.delete(`/organizations/nodes/${officeId}/tags/${tagId}`);
      } else {
        await api.post(`/organizations/nodes/${officeId}/tags`, { tagId });
      }
      await fetchOffices();
      if (tagAssignmentOffice && tagAssignmentOffice.id === officeId) {
        const updated = offices.find(o => o.id === officeId);
        if (updated) setTagAssignmentOffice(updated);
      }
    } catch (err: any) {
      alert(`Failed to update tag: ${err.message}`);
    }
  };

  // Open Office Authority & Activity Tracking Modal
  const handleOpenOfficeTracking = async (office: OfficeNode) => {
    setTrackingOffice(office);
    setTrackingModalOpen(true);
    setLoadingTracking(true);
    setTrackingError(null);
    setTrackingSubTab('GOVERNANCE');
    try {
      const res = await api.get<OfficeTrackingData>(`/organizations/nodes/${office.id}/tracking`);
      setTrackingData(res);
    } catch (err: any) {
      console.error('Failed to load tracking data:', err);
      setTrackingError(err.message || 'Failed to load tracking details');
    } finally {
      setLoadingTracking(false);
    }
  };

  // Delete Admin Level with Safety Checks
  const handleDeleteAdminLevel = async (level: AdminLevel) => {
    if (level.mapped_office_count && level.mapped_office_count > 0) {
      alert(`Cannot delete '${level.name}': ${level.mapped_office_count} office(s) are currently mapped to this tier. Reassign or unmap offices first.`);
      return;
    }
    if (!confirm(`Are you sure you want to delete hierarchy level '${level.name}'?`)) return;
    try {
      await api.delete(`/organizations/admin-levels/${level.id}`);
      await fetchAdminLevels();
    } catch (err: any) {
      alert(err.message || 'Failed to delete admin level');
    }
  };

  // Submit Admin Level Creation via Ticket
  const handleCreateAdminLevel = (e: React.FormEvent) => {
    e.preventDefault();
    if (!levelForm.name.trim()) return;

    setTicketModalConfig({
      isOpen: true,
      title: `Define Decision-Making Layer: ${levelForm.name}`,
      actionType: 'CREATE_OFFICE_POSITION',
      targetResourceType: 'OFFICE_POSITION',
      payload: { ...levelForm },
      summaryItems: [
        { label: 'Admin Level Name', value: levelForm.name, highlight: true },
        { label: 'Hierarchy Tier', value: `Level ${levelForm.levelNumber}` },
        { label: 'Sovereign Body', value: levelForm.bodyId },
        { label: 'Office Type Target', value: levelForm.officeTypeId },
        { label: 'Default Admin Role', value: levelForm.defaultRoleId },
        { label: 'Subordinate Admins Report Here', value: levelForm.managesSubordinateAdmins ? 'YES (Hierarchical)' : 'NO' },
        { label: 'Manages Office Personnel', value: levelForm.managesOfficeUsers ? 'YES' : 'NO' },
        { label: 'Clearance Required', value: levelForm.clearanceRequired },
      ],
      onSuccess: async () => {
        try {
          await api.post('/organizations/admin-levels', levelForm);
        } catch (e) {
          console.error('Direct level sync fallback:', e);
        }
        setShowCreateLevelModal(false);
        setLevelForm({
          bodyId: 'POLICE',
          levelNumber: 3,
          name: '',
          description: '',
          clearanceRequired: 'SECRET',
          officeTypeId: 'POLICE_STATION',
          defaultRoleId: 'POLICE_ADMIN',
          managesOfficeUsers: true,
          managesSubordinateAdmins: true,
          canCreateSubOffices: true,
          canApproveTickets: false,
          maxClearanceAllowed: 'SECRET',
        });
        fetchAdminLevels();
      },
    });
  };

  // Tag Pill Styling Helper
  const getTagStyle = (color: string) => {
    switch (color) {
      case 'emerald': return 'bg-emerald-50 text-emerald-800 border-emerald-200';
      case 'blue': return 'bg-blue-50 text-blue-800 border-blue-200';
      case 'amber': return 'bg-amber-50 text-amber-800 border-amber-200';
      case 'purple': return 'bg-purple-50 text-purple-800 border-purple-200';
      case 'rose': return 'bg-rose-50 text-rose-800 border-rose-200';
      default: return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  // Filtered offices for matrix
  const filteredOffices = offices.filter(o => {
    if (officeFilterBody !== 'ALL' && o.body_id !== officeFilterBody && o.agency_branch !== officeFilterBody) return false;
    if (officeFilterLevel !== 'ALL' && o.level !== parseInt(officeFilterLevel, 10)) return false;
    if (officeSearch.trim()) {
      const q = officeSearch.toLowerCase();
      return o.name.toLowerCase().includes(q) || o.code.toLowerCase().includes(q) || (o.admin_level_name || '').toLowerCase().includes(q);
    }
    return true;
  });

  // Filtered admin levels
  const filteredLevels = adminLevels.filter(l => {
    if (levelFilterBody !== 'ALL' && l.body_id !== levelFilterBody) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <ShieldIcon className="w-5 h-5 text-accent" />
              <span>Admin Hierarchy & Institutional Governance</span>
            </h1>
            <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-blue-50 text-blue-900 border border-blue-300">
              GOVERNANCE CONSOLE
            </span>
          </div>
          <p className="text-xs text-muted-text mt-1">
            Manage administrative authority tiers (Levels 1–5), map governing admin levels to offices, configure live SMTP relays, build layer-wise hierarchies, and track visual telemetry.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center bg-slate-100 border border-slate-300 rounded-lg p-1 flex-wrap gap-1">
          <button
            onClick={() => setActiveTab('MAPPING')}
            className={`px-3 py-1.5 rounded-md font-mono text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'MAPPING'
                ? 'bg-blue-700 text-white shadow-xs'
                : 'text-slate-700 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <BuildingIcon className="w-3.5 h-3.5" />
            <span>Offices & Mapping</span>
          </button>
          <button
            onClick={() => setActiveTab('ANALYTICS')}
            className={`px-3 py-1.5 rounded-md font-mono text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'ANALYTICS'
                ? 'bg-blue-700 text-white shadow-xs'
                : 'text-slate-700 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <ActivityIcon className="w-3.5 h-3.5" />
            <span>Telemetry & Graphs</span>
          </button>
          <button
            onClick={() => setActiveTab('BULK_IMPORT')}
            className={`px-3 py-1.5 rounded-md font-mono text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'BULK_IMPORT'
                ? 'bg-blue-700 text-white shadow-xs'
                : 'text-slate-700 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <span>🌳</span>
            <span>Layer-wise Builder</span>
          </button>
          <button
            onClick={() => setActiveTab('SMTP_CONFIG')}
            className={`px-3 py-1.5 rounded-md font-mono text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'SMTP_CONFIG'
                ? 'bg-blue-700 text-white shadow-xs'
                : 'text-slate-700 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <span>✉️</span>
            <span>Email & SMTP Relay</span>
          </button>
          <button
            onClick={() => setActiveTab('LEVELS')}
            className={`px-3 py-1.5 rounded-md font-mono text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'LEVELS'
                ? 'bg-blue-700 text-white shadow-xs'
                : 'text-slate-700 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <ShieldIcon className="w-3.5 h-3.5" />
            <span>Admin Levels</span>
          </button>
          <button
            onClick={() => setActiveTab('TAGS')}
            className={`px-3 py-1.5 rounded-md font-mono text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'TAGS'
                ? 'bg-blue-700 text-white shadow-xs'
                : 'text-slate-700 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <span>🏷️</span>
            <span>Tags Catalog</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TAB: VISUAL ANALYTICS & TELEMETRY                                          */}
      {/* ========================================================================= */}
      {activeTab === 'ANALYTICS' && (
        <AdminAnalyticsDashboard />
      )}

      {/* ========================================================================= */}
      {/* TAB: LAYER-WISE HIERARCHY BUILDER & BULK IMPORTER                         */}
      {/* ========================================================================= */}
      {activeTab === 'BULK_IMPORT' && (
        <AdminBulkHierarchyImporter onImportSuccess={() => { fetchOffices(); fetchAdminLevels(); }} />
      )}

      {/* ========================================================================= */}
      {/* TAB: LIVE EMAIL AUTHENTICATION & SMTP RELAY CONFIG                         */}
      {/* ========================================================================= */}
      {activeTab === 'SMTP_CONFIG' && (
        <AdminSmtpConfigPanel />
      )}

      {/* ========================================================================= */}
      {/* TAB 1: OFFICE & ADMIN MAPPING MATRIX                                      */}
      {/* ========================================================================= */}
      {activeTab === 'MAPPING' && (
        <div className="space-y-4">
          {/* Controls & Search */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-lg border border-slate-200 shadow-xs">
            <div className="flex items-center gap-2 flex-1 min-w-[240px]">
              <SearchIcon className="w-4 h-4 text-slate-400 shrink-0" />
              <input
                type="text"
                placeholder="Search office name, code, or mapped tier..."
                value={officeSearch}
                onChange={e => setOfficeSearch(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded px-2.5 py-1 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:border-blue-600"
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap text-xs">
              <span className="text-slate-500 font-mono">Agency:</span>
              <select
                value={officeFilterBody}
                onChange={e => setOfficeFilterBody(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded px-2 py-1 text-slate-800 font-mono focus:outline-hidden focus:border-blue-600"
              >
                <option value="ALL">All Sovereign Bodies</option>
                <option value="POLICE">Gujarat Police</option>
                <option value="JUDICIARY">State Judiciary</option>
                <option value="FORENSICS">Forensic DFSS</option>
                <option value="MASTER">Master Apex</option>
              </select>

              <span className="text-slate-500 font-mono ml-2">Level:</span>
              <select
                value={officeFilterLevel}
                onChange={e => setOfficeFilterLevel(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded px-2 py-1 text-slate-800 font-mono focus:outline-hidden focus:border-blue-600"
              >
                <option value="ALL">All Levels</option>
                <option value="1">Level 1 (Apex)</option>
                <option value="2">Level 2 (Commissionerate / Regional)</option>
                <option value="3">Level 3 (Division / District)</option>
                <option value="4">Level 4 (Station / Unit)</option>
              </select>

              <button
                onClick={fetchOffices}
                className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 font-mono transition-colors font-medium shadow-xs"
                title="Refresh mapping matrix"
              >
                Refresh
              </button>

              <button
                onClick={() => handleOpenEstablishOfficeModal()}
                className="px-3 py-1 rounded bg-[#1D4ED8] hover:bg-[#1E40AF] text-white font-mono transition-colors font-bold shadow-xs flex items-center gap-1.5"
                title="Establish new office node under an authorized compulsory update ticket"
              >
                <PlusIcon className="w-3.5 h-3.5" />
                <span>Establish Office Node (Ticket Gateway)</span>
              </button>
            </div>
          </div>

          {/* Mapping Table */}
          <div className="bg-white rounded-lg border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-mono border-b border-slate-200 uppercase text-[11px] font-semibold">
                  <tr>
                    <th className="p-3">Office Name & Code</th>
                    <th className="p-3">Office Level</th>
                    <th className="p-3">Mapped Admin Level</th>
                    <th className="p-3">Attached Tags</th>
                    <th className="p-3">Office Status</th>
                    <th className="p-3 text-right">Office Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {loadingOffices ? (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-slate-500 font-mono">
                        Loading office hierarchy & admin mapping matrix...
                      </td>
                    </tr>
                  ) : filteredOffices.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-slate-500 font-mono">
                        No offices match the selected filter criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredOffices.map(office => {
                      const isMapping = mappingOfficeId === office.id;
                      const isDisabled = (office.status || 'ACTIVE') === 'DISABLED';
                      const relevantLevels = adminLevels.filter(al => al.body_id === office.body_id || al.body_id === office.agency_branch || al.body_id === 'MASTER');

                      return (
                        <tr
                          key={office.id}
                          className={`hover:bg-slate-50/80 transition-colors ${
                            isDisabled ? 'opacity-60 bg-slate-50' : ''
                          }`}
                        >
                          {/* Office Name & Agency */}
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-slate-900">{office.name}</span>
                            </div>
                            <div className="flex items-center gap-2 font-mono text-[10.5px] text-slate-500 mt-0.5">
                              <span className="text-blue-700 font-semibold">{office.code}</span>
                              <span>•</span>
                              <span>{office.agency_branch}</span>
                              {office.child_count !== undefined && office.child_count > 0 && (
                                <>
                                  <span>•</span>
                                  <span className="text-slate-500">{office.child_count} sub-offices</span>
                                </>
                              )}
                            </div>
                          </td>

                          {/* Office Level */}
                          <td className="p-3 font-mono">
                            <span className="px-2 py-0.5 rounded text-[10.5px] font-bold bg-slate-100 border border-slate-200 text-slate-700">
                              Level {office.level}
                            </span>
                          </td>

                          {/* Mapped Admin Level */}
                          <td className="p-3">
                            {isMapping ? (
                              <div className="flex items-center gap-1.5">
                                <select
                                  value={selectedAdminLevelId}
                                  onChange={e => setSelectedAdminLevelId(e.target.value)}
                                  className="bg-white border border-blue-600 rounded px-2 py-1 text-xs text-slate-900 font-mono focus:outline-hidden"
                                >
                                  <option value="">-- No Specific Admin Tier --</option>
                                  {relevantLevels.map(al => (
                                    <option key={al.id} value={al.id}>
                                      Level {al.level_number}: {al.name}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  onClick={() => handleApplyAdminLevel(office, selectedAdminLevelId)}
                                  className="p-1 rounded bg-[#1D4ED8] text-white hover:bg-[#1E40AF] transition-colors shadow-xs"
                                  title="Save Mapping"
                                >
                                  <CheckIcon className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => setMappingOfficeId(null)}
                                  className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 hover:text-slate-900 text-[10px] border border-slate-200"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                {office.admin_level_name ? (
                                  <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-blue-50 text-blue-800 border border-blue-200 font-semibold">
                                    {office.admin_level_number ? `L${office.admin_level_number} • ` : ''}{office.admin_level_name}
                                  </span>
                                ) : (
                                  <span className="text-slate-400 font-mono text-[11px] italic">
                                    Unmapped
                                  </span>
                                )}
                                <button
                                  onClick={() => {
                                    setMappingOfficeId(office.id);
                                    setSelectedAdminLevelId(office.admin_level_id || '');
                                  }}
                                  className="text-[10px] text-blue-700 hover:underline font-mono font-medium"
                                >
                                  Change
                                </button>
                              </div>
                            )}
                          </td>

                          {/* Attached Tags */}
                          <td className="p-3">
                            <div className="flex items-center gap-1 flex-wrap max-w-[260px]">
                              {(office.tags || []).map(tg => (
                                <span
                                  key={tg.id}
                                  className={`px-1.5 py-0.5 rounded text-[9.5px] font-mono border ${getTagStyle(tg.color)}`}
                                >
                                  {tg.name}
                                </span>
                              ))}
                              <button
                                onClick={() => setTagAssignmentOffice(office)}
                                className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 font-medium"
                                title="Manage tags for this office"
                              >
                                + Tags
                              </button>
                            </div>
                          </td>

                          {/* Office Status */}
                          <td className="p-3 font-mono">
                            <span className={`px-2 py-0.5 rounded text-[10.5px] font-bold border ${
                              (office.status || 'ACTIVE') === 'ACTIVE'
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                : 'bg-red-50 text-red-800 border-red-200'
                            }`}>
                              {office.status || 'ACTIVE'}
                            </span>
                          </td>

                          {/* Actions: Track Office, Disable / Enable & Delete */}
                          <td className="p-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Track Office Button */}
                              <button
                                onClick={() => handleOpenOfficeTracking(office)}
                                className="px-2.5 py-1 rounded text-[10.5px] font-mono font-semibold bg-blue-50 text-blue-800 border border-blue-200 hover:bg-blue-100 flex items-center gap-1 transition-colors shadow-2xs cursor-pointer"
                                title="Inspect 'Who Can Change This Office', update tickets & activity tracking"
                              >
                                <ShieldIcon className="w-3 h-3 text-blue-700" />
                                <span>Track Office</span>
                              </button>

                              {/* Disable / Enable Button */}
                              <button
                                onClick={() => handleToggleOfficeStatus(office)}
                                className={`px-2 py-1 rounded text-[10.5px] font-mono font-medium border transition-colors cursor-pointer ${
                                  (office.status || 'ACTIVE') === 'ACTIVE'
                                    ? 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                                    : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                                }`}
                                title="Toggle active / disabled status via ticket"
                              >
                                {(office.status || 'ACTIVE') === 'ACTIVE' ? 'Disable' : 'Activate'}
                              </button>

                              {/* Delete Office Button */}
                              {office.level > 1 && office.parent_id && (
                                <button
                                  onClick={() => handleInitiateDeleteOffice(office)}
                                  className="px-2 py-1 rounded text-[10.5px] font-mono font-medium bg-red-50 text-red-800 border border-red-200 hover:bg-red-100 transition-colors cursor-pointer"
                                  title="Decommission & delete this office node"
                                >
                                  Delete
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: SOVEREIGN DECISION-MAKING LAYERS & GOVERNANCE TIERS                */}
      {/* ========================================================================= */}
      {activeTab === 'LEVELS' && (
        <div className="space-y-5">
          {/* Top Explanatory Banner & Actions */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-lg border border-slate-200 shadow-xs">
            <div>
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <ShieldIcon className="w-4 h-4 text-blue-700" />
                <span>Sovereign Decision-Making Layers & Hierarchy Tiers</span>
              </h2>
              <p className="text-xs text-slate-600 mt-0.5">
                Institutional command tiers strictly separated by sovereign body (Police, Judiciary, Forensics). Each layer defines the office hierarchy, personnel oversight, and subordinate administrator reporting lines.
              </p>
            </div>

            <button
              onClick={() => {
                setLevelForm(prev => ({
                  ...prev,
                  bodyId: levelFilterBody === 'ALL' ? 'POLICE' : levelFilterBody,
                }));
                setShowCreateLevelModal(true);
              }}
              className="px-3.5 py-1.5 rounded bg-[#1D4ED8] hover:bg-[#1E40AF] text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors whitespace-nowrap cursor-pointer"
            >
              <PlusIcon className="w-3.5 h-3.5" />
              <span>Define Decision-Making Layer</span>
            </button>
          </div>

          {/* Body Sub-Tab Switcher - Strictly Separated, Non-Universal */}
          <div className="flex items-center gap-2 bg-slate-100 p-1.5 rounded-lg border border-slate-300 flex-wrap">
            <button
              onClick={() => setLevelFilterBody('POLICE')}
              className={`px-4 py-2 rounded-md font-mono text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                levelFilterBody === 'POLICE'
                  ? 'bg-blue-700 text-white shadow-xs'
                  : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
              }`}
            >
              <span>👮</span>
              <span>Gujarat Police ({adminLevels.filter(l => l.body_id === 'POLICE').length} Layers)</span>
            </button>

            <button
              onClick={() => setLevelFilterBody('JUDICIARY')}
              className={`px-4 py-2 rounded-md font-mono text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                levelFilterBody === 'JUDICIARY'
                  ? 'bg-blue-700 text-white shadow-xs'
                  : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
              }`}
            >
              <span>⚖️</span>
              <span>State Judiciary ({adminLevels.filter(l => l.body_id === 'JUDICIARY').length} Layers)</span>
            </button>

            <button
              onClick={() => setLevelFilterBody('FORENSICS')}
              className={`px-4 py-2 rounded-md font-mono text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                levelFilterBody === 'FORENSICS'
                  ? 'bg-blue-700 text-white shadow-xs'
                  : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
              }`}
            >
              <span>🔬</span>
              <span>Forensic Science ({adminLevels.filter(l => l.body_id === 'FORENSICS').length} Layers)</span>
            </button>

            {(user?.roleId === 'MASTER_ADMIN' || user?.roleId === 'SYSTEM_MASTER_ADMIN') && (
              <button
                onClick={() => setLevelFilterBody('MASTER')}
                className={`px-4 py-2 rounded-md font-mono text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                  levelFilterBody === 'MASTER'
                    ? 'bg-blue-700 text-white shadow-xs'
                    : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
                }`}
              >
                <span>🏛️</span>
                <span>Master Apex</span>
              </button>
            )}

            <button
              onClick={() => setLevelFilterBody('ALL')}
              className={`px-3 py-2 rounded-md font-mono text-xs font-medium transition-all cursor-pointer ${
                levelFilterBody === 'ALL'
                  ? 'bg-slate-800 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Show All Bodies
            </button>
          </div>

          {/* Level Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {loadingLevels ? (
              <div className="col-span-full p-8 text-center text-slate-500 font-mono">
                Loading sovereign decision-making layers...
              </div>
            ) : filteredLevels.length === 0 ? (
              <div className="col-span-full p-8 text-center text-slate-500 font-mono bg-white rounded-lg border border-slate-200">
                No decision-making layers configured for this sovereign body. Click '+ Define Decision-Making Layer' to configure one.
              </div>
            ) : (
              filteredLevels.map(al => (
                <div
                  key={al.id}
                  className="bg-white rounded-lg border border-slate-200 p-4 space-y-3.5 shadow-xs hover:border-blue-400 transition-colors"
                >
                  {/* Card Header: Level Number & Agency */}
                  <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2.5">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded text-[10.5px] font-mono font-bold bg-blue-50 text-blue-800 border border-blue-200">
                          TIER LEVEL {al.level_number}
                        </span>
                        <AgencyBadge branch={al.body_id} />
                      </div>
                      <h3 className="font-bold text-slate-900 text-sm mt-2">{al.name}</h3>
                    </div>

                    <button
                      onClick={() => handleDeleteAdminLevel(al)}
                      className="text-slate-400 hover:text-red-700 p-1 transition-colors text-xs font-mono font-semibold"
                      title="Delete this decision-making layer"
                    >
                      Delete
                    </button>
                  </div>

                  {/* Office Hierarchy & Default Role Representation */}
                  <div className="grid grid-cols-2 gap-2 text-[11px] font-mono bg-slate-50 p-2.5 rounded border border-slate-100">
                    <div>
                      <span className="text-slate-500 block text-[10px]">Office Hierarchy Type:</span>
                      <span className="font-bold text-slate-800">{al.office_type_id || 'OFFICE_NODE'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">Default Admin Role:</span>
                      <span className="font-bold text-slate-800">{al.default_role_id || `${al.body_id}_ADMIN`}</span>
                    </div>
                  </div>

                  <p className="text-xs text-slate-600 line-clamp-2">
                    {al.description || 'Administrative command tier governing subordinate personnel and facilities.'}
                  </p>

                  {/* Decision-Making Governance Capabilities */}
                  <div className="space-y-1.5 pt-1">
                    <span className="text-[10px] font-mono font-semibold uppercase text-slate-500 block">
                      Decision-Making Authority:
                    </span>
                    <div className="grid grid-cols-2 gap-1.5 text-[10.5px] font-mono">
                      <div className={`px-2 py-1 rounded border flex items-center gap-1.5 ${
                        al.manages_office_users !== false
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200 font-semibold'
                          : 'bg-slate-50 text-slate-400 border-slate-200'
                      }`}>
                        <span>{al.manages_office_users !== false ? '✓' : '✗'}</span>
                        <span>Manages Office Users</span>
                      </div>

                      <div className={`px-2 py-1 rounded border flex items-center gap-1.5 ${
                        al.manages_subordinate_admins !== false
                          ? 'bg-blue-50 text-blue-800 border-blue-200 font-semibold'
                          : 'bg-slate-50 text-slate-400 border-slate-200'
                      }`}>
                        <span>{al.manages_subordinate_admins !== false ? '✓' : '✗'}</span>
                        <span title="Admins of lower offices in hierarchy report here">Sub-Admins Under Here</span>
                      </div>

                      <div className={`px-2 py-1 rounded border flex items-center gap-1.5 ${
                        al.can_create_sub_offices
                          ? 'bg-purple-50 text-purple-800 border-purple-200 font-semibold'
                          : 'bg-slate-50 text-slate-400 border-slate-200'
                      }`}>
                        <span>{al.can_create_sub_offices ? '✓' : '✗'}</span>
                        <span>Can Create Offices</span>
                      </div>

                      <div className={`px-2 py-1 rounded border flex items-center gap-1.5 ${
                        al.can_approve_tickets
                          ? 'bg-amber-50 text-amber-800 border-amber-200 font-semibold'
                          : 'bg-slate-50 text-slate-400 border-slate-200'
                      }`}>
                        <span>{al.can_approve_tickets ? '✓' : '✗'}</span>
                        <span>Approves Tickets</span>
                      </div>
                    </div>
                  </div>

                  {/* Card Footer: Clearance & Mapped Offices */}
                  <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-xs font-mono">
                    <div>
                      <span className="text-slate-500 text-[10.5px]">Clearance: </span>
                      <span className="text-slate-900 font-semibold">{al.max_clearance_allowed || al.clearance_required}</span>
                    </div>
                    <div>
                      <span className="text-blue-700 font-bold bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                        {al.mapped_office_count || 0} mapped
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: TAG MANAGEMENT                                                     */}
      {/* ========================================================================= */}
      {activeTab === 'TAGS' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-white p-3 rounded-lg border border-slate-200 shadow-xs">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Institutional Tags Catalog</h2>
              <p className="text-xs text-slate-500">Create and manage operational tags assigned to offices, stations, and specialized units.</p>
            </div>
            <button
              onClick={() => setShowCreateTagModal(true)}
              className="px-3 py-1.5 rounded bg-[#1D4ED8] hover:bg-[#1E40AF] text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors"
            >
              <PlusIcon className="w-3.5 h-3.5" />
              <span>Create New Tag</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {loadingTags ? (
              <div className="col-span-full p-8 text-center text-slate-500 font-mono">
                Loading tags...
              </div>
            ) : tags.length === 0 ? (
              <div className="col-span-full p-8 text-center text-slate-500 font-mono">
                No tags defined yet. Click '+ Create New Tag' to define one.
              </div>
            ) : (
              tags.map(tag => (
                <div key={tag.id} className="bg-white rounded-lg border border-slate-200 p-3 flex flex-col justify-between space-y-2 shadow-xs">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className={`px-2 py-0.5 rounded text-xs font-mono font-semibold border ${getTagStyle(tag.color)}`}>
                        {tag.name}
                      </span>
                      <span className="text-[10px] font-mono text-slate-500 uppercase">
                        {tag.category}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 line-clamp-2">
                      {tag.description || 'No description provided.'}
                    </p>
                  </div>

                  <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-xs font-mono text-slate-500">
                    <span>{tag.office_count || 0} offices tagged</span>
                    <button
                      onClick={() => handleDeleteTag(tag)}
                      className="text-red-600 hover:text-red-800 text-[11px] font-medium"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: CREATE TAG                                                         */}
      {/* ========================================================================= */}
      {showCreateTagModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white border border-slate-200 rounded-lg max-w-md w-full p-5 space-y-4 shadow-xl text-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-bold text-slate-900 text-sm">Create New Office Tag</h3>
              <button
                onClick={() => setShowCreateTagModal(false)}
                className="text-slate-400 hover:text-slate-700 font-mono text-base px-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateTag} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 font-mono mb-1 font-semibold">Tag Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Coastal Border Outpost, Special Investigation Team"
                  value={tagForm.name}
                  onChange={e => setTagForm(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full bg-white border border-slate-300 rounded px-3 py-1.5 text-slate-900 font-mono focus:outline-hidden focus:border-blue-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-mono mb-1 font-semibold">Color Palette</label>
                  <select
                    value={tagForm.color}
                    onChange={e => setTagForm(prev => ({ ...prev, color: e.target.value }))}
                    className="w-full bg-white border border-slate-300 rounded px-3 py-1.5 text-slate-900 font-mono focus:outline-hidden focus:border-blue-600"
                  >
                    <option value="blue">Blue (Police / Urban)</option>
                    <option value="emerald">Emerald (Apex / Command)</option>
                    <option value="amber">Amber (Sensitive / Scene)</option>
                    <option value="purple">Purple (Forensic / Specialty)</option>
                    <option value="rose">Rose (Border / Critical)</option>
                    <option value="slate">Slate (General)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-mono mb-1 font-semibold">Category</label>
                  <select
                    value={tagForm.category}
                    onChange={e => setTagForm(prev => ({ ...prev, category: e.target.value }))}
                    className="w-full bg-white border border-slate-300 rounded px-3 py-1.5 text-slate-900 font-mono focus:outline-hidden focus:border-blue-600"
                  >
                    <option value="OFFICE">Office Facility</option>
                    <option value="JURISDICTION">Jurisdiction</option>
                    <option value="SECURITY">Security / Alert</option>
                    <option value="SPECIALTY">Specialty Wing</option>
                    <option value="OPERATIONAL">Operational Field</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-mono mb-1 font-semibold">Description</label>
                <textarea
                  rows={2}
                  placeholder="Operational purpose of this tag..."
                  value={tagForm.description}
                  onChange={e => setTagForm(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full bg-white border border-slate-300 rounded px-3 py-1.5 text-slate-900 font-mono focus:outline-hidden focus:border-blue-600"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowCreateTagModal(false)}
                  className="px-3 py-1.5 rounded bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-300 font-mono text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded bg-[#1D4ED8] hover:bg-[#1E40AF] text-white font-mono text-xs font-semibold shadow-sm transition-colors"
                >
                  Create Tag
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: CREATE ADMIN LEVEL                                                 */}
      {/* ========================================================================= */}
      {showCreateLevelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full p-5 space-y-4 shadow-xl text-slate-900 my-8">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <ShieldIcon className="w-4 h-4 text-blue-700" />
                  <span>Define Sovereign Decision-Making Layer</span>
                </h3>
                <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                  Establish an institutional governance tier with office mapping and personnel decision-making authority.
                </p>
              </div>
              <button
                onClick={() => setShowCreateLevelModal(false)}
                className="text-slate-400 hover:text-slate-700 font-mono text-base px-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateAdminLevel} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-mono mb-1 font-semibold">Sovereign Body *</label>
                  <select
                    value={levelForm.bodyId}
                    onChange={e => {
                      const b = e.target.value;
                      const defaultType = b === 'POLICE' ? 'POLICE_STATION' : b === 'JUDICIARY' ? 'DISTRICT_COURT' : 'REGIONAL_FSL';
                      const defaultRole = b === 'POLICE' ? 'POLICE_ADMIN' : b === 'JUDICIARY' ? 'JUDICIARY_ADMIN' : 'FSL_ADMIN';
                      setLevelForm(prev => ({ ...prev, bodyId: b, officeTypeId: defaultType, defaultRoleId: defaultRole }));
                    }}
                    className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-slate-900 font-mono focus:outline-hidden focus:border-blue-600 font-bold"
                  >
                    <option value="POLICE">Gujarat Police</option>
                    <option value="JUDICIARY">State Judiciary</option>
                    <option value="FORENSICS">Forensic Science (DFSS)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-mono mb-1 font-semibold">Tier Rank (1–5) *</label>
                  <select
                    value={levelForm.levelNumber}
                    onChange={e => setLevelForm(prev => ({ ...prev, levelNumber: parseInt(e.target.value, 10) }))}
                    className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-slate-900 font-mono focus:outline-hidden focus:border-blue-600 font-bold"
                  >
                    <option value={1}>Tier 1: Sovereign Apex Command</option>
                    <option value={2}>Tier 2: Range / Commissionerate</option>
                    <option value={3}>Tier 3: Divisional / District</option>
                    <option value={4}>Tier 4: Station / Unit Level</option>
                    <option value={5}>Tier 5: Section / Specialized Desk</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-mono mb-1 font-semibold">Layer Official Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Sub-Divisional Police Officer (SDPO) Command"
                  value={levelForm.name}
                  onChange={e => setLevelForm(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full bg-white border border-slate-300 rounded px-3 py-1.5 text-slate-900 font-mono focus:outline-hidden focus:border-blue-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-mono mb-1 font-semibold">Office Hierarchy Type *</label>
                  <select
                    value={levelForm.officeTypeId}
                    onChange={e => setLevelForm(prev => ({ ...prev, officeTypeId: e.target.value }))}
                    className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-slate-900 font-mono focus:outline-hidden focus:border-blue-600"
                  >
                    {levelForm.bodyId === 'POLICE' && (
                      <>
                        <option value="POLICE_HQ">State Police Headquarters (HQ)</option>
                        <option value="COMMISSIONERATE">Metropolitan Commissionerate</option>
                        <option value="RANGE_IG">Range IGP Command Office</option>
                        <option value="DIVISION">Zonal / District SP Division</option>
                        <option value="POLICE_STATION">Police Station / Unit</option>
                        <option value="SPECIAL_WING">Cyber / SOG / CID Wing</option>
                      </>
                    )}
                    {levelForm.bodyId === 'JUDICIARY' && (
                      <>
                        <option value="HIGH_COURT">High Court of Gujarat (Apex)</option>
                        <option value="DISTRICT_COURT">Principal District & Sessions Court</option>
                        <option value="TALUKA_COURT">Sub-Divisional / Taluka Court</option>
                        <option value="EXECUTIVE_MAGISTRACY">Executive Magistracy Court</option>
                      </>
                    )}
                    {levelForm.bodyId === 'FORENSICS' && (
                      <>
                        <option value="STATE_FSL_HQ">State Directorate FSL HQ</option>
                        <option value="REGIONAL_FSL">Regional Forensic Laboratory</option>
                        <option value="DISTRICT_MOBILE_UNIT">Mobile Scene-of-Crime Unit</option>
                      </>
                    )}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-mono mb-1 font-semibold">Default Admin Role *</label>
                  <select
                    value={levelForm.defaultRoleId}
                    onChange={e => setLevelForm(prev => ({ ...prev, defaultRoleId: e.target.value }))}
                    className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-slate-900 font-mono focus:outline-hidden focus:border-blue-600"
                  >
                    {levelForm.bodyId === 'POLICE' && (
                      <>
                        <option value="POLICE_BODY_ADMIN">State Police Body Admin</option>
                        <option value="POLICE_ADMIN">Police Node / Station Admin</option>
                        <option value="POLICE_OFFICER">Police Investigating Officer</option>
                      </>
                    )}
                    {levelForm.bodyId === 'JUDICIARY' && (
                      <>
                        <option value="JUDICIARY_BODY_ADMIN">High Court Registrar General</option>
                        <option value="JUDICIARY_ADMIN">Court Administrator</option>
                        <option value="JUDGE">Presiding Judge / Magistrate</option>
                        <option value="COURT_USER">Court Staff / Clerk</option>
                      </>
                    )}
                    {levelForm.bodyId === 'FORENSICS' && (
                      <>
                        <option value="FSL_BODY_ADMIN">Director Forensic Science</option>
                        <option value="FSL_ADMIN">Forensic Lab Administrator</option>
                        <option value="FORENSIC_EXAMINER">Forensic Scientific Officer</option>
                      </>
                    )}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-mono mb-1 font-semibold">Clearance Required</label>
                  <select
                    value={levelForm.clearanceRequired}
                    onChange={e => setLevelForm(prev => ({ ...prev, clearanceRequired: e.target.value }))}
                    className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-slate-900 font-mono focus:outline-hidden focus:border-blue-600"
                  >
                    <option value="CONFIDENTIAL">CONFIDENTIAL</option>
                    <option value="SECRET">SECRET</option>
                    <option value="TOP_SECRET">TOP_SECRET</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-mono mb-1 font-semibold">Max Clearance Allowed</label>
                  <select
                    value={levelForm.maxClearanceAllowed}
                    onChange={e => setLevelForm(prev => ({ ...prev, maxClearanceAllowed: e.target.value }))}
                    className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-slate-900 font-mono focus:outline-hidden focus:border-blue-600"
                  >
                    <option value="CONFIDENTIAL">CONFIDENTIAL</option>
                    <option value="SECRET">SECRET</option>
                    <option value="TOP_SECRET">TOP_SECRET</option>
                  </select>
                </div>
              </div>

              {/* Decision-Making Authority Checkboxes */}
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2 font-mono">
                <span className="text-[10.5px] font-bold text-slate-700 uppercase block border-b border-slate-200 pb-1">
                  Decision-Making Powers & Hierarchical Authority
                </span>

                <label className="flex items-start gap-2 text-xs text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={levelForm.managesOfficeUsers}
                    onChange={e => setLevelForm(prev => ({ ...prev, managesOfficeUsers: e.target.checked }))}
                    className="mt-0.5 rounded text-blue-600 focus:ring-blue-500"
                  />
                  <span>
                    <strong className="block text-slate-900">Manages Office Users</strong>
                    <span className="text-[10.5px] text-slate-500">Administrator has direct personnel authority over officers stationed at this office.</span>
                  </span>
                </label>

                <label className="flex items-start gap-2 text-xs text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={levelForm.managesSubordinateAdmins}
                    onChange={e => setLevelForm(prev => ({ ...prev, managesSubordinateAdmins: e.target.checked }))}
                    className="mt-0.5 rounded text-blue-600 focus:ring-blue-500"
                  />
                  <span>
                    <strong className="block text-slate-900">Subordinate Office Admins Report Here</strong>
                    <span className="text-[10.5px] text-slate-500">Administrators of lower-tier offices in the hierarchy tree come directly under this tier admin.</span>
                  </span>
                </label>

                <label className="flex items-start gap-2 text-xs text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={levelForm.canCreateSubOffices}
                    onChange={e => setLevelForm(prev => ({ ...prev, canCreateSubOffices: e.target.checked }))}
                    className="mt-0.5 rounded text-blue-600 focus:ring-blue-500"
                  />
                  <span>
                    <strong className="block text-slate-900">Can Establish Subordinate Offices</strong>
                    <span className="text-[10.5px] text-slate-500">Authorized to establish and configure child stations, outposts, and divisions.</span>
                  </span>
                </label>

                <label className="flex items-start gap-2 text-xs text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={levelForm.canApproveTickets}
                    onChange={e => setLevelForm(prev => ({ ...prev, canApproveTickets: e.target.checked }))}
                    className="mt-0.5 rounded text-blue-600 focus:ring-blue-500"
                  />
                  <span>
                    <strong className="block text-slate-900">Approve Compulsory Update Tickets</strong>
                    <span className="text-[10.5px] text-slate-500">Authority to sign off on mutational tickets submitted by subordinate personnel.</span>
                  </span>
                </label>
              </div>

              <div>
                <label className="block text-slate-700 font-mono mb-1 font-semibold">Jurisdictional Mandate & Description</label>
                <textarea
                  rows={2}
                  placeholder="Statutory authority scope, delegation rules, and operational mandates..."
                  value={levelForm.description}
                  onChange={e => setLevelForm(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full bg-white border border-slate-300 rounded px-3 py-1.5 text-slate-900 font-mono focus:outline-hidden focus:border-blue-600"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowCreateLevelModal(false)}
                  className="px-3 py-1.5 rounded bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-300 font-mono text-xs font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded bg-[#1D4ED8] hover:bg-[#1E40AF] text-white font-mono text-xs font-semibold shadow-sm transition-colors cursor-pointer"
                >
                  Save Decision-Making Layer via Ticket
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: ASSIGN TAGS TO OFFICE                                              */}
      {/* ========================================================================= */}
      {tagAssignmentOffice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white border border-slate-200 rounded-lg max-w-lg w-full p-5 space-y-4 shadow-xl text-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Assign Tags to Office</h3>
                <p className="text-xs text-slate-500 font-mono mt-0.5">{tagAssignmentOffice.name} ({tagAssignmentOffice.code})</p>
              </div>
              <button
                onClick={() => setTagAssignmentOffice(null)}
                className="text-slate-400 hover:text-slate-700 font-mono text-base px-1"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <p className="text-slate-600">Select operational tags to attach to or detach from this office node:</p>
              <div className="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto p-1">
                {tags.map(tag => {
                  const attachedTagIds = (tagAssignmentOffice.tags || []).map(t => t.id);
                  const isAttached = attachedTagIds.includes(tag.id);

                  return (
                    <button
                      key={tag.id}
                      onClick={() => handleToggleOfficeTag(tagAssignmentOffice.id, tag.id, isAttached)}
                      className={`p-2.5 rounded-lg border text-left font-mono text-xs flex items-center justify-between transition-colors ${
                        isAttached
                          ? `${getTagStyle(tag.color)} font-semibold`
                          : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-400'
                      }`}
                    >
                      <span>{tag.name}</span>
                      <span>{isAttached ? '✓' : '+'}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-200">
              <button
                onClick={() => setTagAssignmentOffice(null)}
                className="px-4 py-1.5 rounded bg-[#1D4ED8] hover:bg-[#1E40AF] text-white text-xs font-semibold shadow-sm transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: DELETE OFFICE CONFIRMATION                                         */}
      {/* ========================================================================= */}
      {officeToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white border border-slate-200 rounded-lg max-w-md w-full p-5 space-y-4 shadow-xl text-slate-900">
            <div className="flex items-center gap-2.5 text-red-600 border-b border-slate-200 pb-3">
              <AlertTriangleIcon className="w-5 h-5 shrink-0" />
              <h3 className="font-bold text-sm text-slate-900">Decommission & Delete Office</h3>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-slate-600">
                You are about to delete the following organization node from the sovereign hierarchy:
              </p>

              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1 font-mono">
                <div className="text-slate-900 font-bold">{officeToDelete.name}</div>
                <div className="text-blue-700 text-[11px] font-semibold">{officeToDelete.code}</div>
                <div className="text-slate-500 text-[11px]">Level {officeToDelete.level} • {officeToDelete.agency_branch}</div>
              </div>

              {/* Dependency checks warning */}
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded text-[11px] space-y-1 font-mono">
                <div className="text-slate-800 font-semibold">Safety Verification:</div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Subordinate Child Offices:</span>
                  <span className={officeToDelete.child_count && officeToDelete.child_count > 0 ? 'text-red-600 font-bold' : 'text-emerald-700 font-semibold'}>
                    {officeToDelete.child_count || 0}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Assigned Personnel:</span>
                  <span className={officeToDelete.user_count && officeToDelete.user_count > 0 ? 'text-red-600 font-bold' : 'text-emerald-700 font-semibold'}>
                    {officeToDelete.user_count || 0}
                  </span>
                </div>
              </div>

              {deleteError && (
                <div className="p-2.5 bg-red-50 border border-red-200 rounded text-red-700 text-xs font-mono">
                  {deleteError}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                onClick={() => setOfficeToDelete(null)}
                className="px-3 py-1.5 rounded bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-300 font-mono text-xs font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDeleteOffice}
                className="px-3 py-1.5 rounded bg-red-600 hover:bg-red-700 text-white font-mono text-xs font-semibold shadow-xs"
              >
                Continue to Ticket
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: OFFICE AUTHORITY GOVERNANCE & AUDIT/TICKET TRACKING                 */}
      {/* ========================================================================= */}
      {trackingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl text-slate-900 overflow-hidden my-6">
            {/* Modal Header */}
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <ShieldIcon className="w-5 h-5 text-blue-400" />
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-bold text-base leading-none">
                      {trackingOffice?.name}
                    </h2>
                    <span className="px-2 py-0.5 rounded text-[10.5px] font-mono font-bold bg-blue-900/60 text-blue-200 border border-blue-700">
                      {trackingOffice?.code}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                      (trackingOffice?.status || 'ACTIVE') === 'ACTIVE'
                        ? 'bg-emerald-950 text-emerald-300 border-emerald-700'
                        : 'bg-red-950 text-red-300 border-red-700'
                    }`}>
                      {trackingOffice?.status || 'ACTIVE'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 font-mono mt-1">
                    {trackingOffice?.agency_branch} • Level {trackingOffice?.level} • Tier: {trackingOffice?.admin_level_name || 'Standard LEA Unit'}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setTrackingModalOpen(false)}
                className="text-slate-400 hover:text-white font-mono text-xl p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Quick Metrics Bar */}
            {trackingData && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 bg-slate-50 border-b border-slate-200 text-xs font-mono">
                <div className="bg-white p-2 rounded border border-slate-200">
                  <span className="text-[10px] text-slate-500 uppercase block">Active Personnel</span>
                  <span className="text-base font-bold text-slate-900">{trackingData.stats.activeUsers}</span>
                </div>
                <div className="bg-white p-2 rounded border border-slate-200">
                  <span className="text-[10px] text-slate-500 uppercase block">Direct Admins</span>
                  <span className="text-base font-bold text-blue-700">{trackingData.stats.activeAdmins}</span>
                </div>
                <div className="bg-white p-2 rounded border border-slate-200">
                  <span className="text-[10px] text-slate-500 uppercase block">Sub-Offices Under Command</span>
                  <span className="text-base font-bold text-purple-700">{trackingData.stats.descendantOffices}</span>
                </div>
                <div className="bg-white p-2 rounded border border-slate-200">
                  <span className="text-[10px] text-slate-500 uppercase block">Compulsory Tickets</span>
                  <span className="text-base font-bold text-emerald-700">{trackingData.stats.totalTickets}</span>
                </div>
              </div>
            )}

            {/* Sub-Tab Navigation */}
            <div className="flex border-b border-slate-200 bg-white px-4 pt-2 gap-2 text-xs font-mono font-semibold">
              <button
                onClick={() => setTrackingSubTab('GOVERNANCE')}
                className={`pb-2.5 px-3 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
                  trackingSubTab === 'GOVERNANCE'
                    ? 'border-blue-600 text-blue-700'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                <ShieldIcon className="w-3.5 h-3.5" />
                <span>Who Can Change This Office</span>
              </button>

              <button
                onClick={() => setTrackingSubTab('ADMIN_TICKETS')}
                className={`pb-2.5 px-3 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
                  trackingSubTab === 'ADMIN_TICKETS'
                    ? 'border-blue-600 text-blue-700'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                <ClockIcon className="w-3.5 h-3.5" />
                <span>Admin Activity & Tickets ({trackingData?.tickets.length || 0})</span>
              </button>

              <button
                onClick={() => setTrackingSubTab('USER_ACTIVITY')}
                className={`pb-2.5 px-3 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
                  trackingSubTab === 'USER_ACTIVITY'
                    ? 'border-blue-600 text-blue-700'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                <ActivityIcon className="w-3.5 h-3.5" />
                <span>Office Personnel Operational Feed ({trackingData?.userActivity.length || 0})</span>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 overflow-y-auto flex-1 space-y-4">
              {loadingTracking ? (
                <div className="p-12 text-center text-slate-500 font-mono">
                  Loading office authority governance & audit tracking...
                </div>
              ) : trackingError ? (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs font-mono">
                  {trackingError}
                </div>
              ) : !trackingData ? (
                <div className="p-8 text-center text-slate-400 font-mono">
                  No tracking data available.
                </div>
              ) : (
                <>
                  {/* SUB-TAB 1: WHO CAN CHANGE THIS OFFICE */}
                  {trackingSubTab === 'GOVERNANCE' && (
                    <div className="space-y-4">
                      {/* Governance Rules Alert */}
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-1.5">
                        <div className="flex items-center gap-2 text-blue-900 font-bold text-xs font-mono">
                          <LockIcon className="w-3.5 h-3.5 text-blue-700" />
                          <span>MANDATORY LEA GOVERNANCE & ISOLATION POLICIES</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-mono text-blue-950">
                          {trackingData.governance.rules.isolationRules.map((r, i) => (
                            <div key={i} className="bg-white/90 p-2.5 rounded border border-blue-100 shadow-2xs">
                              <span className="font-bold block text-blue-900">{r.rule}:</span>
                              <span className="text-slate-700">{r.description}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Direct Administrators */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-bold font-mono uppercase text-slate-700 flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
                            <span>Direct Office Administrators (Stationed Directly at this Node)</span>
                          </h4>
                          <span className="text-[11px] font-mono text-slate-500">
                            {trackingData.governance.directAdministrators.length} active
                          </span>
                        </div>

                        {trackingData.governance.directAdministrators.length === 0 ? (
                          <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-500 font-mono italic">
                            No direct layer administrator is currently stationed at this office. Administration falls to superior chain supervisors.
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            {trackingData.governance.directAdministrators.map(adm => (
                              <div key={adm.id} className="p-3 bg-white rounded-lg border border-slate-200 shadow-xs space-y-1 text-xs font-mono">
                                <div className="flex items-center justify-between">
                                  <span className="font-bold text-slate-900">{adm.display_name}</span>
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                    DIRECT ADMIN
                                  </span>
                                </div>
                                <div className="text-[11px] text-slate-600">
                                  <span>{adm.designation || 'Administrator'}</span>
                                  {adm.badge_number && <span> • Badge: {adm.badge_number}</span>}
                                </div>
                                <div className="text-[10.5px] text-blue-700 font-semibold">
                                  Gov ID: {adm.government_id || 'N/A'} • Role: {adm.role_name}
                                </div>
                                <div className="text-[10px] text-slate-400">
                                  Email: {adm.email} {adm.phone_number ? `• Ph: ${adm.phone_number}` : ''}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Supervising Parent Chain Administrators */}
                      <div className="space-y-2 pt-2 border-t border-slate-200">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-bold font-mono uppercase text-slate-700 flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-blue-600 inline-block"></span>
                            <span>Supervising Upward Chain Administrators (Hierarchical Parents)</span>
                          </h4>
                          <span className="text-[11px] font-mono text-slate-500">
                            {trackingData.governance.supervisingAdministrators.length} superior authorities
                          </span>
                        </div>

                        {trackingData.governance.supervisingAdministrators.length === 0 ? (
                          <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-500 font-mono italic">
                            This office is at the apex or has no parent administrators currently provisioned in its vertical command line.
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            {trackingData.governance.supervisingAdministrators.map(adm => (
                              <div key={adm.id} className="p-3 bg-slate-50 rounded-lg border border-slate-200 shadow-xs space-y-1 text-xs font-mono">
                                <div className="flex items-center justify-between">
                                  <span className="font-bold text-slate-900">{adm.display_name}</span>
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-800 border border-blue-200">
                                    SUPERVISOR
                                  </span>
                                </div>
                                <div className="text-[11px] text-slate-700 font-semibold">
                                  Office: {adm.office_name} ({adm.office_code}) • Level {adm.office_level}
                                </div>
                                <div className="text-[10.5px] text-blue-800">
                                  Gov ID: {adm.government_id || 'N/A'} • Role: {adm.role_name}
                                </div>
                                <div className="text-[10px] text-slate-500">
                                  Email: {adm.email} • Tier: {adm.admin_level_name || `Level ${adm.office_level}`}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Universal Master Admins */}
                      <div className="space-y-2 pt-2 border-t border-slate-200">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-bold font-mono uppercase text-slate-700 flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-slate-800 inline-block"></span>
                            <span>Universal Master Administrators (Cross-Agency Apex)</span>
                          </h4>
                          <span className="text-[11px] font-mono text-slate-500">
                            {trackingData.governance.masterAdministrators.length} accounts
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono">
                          {trackingData.governance.masterAdministrators.map(m => (
                            <div key={m.id} className="p-2.5 bg-slate-100 rounded border border-slate-200 flex items-center justify-between">
                              <div>
                                <span className="font-bold text-slate-900 block">{m.display_name}</span>
                                <span className="text-[10.5px] text-slate-500">{m.email}</span>
                              </div>
                              <span className="px-2 py-0.5 rounded text-[9.5px] font-bold bg-slate-200 text-slate-800">
                                {m.role_name}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* SUB-TAB 2: ADMIN ACTIVITY & COMPULSORY TICKETS */}
                  {trackingSubTab === 'ADMIN_TICKETS' && (
                    <div className="space-y-5">
                      {/* Compulsory Update Tickets Section */}
                      <div className="space-y-2.5">
                        <h4 className="text-xs font-bold font-mono uppercase text-slate-800 flex items-center gap-1.5">
                          <ClockIcon className="w-3.5 h-3.5 text-blue-700" />
                          <span>Compulsory LEA Update Tickets Targeting This Office</span>
                        </h4>

                        {trackingData.tickets.length === 0 ? (
                          <div className="p-6 bg-slate-50 rounded-lg border border-slate-200 text-center text-slate-500 text-xs font-mono">
                            Zero update tickets on record for this office node.
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {trackingData.tickets.map(tck => (
                              <div key={tck.id} className="p-3 bg-white rounded-lg border border-slate-200 shadow-xs space-y-1.5 text-xs font-mono">
                                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-1.5">
                                  <div className="flex items-center gap-2">
                                    <span className="px-2 py-0.5 rounded font-bold bg-blue-50 text-blue-800 border border-blue-300">
                                      {tck.ticket_number}
                                    </span>
                                    <span className="font-semibold text-slate-900">{tck.action_type}</span>
                                  </div>
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                                    tck.status === 'EXECUTED'
                                      ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                      : 'bg-amber-50 text-amber-800 border-amber-300'
                                  }`}>
                                    {tck.status}
                                  </span>
                                </div>

                                <div className="text-slate-700">
                                  <span className="text-slate-500 font-semibold">Justification: </span>
                                  <span>{tck.justification}</span>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-[11px] text-slate-500 pt-1 border-t border-slate-100">
                                  <div>
                                    <span>Requester: </span>
                                    <span className="text-slate-800 font-semibold">
                                      {tck.requester_name || tck.requester_display_name || tck.requester_email}
                                    </span>
                                    {tck.requester_government_id && (
                                      <span className="text-blue-700"> ({tck.requester_government_id})</span>
                                    )}
                                  </div>
                                  <div className="sm:text-right">
                                    <span>Executed: </span>
                                    <span className="text-slate-800 font-semibold">
                                      {tck.executed_at ? new Date(tck.executed_at).toLocaleString() : 'Pending'}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Mutational Audit Trail */}
                      <div className="space-y-2.5 pt-3 border-t border-slate-200">
                        <h4 className="text-xs font-bold font-mono uppercase text-slate-800 flex items-center gap-1.5">
                          <ActivityIcon className="w-3.5 h-3.5 text-blue-700" />
                          <span>Administrative Mutational Audit Trail</span>
                        </h4>

                        {trackingData.adminActivity.length === 0 ? (
                          <div className="p-6 bg-slate-50 rounded-lg border border-slate-200 text-center text-slate-500 text-xs font-mono">
                            No mutational audit logs recorded for this office.
                          </div>
                        ) : (
                          <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden bg-white">
                            {trackingData.adminActivity.map(al => (
                              <div key={al.id} className="p-3 text-xs font-mono space-y-1 hover:bg-slate-50/70">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold text-slate-900">{al.action}</span>
                                    {al.ticket_number && (
                                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-50 text-blue-800 border border-blue-200 font-bold">
                                        Ticket: {al.ticket_number}
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-slate-500 text-[11px]">
                                    {new Date(al.timestamp).toLocaleString()}
                                  </span>
                                </div>

                                <div className="text-[11.5px] text-slate-600 flex items-center gap-2 flex-wrap">
                                  <span>Actor: <strong className="text-slate-800">{al.actor_name || 'System'}</strong></span>
                                  {al.actor_government_id && <span>• Gov ID: <strong className="text-blue-700">{al.actor_government_id}</strong></span>}
                                  {al.actor_badge && <span>• Badge: {al.actor_badge}</span>}
                                  {al.ip_address && <span>• IP: {al.ip_address}</span>}
                                </div>

                                {al.justification && (
                                  <div className="text-[11px] text-slate-600 italic">
                                    "{al.justification}"
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* SUB-TAB 3: OFFICE USER OPERATIONAL ACTIVITY */}
                  {trackingSubTab === 'USER_ACTIVITY' && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold font-mono uppercase text-slate-800 flex items-center gap-1.5">
                          <UsersIcon className="w-3.5 h-3.5 text-blue-700" />
                          <span>Operational Activities Performed by Office Staff</span>
                        </h4>
                        <span className="text-[11px] font-mono text-slate-500">
                          {trackingData.userActivity.length} recent events
                        </span>
                      </div>

                      {trackingData.userActivity.length === 0 ? (
                        <div className="p-8 bg-slate-50 rounded-lg border border-slate-200 text-center text-slate-500 text-xs font-mono">
                          Zero operational user logs recorded under this office unit.
                        </div>
                      ) : (
                        <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden bg-white">
                          {trackingData.userActivity.map(ua => (
                            <div key={ua.id} className="p-3 text-xs font-mono space-y-1 hover:bg-slate-50/70">
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-slate-900">{ua.action}</span>
                                <span className="text-slate-500 text-[11px]">
                                  {new Date(ua.timestamp).toLocaleString()}
                                </span>
                              </div>
                              <div className="text-[11.5px] text-slate-600 flex items-center gap-2 flex-wrap">
                                <span>Officer: <strong className="text-slate-800">{ua.user_name || 'Anonymous Officer'}</strong></span>
                                {ua.user_government_id && <span>• Gov ID: <strong className="text-blue-700">{ua.user_government_id}</strong></span>}
                                {ua.user_badge && <span>• Badge: {ua.user_badge}</span>}
                                {ua.case_fir && <span>• Case FIR: <strong className="text-purple-700">{ua.case_fir}</strong></span>}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3 bg-slate-100 border-t border-slate-200 flex items-center justify-between font-mono text-xs text-slate-600">
              <span className="text-[11px]">State of Gujarat • Sovereign Multi-Agency Investigation & Court Portal</span>
              <button
                onClick={() => setTrackingModalOpen(false)}
                className="px-4 py-1.5 rounded bg-slate-800 hover:bg-slate-900 text-white font-semibold transition-colors cursor-pointer"
              >
                Close Tracking Inspector
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================================= */}
      {/* TICKET-FIRST ESTABLISH OFFICE NODE MODAL (DYNAMIC LAYER-DRIVEN PROTOCOL)                   */}
      {/* ========================================================================================= */}
      {showEstablishOfficeModal && (() => {
        const availableLayers = adminLevels.filter(al => al.body_id === establishForm.bodyId);
        const selectedLayer = availableLayers.find(al => al.id === establishForm.adminLevelId) || availableLayers[0];
        const validParents = offices.filter(o => o.body_id === establishForm.bodyId && (selectedLayer?.level_number ? o.level < selectedLayer.level_number : true));

        return (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-xs">
            <div className="bg-white rounded-xl border border-slate-300 shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[92vh]">
              {/* Header */}
              <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-600/30 border border-blue-500/40 flex items-center justify-center text-blue-300">
                    <BuildingIcon className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold font-mono tracking-wide uppercase flex items-center gap-2">
                      <span>Establish Office Node</span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-blue-800 text-blue-200 border border-blue-600">
                        COMPULSORY TICKET GATEWAY
                      </span>
                    </h3>
                    <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                      State of Gujarat • Sovereign Hierarchy & Institutional Layer Inheritance
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowEstablishOfficeModal(false)}
                  className="w-7 h-7 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center font-bold text-sm cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {/* Progress Stepper Banner */}
              <div className="bg-slate-100 border-b border-slate-200 px-5 py-2.5 flex items-center justify-between text-xs font-mono">
                <div className="flex items-center gap-2">
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    officeModalStage === 'JUSTIFICATION' ? 'bg-blue-700 text-white' : 'bg-emerald-600 text-white'
                  }`}>
                    {officeModalStage === 'JUSTIFICATION' ? '1' : '✓'}
                  </span>
                  <span className={officeModalStage === 'JUSTIFICATION' ? 'font-bold text-slate-900' : 'text-slate-600'}>
                    1. Generate Update Ticket & Layer
                  </span>
                </div>
                <ChevronRightIcon className="w-3.5 h-3.5 text-slate-400" />
                <div className="flex items-center gap-2">
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    officeModalStage === 'ACTIVE_TICKET' ? 'bg-blue-700 text-white' : officeModalStage === 'COMPLETED' ? 'bg-emerald-600 text-white' : 'bg-slate-300 text-slate-600'
                  }`}>
                    {officeModalStage === 'COMPLETED' ? '✓' : '2'}
                  </span>
                  <span className={officeModalStage === 'ACTIVE_TICKET' ? 'font-bold text-slate-900' : 'text-slate-600'}>
                    2. Add Office Details & Verify OTP
                  </span>
                </div>
              </div>

              {/* Modal Body */}
              <div className="p-5 overflow-y-auto flex-1 space-y-4 text-xs">
                {modalError && (
                  <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 font-mono flex items-center gap-2">
                    <span>⚠️</span>
                    <span>{modalError}</span>
                  </div>
                )}

                {modalSuccess && (
                  <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 font-mono flex items-center gap-2">
                    <span>✅</span>
                    <span>{modalSuccess}</span>
                  </div>
                )}

                {/* STAGE 1: TICKET GENERATION & LAYER SELECTION */}
                {officeModalStage === 'JUSTIFICATION' && (
                  <form onSubmit={handleGenerateOfficeTicket} className="space-y-4">
                    <div className="p-3 rounded bg-blue-50 border border-blue-200 text-blue-900 font-mono text-[11.5px] leading-relaxed">
                      <strong>COMPULSORY LEA REGULATORY PROTOCOL:</strong> Establishing an office node creates sovereign legal jurisdiction. Under state audit protocol, you must select the designated governance layer and submit a mandatory justification to generate an authorized update ticket before office details can be configured.
                    </div>

                    {/* Sovereign Body Selector */}
                    <div>
                      <label className="block text-slate-700 font-bold font-mono mb-1.5 uppercase text-[11px]">
                        1. Sovereign Institutional Body *
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { id: 'POLICE', name: 'Gujarat Police', icon: '👮' },
                          { id: 'JUDICIARY', name: 'State Judiciary', icon: '⚖️' },
                          { id: 'FORENSICS', name: 'Forensics (DFSS)', icon: '🔬' },
                        ].map(b => (
                          <button
                            key={b.id}
                            type="button"
                            onClick={() => {
                              const newLayers = adminLevels.filter(al => al.body_id === b.id);
                              setEstablishForm({
                                ...establishForm,
                                bodyId: b.id as any,
                                adminLevelId: newLayers[0]?.id || '',
                                parentId: offices.filter(o => o.body_id === b.id)[0]?.id || '',
                              });
                            }}
                            className={`p-2.5 rounded-lg border text-left font-mono transition-all cursor-pointer ${
                              establishForm.bodyId === b.id
                                ? 'bg-blue-50 border-blue-600 ring-2 ring-blue-600/20 text-blue-900 font-bold'
                                : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                            }`}
                          >
                            <div className="text-base">{b.icon}</div>
                            <div className="text-xs font-bold mt-1">{b.name}</div>
                            <div className="text-[10px] text-slate-500">{b.id} TREE</div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Dynamic Governance Layer Selector */}
                    <div>
                      <label className="block text-slate-700 font-bold font-mono mb-1.5 uppercase text-[11px]">
                        2. Select Configured Governance Layer (Admin Level) *
                      </label>
                      {availableLayers.length === 0 ? (
                        <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 font-mono">
                          No administrative layers defined for {establishForm.bodyId}. Please go to the <strong>LEVELS</strong> tab to define a layer first.
                        </div>
                      ) : (
                        <select
                          required
                          value={establishForm.adminLevelId}
                          onChange={e => {
                            const newLayer = adminLevels.find(al => al.id === e.target.value);
                            const validP = offices.filter(o => o.body_id === establishForm.bodyId && (newLayer?.level_number ? o.level < newLayer.level_number : true));
                            setEstablishForm({
                              ...establishForm,
                              adminLevelId: e.target.value,
                              parentId: validP[0]?.id || '',
                            });
                          }}
                          className="w-full p-2.5 rounded bg-slate-50 border border-slate-300 font-mono text-slate-900 focus:border-blue-600 focus:outline-hidden"
                        >
                          {availableLayers.map(al => (
                            <option key={al.id} value={al.id}>
                              Level {al.level_number}: {al.name} (Type: {al.office_type_name || al.office_type_id} • Admin: {al.default_role_name || al.default_role_id})
                            </option>
                          ))}
                        </select>
                      )}
                    </div>

                    {/* Layer Preview Info Card */}
                    {selectedLayer && (
                      <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
                        <div className="text-[11px] font-bold font-mono text-slate-800 uppercase flex items-center justify-between">
                          <span>Layer Decision-Making Profile: {selectedLayer.name}</span>
                          <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 text-[10px]">
                            Tier {selectedLayer.level_number}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono">
                          <div className="p-2 bg-white rounded border border-slate-200">
                            <span className="text-slate-400 block text-[9px] uppercase">Hierarchy Level</span>
                            <span className="font-bold text-slate-800">Level {selectedLayer.level_number}</span>
                          </div>
                          <div className="p-2 bg-white rounded border border-slate-200">
                            <span className="text-slate-400 block text-[9px] uppercase">Office Type</span>
                            <span className="font-bold text-blue-700 truncate block">{selectedLayer.office_type_name || selectedLayer.office_type_id}</span>
                          </div>
                          <div className="p-2 bg-white rounded border border-slate-200">
                            <span className="text-slate-400 block text-[9px] uppercase">Managing Role</span>
                            <span className="font-bold text-slate-800 truncate block">{selectedLayer.default_role_name || selectedLayer.default_role_id}</span>
                          </div>
                          <div className="p-2 bg-white rounded border border-slate-200">
                            <span className="text-slate-400 block text-[9px] uppercase">Max Clearance</span>
                            <span className="font-bold text-emerald-700">{selectedLayer.max_clearance_allowed || 'CONFIDENTIAL'}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap pt-1 text-[10px] font-mono text-slate-600">
                          {selectedLayer.can_create_sub_offices && <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">✓ Can Create Sub-Offices</span>}
                          {selectedLayer.manages_office_users && <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200">✓ Manages Office Users</span>}
                          {selectedLayer.manages_subordinate_admins && <span className="px-1.5 py-0.5 rounded bg-purple-50 text-purple-800 border border-purple-200">✓ Sub-Admins Under Here</span>}
                          {selectedLayer.can_approve_tickets && <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">✓ Approves Tickets</span>}
                        </div>
                      </div>
                    )}

                    {/* Compulsory Operational Justification */}
                    <div>
                      <label className="block text-slate-700 font-bold font-mono mb-1.5 uppercase text-[11px]">
                        3. Compulsory Operational Justification (For Update Ticket) *
                      </label>
                      <textarea
                        required
                        rows={3}
                        value={establishForm.justification}
                        onChange={e => setEstablishForm({ ...establishForm, justification: e.target.value })}
                        placeholder="State official government gazette, sanction order, or administrative requirement for establishing this office node..."
                        className="w-full p-2.5 rounded bg-slate-50 border border-slate-300 font-mono text-slate-900 focus:border-blue-600 focus:outline-hidden text-xs"
                      />
                      <p className="text-[10.5px] text-slate-500 font-mono mt-1">
                        Minimum 10 characters. Recorded immutably in state cryptographic ledger.
                      </p>
                    </div>

                    {/* Step 1 Actions */}
                    <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => setShowEstablishOfficeModal(false)}
                        className="px-4 py-2 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-mono font-medium"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={modalSubmitting || availableLayers.length === 0}
                        className="px-5 py-2.5 rounded bg-[#1D4ED8] hover:bg-[#1E40AF] text-white font-mono font-bold shadow-sm flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                      >
                        <LockIcon className="w-4 h-4" />
                        <span>{modalSubmitting ? 'Generating Ticket & OTP...' : 'Generate Compulsory Update Ticket & OTP →'}</span>
                      </button>
                    </div>
                  </form>
                )}

                {/* STAGE 2: ACTIVE TICKET • OFFICE DETAILS SPECIFICATION */}
                {officeModalStage === 'ACTIVE_TICKET' && generatedTicket && (
                  <form onSubmit={handleExecuteEstablishOffice} className="space-y-4">
                    {/* Active Ticket Banner */}
                    <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 space-y-1.5 font-mono">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                          <span className="font-bold text-blue-900 text-xs tracking-wider">
                            ACTIVE TICKET: {generatedTicket.ticketNumber}
                          </span>
                        </div>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-200 text-blue-900">
                          STATUS: PENDING OTP
                        </span>
                      </div>
                      <div className="text-[11px] text-blue-800">
                        Governing Layer: <strong>Level {selectedLayer?.level_number} ({selectedLayer?.name})</strong> • Agency: <strong>{establishForm.bodyId}</strong>
                      </div>
                      {generatedTicket.devOtpPreview && (
                        <div className="mt-2 p-2 rounded bg-white border border-blue-300 flex items-center justify-between text-xs">
                          <span className="text-slate-600 text-[11px]">LEA Test Verification Code:</span>
                          <span className="font-bold text-blue-900 font-mono text-sm tracking-widest">{generatedTicket.devOtpPreview}</span>
                        </div>
                      )}
                    </div>

                    {/* Parent Office Selection */}
                    <div>
                      <label className="block text-slate-700 font-bold font-mono mb-1 uppercase text-[11px]">
                        Parent Command Office Node *
                      </label>
                      {selectedLayer && selectedLayer.level_number === 1 ? (
                        <div className="p-2.5 rounded bg-slate-100 border border-slate-200 font-mono text-xs text-slate-600">
                          None (This is a Sovereign Apex Root Command Node)
                        </div>
                      ) : (
                        <select
                          required
                          value={establishForm.parentId}
                          onChange={e => setEstablishForm({ ...establishForm, parentId: e.target.value })}
                          className="w-full p-2.5 rounded bg-slate-50 border border-slate-300 font-mono text-slate-900 focus:border-blue-600 focus:outline-hidden"
                        >
                          <option value="">-- Select Parent Office (Must be Higher Level) --</option>
                          {validParents.map(po => (
                            <option key={po.id} value={po.id}>
                              Level {po.level} • {po.name} ({po.code})
                            </option>
                          ))}
                        </select>
                      )}
                      <p className="text-[10.5px] text-slate-500 font-mono mt-1">
                        Parent offices are strictly restricted to the same sovereign body ({establishForm.bodyId}) with level strictly lower than Level {selectedLayer?.level_number}.
                      </p>
                    </div>

                    {/* Office Node Name & Code */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-slate-700 font-bold font-mono mb-1 uppercase text-[11px]">
                          Office Node Name *
                        </label>
                        <input
                          required
                          type="text"
                          value={establishForm.name}
                          onChange={e => {
                            const newName = e.target.value;
                            const suggestedCode = establishForm.code || `GUJ-${establishForm.bodyId.slice(0,3)}-${newName.toUpperCase().replace(/[^A-Z0-9]/g, '-').slice(0, 15)}`;
                            setEstablishForm({ ...establishForm, name: newName, code: suggestedCode });
                          }}
                          placeholder="e.g. Satellite Division Command Office"
                          className="w-full p-2.5 rounded bg-slate-50 border border-slate-300 font-mono text-slate-900 focus:border-blue-600 focus:outline-hidden text-xs"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-700 font-bold font-mono mb-1 uppercase text-[11px]">
                          Official Identifier Code *
                        </label>
                        <input
                          required
                          type="text"
                          value={establishForm.code}
                          onChange={e => setEstablishForm({ ...establishForm, code: e.target.value.toUpperCase() })}
                          placeholder="e.g. GUJ-POL-AMD-SATELLITE"
                          className="w-full p-2.5 rounded bg-slate-50 border border-slate-300 font-mono text-slate-900 uppercase focus:border-blue-600 focus:outline-hidden text-xs"
                        />
                      </div>
                    </div>

                    {/* Jurisdiction Area */}
                    <div>
                      <label className="block text-slate-700 font-bold font-mono mb-1 uppercase text-[11px]">
                        Jurisdiction Area Envelope
                      </label>
                      <input
                        type="text"
                        value={establishForm.jurisdictionArea}
                        onChange={e => setEstablishForm({ ...establishForm, jurisdictionArea: e.target.value })}
                        placeholder="e.g. Satellite, Jodhpur, and Bopal Corridor (Ahmedabad West)"
                        className="w-full p-2.5 rounded bg-slate-50 border border-slate-300 font-mono text-slate-900 focus:border-blue-600 focus:outline-hidden text-xs"
                      />
                    </div>

                    {/* Authorization OTP Code */}
                    <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                      <label className="block text-slate-800 font-bold font-mono mb-1.5 uppercase text-[11px]">
                        Enter 6-Digit Authorization Code (OTP) *
                      </label>
                      <input
                        required
                        type="text"
                        maxLength={6}
                        value={establishForm.otp}
                        onChange={e => setEstablishForm({ ...establishForm, otp: e.target.value })}
                        placeholder="••••••"
                        className="w-full p-2 text-center tracking-[0.3em] font-bold text-lg font-mono rounded bg-white border border-slate-300 focus:border-blue-600 focus:outline-hidden text-slate-900"
                      />
                      <p className="text-[10.5px] text-slate-500 font-mono mt-1 text-center">
                        Dispatched to registered official identity for ticket execution.
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => setOfficeModalStage('JUSTIFICATION')}
                        className="px-4 py-2 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-mono font-medium"
                      >
                        ← Back / Re-initiate
                      </button>
                      <button
                        type="submit"
                        disabled={modalSubmitting}
                        className="px-5 py-2.5 rounded bg-[#1D4ED8] hover:bg-[#1E40AF] text-white font-mono font-bold shadow-sm flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                      >
                        <LockIcon className="w-4 h-4" />
                        <span>{modalSubmitting ? 'Executing Ticket...' : 'Verify OTP & Establish Office Node'}</span>
                      </button>
                    </div>
                  </form>
                )}

                {/* STAGE 3: COMPLETED */}
                {officeModalStage === 'COMPLETED' && (
                  <div className="p-8 text-center space-y-3 font-mono">
                    <div className="w-12 h-12 mx-auto rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-xl font-bold">
                      ✓
                    </div>
                    <h4 className="text-base font-bold text-slate-900 uppercase">
                      Office Node Established Successfully
                    </h4>
                    <p className="text-xs text-slate-600">
                      The office has been established, linked to layer <strong>{selectedLayer?.name}</strong>, and permanently recorded in the state cryptographic ledger.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Reusable Compulsory Ticket Modal */}
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
