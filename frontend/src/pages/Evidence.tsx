import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import {
  ShieldIcon, SearchIcon, Filter, ClockIcon, BuildingIcon, UsersIcon
} from '../components/Icons';

export const Evidence: React.FC = () => {
  const { user, hasPermission } = useAuth();
  const navigate = useNavigate();

  const [evidenceItems, setEvidenceItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Modals
  const [showCustodyModal, setShowCustodyModal] = useState(false);
  const [selectedEvidence, setSelectedEvidence] = useState<any>(null);
  const [custodyHistory, setCustodyHistory] = useState<any[]>([]);
  const [custodyIntegrity, setCustodyIntegrity] = useState<any>(null);

  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferForm, setTransferForm] = useState({
    toUserId: '', toOrganizationId: '', actionType: 'HANDOFF', purpose: '', notes: ''
  });

  const [organizationsList, setOrganizationsList] = useState<any[]>([]);
  const [usersList, setUsersList] = useState<any[]>([]);

  const fetchEvidence = async () => {
    setLoading(true);
    try {
      let url = '/evidence?';
      if (categoryFilter) url += `category=${categoryFilter}&`;
      if (statusFilter) url += `status=${statusFilter}&`;
      if (searchQuery) url += `search=${encodeURIComponent(searchQuery)}&`;
      const res = await api.get<{ evidence: any[] }>(url);
      setEvidenceItems(res.evidence || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvidence();
  }, [categoryFilter, statusFilter, searchQuery]);

  const loadLookups = async () => {
    try {
      const orgRes = await api.get<any>('/organizations');
      setOrganizationsList(orgRes.organizations || []);
      if (hasPermission('USER_READ')) {
        const userRes = await api.get<any>('/users');
        setUsersList(userRes.users || []);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleViewCustody = async (ev: any) => {
    setSelectedEvidence(ev);
    try {
      const res = await api.get<any>(`/evidence/${ev.id}/custody`);
      setCustodyHistory(res.custodyHistory || []);
      setCustodyIntegrity(res.integrity || null);
      setShowCustodyModal(true);
    } catch (err: any) {
      alert(err.message || 'Failed to fetch chain of custody');
    }
  };

  const handleTransferCustody = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEvidence) return;
    try {
      await api.post(`/evidence/${selectedEvidence.id}/transfer`, transferForm);
      setShowTransferModal(false);
      fetchEvidence();
    } catch (err: any) {
      alert(err.message || 'Failed to transfer custody');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-primary-text flex items-center gap-2">
            <ShieldIcon className="w-5 h-5 text-accent" />
            <span>Physical & Digital Evidence Registry</span>
          </h1>
          <p className="text-xs text-muted-text font-mono mt-0.5">
            Chain-of-Custody Tracking & Cryptographic Handoff • Scope: {user?.organizationName}
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col md:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <SearchIcon className="w-4 h-4 text-muted-text absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search by Evidence Tag, description, or FIR number..."
            className="input-field pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="w-full sm:w-48">
          <select
            className="input-field"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="">All Categories</option>
            <option value="PHYSICAL">Physical Article</option>
            <option value="FIREARM">Firearm / Weapon</option>
            <option value="DIGITAL">Digital Device</option>
            <option value="BIOLOGICAL">Biological / Blood</option>
            <option value="DOCUMENT">Questioned Document</option>
            <option value="NARCOTIC">Narcotic / Contraband</option>
          </select>
        </div>

        <div className="w-full sm:w-48">
          <select
            className="input-field"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All Custody States</option>
            <option value="POLICE_CUSTODY">Police Custody</option>
            <option value="IN_FORENSIC_LAB">In Forensic Lab</option>
            <option value="COURT_EXHIBIT">Court Exhibit</option>
            <option value="RETURNED">Returned</option>
            <option value="DESTROYED">Destroyed / Disposed</option>
          </select>
        </div>
      </div>

      {/* Evidence Table */}
      <div className="glass-card overflow-hidden border border-border">
        {loading ? (
          <div className="p-8 text-center text-xs text-muted-text font-mono">Loading evidence catalog...</div>
        ) : evidenceItems.length === 0 ? (
          <div className="p-12 text-center text-xs text-muted-text">
            <ShieldIcon className="w-10 h-10 text-muted-darker mx-auto mb-2" />
            <h3 className="text-sm font-semibold text-primary-text">No Evidence Items Found</h3>
            <p className="mt-1 max-w-sm mx-auto">No physical or digital evidence matches your filters within your jurisdictional scope.</p>
          </div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="bg-surface border-b border-border text-[11px] font-mono uppercase text-muted-text">
              <tr>
                <th className="py-3 px-4">Tag / Barcode</th>
                <th className="py-3 px-4">Associated Case</th>
                <th className="py-3 px-4">Category & Description</th>
                <th className="py-3 px-4">Current Custodian</th>
                <th className="py-3 px-4">Custody State</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {evidenceItems.map((ev) => (
                <tr key={ev.id} className="hover:bg-surface/50 transition-colors">
                  <td className="py-3 px-4 font-mono font-bold text-accent">
                    <div>{ev.evidence_tag}</div>
                    <span className="text-[9.5px] font-mono px-1.5 py-0.2 rounded bg-surface border border-border text-muted-text">
                      {ev.seal_status}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <button
                      onClick={() => navigate(`/cases/${ev.case_id}`)}
                      className="font-mono font-bold text-primary-text hover:text-accent text-left"
                    >
                      {ev.fir_number || 'View Case'}
                    </button>
                    <div className="text-[11px] text-muted-text truncate max-w-xs">{ev.case_title}</div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="font-semibold text-primary-text">{ev.category}</div>
                    <div className="text-[11px] text-muted-text max-w-xs truncate">{ev.description}</div>
                  </td>
                  <td className="py-3 px-4 font-mono text-[11px]">
                    <div className="text-primary-text">{ev.current_custodian_name}</div>
                    <div className="text-muted-darker">{ev.current_organization_name} ({ev.current_organization_code})</div>
                  </td>
                  <td className="py-3 px-4">
                    <span className={`px-2 py-0.5 rounded font-mono text-[10.5px] font-bold ${
                      ev.custody_status === 'POLICE_CUSTODY' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/30' :
                      ev.custody_status === 'IN_FORENSIC_LAB' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/30' :
                      ev.custody_status === 'COURT_EXHIBIT' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30' :
                      'bg-surface text-muted-text border border-border'
                    }`}>
                      {ev.custody_status || 'POLICE_CUSTODY'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right space-x-2">
                    <button
                      onClick={() => handleViewCustody(ev)}
                      className="text-xs text-accent hover:underline font-semibold"
                    >
                      Chain Log
                    </button>
                    {hasPermission('EVIDENCE_TRANSFER') && (
                      <button
                        onClick={async () => {
                          setSelectedEvidence(ev);
                          await loadLookups();
                          setShowTransferModal(true);
                        }}
                        className="text-xs text-blue-400 hover:underline font-semibold"
                      >
                        Transfer
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Custody Chain Modal */}
      {showCustodyModal && selectedEvidence && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="glass-card p-6 border border-border w-full max-w-xl space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <span className="text-[10.5px] font-mono text-muted-text block">EVIDENCE EXHIBIT</span>
                <span className="text-base font-bold font-mono text-accent">{selectedEvidence.evidence_tag}</span>
              </div>
              <button onClick={() => setShowCustodyModal(false)} className="text-muted-text hover:text-primary-text">✕</button>
            </div>

            {custodyIntegrity && (
              <div className={`px-3 py-2 rounded border text-[11px] font-mono flex items-center justify-between ${
                custodyIntegrity.chainVerified ? 'bg-success-light border-success/30 text-success' : 'bg-danger-light border-danger/30 text-danger'
              }`}>
                <span>🔗 {custodyIntegrity.chainVerified ? 'Hash Chain Verified' : `Chain Broken at block #${custodyIntegrity.ledgerBrokenAt}`}</span>
                <span>{custodyIntegrity.anchoredTransitions}/{custodyIntegrity.totalTransitions} transitions anchored</span>
              </div>
            )}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase font-mono text-muted-text tracking-wider">
                Cryptographic Chain of Custody History
              </h4>
              <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-border">
                {custodyHistory.map((ev: any) => (
                  <div key={ev.id} className="relative text-xs space-y-1 font-mono">
                    <div className="absolute -left-6 top-1 w-2.5 h-2.5 rounded-full bg-accent border-2 border-bg" />
                    <div className="flex items-center justify-between font-bold text-primary-text">
                      <span>{ev.action_type}</span>
                      <span className="text-muted-text text-[10.5px]">{new Date(ev.timestamp).toLocaleString()}</span>
                    </div>
                    <div className="text-muted-text text-[11px]">
                      From: <span className="text-primary-text">{ev.from_user_name}</span> ({ev.from_org_code}) →
                      To: <span className="text-accent font-bold">{ev.to_user_name}</span> ({ev.to_org_code})
                    </div>
                    {ev.purpose && <div className="text-muted-darker text-[10.5px]">Purpose: {ev.purpose}</div>}
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <button onClick={() => setShowCustodyModal(false)} className="btn-secondary text-xs">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Transfer Custody Modal */}
      {showTransferModal && selectedEvidence && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="glass-card p-6 border border-border w-full max-w-lg space-y-4">
            <h3 className="text-sm font-bold text-primary-text">
              Transfer Custody: <span className="text-accent font-mono">{selectedEvidence.evidence_tag}</span>
            </h3>
            <form onSubmit={handleTransferCustody} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-muted-text mb-1">Receiving Organization *</label>
                  <select
                    required
                    className="input-field"
                    value={transferForm.toOrganizationId}
                    onChange={(e) => setTransferForm({ ...transferForm, toOrganizationId: e.target.value })}
                  >
                    <option value="">Select Organization</option>
                    {organizationsList.map((org: any) => (
                      <option key={org.id} value={org.id}>{org.name} ({org.code})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-muted-text mb-1">Receiving Custodian *</label>
                  <select
                    required
                    className="input-field"
                    value={transferForm.toUserId}
                    onChange={(e) => setTransferForm({ ...transferForm, toUserId: e.target.value })}
                  >
                    <option value="">Select Officer / Custodian</option>
                    {usersList.map((u: any) => (
                      <option key={u.id} value={u.id}>{u.display_name} ({u.role_name})</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-muted-text mb-1">Action Type</label>
                  <select
                    className="input-field"
                    value={transferForm.actionType}
                    onChange={(e) => setTransferForm({ ...transferForm, actionType: e.target.value })}
                  >
                    <option value="HANDOFF">Physical Handoff</option>
                    <option value="SUBMIT_TO_LAB">Submission to Forensic Lab</option>
                    <option value="RETURN_FROM_LAB">Return from Forensic Lab</option>
                    <option value="PRODUCE_IN_COURT">Production as Court Exhibit</option>
                  </select>
                </div>
                <div>
                  <label className="block text-muted-text mb-1">Transfer Purpose *</label>
                  <input
                    required
                    type="text"
                    placeholder="e.g. Ballistics forensic examination"
                    className="input-field"
                    value={transferForm.purpose}
                    onChange={(e) => setTransferForm({ ...transferForm, purpose: e.target.value })}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowTransferModal(false)} className="btn-secondary">Cancel</button>
                <button type="submit" className="btn-primary">Confirm Transfer</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

