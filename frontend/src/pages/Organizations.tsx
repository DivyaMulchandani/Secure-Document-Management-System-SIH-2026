import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { AgencyBadge } from '../components/ClassificationBadge';
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
  permissions: {
    canCreateChildNode: boolean;
    canCreateAdmin: boolean;
    canCreateUser: boolean;
    canEditNode: boolean;
    canDisableNode: boolean;
  };
}

export const Organizations: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const isMaster = user?.roleId === 'MASTER_ADMIN' || user?.roleId === 'SYSTEM_MASTER_ADMIN';
  const initialBody = (searchParams.get('body') as SovereignBody) || (isMaster ? 'ALL' : (user?.agencyBranch as SovereignBody) || 'ALL');

  const [activeBody, setActiveBody] = useState<SovereignBody>(initialBody);
  const [nodes, setNodes] = useState<any[]>([]);
  const [nodeTypes, setNodeTypes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const [nodeDetail, setNodeDetail] = useState<NodeDetailData | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});

  // Sibling Isolation Demo State
  const [nodeA, setNodeA] = useState<any>(null);
  const [nodeB, setNodeB] = useState<any>(null);

  // Modal: Add Child Org Node
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({
    parentId: '',
    typeId: '',
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

  const fetchNodeTypes = async () => {
    try {
      const res = await api.get<{ types: any[] }>('/organizations/node-types');
      if (res.types && res.types.length > 0) {
        setNodeTypes(res.types);
        if (!addForm.typeId) {
          setAddForm(prev => ({ ...prev, typeId: res.types[0].id }));
        }
      }
    } catch (err) {
      console.error('Failed to load node types:', err);
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

  const handleAddOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/organizations', {
        ...addForm,
        parentId: addForm.parentId || selectedNode?.id
      });
      setShowAddModal(false);
      setAddForm({
        parentId: '',
        typeId: nodeTypes[0]?.id || 'POLICE_STATION',
        name: '',
        code: '',
        jurisdictionArea: ''
      });
      await fetchTree(activeBody);
      if (selectedNode?.id) {
        await fetchNodeDetail(selectedNode.id);
      }
    } catch (err: any) {
      alert(err.message || 'Failed to create organization');
    }
  };

  const handleOpenEdit = () => {
    if (!selectedNode) return;
    setEditForm({
      name: selectedNode.name || '',
      jurisdictionArea: selectedNode.jurisdiction_area || ''
    });
    setShowEditModal(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedNode) return;
    try {
      await api.put(`/organizations/nodes/${selectedNode.id}`, editForm);
      setShowEditModal(false);
      await fetchTree(activeBody);
      await fetchNodeDetail(selectedNode.id);
    } catch (err: any) {
      alert(err.message || 'Failed to update organization node');
    }
  };

  const handleToggleStatus = async () => {
    if (!selectedNode || !nodeDetail) return;
    const currentStatus = selectedNode.status || 'ACTIVE';
    const newStatus = currentStatus === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
    const confirmMsg = `Are you sure you want to change status of ${selectedNode.name} to ${newStatus}?`;
    if (!window.confirm(confirmMsg)) return;

    try {
      await api.put(`/organizations/nodes/${selectedNode.id}/status`, { status: newStatus });
      await fetchTree(activeBody);
      await fetchNodeDetail(selectedNode.id);
    } catch (err: any) {
      alert(err.message || 'Failed to update node status');
    }
  };

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

          return (
            <div key={node.id} className="text-xs">
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
                  {node.body_id === 'POLICE' ? <ShieldIcon className="w-3.5 h-3.5 shrink-0 text-blue-400 opacity-80" /> :
                   node.body_id === 'FORENSICS' ? <FlaskIcon className="w-3.5 h-3.5 shrink-0 text-purple-400 opacity-80" /> :
                   node.body_id === 'JUDICIARY' ? <ScaleIcon className="w-3.5 h-3.5 shrink-0 text-amber-400 opacity-80" /> :
                   <BuildingIcon className="w-3.5 h-3.5 shrink-0 text-emerald-400 opacity-80" />}
                  <span className="truncate">{node.name}</span>
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-2">
                  {node.status === 'DISABLED' && (
                    <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-danger-light text-danger border border-danger/30">
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

  // Calculate sibling relationship for demo
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
            <span>Sovereign Hierarchy Master Explorer</span>
          </h1>
          <p className="text-xs text-muted-text font-mono mt-0.5">
            Three Independent Sovereign Trees: Gujarat Police • State Judiciary • Forensics (DFSS)
          </p>
        </div>

        {selectedNode && permissions.canCreateChildNode && (
          <button
            onClick={() => {
              setAddForm({
                ...addForm,
                parentId: selectedNode?.id || '',
                typeId: nodeTypes[0]?.id || 'POLICE_STATION'
              });
              setShowAddModal(true);
            }}
            className="btn-primary text-xs"
          >
            <PlusIcon className="w-3.5 h-3.5" />
            <span>Create Child Node</span>
          </button>
        )}
      </div>

      {/* Sovereign Body Selection Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-border/80">
        {isMaster && (
          <button
            onClick={() => handleBodyChange('ALL')}
            className={`px-3.5 py-1.5 rounded-md text-xs font-mono font-medium transition-colors ${
              activeBody === 'ALL'
                ? 'bg-accent text-bg font-bold shadow-sm'
                : 'bg-surface hover:bg-surface-hover text-muted-text border border-border'
            }`}
          >
            All Sovereign Trees
          </button>
        )}

        {(isMaster || user?.agencyBranch === 'POLICE') && (
          <button
            onClick={() => handleBodyChange('POLICE')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-mono font-medium transition-colors ${
              activeBody === 'POLICE'
                ? 'bg-blue-600 text-white font-bold shadow-sm'
                : 'bg-surface hover:bg-surface-hover text-blue-300 border border-blue-500/30'
            }`}
          >
            <ShieldIcon className="w-3.5 h-3.5" />
            <span>Gujarat Police Tree</span>
          </button>
        )}

        {(isMaster || user?.agencyBranch === 'JUDICIARY') && (
          <button
            onClick={() => handleBodyChange('JUDICIARY')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-mono font-medium transition-colors ${
              activeBody === 'JUDICIARY'
                ? 'bg-amber-600 text-white font-bold shadow-sm'
                : 'bg-surface hover:bg-surface-hover text-amber-300 border border-amber-500/30'
            }`}
          >
            <ScaleIcon className="w-3.5 h-3.5" />
            <span>State Judiciary Tree</span>
          </button>
        )}

        {(isMaster || user?.agencyBranch === 'FORENSICS') && (
          <button
            onClick={() => handleBodyChange('FORENSICS')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-mono font-medium transition-colors ${
              activeBody === 'FORENSICS'
                ? 'bg-purple-600 text-white font-bold shadow-sm'
                : 'bg-surface hover:bg-surface-hover text-purple-300 border border-purple-500/30'
            }`}
          >
            <FlaskIcon className="w-3.5 h-3.5" />
            <span>Forensic Science (DFSS) Tree</span>
          </button>
        )}

        {isMaster && (
          <button
            onClick={() => handleBodyChange('MASTER')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-mono font-medium transition-colors ${
              activeBody === 'MASTER'
                ? 'bg-emerald-600 text-white font-bold shadow-sm'
                : 'bg-surface hover:bg-surface-hover text-emerald-300 border border-emerald-500/30'
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
                    <span className="px-2 py-0.5 rounded bg-surface border border-border text-[10.5px] font-mono text-muted-text">
                      Level {selectedNode.level}
                    </span>
                  </div>
                  <div className="text-xs font-mono text-muted-text mt-1 space-x-2">
                    <span>Code: <strong className="text-accent">{selectedNode.code}</strong></span>
                    <span>•</span>
                    <span>Body: <strong>{selectedNode.body_name || selectedNode.body_id}</strong></span>
                    <span>•</span>
                    <span>Type: <strong>{selectedNode.type_name || selectedNode.type_id}</strong></span>
                  </div>
                </div>

                {/* Node Action Buttons (conditionally shown per backend permissions object) */}
                <div className="flex items-center gap-2 flex-wrap">
                  {permissions.canCreateChildNode && (
                    <button
                      onClick={() => {
                        setAddForm({
                          parentId: selectedNode.id,
                          typeId: nodeTypes[0]?.id || 'POLICE_STATION',
                          name: '',
                          code: '',
                          jurisdictionArea: ''
                        });
                        setShowAddModal(true);
                      }}
                      className="px-2.5 py-1.5 rounded bg-accent/15 text-accent hover:bg-accent/25 border border-accent/30 font-mono text-[11px] flex items-center gap-1 transition-colors"
                      title="Create child node beneath this node"
                    >
                      <PlusIcon className="w-3.5 h-3.5" />
                      <span>Create Child Node</span>
                    </button>
                  )}

                  {permissions.canCreateAdmin && (
                    <button
                      onClick={() => navigate(`/users?orgId=${selectedNode.id}&asAdmin=true`)}
                      className="px-2.5 py-1.5 rounded bg-blue-600/20 text-blue-300 hover:bg-blue-600/30 border border-blue-500/40 font-mono text-[11px] flex items-center gap-1 transition-colors"
                      title="Create node administrator with delegated subtree scope"
                    >
                      <ShieldIcon className="w-3.5 h-3.5" />
                      <span>Create Admin</span>
                    </button>
                  )}

                  {permissions.canCreateUser && (
                    <button
                      onClick={() => navigate(`/users?orgId=${selectedNode.id}`)}
                      className="px-2.5 py-1.5 rounded bg-surface hover:bg-surface-hover text-primary-text border border-border font-mono text-[11px] flex items-center gap-1 transition-colors"
                      title="Enroll personnel into this organization node"
                    >
                      <UsersIcon className="w-3.5 h-3.5" />
                      <span>Create User</span>
                    </button>
                  )}

                  {permissions.canEditNode && (
                    <button
                      onClick={handleOpenEdit}
                      className="px-2.5 py-1.5 rounded bg-surface hover:bg-surface-hover text-primary-text border border-border font-mono text-[11px] transition-colors"
                      title="Edit organization node details"
                    >
                      <span>Edit Node</span>
                    </button>
                  )}

                  {permissions.canDisableNode && (
                    <button
                      onClick={handleToggleStatus}
                      className={`px-2.5 py-1.5 rounded font-mono text-[11px] border transition-colors ${
                        (selectedNode.status || 'ACTIVE') === 'ACTIVE'
                          ? 'bg-danger-light text-danger hover:bg-danger/20 border-danger/30'
                          : 'bg-success-light text-success hover:bg-success/20 border-success/30'
                      }`}
                      title="Toggle active / disabled status"
                    >
                      {(selectedNode.status || 'ACTIVE') === 'ACTIVE' ? 'Disable Node' : 'Activate Node'}
                    </button>
                  )}
                </div>
              </div>

              {/* Node Properties */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                <div className="p-3 bg-surface rounded border border-border">
                  <span className="text-muted-text block text-[10px] uppercase font-bold">Parent Node</span>
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
                  <span className="text-muted-text block text-[10px] uppercase font-bold">Direct Children</span>
                  <span className="font-semibold text-accent mt-0.5 block">
                    {nodeDetail?.children?.length || 0} Subordinate Units
                  </span>
                </div>
                <div className="p-3 bg-surface rounded border border-border">
                  <span className="text-muted-text block text-[10px] uppercase font-bold">Attached Personnel</span>
                  <span className="font-semibold text-accent mt-0.5 block">
                    {(nodeDetail?.administrators?.length || 0) + (nodeDetail?.users?.length || 0)} Total
                  </span>
                </div>
              </div>

              {/* Materialized Dot-Hierarchy Path */}
              <div>
                <span className="text-[10px] font-mono text-muted-text font-bold uppercase block mb-1">
                  Materialized Dot-Hierarchy Path
                </span>
                <div className="p-2.5 bg-surface rounded border border-border font-mono text-xs text-accent break-all">
                  {selectedNode.hierarchy_path}
                </div>
              </div>

              {/* Direct Child Nodes List */}
              <div className="space-y-2">
                <div className="flex items-center justify-between border-b border-border/80 pb-1.5">
                  <h3 className="text-xs font-bold font-mono text-primary-text uppercase tracking-wider">
                    Direct Subordinate Units ({nodeDetail?.children?.length || 0})
                  </h3>
                  {permissions.canCreateChildNode && (
                    <button
                      onClick={() => {
                        setAddForm({
                          parentId: selectedNode.id,
                          typeId: nodeTypes[0]?.id || 'POLICE_STATION',
                          name: '',
                          code: '',
                          jurisdictionArea: ''
                        });
                        setShowAddModal(true);
                      }}
                      className="text-[11px] font-mono text-accent hover:underline flex items-center gap-1"
                    >
                      <PlusIcon className="w-3 h-3" />
                      <span>Add Child</span>
                    </button>
                  )}
                </div>

                {loadingDetail ? (
                  <div className="text-xs text-muted-text py-2">Loading subordinates...</div>
                ) : !nodeDetail?.children || nodeDetail.children.length === 0 ? (
                  <div className="text-xs text-muted-text italic py-2">No direct child nodes registered under this unit.</div>
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

              {/* Administrators of this Node Table */}
              <div className="space-y-2">
                <div className="flex items-center justify-between border-b border-border/80 pb-1.5">
                  <h3 className="text-xs font-bold font-mono text-primary-text uppercase tracking-wider flex items-center gap-1.5">
                    <ShieldIcon className="w-3.5 h-3.5 text-blue-400" />
                    <span>Designated Administrators ({nodeDetail?.administrators?.length || 0})</span>
                  </h3>
                  {permissions.canCreateAdmin && (
                    <button
                      onClick={() => navigate(`/users?orgId=${selectedNode.id}&asAdmin=true`)}
                      className="text-[11px] font-mono text-accent hover:underline flex items-center gap-1"
                    >
                      <PlusIcon className="w-3 h-3" />
                      <span>Provision Admin</span>
                    </button>
                  )}
                </div>

                {!nodeDetail?.administrators || nodeDetail.administrators.length === 0 ? (
                  <div className="text-xs text-muted-text italic py-2">No designated administrators assigned directly at this level.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border border-border rounded">
                      <thead className="bg-surface text-muted-text font-mono text-[10.5px]">
                        <tr>
                          <th className="py-2 px-3">Official Name / Badge</th>
                          <th className="py-2 px-3">Username</th>
                          <th className="py-2 px-3">Role</th>
                          <th className="py-2 px-3">Designation</th>
                          <th className="py-2 px-3 text-right">Status</th>
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
                            <td className="py-2 px-3 text-right">
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-success-light text-success border border-success/30 font-bold">
                                {admin.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Regular Users belonging to this Node Table */}
              <div className="space-y-2">
                <div className="flex items-center justify-between border-b border-border/80 pb-1.5">
                  <h3 className="text-xs font-bold font-mono text-primary-text uppercase tracking-wider flex items-center gap-1.5">
                    <UsersIcon className="w-3.5 h-3.5 text-accent" />
                    <span>Assigned Officers & Personnel ({nodeDetail?.users?.length || 0})</span>
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
                  <div className="text-xs text-muted-text italic py-2">No regular officers enrolled directly at this node.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border border-border rounded">
                      <thead className="bg-surface text-muted-text font-mono text-[10.5px]">
                        <tr>
                          <th className="py-2 px-3">Official Name</th>
                          <th className="py-2 px-3">Username</th>
                          <th className="py-2 px-3">Role</th>
                          <th className="py-2 px-3">Designation</th>
                          <th className="py-2 px-3 text-right">Status</th>
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
                            <td className="py-2 px-3 text-right">
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-success-light text-success border border-success/30 font-bold">
                                {u.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Isolation Simulation Quick Selectors */}
              <div className="pt-2 border-t border-border flex gap-2">
                <button
                  onClick={() => setNodeA(selectedNode)}
                  className="btn-secondary text-xs"
                >
                  Set as Node A for Isolation Test
                </button>
                <button
                  onClick={() => setNodeB(selectedNode)}
                  className="btn-secondary text-xs"
                >
                  Set as Node B for Isolation Test
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

      {/* Add Child Node Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="glass-card p-6 border border-border w-full max-w-lg space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-2">
              <h3 className="text-sm font-bold text-primary-text">Create Child Organization Node</h3>
              <button onClick={() => setShowAddModal(false)} className="text-muted-text hover:text-primary-text text-sm">✕</button>
            </div>
            <form onSubmit={handleAddOrg} className="space-y-3 text-xs">
              <div>
                <label className="block text-muted-text mb-1">Parent Node</label>
                <input
                  disabled
                  type="text"
                  className="input-field opacity-70"
                  value={nodes.find(n => n.id === addForm.parentId)?.name || selectedNode?.name || 'Selected Node'}
                />
              </div>
              <div>
                <label className="block text-muted-text mb-1">Node Type *</label>
                <select
                  required
                  className="input-field font-mono"
                  value={addForm.typeId}
                  onChange={(e) => setAddForm({ ...addForm, typeId: e.target.value })}
                >
                  {nodeTypes.map((t: any) => (
                    <option key={t.id} value={t.id}>
                      {t.name} (Rank Level {t.level_rank || 1})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-muted-text mb-1">Organization Node Name *</label>
                <input
                  required
                  type="text"
                  placeholder="e.g. Navrangpura Police Station or Ellisbridge Division"
                  className="input-field"
                  value={addForm.name}
                  onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-muted-text mb-1">Unique Node Code *</label>
                  <input
                    required
                    type="text"
                    placeholder="e.g. GUJ-POL-AMD-NAVRANGPURA"
                    className="input-field font-mono uppercase"
                    value={addForm.code}
                    onChange={(e) => setAddForm({ ...addForm, code: e.target.value.toUpperCase() })}
                  />
                </div>
                <div>
                  <label className="block text-muted-text mb-1">Jurisdiction Area</label>
                  <input
                    type="text"
                    placeholder="e.g. Ahmedabad West Sector"
                    className="input-field"
                    value={addForm.jurisdictionArea}
                    onChange={(e) => setAddForm({ ...addForm, jurisdictionArea: e.target.value })}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-border">
                <button type="button" onClick={() => setShowAddModal(false)} className="btn-secondary">Cancel</button>
                <button type="submit" className="btn-primary">Create Child Node</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Node Modal */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="glass-card p-6 border border-border w-full max-w-lg space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-2">
              <h3 className="text-sm font-bold text-primary-text">Edit Organization Node</h3>
              <button onClick={() => setShowEditModal(false)} className="text-muted-text hover:text-primary-text text-sm">✕</button>
            </div>
            <form onSubmit={handleEditSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block text-muted-text mb-1">Organization Node Code</label>
                <input
                  disabled
                  type="text"
                  className="input-field font-mono opacity-70"
                  value={selectedNode?.code || ''}
                />
              </div>
              <div>
                <label className="block text-muted-text mb-1">Organization Node Name *</label>
                <input
                  required
                  type="text"
                  className="input-field"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-muted-text mb-1">Jurisdiction Area</label>
                <input
                  type="text"
                  className="input-field"
                  value={editForm.jurisdictionArea}
                  onChange={(e) => setEditForm({ ...editForm, jurisdictionArea: e.target.value })}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-border">
                <button type="button" onClick={() => setShowEditModal(false)} className="btn-secondary">Cancel</button>
                <button type="submit" className="btn-primary">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
