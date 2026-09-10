import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { AgencyBadge } from '../components/ClassificationBadge';
import { CompulsoryTicketModal, TicketSummaryItem } from '../components/CompulsoryTicketModal';
import {
  BuildingIcon, ChevronRightIcon, ChevronDownIcon, PlusIcon,
  ShieldIcon, UsersIcon, FlaskIcon, ScaleIcon
} from '../components/Icons';

type SovereignBody = 'ALL' | 'POLICE' | 'JUDICIARY' | 'FORENSICS' | 'MASTER';

interface NodeDetailData {
  organization: any;
  parent: any | null;
  children: any[];
  administrators: any[];
  users: any[];
  tags?: any[];
  permissions: {
    canCreateChildNode: boolean;
    canCreateAdmin: boolean;
    canCreateUser: boolean;
    canEditNode: boolean;
    canDisableNode: boolean;
    canDeleteNode?: boolean;
  };
}

export const Organizations: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const isMaster = user?.roleId === 'MASTER_ADMIN' || user?.roleId === 'SYSTEM_MASTER_ADMIN';
  const initialBody = (searchParams.get('body') as SovereignBody) || (isMaster ? 'ALL' : (user?.agencyBranch as SovereignBody) || 'ALL');

  // View switch: Hierarchy Tree Explorer vs Office Positions Catalog
  const [activeTab, setActiveTab] = useState<'TREE' | 'POSITIONS'>('TREE');

  const [activeBody, setActiveBody] = useState<SovereignBody>(initialBody);
  const [nodes, setNodes] = useState<any[]>([]);
  const [nodeTypes, setNodeTypes] = useState<any[]>([]);
  const [groupedPositions, setGroupedPositions] = useState<Record<string, any[]>>({
    POLICE: [],
    JUDICIARY: [],
    FORENSICS: [],
    ALL: [],
  });
  const [loading, setLoading] = useState(true);
  const [loadingPositions, setLoadingPositions] = useState(false);
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const [nodeDetail, setNodeDetail] = useState<NodeDetailData | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});

  // Sibling Isolation Demo State
  const [nodeA, setNodeA] = useState<any>(null);
  const [nodeB, setNodeB] = useState<any>(null);

  // Administrative Layers
  const [adminLevels, setAdminLevels] = useState<any[]>([]);

  // Modal: Add Child Org Node
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({
    parentId: '',
    adminLevelId: '',
    name: '',
    code: '',
    jurisdictionArea: ''
  });

  // Modal: Edit Node
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '',
    jurisdictionArea: ''
  });

  // Modal: Add Office Position
  const [showAddPositionModal, setShowAddPositionModal] = useState(false);
  const [positionForm, setPositionForm] = useState({
    bodyId: 'POLICE' as 'POLICE' | 'JUDICIARY' | 'FORENSICS',
    name: '',
    code: '',
    description: '',
  });

  // Modal: Delete Personnel
  const [userToDelete, setUserToDelete] = useState<any>(null);

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
    actionType: 'CREATE_OFFICE',
    targetResourceType: 'ORGANIZATION_NODE',
    payload: {},
    summaryItems: [],
    onSuccess: () => {},
  });

  const fetchAdminLevels = async () => {
    try {
      const res = await api.get<{ adminLevels: any[] }>('/organizations/admin-levels');
      if (res.adminLevels) {
        setAdminLevels(res.adminLevels);
      }
    } catch (err) {
      console.error('Failed to load admin levels:', err);
    }
  };

  const fetchNodeTypes = async () => {
    try {
      const res = await api.get<{ types: any[] }>('/organizations/node-types');
      if (res.types && res.types.length > 0) {
        setNodeTypes(res.types);
      }
    } catch (err) {
      console.error('Failed to load node types:', err);
    }
  };

  const fetchOfficePositions = async () => {
    setLoadingPositions(true);
    try {
      const res = await api.get<{ positions: any[]; grouped: Record<string, any[]> }>('/organizations/office-positions');
      if (res.grouped) {
        setGroupedPositions(res.grouped);
      }
    } catch (err) {
      console.error('Failed to load office positions catalog:', err);
    } finally {
      setLoadingPositions(false);
    }
  };

  const fetchTree = async (body?: SovereignBody) => {
    setLoading(true);
    try {
      const queryParam = body && body !== 'ALL' ? `?body=${body}` : '';
      const res = await api.get<{ organizations: any[]; tree: any[] }>(`/organizations/tree${queryParam}`);
      const list = res.organizations || [];
      setNodes(list);
      if (list.length > 0) {
        const defaultNode = list.find((n: any) => n.id === selectedNode?.id) || list[0];
        setSelectedNode(defaultNode);
        // Expand first 2 levels by default
        const initialExpanded: Record<string, boolean> = {};
        list.filter((n: any) => n.level <= 3).forEach((n: any) => {
          initialExpanded[n.id] = true;
        });
        setExpandedNodes(initialExpanded);
      } else {
        setSelectedNode(null);
        setNodeDetail(null);
      }
    } catch (err) {
      console.error('Failed to load organization tree:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchNodeDetail = async (nodeId: string) => {
    setLoadingDetail(true);
    try {
      const res = await api.get<NodeDetailData>(`/organizations/nodes/${nodeId}`);
      setNodeDetail(res);
    } catch (err) {
      console.error(`Failed to load details for node ${nodeId}:`, err);
      setNodeDetail(null);
    } finally {
      setLoadingDetail(false);
    }
  };

  useEffect(() => {
    fetchNodeTypes();
    fetchOfficePositions();
    fetchAdminLevels();
  }, []);

  useEffect(() => {
    fetchTree(activeBody);
  }, [activeBody]);

  useEffect(() => {
    if (selectedNode?.id) {
      fetchNodeDetail(selectedNode.id);
    }
  }, [selectedNode?.id]);

  const handleBodyChange = (b: SovereignBody) => {
    setActiveBody(b);
    if (b === 'ALL') {
      searchParams.delete('body');
    } else {
      searchParams.set('body', b);
    }
    setSearchParams(searchParams);
  };

  const toggleExpand = (nodeId: string) => {
    setExpandedNodes(prev => ({ ...prev, [nodeId]: !prev[nodeId] }));
  };

  // 1. Trigger Compulsory Ticket on Add Child Office
  const handleInitiateAddOrg = (e: React.FormEvent) => {
    e.preventDefault();
    const parentNode = nodes.find(n => n.id === (addForm.parentId || selectedNode?.id));
    const availableLayers = adminLevels.filter(al => al.body_id === currentNodeBody);
    const selectedLayer = adminLevels.find(al => al.id === addForm.adminLevelId) || availableLayers[0];

    setShowAddModal(false);
    setTicketModalConfig({
      isOpen: true,
      title: 'Compulsory Ticket: Establish Office Node',
      actionType: 'CREATE_OFFICE',
      targetResourceType: 'ORGANIZATION_NODE',
      payload: {
        parentId: addForm.parentId || selectedNode?.id,
        adminLevelId: selectedLayer?.id,
        name: addForm.name.trim(),
        code: addForm.code.trim().toUpperCase(),
        jurisdictionArea: addForm.jurisdictionArea.trim(),
      },
      summaryItems: [
        { label: 'Office Name', value: addForm.name },
        { label: 'Governance Layer', value: selectedLayer ? `Level ${selectedLayer.level_number}: ${selectedLayer.name}` : 'Unassigned Tier' },
        { label: 'Office Type', value: selectedLayer?.office_type_name || selectedLayer?.office_type_id || 'OFFICE' },
        { label: 'Managing Admin Role', value: selectedLayer?.default_role_name || selectedLayer?.default_role_id || 'OFFICE_ADMIN' },
        { label: 'Node Code', value: addForm.code },
        { label: 'Parent Unit', value: parentNode?.name || 'Selected Office' },
        { label: 'Jurisdiction', value: addForm.jurisdictionArea || 'Default Zone' },
      ],
      onSuccess: async () => {
        setAddForm({
          parentId: '',
          adminLevelId: '',
          name: '',
          code: '',
          jurisdictionArea: ''
        });
        await fetchTree(activeBody);
        if (selectedNode?.id) {
          await fetchNodeDetail(selectedNode.id);
        }
      }
    });
  };

  // 2. Trigger Compulsory Ticket on Edit Office Node
  const handleOpenEdit = () => {
    if (!selectedNode) return;
    setEditForm({
      name: selectedNode.name || '',
      jurisdictionArea: selectedNode.jurisdiction_area || ''
    });
    setShowEditModal(true);
  };

  const handleInitiateEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedNode) return;

    setShowEditModal(false);
    setTicketModalConfig({
      isOpen: true,
      title: 'Compulsory Ticket: Modify Office Node',
      actionType: 'UPDATE_OFFICE',
      targetResourceType: 'ORGANIZATION_NODE',
      targetResourceId: selectedNode.id,
      payload: editForm,
      summaryItems: [
        { label: 'Office Code', value: selectedNode.code },
        { label: 'Current Name', value: selectedNode.name },
        { label: 'Updated Name', value: editForm.name },
        { label: 'Jurisdiction', value: editForm.jurisdictionArea || 'Default' },
      ],
      onSuccess: async () => {
        await fetchTree(activeBody);
        await fetchNodeDetail(selectedNode.id);
      }
    });
  };

  // 3. Trigger Compulsory Ticket on Toggle Status
  const handleInitiateToggleStatus = () => {
    if (!selectedNode || !nodeDetail) return;
    const currentStatus = selectedNode.status || 'ACTIVE';
    const newStatus = currentStatus === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';

    setTicketModalConfig({
      isOpen: true,
      title: `Compulsory Ticket: ${newStatus === 'DISABLED' ? 'Disable' : 'Activate'} Office Node`,
      actionType: 'UPDATE_OFFICE_STATUS',
      targetResourceType: 'ORGANIZATION_NODE',
      targetResourceId: selectedNode.id,
      payload: { status: newStatus },
      summaryItems: [
        { label: 'Target Office', value: selectedNode.name },
        { label: 'Node Code', value: selectedNode.code },
        { label: 'Action', value: `Transition status from ${currentStatus} to ${newStatus}` },
      ],
      onSuccess: async () => {
        await fetchTree(activeBody);
        await fetchNodeDetail(selectedNode.id);
      }
    });
  };

  // 4. Trigger Compulsory Ticket on Deleting Personnel
  const handleInitiateDeletePersonnel = () => {
    if (!userToDelete) return;
    const target = userToDelete;
    setUserToDelete(null);

    setTicketModalConfig({
      isOpen: true,
      title: 'Compulsory Ticket: De-enroll Personnel',
      actionType: 'DELETE_USER',
      targetResourceType: 'USER',
      targetResourceId: target.id,
      payload: {},
      summaryItems: [
        { label: 'Personnel Name', value: target.display_name },
        { label: 'Username', value: `@${target.username}` },
        { label: 'Role', value: target.role_name || target.role_id },
        { label: 'Assigned Station', value: target.org_name || selectedNode?.name },
      ],
      onSuccess: async () => {
        if (selectedNode?.id) {
          await fetchNodeDetail(selectedNode.id);
        }
      }
    });
  };

  // 4b. Trigger Compulsory Ticket on Deleting Office Node
  const handleInitiateDeleteOffice = () => {
    if (!selectedNode) return;
    if (selectedNode.level <= 1 || !selectedNode.parent_id) {
      alert('Sovereign Apex / Root offices (Level 1) cannot be deleted.');
      return;
    }
    if (nodeDetail?.children && nodeDetail.children.length > 0) {
      alert(`Cannot delete office '${selectedNode.name}': ${nodeDetail.children.length} subordinate child office(s) exist under this node. Please delete or reassign child offices first.`);
      return;
    }
    const totalPersonnel = (nodeDetail?.administrators?.length || 0) + (nodeDetail?.users?.length || 0);
    if (totalPersonnel > 0) {
      alert(`Cannot delete office '${selectedNode.name}': ${totalPersonnel} personnel are currently stationed in this office. Please reassign personnel to another office first.`);
      return;
    }

    setTicketModalConfig({
      isOpen: true,
      title: 'Compulsory Ticket: Delete Office Node',
      actionType: 'DELETE_OFFICE',
      targetResourceType: 'ORGANIZATION_NODE',
      targetResourceId: selectedNode.id,
      payload: {},
      summaryItems: [
        { label: 'Target Office', value: `${selectedNode.name} (${selectedNode.code})` },
        { label: 'Office Level', value: `Level ${selectedNode.level}` },
        { label: 'Sovereign Branch', value: selectedNode.agency_branch || selectedNode.body_id },
        { label: 'Action Warning', value: 'Permanent deletion of office record from sovereign hierarchy' },
      ],
      onSuccess: async () => {
        setSelectedNode(null);
        setNodeDetail(null);
        await fetchTree(activeBody);
      }
    });
  };

  // 5. Trigger Compulsory Ticket on Defining Office Position
  const handleInitiateCreatePosition = (e: React.FormEvent) => {
    e.preventDefault();
    setShowAddPositionModal(false);

    setTicketModalConfig({
      isOpen: true,
      title: `Compulsory Ticket: Define Office Position (${positionForm.bodyId})`,
      actionType: 'CREATE_OFFICE_POSITION',
      targetResourceType: 'OFFICE_POSITION',
      payload: positionForm,
      summaryItems: [
        { label: 'Sovereign Body', value: positionForm.bodyId },
        { label: 'Position Name', value: positionForm.name },
        { label: 'Position Code', value: positionForm.code.toUpperCase().replace(/\s+/g, '_') },
        { label: 'Description', value: positionForm.description || 'Institutional tier' },
      ],
      onSuccess: async () => {
        setPositionForm({
          bodyId: 'POLICE',
          name: '',
          code: '',
          description: '',
        });
        await fetchOfficePositions();
        await fetchNodeTypes();
      }
    });
  };

  // Positions applicable to current node
  const currentNodeBody = selectedNode?.body_id || selectedNode?.agency_branch || (activeBody !== 'ALL' ? activeBody : 'POLICE');
  const availablePositionsForCreation = (groupedPositions[currentNodeBody] && groupedPositions[currentNodeBody].length > 0)
    ? groupedPositions[currentNodeBody]
    : nodeTypes;

  // Build recursive tree items
  const renderTree = (parentId: string | null = null, level: number = 1) => {
    const children = nodes.filter(n => (parentId === null ? !n.parent_id : n.parent_id === parentId));
    if (children.length === 0) return null;

    return (
      <div className={`space-y-1 ${level > 1 ? 'pl-4 border-l border-border/60 ml-2' : ''}`}>
        {children.map(node => {
          const hasChildren = nodes.some(n => n.parent_id === node.id);
          const isExpanded = !!expandedNodes[node.id];
          const isSelected = selectedNode?.id === node.id;

          const isDisabled = node.status === 'DISABLED';

          return (
            <div key={node.id} className={`text-xs ${isDisabled ? 'opacity-65' : ''}`}>
              <div
                onClick={() => setSelectedNode(node)}
                className={`flex items-center justify-between p-1.5 rounded cursor-pointer transition-colors ${
                  isSelected ? 'bg-accent/15 text-accent font-semibold border border-accent/30' : 'hover:bg-surface/70 text-primary-text'
                }`}
              >
                <div className="flex items-center gap-1.5 truncate">
                  {hasChildren ? (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); toggleExpand(node.id); }}
                      className="p-0.5 hover:text-accent"
                    >
                      {isExpanded ? <ChevronDownIcon className="w-3.5 h-3.5" /> : <ChevronRightIcon className="w-3.5 h-3.5" />}
                    </button>
                  ) : (
                    <span className="w-3.5 inline-block" />
                  )}
                  {node.body_id === 'POLICE' ? <ShieldIcon className="w-3.5 h-3.5 shrink-0 text-blue-700" /> :
                   node.body_id === 'FORENSICS' ? <FlaskIcon className="w-3.5 h-3.5 shrink-0 text-indigo-700" /> :
                   node.body_id === 'JUDICIARY' ? <ScaleIcon className="w-3.5 h-3.5 shrink-0 text-emerald-700" /> :
                   <BuildingIcon className="w-3.5 h-3.5 shrink-0 text-slate-700" />}
                  <span className={`truncate ${isDisabled ? 'line-through text-muted-text' : ''}`}>{node.name}</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-900 border border-slate-300 font-bold" title={`Office Tier Level ${node.level}`}>
                    L{node.level}
                  </span>
                  {isDisabled && (
                    <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-danger-light text-danger border border-danger/30 font-semibold">
                      DISABLED
                    </span>
                  )}
                  <span className="text-[10px] font-mono text-muted-darker">
                    {node.code}
                  </span>
                </div>
              </div>

              {hasChildren && isExpanded && renderTree(node.id, level + 1)}
            </div>
          );
        })}
      </div>
    );
  };

  const isSibling = nodeA && nodeB && nodeA.parent_id === nodeB.parent_id && nodeA.id !== nodeB.id;
  const isDescendant = nodeA && nodeB && nodeB.hierarchy_path?.startsWith(nodeA.hierarchy_path + '.');

  const permissions = nodeDetail?.permissions || {
    canCreateChildNode: false,
    canCreateAdmin: false,
    canCreateUser: false,
    canEditNode: false,
    canDisableNode: false,
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-primary-text flex items-center gap-2">
            <BuildingIcon className="w-5 h-5 text-accent" />
            <span>Sovereign Hierarchy & Office Position Governance</span>
          </h1>
          <p className="text-xs text-muted-text font-mono mt-0.5">
            Institutional Hierarchy Tiers: Gujarat Police • State Judiciary • Forensics (DFSS)
          </p>
        </div>

        {/* View Toggle Tabs */}
        <div className="flex items-center gap-2">
          <div className="flex bg-surface p-1 rounded-lg border border-border text-xs font-mono">
            <button
              onClick={() => setActiveTab('TREE')}
              className={`px-3 py-1 rounded font-medium transition-colors ${
                activeTab === 'TREE' ? 'bg-accent text-white font-bold' : 'text-muted-text hover:text-primary-text'
              }`}
            >
              Hierarchy Explorer
            </button>
            <button
              onClick={() => setActiveTab('POSITIONS')}
              className={`px-3 py-1 rounded font-medium transition-colors flex items-center gap-1.5 ${
                activeTab === 'POSITIONS' ? 'bg-accent text-white font-bold' : 'text-muted-text hover:text-primary-text'
              }`}
            >
              <span>Office Positions Catalog</span>
              <span className="text-[10px] px-1 py-0.2 rounded bg-black/40 font-mono">
                {Object.values(groupedPositions).reduce((acc, arr) => acc + arr.length, 0)}
              </span>
            </button>
          </div>

          <button
            onClick={() => navigate('/admin-hierarchy')}
            className="px-3 py-1.5 rounded-lg bg-surface hover:bg-surface-hover text-accent border border-border hover:border-accent/40 font-mono text-xs font-medium flex items-center gap-1.5 transition-colors shadow-sm"
            title="Open Admin Levels, Office Mapping & Tag Management Console"
          >
            <ShieldIcon className="w-3.5 h-3.5" />
            <span>Admin Levels & Mapping</span>
          </button>

          {activeTab === 'TREE' && selectedNode && permissions.canCreateChildNode && (
            <button
              onClick={() => {
                const layers = adminLevels.filter(al => al.body_id === currentNodeBody && al.level_number > (selectedNode.level || 1));
                const fallbackLayers = adminLevels.filter(al => al.body_id === currentNodeBody);
                const chosenLayer = layers[0] || fallbackLayers[0];
                setAddForm({
                  parentId: selectedNode?.id || '',
                  adminLevelId: chosenLayer?.id || '',
                  name: '',
                  code: '',
                  jurisdictionArea: ''
                });
                setShowAddModal(true);
              }}
              className="btn-primary text-xs"
            >
              <PlusIcon className="w-3.5 h-3.5" />
              <span>Create Child Office</span>
            </button>
          )}

          {activeTab === 'POSITIONS' && (
            <button
              onClick={() => setShowAddPositionModal(true)}
              className="btn-primary text-xs flex items-center gap-1.5"
            >
              <PlusIcon className="w-3.5 h-3.5" />
              <span>Define Office Position</span>
            </button>
          )}
        </div>
      </div>

      {/* ======================= TAB 1: SOVEREIGN TREE EXPLORER ======================= */}
      {activeTab === 'TREE' && (
        <>
          {/* Sovereign Body Selection Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-border/80">
            {isMaster && (
              <button
                onClick={() => handleBodyChange('ALL')}
                className={`px-3.5 py-1.5 rounded-md text-xs font-mono font-medium transition-colors ${
                  activeBody === 'ALL'
                    ? 'bg-accent text-white font-bold'
                    : 'bg-surface hover:bg-surface-hover text-muted-text border border-border'
                }`}
              >
                All Sovereign Trees
              </button>
            )}

            {(isMaster || user?.agencyBranch === 'POLICE') && (
              <button
                onClick={() => handleBodyChange('POLICE')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-mono transition-colors cursor-pointer ${
                  activeBody === 'POLICE'
                    ? 'bg-blue-700 text-white font-bold shadow-xs'
                    : 'bg-white hover:bg-blue-50 text-blue-900 border border-blue-300 font-semibold'
                }`}
              >
                <ShieldIcon className="w-3.5 h-3.5" />
                <span>Gujarat Police Tree</span>
              </button>
            )}

            {(isMaster || user?.agencyBranch === 'JUDICIARY') && (
              <button
                onClick={() => handleBodyChange('JUDICIARY')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-mono transition-colors cursor-pointer ${
                  activeBody === 'JUDICIARY'
                    ? 'bg-emerald-700 text-white font-bold shadow-xs'
                    : 'bg-white hover:bg-emerald-50 text-emerald-900 border border-emerald-300 font-semibold'
                }`}
              >
                <ScaleIcon className="w-3.5 h-3.5" />
                <span>State Judiciary Tree</span>
              </button>
            )}

            {(isMaster || user?.agencyBranch === 'FORENSICS') && (
              <button
                onClick={() => handleBodyChange('FORENSICS')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-mono transition-colors cursor-pointer ${
                  activeBody === 'FORENSICS'
                    ? 'bg-indigo-700 text-white font-bold shadow-xs'
                    : 'bg-white hover:bg-indigo-50 text-indigo-900 border border-indigo-300 font-semibold'
                }`}
              >
                <FlaskIcon className="w-3.5 h-3.5" />
                <span>Forensic Science (DFSS) Tree</span>
              </button>
            )}

            {isMaster && (
              <button
                onClick={() => handleBodyChange('MASTER')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-mono transition-colors cursor-pointer ${
                  activeBody === 'MASTER'
                    ? 'bg-slate-800 text-white font-bold shadow-xs'
                    : 'bg-white hover:bg-slate-100 text-slate-900 border border-slate-300 font-semibold'
                }`}
              >
                <BuildingIcon className="w-3.5 h-3.5" />
                <span>Master Apex Command</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Tree Explorer Column */}
            <div className="glass-card p-4 border border-border space-y-3 max-h-[85vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-border pb-2">
                <span className="text-xs font-mono font-bold uppercase text-muted-text">Hierarchical Units</span>
                <span className="text-[10.5px] font-mono text-accent">{nodes.length} Nodes</span>
              </div>
              {loading ? (
                <div className="text-xs text-muted-text py-6 text-center font-mono">Loading tree nodes...</div>
              ) : (
                renderTree(null, 1)
              )}
            </div>

            {/* Selected Node Details & Operations Column */}
            <div className="md:col-span-2 space-y-6">
              {selectedNode ? (
                <div className="glass-card p-5 border border-border space-y-5">
                  {/* Node Header & Capabilities Toolbar */}
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-border pb-4">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-lg font-bold text-primary-text">{selectedNode.name}</h2>
                        <AgencyBadge branch={selectedNode.agency_branch} />
                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                          (selectedNode.status || 'ACTIVE') === 'ACTIVE'
                            ? 'bg-success-light text-success border border-success/30'
                            : 'bg-danger-light text-danger border border-danger/30'
                        }`}>
                          {selectedNode.status || 'ACTIVE'}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10.5px] font-mono text-slate-300 font-bold" title="Institutional Office Hierarchy Level">
                          Office Level {selectedNode.level}
                        </span>
                        {(selectedNode.admin_level_name || nodeDetail?.organization?.admin_level_name) && (
                          <span className="px-2 py-0.5 rounded bg-blue-950/60 border border-blue-800/60 text-[10.5px] font-mono text-blue-300 font-medium" title="Governing Administrator Tier">
                            Admin Tier {selectedNode.admin_level_number || nodeDetail?.organization?.admin_level_number || ''}: {selectedNode.admin_level_name || nodeDetail?.organization?.admin_level_name}
                          </span>
                        )}
                      </div>
                      <div className="text-xs font-mono text-muted-text mt-1 space-x-2">
                        <span>Code: <strong className="text-accent">{selectedNode.code}</strong></span>
                        <span>•</span>
                        <span>Body: <strong>{selectedNode.body_name || selectedNode.body_id}</strong></span>
                        <span>•</span>
                        <span>Office Position: <strong className="text-slate-200">{selectedNode.type_name || selectedNode.type_id}</strong></span>
                      </div>

                      {/* Attached Tags */}
                      {((nodeDetail?.tags && nodeDetail.tags.length > 0) || (selectedNode.tags && selectedNode.tags.length > 0)) && (
                        <div className="flex items-center gap-1.5 flex-wrap mt-2">
                          <span className="text-[10px] font-mono text-muted-text uppercase font-bold mr-0.5">Tags:</span>
                          {(nodeDetail?.tags || selectedNode.tags || []).map((t: any) => (
                            <span
                              key={t.id || t.slug}
                              className="px-2 py-0.5 rounded-full text-[10px] font-mono font-medium border"
                              style={{
                                backgroundColor: `${t.color || '#3b82f6'}15`,
                                borderColor: `${t.color || '#3b82f6'}40`,
                                color: t.color || '#93c5fd',
                              }}
                            >
                              {t.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Node Action Buttons */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {permissions.canCreateChildNode && (
                        <button
                          onClick={() => {
                            const layers = adminLevels.filter(al => al.body_id === currentNodeBody && al.level_number > (selectedNode.level || 1));
                            const fallbackLayers = adminLevels.filter(al => al.body_id === currentNodeBody);
                            const chosenLayer = layers[0] || fallbackLayers[0];
                            setAddForm({
                              parentId: selectedNode.id,
                              adminLevelId: chosenLayer?.id || '',
                              name: '',
                              code: '',
                              jurisdictionArea: ''
                            });
                            setShowAddModal(true);
                          }}
                          className="px-2.5 py-1.5 rounded bg-accent/15 text-accent hover:bg-accent/25 border border-accent/30 font-mono text-[11px] flex items-center gap-1 transition-colors"
                          title="Create child office beneath this node"
                        >
                          <PlusIcon className="w-3.5 h-3.5" />
                          <span>Create Child Office</span>
                        </button>
                      )}

                      {permissions.canCreateAdmin && (
                        <button
                          onClick={() => navigate(`/users?orgId=${selectedNode.id}&asAdmin=true`)}
                          className="px-2.5 py-1.5 rounded bg-blue-700/20 text-blue-300 hover:bg-blue-700/30 border border-blue-500/40 font-mono text-[11px] flex items-center gap-1 transition-colors"
                          title="Create administrator stationed in this office"
                        >
                          <ShieldIcon className="w-3.5 h-3.5" />
                          <span>Provision Office Admin</span>
                        </button>
                      )}

                      {permissions.canCreateUser && (
                        <button
                          onClick={() => navigate(`/users?orgId=${selectedNode.id}`)}
                          className="px-2.5 py-1.5 rounded bg-surface hover:bg-surface-hover text-primary-text border border-border font-mono text-[11px] flex items-center gap-1 transition-colors"
                          title="Enroll personnel into this office"
                        >
                          <UsersIcon className="w-3.5 h-3.5" />
                          <span>Enroll Officer</span>
                        </button>
                      )}

                      {permissions.canEditNode && (
                        <button
                          onClick={handleOpenEdit}
                          className="px-2.5 py-1.5 rounded bg-surface hover:bg-surface-hover text-primary-text border border-border font-mono text-[11px] transition-colors"
                          title="Edit office details with compulsory ticket"
                        >
                          <span>Edit Office</span>
                        </button>
                      )}

                      {permissions.canDisableNode && (
                        <button
                          onClick={handleInitiateToggleStatus}
                          className={`px-2.5 py-1.5 rounded font-mono text-[11px] border transition-colors ${
                            (selectedNode.status || 'ACTIVE') === 'ACTIVE'
                              ? 'bg-amber-950/30 text-amber-300 hover:bg-amber-900/40 border-amber-800/50'
                              : 'bg-success-light text-success hover:bg-success/20 border-success/30'
                          }`}
                          title="Toggle active / disabled status via ticket"
                        >
                          {(selectedNode.status || 'ACTIVE') === 'ACTIVE' ? 'Disable Office' : 'Activate Office'}
                        </button>
                      )}

                      {(permissions.canDeleteNode ?? (selectedNode.level > 1 && (isMaster || user?.roleId?.includes('ADMIN')))) && selectedNode.level > 1 && (
                        <button
                          onClick={handleInitiateDeleteOffice}
                          className="px-2.5 py-1.5 rounded bg-danger-light text-danger hover:bg-danger/20 border border-danger/30 font-mono text-[11px] transition-colors"
                          title="Permanently delete office via ticket (requires leaf node with zero personnel)"
                        >
                          Delete Office
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Node Scope Callout: Admin Scope Explanation */}
                  <div className="p-3 bg-surface border border-border rounded text-xs font-mono text-slate-300 space-y-1">
                    <div className="font-bold text-accent flex items-center gap-1.5">
                      <ShieldIcon className="w-3.5 h-3.5" />
                      <span>Office Administrative Authority Scope</span>
                    </div>
                    <p className="text-[11px] text-muted-text font-sans leading-relaxed">
                      An administrator assigned to <strong>{selectedNode.name}</strong> operates this office and possesses delegated administrative authority over:
                      (1) all users and officers enrolled directly in this office, and
                      (2) administrators and personnel of all subordinate offices below this unit in the sovereign tree.
                    </p>
                  </div>

                  {/* Node Properties */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                    <div className="p-3 bg-surface rounded border border-border">
                      <span className="text-muted-text block text-[10px] uppercase font-bold">Parent Office</span>
                      <span className="font-semibold text-primary-text mt-0.5 block truncate">
                        {nodeDetail?.parent ? `${nodeDetail.parent.name} (${nodeDetail.parent.code})` : 'Root / Sovereign Apex'}
                      </span>
                    </div>
                    <div className="p-3 bg-surface rounded border border-border">
                      <span className="text-muted-text block text-[10px] uppercase font-bold">Jurisdiction Area</span>
                      <span className="font-semibold text-primary-text mt-0.5 block truncate">
                        {selectedNode.jurisdiction_area || 'Jurisdictional Envelope'}
                      </span>
                    </div>
                    <div className="p-3 bg-surface rounded border border-border">
                      <span className="text-muted-text block text-[10px] uppercase font-bold">Subordinate Offices</span>
                      <span className="font-semibold text-accent mt-0.5 block">
                        {nodeDetail?.children?.length || 0} Child Units
                      </span>
                    </div>
                    <div className="p-3 bg-surface rounded border border-border">
                      <span className="text-muted-text block text-[10px] uppercase font-bold">Stationed Personnel</span>
                      <span className="font-semibold text-accent mt-0.5 block">
                        {(nodeDetail?.administrators?.length || 0) + (nodeDetail?.users?.length || 0)} Total
                      </span>
                    </div>
                  </div>

                  {/* Dot-Hierarchy Path */}
                  <div>
                    <span className="text-[10px] font-mono text-muted-text font-bold uppercase block mb-1">
                      Materialized Dot-Hierarchy Path
                    </span>
                    <div className="p-2.5 bg-surface rounded border border-border font-mono text-xs text-accent break-all">
                      {selectedNode.hierarchy_path}
                    </div>
                  </div>

                  {/* Direct Child Offices */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between border-b border-border/80 pb-1.5">
                      <h3 className="text-xs font-bold font-mono text-primary-text uppercase tracking-wider">
                        Direct Subordinate Offices ({nodeDetail?.children?.length || 0})
                      </h3>
                      {permissions.canCreateChildNode && (
                        <button
                          onClick={() => {
                            const layers = adminLevels.filter(al => al.body_id === currentNodeBody && al.level_number > (selectedNode.level || 1));
                            const fallbackLayers = adminLevels.filter(al => al.body_id === currentNodeBody);
                            const chosenLayer = layers[0] || fallbackLayers[0];
                            setAddForm({
                              parentId: selectedNode.id,
                              adminLevelId: chosenLayer?.id || '',
                              name: '',
                              code: '',
                              jurisdictionArea: ''
                            });
                            setShowAddModal(true);
                          }}
                          className="text-[11px] font-mono text-accent hover:underline flex items-center gap-1"
                        >
                          <PlusIcon className="w-3 h-3" />
                          <span>Add Child Office</span>
                        </button>
                      )}
                    </div>

                    {loadingDetail ? (
                      <div className="text-xs text-muted-text py-2">Loading subordinates...</div>
                    ) : !nodeDetail?.children || nodeDetail.children.length === 0 ? (
                      <div className="text-xs text-muted-text italic py-2">No direct child offices registered under this unit.</div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {nodeDetail.children.map(child => (
                          <div
                            key={child.id}
                            onClick={() => {
                              const matched = nodes.find(n => n.id === child.id) || child;
                              setSelectedNode(matched);
                            }}
                            className="p-2.5 rounded bg-surface/60 border border-border hover:border-accent/40 cursor-pointer transition-colors flex items-center justify-between text-xs"
                          >
                            <div className="truncate">
                              <div className="font-semibold text-primary-text truncate">{child.name}</div>
                              <div className="text-[10.5px] font-mono text-muted-text">{child.code} • Level {child.level}</div>
                            </div>
                            <span className="text-accent text-[11px] font-mono shrink-0 ml-2">Inspect →</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Office Administrators */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between border-b border-border/80 pb-1.5">
                      <h3 className="text-xs font-bold font-mono text-primary-text uppercase tracking-wider flex items-center gap-1.5">
                        <ShieldIcon className="w-3.5 h-3.5 text-blue-400" />
                        <span>Stationed Administrators ({nodeDetail?.administrators?.length || 0})</span>
                      </h3>
                      {permissions.canCreateAdmin && (
                        <button
                          onClick={() => navigate(`/users?orgId=${selectedNode.id}&asAdmin=true`)}
                          className="text-[11px] font-mono text-accent hover:underline flex items-center gap-1"
                        >
                          <PlusIcon className="w-3 h-3" />
                          <span>Provision Office Admin</span>
                        </button>
                      )}
                    </div>

                    {!nodeDetail?.administrators || nodeDetail.administrators.length === 0 ? (
                      <div className="text-xs text-muted-text italic py-2">No administrators stationed directly at this office node.</div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border border-border rounded">
                          <thead className="bg-surface text-muted-text font-mono text-[10.5px]">
                            <tr>
                              <th className="py-2 px-3">Official Name</th>
                              <th className="py-2 px-3">Username</th>
                              <th className="py-2 px-3">Role</th>
                              <th className="py-2 px-3">Designation</th>
                              <th className="py-2 px-3">Status</th>
                              <th className="py-2 px-3 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {nodeDetail.administrators.map(admin => (
                              <tr key={admin.id} className="hover:bg-surface/40">
                                <td className="py-2 px-3 font-semibold text-primary-text">
                                  {admin.display_name}
                                  {admin.badge_number && <span className="text-[10px] font-mono text-muted-text block">{admin.badge_number}</span>}
                                </td>
                                <td className="py-2 px-3 font-mono text-muted-text">{admin.username}</td>
                                <td className="py-2 px-3 font-mono text-accent">{admin.role_name || admin.role_id}</td>
                                <td className="py-2 px-3 text-muted-text">{admin.designation || 'Administrator'}</td>
                                <td className="py-2 px-3">
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-success-light text-success border border-success/30 font-bold">
                                    {admin.status}
                                  </span>
                                </td>
                                <td className="py-2 px-3 text-right space-x-2">
                                  <button
                                    onClick={() => navigate(`/users?orgId=${selectedNode.id}`)}
                                    className="text-[11px] font-mono text-accent hover:underline"
                                  >
                                    Manage
                                  </button>
                                  {admin.id !== user?.userId && admin.role_id !== 'MASTER_ADMIN' && (
                                    <button
                                      onClick={() => {
                                        setUserToDelete({
                                          ...admin,
                                          org_name: selectedNode.name,
                                          org_level: selectedNode.level,
                                        });
                                      }}
                                      className="text-[11px] font-mono text-red-400 hover:text-red-300 hover:underline"
                                    >
                                      De-enroll
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* Stationed Officers */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between border-b border-border/80 pb-1.5">
                      <h3 className="text-xs font-bold font-mono text-primary-text uppercase tracking-wider flex items-center gap-1.5">
                        <UsersIcon className="w-3.5 h-3.5 text-accent" />
                        <span>Enrolled Officers & Personnel ({nodeDetail?.users?.length || 0})</span>
                      </h3>
                      {permissions.canCreateUser && (
                        <button
                          onClick={() => navigate(`/users?orgId=${selectedNode.id}`)}
                          className="text-[11px] font-mono text-accent hover:underline flex items-center gap-1"
                        >
                          <PlusIcon className="w-3 h-3" />
                          <span>Enroll Officer</span>
                        </button>
                      )}
                    </div>

                    {!nodeDetail?.users || nodeDetail.users.length === 0 ? (
                      <div className="text-xs text-muted-text italic py-2">No regular officers enrolled directly at this office.</div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border border-border rounded">
                          <thead className="bg-surface text-muted-text font-mono text-[10.5px]">
                            <tr>
                              <th className="py-2 px-3">Official Name</th>
                              <th className="py-2 px-3">Username</th>
                              <th className="py-2 px-3">Role</th>
                              <th className="py-2 px-3">Designation</th>
                              <th className="py-2 px-3">Status</th>
                              <th className="py-2 px-3 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {nodeDetail.users.map(u => (
                              <tr key={u.id} className="hover:bg-surface/40">
                                <td className="py-2 px-3 font-semibold text-primary-text">
                                  {u.display_name}
                                  {u.badge_number && <span className="text-[10px] font-mono text-muted-text block">{u.badge_number}</span>}
                                </td>
                                <td className="py-2 px-3 font-mono text-muted-text">{u.username}</td>
                                <td className="py-2 px-3 font-mono text-primary-text">{u.role_name || u.role_id}</td>
                                <td className="py-2 px-3 text-muted-text">{u.designation || 'Personnel'}</td>
                                <td className="py-2 px-3">
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-success-light text-success border border-success/30 font-bold">
                                    {u.status}
                                  </span>
                                </td>
                                <td className="py-2 px-3 text-right space-x-2">
                                  <button
                                    onClick={() => navigate(`/users?orgId=${selectedNode.id}`)}
                                    className="text-[11px] font-mono text-accent hover:underline"
                                  >
                                    Manage
                                  </button>
                                  {u.id !== user?.userId && u.role_id !== 'MASTER_ADMIN' && (
                                    <button
                                      onClick={() => {
                                        setUserToDelete({
                                          ...u,
                                          org_name: selectedNode.name,
                                          org_level: selectedNode.level,
                                        });
                                      }}
                                      className="text-[11px] font-mono text-red-400 hover:text-red-300 hover:underline"
                                    >
                                      De-enroll
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* Sibling Isolation Simulation Hooks */}
                  <div className="pt-2 border-t border-border flex gap-2">
                    <button
                      onClick={() => setNodeA(selectedNode)}
                      className="btn-secondary text-xs"
                    >
                      Set as Node A for Boundary Test
                    </button>
                    <button
                      onClick={() => setNodeB(selectedNode)}
                      className="btn-secondary text-xs"
                    >
                      Set as Node B for Boundary Test
                    </button>
                  </div>
                </div>
              ) : (
                <div className="glass-card p-8 text-center text-xs text-muted-text border border-border">
                  Select an organization node from the hierarchy tree to inspect details.
                </div>
              )}

              {/* Sibling Isolation Demonstration Panel */}
              <div className="glass-card p-5 border border-border space-y-4">
                <div className="border-b border-border pb-2 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-primary-text">Sibling Isolation & Subtree Boundary Simulator</h3>
                    <p className="text-xs text-muted-text">Mathematical evaluation of cross-agency and peer branch visibility</p>
                  </div>
                  <span className="text-[10.5px] font-mono px-2 py-0.5 rounded bg-surface border border-border text-accent">
                    Zero-Trust Subtree Gate
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div className="p-3 bg-surface rounded border border-border">
                    <span className="text-muted-text font-mono text-[10.5px] block font-bold">NODE A (REQUESTING ACTOR ORG)</span>
                    {nodeA ? (
                      <div className="mt-1 font-mono">
                        <div className="font-bold text-primary-text">{nodeA.name}</div>
                        <div className="text-accent text-[11px]">{nodeA.code}</div>
                        <div className="text-muted-darker text-[10px] break-all mt-1">{nodeA.hierarchy_path}</div>
                      </div>
                    ) : (
                      <span className="text-muted-text italic">Click &quot;Set as Node A&quot; on any node above</span>
                    )}
                  </div>

                  <div className="p-3 bg-surface rounded border border-border">
                    <span className="text-muted-text font-mono text-[10.5px] block font-bold">NODE B (TARGET RESOURCE ORG)</span>
                    {nodeB ? (
                      <div className="mt-1 font-mono">
                        <div className="font-bold text-primary-text">{nodeB.name}</div>
                        <div className="text-accent text-[11px]">{nodeB.code}</div>
                        <div className="text-muted-darker text-[10px] break-all mt-1">{nodeB.hierarchy_path}</div>
                      </div>
                    ) : (
                      <span className="text-muted-text italic">Click &quot;Set as Node B&quot; on another node above</span>
                    )}
                  </div>
                </div>

                {nodeA && nodeB && (
                  <div className={`p-4 rounded border text-xs space-y-1.5 font-mono ${
                    nodeA.id === nodeB.id ? 'bg-blue-500/10 border-blue-500/30 text-blue-300' :
                    isDescendant ? 'bg-success-light border-success/30 text-success' :
                    isSibling ? 'bg-danger-light border-danger/30 text-danger' :
                    'bg-surface border-border text-muted-text'
                  }`}>
                    <div className="font-bold uppercase">
                      {nodeA.id === nodeB.id ? 'SELF NODE • DIRECT ACCESS ALLOWED' :
                       isDescendant ? 'VERTICAL ANCESTOR → DESCENDANT SUBTREE: ACCESS ALLOWED' :
                       isSibling ? 'SIBLING BRANCH DETECTED • ACCESS REJECTED (403 FORBIDDEN)' :
                       'DISJOINT SUBTREE • ACCESS STRICTLY ISOLATED (403 FORBIDDEN)'}
                    </div>
                    <p className="font-sans text-[11.5px] text-primary-text/90">
                      {nodeA.id === nodeB.id ? 'Node A and Node B are identical. The actor has native local jurisdiction.' :
                       isDescendant ? `${nodeA.name} is a vertical ancestor of ${nodeB.name}. Administrative subtree traversal permits visibility.` :
                       isSibling ? `${nodeA.name} and ${nodeB.name} share the same supervisory parent but are sibling branches. Under judicial isolation rules, Station A officers cannot query or modify Station B cases without explicit delegation.` :
                       'Nodes belong to separate organizational branches. Crossover requires active Case Agency Participation or Temporary Delegated Access.'}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ======================= TAB 2: OFFICE POSITIONS CATALOG ======================= */}
      {activeTab === 'POSITIONS' && (
        <div className="space-y-6">
          <div className="p-4 rounded-lg bg-surface border border-border text-xs font-mono text-slate-300 flex items-center justify-between">
            <div>
              <div className="font-bold text-accent text-sm flex items-center gap-2">
                <BuildingIcon className="w-4 h-4" />
                <span>Extensible Office Position Catalog for Sovereign Bodies</span>
              </div>
              <p className="text-[11.5px] text-muted-text font-sans mt-0.5">
                Configurable catalog of hierarchical positions/tiers separated for Police, Judiciary, and Forensics. These positions directly populate office creation forms across all administrative workflows.
              </p>
            </div>
            <button
              onClick={() => setShowAddPositionModal(true)}
              className="btn-primary text-xs shrink-0"
            >
              <PlusIcon className="w-3.5 h-3.5" />
              <span>Define New Position</span>
            </button>
          </div>

          {loadingPositions ? (
            <div className="p-8 text-center text-xs text-muted-text font-mono">
              Loading position catalogs...
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* POLICE POSITIONS */}
              <div className="glass-card p-5 border border-border space-y-4">
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <div className="flex items-center gap-2">
                    <ShieldIcon className="w-4 h-4 text-blue-400" />
                    <div>
                      <h3 className="font-bold text-slate-100 font-mono text-sm">Gujarat Police</h3>
                      <p className="text-[10px] text-slate-400 font-mono">Law Enforcement Tiers</p>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-900/40 text-blue-300 border border-blue-700/40">
                    {groupedPositions.POLICE?.length || 0} Positions
                  </span>
                </div>

                <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                  {groupedPositions.POLICE?.map((pos: any) => (
                    <div key={pos.id} className="p-3 rounded bg-surface/70 border border-border space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-200 text-xs">{pos.name}</span>
                        <span className="text-[10px] font-mono text-blue-400">{pos.code}</span>
                      </div>
                      {pos.description && (
                        <p className="text-[11px] text-slate-400 font-sans">{pos.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* JUDICIARY POSITIONS */}
              <div className="glass-card p-5 border border-border space-y-4">
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <div className="flex items-center gap-2">
                    <ScaleIcon className="w-4 h-4 text-amber-400" />
                    <div>
                      <h3 className="font-bold text-slate-100 font-mono text-sm">State Judiciary</h3>
                      <p className="text-[10px] text-slate-400 font-mono">Court & Registry Tiers</p>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-900/40 text-amber-300 border border-amber-700/40">
                    {groupedPositions.JUDICIARY?.length || 0} Positions
                  </span>
                </div>

                <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                  {groupedPositions.JUDICIARY?.map((pos: any) => (
                    <div key={pos.id} className="p-3 rounded bg-surface/70 border border-border space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-200 text-xs">{pos.name}</span>
                        <span className="text-[10px] font-mono text-amber-400">{pos.code}</span>
                      </div>
                      {pos.description && (
                        <p className="text-[11px] text-slate-400 font-sans">{pos.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* FORENSICS POSITIONS */}
              <div className="glass-card p-5 border border-border space-y-4">
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <div className="flex items-center gap-2">
                    <FlaskIcon className="w-4 h-4 text-purple-400" />
                    <div>
                      <h3 className="font-bold text-slate-100 font-mono text-sm">Forensics (DFSS)</h3>
                      <p className="text-[10px] text-slate-400 font-mono">Scientific Analysis Tiers</p>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-purple-900/40 text-purple-300 border border-purple-700/40">
                    {groupedPositions.FORENSICS?.length || 0} Positions
                  </span>
                </div>

                <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                  {groupedPositions.FORENSICS?.map((pos: any) => (
                    <div key={pos.id} className="p-3 rounded bg-surface/70 border border-border space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-200 text-xs">{pos.name}</span>
                        <span className="text-[10px] font-mono text-purple-400">{pos.code}</span>
                      </div>
                      {pos.description && (
                        <p className="text-[11px] text-slate-400 font-sans">{pos.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ======================= MODAL: CREATE CHILD OFFICE ======================= */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-surface border border-border rounded-lg w-full max-w-lg shadow-xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-2">
              <div>
                <h3 className="text-sm font-bold text-slate-100 font-mono">Create Subordinate Office</h3>
                <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                  Designate Office Name and Office Position for {selectedNode?.name || 'Selected Office'}
                </p>
              </div>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-200 text-sm">✕</button>
            </div>
            <form onSubmit={handleInitiateAddOrg} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-300 mb-1 font-mono">Parent Office Node</label>
                <input
                  disabled
                  type="text"
                  className="input-field opacity-70 font-mono"
                  value={nodes.find(n => n.id === addForm.parentId)?.name || selectedNode?.name || 'Selected Node'}
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-mono">Governing Layer (Admin Level) *</label>
                {adminLevels.filter(al => al.body_id === currentNodeBody).length === 0 ? (
                  <div className="p-2.5 rounded bg-amber-900/20 border border-amber-700/40 text-amber-300 font-mono text-[11px]">
                    No layers defined for {currentNodeBody}. Please configure administrative layers in Admin Hierarchy first.
                  </div>
                ) : (
                  <select
                    required
                    className="input-field font-mono text-xs"
                    value={addForm.adminLevelId}
                    onChange={(e) => setAddForm({ ...addForm, adminLevelId: e.target.value })}
                  >
                    {adminLevels
                      .filter(al => al.body_id === currentNodeBody)
                      .map((al: any) => (
                        <option key={al.id} value={al.id}>
                          Level {al.level_number}: {al.name} (Type: {al.office_type_name || al.office_type_id} • Admin: {al.default_role_name || al.default_role_id})
                        </option>
                      ))}
                  </select>
                )}
                <p className="text-[10px] text-muted-text mt-1 font-mono">
                  Sovereign branch: {currentNodeBody} • Office position and hierarchy level are inherited dynamically from the Layer
                </p>
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-mono">Office Node Name *</label>
                <input
                  required
                  type="text"
                  placeholder="e.g. Navrangpura Police Station or Courtroom 4B"
                  className="input-field"
                  value={addForm.name}
                  onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1 font-mono">Identifier Code (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. PS-NAVRANGPURA"
                    className="input-field font-mono uppercase"
                    value={addForm.code}
                    onChange={(e) => setAddForm({ ...addForm, code: e.target.value.toUpperCase() })}
                  />
                </div>
                <div>
                  <label className="block text-slate-300 mb-1 font-mono">Jurisdiction Area</label>
                  <input
                    type="text"
                    placeholder="e.g. Ahmedabad West Sector"
                    className="input-field"
                    value={addForm.jurisdictionArea}
                    onChange={(e) => setAddForm({ ...addForm, jurisdictionArea: e.target.value })}
                  />
                </div>
              </div>

              <div className="p-3 bg-blue-50 border border-blue-200 rounded text-[11px] text-blue-900 font-mono">
                <span className="font-bold text-blue-800">COMPULSORY PROTOCOL:</span> Submitting this form generates an immutable update ticket requiring operational justification and OTP authorization.
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-border">
                <button type="button" onClick={() => setShowAddModal(false)} className="btn-secondary">Cancel</button>
                <button type="submit" className="btn-primary">Proceed to Authorization →</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================= MODAL: EDIT OFFICE NODE ======================= */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface border border-border rounded-lg w-full max-w-lg shadow-xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-2">
              <h3 className="text-sm font-bold text-slate-900 font-mono">Edit Office Node Details</h3>
              <button onClick={() => setShowEditModal(false)} className="text-slate-400 hover:text-slate-700 text-sm">✕</button>
            </div>
            <form onSubmit={handleInitiateEditSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1 font-mono">Office Node Code</label>
                <input
                  disabled
                  type="text"
                  className="input-field font-mono opacity-70"
                  value={selectedNode?.code || ''}
                />
              </div>
              <div>
                <label className="block text-slate-700 font-semibold mb-1 font-mono">Office Node Name *</label>
                <input
                  required
                  type="text"
                  className="input-field"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-slate-700 font-semibold mb-1 font-mono">Jurisdiction Area</label>
                <input
                  type="text"
                  className="input-field"
                  value={editForm.jurisdictionArea}
                  onChange={(e) => setEditForm({ ...editForm, jurisdictionArea: e.target.value })}
                />
              </div>

              <div className="p-3 bg-blue-50 border border-blue-200 rounded text-[11px] text-blue-900 font-mono">
                <span className="font-bold text-blue-800">COMPULSORY PROTOCOL:</span> Saving changes requires generating an OTP-verified update ticket.
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-border">
                <button type="button" onClick={() => setShowEditModal(false)} className="btn-secondary">Cancel</button>
                <button type="submit" className="btn-primary">Proceed to Authorization →</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================= MODAL: DEFINE OFFICE POSITION ======================= */}
      {showAddPositionModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-surface border border-border rounded-lg w-full max-w-lg shadow-xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-2">
              <div>
                <h3 className="text-sm font-bold text-slate-100 font-mono">Define Office Position Tag</h3>
                <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                  Register new organizational position tier into sovereign catalogs
                </p>
              </div>
              <button onClick={() => setShowAddPositionModal(false)} className="text-slate-400 hover:text-slate-200 text-sm">✕</button>
            </div>
            <form onSubmit={handleInitiateCreatePosition} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-300 mb-1 font-mono">Sovereign Body *</label>
                <select
                  required
                  className="input-field font-mono"
                  value={positionForm.bodyId}
                  onChange={(e) => setPositionForm({ ...positionForm, bodyId: e.target.value as any })}
                >
                  <option value="POLICE">Gujarat Police</option>
                  <option value="JUDICIARY">State Judiciary</option>
                  <option value="FORENSICS">Forensic Science (DFSS)</option>
                </select>
              </div>
              <div>
                <label className="block text-slate-300 mb-1 font-mono">Position Name *</label>
                <input
                  required
                  type="text"
                  placeholder="e.g. Sub-Divisional Police Office or Fast Track Court"
                  className="input-field"
                  value={positionForm.name}
                  onChange={(e) => setPositionForm({ ...positionForm, name: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-slate-300 mb-1 font-mono">Position Code Identifier *</label>
                <input
                  required
                  type="text"
                  placeholder="e.g. SDPO or FAST_TRACK_COURT"
                  className="input-field font-mono uppercase"
                  value={positionForm.code}
                  onChange={(e) => setPositionForm({ ...positionForm, code: e.target.value.toUpperCase() })}
                />
              </div>
              <div>
                <label className="block text-slate-300 mb-1 font-mono">Description / Operational Scope</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Middle-tier supervisory command over multiple police stations"
                  className="input-field"
                  value={positionForm.description}
                  onChange={(e) => setPositionForm({ ...positionForm, description: e.target.value })}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-border">
                <button type="button" onClick={() => setShowAddPositionModal(false)} className="btn-secondary">Cancel</button>
                <button type="submit" className="btn-primary">Generate Ticket & Define Position →</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================= MODAL: CONFIRM DE-ENROLLMENT ======================= */}
      {userToDelete && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-surface border border-red-800/80 rounded-lg w-full max-w-lg p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded bg-red-950/80 border border-red-700/60 flex items-center justify-center text-red-400 font-bold">
                  ⚠️
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider font-mono">
                    CONFIRM PERSONNEL DE-ENROLLMENT
                  </h3>
                  <p className="text-[10px] text-red-400 font-mono">
                    CRITICAL // IRREVERSIBLE OPERATION // COMPULSORY TICKET REQUIRED
                  </p>
                </div>
              </div>
              <button
                onClick={() => setUserToDelete(null)}
                className="text-slate-400 hover:text-slate-200 font-mono text-sm"
              >
                ✕
              </button>
            </div>

            <div className="p-3.5 rounded bg-surface border border-slate-700 space-y-2 text-xs font-mono">
              <div className="flex items-center justify-between">
                <div className="font-bold text-slate-100 text-sm">{userToDelete.display_name}</div>
                <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 font-bold">
                  {userToDelete.role_name || userToDelete.role_id}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-slate-400">
                <div>Username: <span className="text-slate-200">@{userToDelete.username}</span></div>
                <div>Badge: <span className="text-slate-200">{userToDelete.badge_number || 'N/A'}</span></div>
                <div>Office: <span className="text-blue-400">{userToDelete.org_name || selectedNode?.name}</span></div>
                <div>Level: <span className="text-amber-400">Level {userToDelete.org_level || selectedNode?.level}</span></div>
              </div>
            </div>

            <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-700">
              <button
                type="button"
                onClick={() => setUserToDelete(null)}
                className="btn-secondary text-xs"
              >
                Abort / Cancel
              </button>
              <button
                type="button"
                onClick={handleInitiateDeletePersonnel}
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
