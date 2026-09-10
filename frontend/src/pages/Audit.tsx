import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { LockIcon, SearchIcon, Filter, ClockIcon, AlertCircleIcon } from '../components/Icons';

export const Audit: React.FC = () => {
  const { user, hasPermission } = useAuth();
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState('');
  const [resultFilter, setResultFilter] = useState('');
  const [selectedLog, setSelectedLog] = useState<any>(null);

  const [ledger, setLedger] = useState<any>(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  const verifyLedger = async () => {
    setLedgerLoading(true);
    try {
      const res = await api.get<any>('/ledger/verify');
      setLedger(res);
    } catch (err) {
      console.error(err);
      setLedger({ valid: false, reason: 'Verification request failed' });
    } finally {
      setLedgerLoading(false);
    }
  };

  useEffect(() => {
    verifyLedger();
  }, []);

  const fetchAuditLogs = async () => {
    setLoading(true);
    try {
      let url = '/audit?limit=150&';
      if (actionFilter) url += `action=${actionFilter}&`;
      if (resultFilter) url += `result=${resultFilter}&`;
      const res = await api.get<{ auditLogs: any[] }>(url);
      setLogs(res.auditLogs || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAuditLogs();
  }, [actionFilter, resultFilter]);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-primary-text flex items-center gap-2">
            <LockIcon className="w-5 h-5 text-accent" />
            <span>Immutable Security Audit Vault</span>
          </h1>
          <p className="text-xs text-muted-text font-mono mt-0.5">
            Cryptographic Append-Only Ledger • All System Access, Mutations & Policy Denials
          </p>
        </div>

        <span className="text-[11px] font-mono px-2.5 py-1 rounded bg-surface border border-border text-accent flex items-center gap-1.5 self-start sm:self-auto">
          <span className="w-2 h-2 rounded-full bg-accent animate-ping" />
          <span>Synchronous ACID Logging Active</span>
        </span>
      </div>

      {/* Hash-Chained Ledger Integrity */}
      <div className={`glass-card p-4 border ${
        ledger == null ? 'border-border'
          : ledger.valid ? 'border-emerald-600/40 bg-emerald-50/20' : 'border-red-600/50 bg-red-50/20'
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="text-xs font-bold text-primary-text flex items-center gap-2">
              <span>🔗 Cryptographic Ledger Integrity</span>
              {ledger != null && (
                <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                  ledger.valid
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    : 'bg-red-100 text-red-800 border border-red-300'
                }`}>
                  {ledger.valid ? 'CHAIN INTACT ✓' : 'CHAIN BROKEN ✗'}
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted-text font-mono mt-1">
              {ledgerLoading
                ? 'Recomputing SHA-256 chain and verifying Ed25519 body signatures…'
                : ledger == null
                  ? 'Not yet verified.'
                  : ledger.valid
                    ? `${ledger.totalBlocks} blocks verified • ${ledger.checkedSignatures} agency signatures checked • ${new Date(ledger.verifiedAt).toLocaleTimeString()}`
                    : `Tamper detected at block #${ledger.brokenAt ?? '?'} — ${ledger.reason}`}
            </p>
          </div>
          <button onClick={verifyLedger} disabled={ledgerLoading} className="btn-secondary text-xs self-start sm:self-auto">
            <span>{ledgerLoading ? 'Verifying…' : 'Re-verify Chain'}</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="w-full sm:w-64">
          <select
            className="input-field"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
          >
            <option value="">All Security Actions</option>
            <option value="LOGIN">User Login</option>
            <option value="LOGIN_FAILURE">Failed Login Attempt</option>
            <option value="AUTHZ_DENY">Authorization Denial (403)</option>
            <option value="CASE_CREATED">Case / FIR Created</option>
            <option value="CASE_UPDATED">Case Status Transition</option>
            <option value="EVIDENCE_CREATED">Evidence Registered</option>
            <option value="EVIDENCE_TRANSFERRED">Evidence Custody Handoff</option>
            <option value="FORENSIC_REPORT_ISSUED">Forensic Report Sealed</option>
            <option value="COURT_CASE_REGISTERED">Court Case Docketed</option>
            <option value="DOCUMENT_UPLOAD">Document Stored in Vault</option>
            <option value="DOCUMENT_DOWNLOAD">Document Vault Download</option>
            <option value="DELEGATION_GRANTED">Delegation Issued</option>
          </select>
        </div>

        <div className="w-full sm:w-48">
          <select
            className="input-field"
            value={resultFilter}
            onChange={(e) => setResultFilter(e.target.value)}
          >
            <option value="">All Decisions</option>
            <option value="ALLOW">ALLOW (Granted)</option>
            <option value="DENY">DENY (Blocked by Policy)</option>
          </select>
        </div>

        <button onClick={fetchAuditLogs} className="btn-secondary text-xs sm:ml-auto">
          <span>Refresh Ledger</span>
        </button>
      </div>

      {/* Audit Log Table */}
      <div className="glass-card overflow-hidden border border-border">
        {loading ? (
          <div className="p-8 text-center text-xs text-muted-text font-mono">Loading immutable audit ledger...</div>
        ) : logs.length === 0 ? (
          <div className="p-12 text-center text-xs text-muted-text">
            <LockIcon className="w-10 h-10 text-muted-darker mx-auto mb-2" />
            <h3 className="text-sm font-semibold text-primary-text">No Audit Entries Found</h3>
            <p className="mt-1">No security audit events match the selected filters within your scope.</p>
          </div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="bg-surface border-b border-border text-[11px] font-mono uppercase text-muted-text">
              <tr>
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">Action</th>
                <th className="py-3 px-4">Gate Decision</th>
                <th className="py-3 px-4">Actor & Station</th>
                <th className="py-3 px-4">Resource & Case</th>
                <th className="py-3 px-4">IP & Network</th>
                <th className="py-3 px-4 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border font-mono text-[11.5px]">
              {logs.map((log) => (
                <tr
                  key={log.id}
                  onClick={() => setSelectedLog(log)}
                  className="hover:bg-surface/50 cursor-pointer transition-colors"
                >
                  <td className="py-3 px-4 text-muted-text text-[11px]">
                    {new Date(log.timestamp).toLocaleString()}
                  </td>
                  <td className="py-3 px-4">
                    <span className="font-bold text-primary-text">{log.action}</span>
                    <div className="text-[10px] text-muted-darker">{log.resource_type}</div>
                  </td>
                  <td className="py-3 px-4">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      log.result === 'ALLOW' ? 'bg-success-light text-success border border-success/30' :
                      'bg-danger-light text-danger border border-danger/30'
                    }`}>
                      {log.result}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <div className="text-accent font-semibold">{log.display_name || log.username || 'System Daemon'}</div>
                    <div className="text-[10px] text-muted-darker">{log.org_code || log.organization_id}</div>
                  </td>
                  <td className="py-3 px-4">
                    {log.fir_number ? (
                      <span className="text-primary-text font-bold">{log.fir_number}</span>
                    ) : (
                      <span className="text-muted-darker">-</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-[10.5px] text-muted-text">
                    <div>{log.ip_address || '127.0.0.1'}</div>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <span className="text-xs text-accent hover:underline font-semibold font-sans">
                      Inspect Diff →
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Diff Inspector Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="glass-card p-6 border border-border w-full max-w-2xl space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <span className="text-[10.5px] font-mono text-muted-text block">AUDIT RECORD ID: {selectedLog.id}</span>
                <div className="text-base font-bold font-mono text-primary-text flex items-center gap-2 mt-0.5">
                  <span>{selectedLog.action}</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] ${
                    selectedLog.result === 'ALLOW' ? 'bg-success-light text-success' : 'bg-danger-light text-danger'
                  }`}>
                    {selectedLog.result}
                  </span>
                </div>
              </div>
              <button onClick={() => setSelectedLog(null)} className="text-muted-text hover:text-primary-text">✕</button>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs font-mono">
              <div className="p-3 bg-surface rounded border border-border">
                <span className="text-muted-text text-[10.5px] block">ACTOR DETAILS</span>
                <div className="font-bold text-primary-text mt-1">{selectedLog.display_name} (@{selectedLog.username})</div>
                <div className="text-muted-darker text-[11px]">{selectedLog.org_name} ({selectedLog.org_code})</div>
              </div>
              <div className="p-3 bg-surface rounded border border-border">
                <span className="text-muted-text text-[10.5px] block">SECURITY CONTEXT</span>
                <div className="text-primary-text mt-1">IP: {selectedLog.ip_address || '127.0.0.1'}</div>
                <div className="text-muted-darker text-[10px] truncate">{selectedLog.user_agent || 'Mozilla/5.0'}</div>
              </div>
            </div>

            {selectedLog.before_value && (
              <div>
                <span className="text-xs font-mono font-bold uppercase text-muted-text block mb-1">
                  Prior State (Before Value)
                </span>
                <pre className="p-3 bg-surface rounded border border-border font-mono text-[11px] text-muted-text overflow-x-auto">
                  {JSON.stringify(selectedLog.before_value, null, 2)}
                </pre>
              </div>
            )}

            {selectedLog.after_value && (
              <div>
                <span className="text-xs font-mono font-bold uppercase text-muted-text block mb-1">
                  Mutated State / Payload (After Value)
                </span>
                <pre className="p-3 bg-surface rounded border border-border font-mono text-[11px] text-accent overflow-x-auto">
                  {JSON.stringify(selectedLog.after_value, null, 2)}
                </pre>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button onClick={() => setSelectedLog(null)} className="btn-secondary text-xs">Close Inspector</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

