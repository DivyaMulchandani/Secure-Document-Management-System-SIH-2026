import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { KeyIcon, PlusIcon, ClockIcon, AlertCircleIcon, ShieldIcon } from '../components/Icons';

export const Delegations: React.FC = () => {
  const { user, hasPermission } = useAuth();
  const [delegations, setDelegations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [showGrantModal, setShowGrantModal] = useState(false);
  const [casesList, setCasesList] = useState<any[]>([]);
  const [usersList, setUsersList] = useState<any[]>([]);
  const [grantForm, setGrantForm] = useState({
    caseId: '',
    grantedToUserId: '',
    permissions: ['CASE_READ', 'FIR_READ'],
    reason: '',
    startsAt: new Date().toISOString().slice(0, 16),
    expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().slice(0, 16),
  });

  const fetchDelegations = async () => {
    setLoading(true);
    try {
      const res = await api.get<{ delegations: any[] }>('/delegations');
      setDelegations(res.delegations || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDelegations();
  }, []);

  const loadLookups = async () => {
    try {
      const [cRes, uRes] = await Promise.all([
        api.get<any>('/cases'),
        api.get<any>('/users')
      ]);
      setCasesList(cRes.cases || []);
      setUsersList(uRes.users || []);
    } catch (err) {
      console.error(err);
    }
  };

  const handleGrant = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/delegations', {
        ...grantForm,
        startsAt: new Date(grantForm.startsAt).toISOString(),
        expiresAt: new Date(grantForm.expiresAt).toISOString(),
      });
      setShowGrantModal(false);
      fetchDelegations();
    } catch (err: any) {
      alert(err.message || 'Failed to grant delegation');
    }
  };

  const handleRevoke = async (id: string) => {
    if (!confirm('Are you sure you want to revoke this delegation immediately?')) return;
    try {
      await api.put(`/delegations/${id}/revoke`);
      fetchDelegations();
    } catch (err: any) {
      alert(err.message || 'Failed to revoke delegation');
    }
  };

  const togglePermission = (perm: string) => {
    setGrantForm(prev => ({
      ...prev,
      permissions: prev.permissions.includes(perm)
        ? prev.permissions.filter(p => p !== perm)
        : [...prev.permissions, perm]
    }));
  };

  const allPermissions = [
    'CASE_READ', 'FIR_READ', 'INVESTIGATION_READ', 'EVIDENCE_READ', 'DOCUMENT_READ', 'DOCUMENT_DOWNLOAD'
  ];

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-primary-text flex items-center gap-2">
            <KeyIcon className="w-5 h-5 text-accent" />
            <span>Temporary Delegated Access Manager</span>
          </h1>
          <p className="text-xs text-muted-text font-mono mt-0.5">
            Cross-Agency Special Investigations & Time-Bound Jurisdictional Grants
          </p>
        </div>

        {hasPermission('DELEGATION_MANAGE') && (
          <button
            onClick={async () => { await loadLookups(); setShowGrantModal(true); }}
            className="btn-primary text-xs"
          >
            <PlusIcon className="w-3.5 h-3.5" />
            <span>Issue Delegation Grant</span>
          </button>
        )}
      </div>

      {/* Delegations Table */}
      <div className="glass-card overflow-hidden border border-border">
        {loading ? (
          <div className="p-8 text-center text-xs text-muted-text font-mono">Loading active delegations...</div>
        ) : delegations.length === 0 ? (
          <div className="p-12 text-center text-xs text-muted-text">
            <KeyIcon className="w-10 h-10 text-muted-darker mx-auto mb-2" />
            <h3 className="text-sm font-semibold text-primary-text">No Delegations Found</h3>
            <p className="mt-1">There are no active or historical temporary delegated access grants in your purview.</p>
          </div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="bg-surface border-b border-border text-[11px] font-mono uppercase text-muted-text">
              <tr>
                <th className="py-3 px-4">Case / FIR</th>
                <th className="py-3 px-4">Delegate Officer</th>
                <th className="py-3 px-4">Authorizing Officer</th>
                <th className="py-3 px-4">Permissions Granted</th>
                <th className="py-3 px-4">Temporal Validity</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {delegations.map((d) => {
                const isExpired = new Date(d.expires_at) < new Date();
                const effectiveStatus = d.status === 'ACTIVE' && isExpired ? 'EXPIRED' : d.status;

                return (
                  <tr key={d.id} className="hover:bg-surface/50 transition-colors">
                    <td className="py-3 px-4 font-mono">
                      <div className="font-bold text-accent">{d.fir_number}</div>
                      <div className="text-[11px] text-muted-text truncate max-w-xs">{d.case_title}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-bold text-primary-text">{d.granted_to_name}</div>
                      <div className="text-[11px] text-muted-text font-mono">
                        @{d.granted_to_username} • {d.granted_to_org_name}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-muted-text">
                      {d.granted_by_name}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex flex-wrap gap-1 max-w-xs">
                        {d.permissions?.map((p: string) => (
                          <span key={p} className="px-1.5 py-0.2 rounded bg-surface border border-border text-[10px] font-mono text-accent">
                            {p}
                          </span>
                        ))}
                      </div>
                      <div className="text-[10px] text-muted-darker mt-1 italic max-w-xs truncate" title={d.reason}>
                        &quot;{d.reason}&quot;
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px]">
                      <div>{new Date(d.starts_at).toLocaleDateString()} to</div>
                      <div className="text-muted-darker">{new Date(d.expires_at).toLocaleString()}</div>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold ${
                        effectiveStatus === 'ACTIVE' ? 'bg-success-light text-success border border-success/30' :
                        effectiveStatus === 'EXPIRED' ? 'bg-warning-light text-warning border border-warning/30' :
                        'bg-danger-light text-danger border border-danger/30'
                      }`}>
                        {effectiveStatus}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      {d.status === 'ACTIVE' && !isExpired && (d.granted_by_user_id === user?.userId || user?.roleId === 'MASTER_ADMIN') && (
                        <button
                          onClick={() => handleRevoke(d.id)}
                          className="text-xs text-danger hover:underline font-semibold"
                        >
                          Revoke Access
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Grant Modal */}
      {showGrantModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="glass-card p-6 border border-border w-full max-w-lg space-y-4">
            <h3 className="text-sm font-bold text-primary-text">Issue Temporary Delegated Access</h3>
            <form onSubmit={handleGrant} className="space-y-3 text-xs">
              <div>
                <label className="block text-muted-text mb-1">Target Case Workspace *</label>
                <select
                  required
                  className="input-field font-mono"
                  value={grantForm.caseId}
                  onChange={(e) => setGrantForm({ ...grantForm, caseId: e.target.value })}
                >
                  <option value="">Select Case</option>
                  {casesList.map((c: any) => (
                    <option key={c.id} value={c.id}>{c.fir_number} - {c.title}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-muted-text mb-1">Recipient Officer (Delegate) *</label>
                <select
                  required
                  className="input-field"
                  value={grantForm.grantedToUserId}
                  onChange={(e) => setGrantForm({ ...grantForm, grantedToUserId: e.target.value })}
                >
                  <option value="">Select Officer</option>
                  {usersList.filter((u: any) => u.id !== user?.userId).map((u: any) => (
                    <option key={u.id} value={u.id}>
                      {u.display_name} ({u.role_name} - {u.org_name})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-muted-text mb-1">Permissions to Grant *</label>
                <div className="grid grid-cols-2 gap-2 p-2 bg-surface rounded border border-border">
                  {allPermissions.map((perm) => (
                    <label key={perm} className="flex items-center gap-2 cursor-pointer text-[11px] font-mono">
                      <input
                        type="checkbox"
                        checked={grantForm.permissions.includes(perm)}
                        onChange={() => togglePermission(perm)}
                        className="rounded border-border text-accent focus:ring-accent"
                      />
                      <span>{perm}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-muted-text mb-1">Starts At *</label>
                  <input
                    required
                    type="datetime-local"
                    className="input-field font-mono"
                    value={grantForm.startsAt}
                    onChange={(e) => setGrantForm({ ...grantForm, startsAt: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-muted-text mb-1">Expires At *</label>
                  <input
                    required
                    type="datetime-local"
                    className="input-field font-mono"
                    value={grantForm.expiresAt}
                    onChange={(e) => setGrantForm({ ...grantForm, expiresAt: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className="block text-muted-text mb-1">Mandatory Official Justification / Reason *</label>
                <textarea
                  required
                  rows={2}
                  placeholder="e.g. Special joint SIT inquiry ordered by Superintendent of Police"
                  className="input-field font-mono"
                  value={grantForm.reason}
                  onChange={(e) => setGrantForm({ ...grantForm, reason: e.target.value })}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowGrantModal(false)} className="btn-secondary">Cancel</button>
                <button type="submit" className="btn-primary">Grant Temporary Access</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

