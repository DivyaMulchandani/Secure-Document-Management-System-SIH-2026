import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { AgencyBadge } from '../components/ClassificationBadge';
import {
  BuildingIcon, ShieldIcon, PlusIcon,
  SearchIcon, AlertTriangle as AlertTriangleIcon, CheckIcon, ActivityIcon
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
  });

  // Office Delete Modal
  const [officeToDelete, setOfficeToDelete] = useState<OfficeNode | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Tag Assignment to Office Modal
  const [tagAssignmentOffice, setTagAssignmentOffice] = useState<OfficeNode | null>(null);

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

  // Submit Admin Level Creation via Ticket
  const handleCreateAdminLevel = (e: React.FormEvent) => {
    e.preventDefault();
    if (!levelForm.name.trim()) return;

    setTicketModalConfig({
      isOpen: true,
      title: `Define Admin Hierarchy Level: ${levelForm.name}`,
      actionType: 'CREATE_OFFICE_POSITION',
      targetResourceType: 'OFFICE_POSITION',
      payload: {
        bodyId: levelForm.bodyId,
        levelNumber: levelForm.levelNumber,
        name: levelForm.name,
        description: levelForm.description,
        clearanceRequired: levelForm.clearanceRequired,
      },
      summaryItems: [
        { label: 'Admin Level Name', value: levelForm.name, highlight: true },
        { label: 'Hierarchy Tier', value: `Level ${levelForm.levelNumber}` },
        { label: 'Sovereign Body', value: levelForm.bodyId },
        { label: 'Clearance Required', value: levelForm.clearanceRequired },
      ],
      onSuccess: async () => {
        try {
          await api.post('/organizations/admin-levels', levelForm);
        } catch (e) {
          console.error('Direct level sync fallback:', e);
        }
        setShowCreateLevelModal(false);
        setLevelForm({ bodyId: 'POLICE', levelNumber: 3, name: '', description: '', clearanceRequired: 'SECRET' });
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

                          {/* Actions: Disable / Enable & Delete */}
                          <td className="p-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Disable / Enable Button */}
                              <button
                                onClick={() => handleToggleOfficeStatus(office)}
                                className={`px-2 py-1 rounded text-[10.5px] font-mono font-medium border transition-colors ${
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
                                  className="px-2 py-1 rounded text-[10.5px] font-mono font-medium bg-red-50 text-red-800 border border-red-200 hover:bg-red-100 transition-colors"
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
      {/* TAB 2: ADMIN LEVELS CATALOG (TIERS 1 TO 5)                                */}
      {/* ========================================================================= */}
      {activeTab === 'LEVELS' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-lg border border-slate-200 shadow-xs">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-500 font-mono">Filter Agency:</span>
              <select
                value={levelFilterBody}
                onChange={e => setLevelFilterBody(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded px-2.5 py-1 text-slate-800 font-mono focus:outline-hidden focus:border-blue-600"
              >
                <option value="ALL">All Sovereign Bodies</option>
                <option value="POLICE">Gujarat Police</option>
                <option value="JUDICIARY">State Judiciary</option>
                <option value="FORENSICS">Forensics DFSS</option>
                <option value="MASTER">Master Apex</option>
              </select>
            </div>

            <button
              onClick={() => setShowCreateLevelModal(true)}
              className="px-3 py-1.5 rounded bg-[#1D4ED8] hover:bg-[#1E40AF] text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors"
            >
              <PlusIcon className="w-3.5 h-3.5" />
              <span>Define New Admin Level</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {loadingLevels ? (
              <div className="col-span-full p-8 text-center text-slate-500 font-mono">
                Loading admin hierarchy levels...
              </div>
            ) : filteredLevels.length === 0 ? (
              <div className="col-span-full p-8 text-center text-slate-500 font-mono">
                No admin levels found for this agency filter.
              </div>
            ) : (
              filteredLevels.map(al => (
                <div key={al.id} className="bg-white rounded-lg border border-slate-200 p-4 space-y-3 shadow-xs">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-50 text-blue-800 border border-blue-200">
                          TIER LEVEL {al.level_number}
                        </span>
                        <AgencyBadge branch={al.body_id} />
                      </div>
                      <h3 className="font-bold text-slate-900 text-sm mt-1.5">{al.name}</h3>
                    </div>
                  </div>

                  <p className="text-xs text-slate-600 line-clamp-2">
                    {al.description || 'Administrative leadership tier governing subordinate personnel and facilities.'}
                  </p>

                  <div className="pt-2 border-t border-slate-200 grid grid-cols-2 gap-2 text-xs font-mono">
                    <div>
                      <span className="text-slate-500 block text-[10.5px]">Clearance:</span>
                      <span className="text-slate-900 font-semibold">{al.clearance_required}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10.5px]">Mapped Offices:</span>
                      <span className="text-blue-700 font-semibold">{al.mapped_office_count || 0} offices</span>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white border border-slate-200 rounded-lg max-w-md w-full p-5 space-y-4 shadow-xl text-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-bold text-slate-900 text-sm">Define New Admin Hierarchy Level</h3>
              <button
                onClick={() => setShowCreateLevelModal(false)}
                className="text-slate-400 hover:text-slate-700 font-mono text-base px-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateAdminLevel} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-mono mb-1 font-semibold">Sovereign Body *</label>
                  <select
                    value={levelForm.bodyId}
                    onChange={e => setLevelForm(prev => ({ ...prev, bodyId: e.target.value }))}
                    className="w-full bg-white border border-slate-300 rounded px-3 py-1.5 text-slate-900 font-mono focus:outline-hidden focus:border-blue-600"
                  >
                    <option value="POLICE">Gujarat Police</option>
                    <option value="JUDICIARY">State Judiciary</option>
                    <option value="FORENSICS">Forensic DFSS</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-mono mb-1 font-semibold">Tier Level (1–5) *</label>
                  <select
                    value={levelForm.levelNumber}
                    onChange={e => setLevelForm(prev => ({ ...prev, levelNumber: parseInt(e.target.value, 10) }))}
                    className="w-full bg-white border border-slate-300 rounded px-3 py-1.5 text-slate-900 font-mono focus:outline-hidden focus:border-blue-600"
                  >
                    <option value={1}>Level 1: Sovereign Apex Command</option>
                    <option value={2}>Level 2: Zonal / Commissionerate</option>
                    <option value={3}>Level 3: Divisional / District</option>
                    <option value={4}>Level 4: Station / Unit Level</option>
                    <option value={5}>Level 5: Section / Desk Level</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-mono mb-1 font-semibold">Admin Level Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Sub-Divisional Police Officer (SDPO) Command"
                  value={levelForm.name}
                  onChange={e => setLevelForm(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full bg-white border border-slate-300 rounded px-3 py-1.5 text-slate-900 font-mono focus:outline-hidden focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-mono mb-1 font-semibold">Clearance Required</label>
                <select
                  value={levelForm.clearanceRequired}
                  onChange={e => setLevelForm(prev => ({ ...prev, clearanceRequired: e.target.value }))}
                  className="w-full bg-white border border-slate-300 rounded px-3 py-1.5 text-slate-900 font-mono focus:outline-hidden focus:border-blue-600"
                >
                  <option value="CONFIDENTIAL">CONFIDENTIAL</option>
                  <option value="SECRET">SECRET</option>
                  <option value="TOP_SECRET">TOP_SECRET</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-mono mb-1 font-semibold">Description</label>
                <textarea
                  rows={2}
                  placeholder="Authority scope and delegation rules..."
                  value={levelForm.description}
                  onChange={e => setLevelForm(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full bg-white border border-slate-300 rounded px-3 py-1.5 text-slate-900 font-mono focus:outline-hidden focus:border-blue-600"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowCreateLevelModal(false)}
                  className="px-3 py-1.5 rounded bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-300 font-mono text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded bg-[#1D4ED8] hover:bg-[#1E40AF] text-white font-mono text-xs font-semibold shadow-sm transition-colors"
                >
                  Continue to Ticket
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
