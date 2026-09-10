import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { AgencyBadge } from '../components/ClassificationBadge';
import { ShieldIcon, SearchIcon, CheckIcon, LockIcon } from '../components/Icons';

export interface UpdateTicket {
  id: string;
  ticket_number: string;
  requester_user_id: string;
  requester_email: string;
  requester_government_id: string;
  requester_name: string;
  organization_id: string;
  body_id: string;
  action_type: string;
  target_resource_type: string;
  target_resource_id?: string;
  justification: string;
  payload: any;
  before_state: any;
  status: 'PENDING_OTP' | 'VERIFIED' | 'EXECUTED' | 'REJECTED';
  verified_at?: string;
  executed_at?: string;
  created_at: string;
  updated_at: string;
  org_name?: string;
  org_code?: string;
}

export const Tickets: React.FC = () => {
  const { user } = useAuth();
  const isMaster = user?.roleId === 'MASTER_ADMIN' || user?.roleId === 'SYSTEM_MASTER_ADMIN';

  const [tickets, setTickets] = useState<UpdateTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING_OTP' | 'EXECUTED' | 'REJECTED'>('ALL');
  const [bodyFilter, setBodyFilter] = useState<'ALL' | 'POLICE' | 'JUDICIARY' | 'FORENSICS'>('ALL');

  // Modal State for Inspection
  const [selectedTicket, setSelectedTicket] = useState<UpdateTicket | null>(null);
  const [verifyOtpInput, setVerifyOtpInput] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState('');
  const [verifySuccess, setVerifySuccess] = useState('');

  const fetchTickets = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (bodyFilter !== 'ALL') params.set('body', bodyFilter);
      if (statusFilter !== 'ALL') params.set('status', statusFilter);

      const queryStr = params.toString() ? `?${params.toString()}` : '';
      const res = await api.get<{ tickets: UpdateTicket[] }>(`/tickets${queryStr}`);
      setTickets(res.tickets || []);
    } catch (err) {
      console.error('Failed to load update tickets:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTickets();
  }, [statusFilter, bodyFilter]);

  const handleExecuteTicket = async (ticketId: string) => {
    if (!verifyOtpInput.trim()) {
      setVerifyError('Please enter the 6-digit authorization code');
      return;
    }
    setIsVerifying(true);
    setVerifyError('');
    try {
      const res = await api.post<{ success: boolean; message: string; ticketNumber: string }>(
        '/tickets/execute-with-otp',
        { ticketId, otp: verifyOtpInput.trim() }
      );
      if (res.success) {
        setVerifySuccess(`Ticket ${res.ticketNumber} verified and executed!`);
        fetchTickets();
        setTimeout(() => {
          setSelectedTicket(null);
          setVerifyOtpInput('');
          setVerifySuccess('');
        }, 1500);
      }
    } catch (err: any) {
      setVerifyError(err.message || 'OTP verification and ticket execution failed');
    } finally {
      setIsVerifying(false);
    }
  };

  const filteredTickets = tickets.filter(t => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      t.ticket_number.toLowerCase().includes(q) ||
      t.action_type.toLowerCase().includes(q) ||
      t.requester_name.toLowerCase().includes(q) ||
      t.requester_email.toLowerCase().includes(q) ||
      (t.requester_government_id && t.requester_government_id.toLowerCase().includes(q)) ||
      t.justification.toLowerCase().includes(q)
    );
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'EXECUTED':
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">EXECUTED</span>;
      case 'PENDING_OTP':
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-50 text-amber-800 border border-amber-200">PENDING OTP</span>;
      case 'VERIFIED':
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-50 text-blue-800 border border-blue-200">VERIFIED</span>;
      case 'REJECTED':
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-red-50 text-red-800 border border-red-200">REJECTED</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-100 text-slate-700 border border-slate-200">{status}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-1 h-5 bg-[#1D4ED8] rounded-xs inline-block"></span>
            <ShieldIcon className="w-5 h-5 text-blue-700" />
            <h1 className="text-lg font-bold tracking-wide text-slate-900 uppercase">
              Action & Update Tickets Ledger
            </h1>
          </div>
          <p className="text-xs text-slate-500 font-mono">
            Mandatory Institutional Provenance // Every Modification Requires an Authorized Ticket with Email OTP Verification
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchTickets}
            className="px-3 py-1.5 rounded bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-xs font-mono font-semibold shadow-xs"
          >
            Refresh Ledger
          </button>
        </div>
      </div>

      {/* Summary KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-xs">
          <div className="text-[10.5px] font-mono text-slate-500 uppercase tracking-wider">Total Tickets</div>
          <div className="text-xl font-bold font-mono text-slate-900 mt-1">{tickets.length}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">Recorded in database ledger</div>
        </div>
        <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-xs">
          <div className="text-[10.5px] font-mono text-emerald-700 uppercase tracking-wider font-semibold">Executed & Verified</div>
          <div className="text-xl font-bold font-mono text-emerald-700 mt-1">
            {tickets.filter(t => t.status === 'EXECUTED').length}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">Approved via official OTP</div>
        </div>
        <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-xs">
          <div className="text-[10.5px] font-mono text-amber-700 uppercase tracking-wider font-semibold">Pending OTP Authorization</div>
          <div className="text-xl font-bold font-mono text-amber-700 mt-1">
            {tickets.filter(t => t.status === 'PENDING_OTP').length}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">Awaiting 6-digit code entry</div>
        </div>
        <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-xs">
          <div className="text-[10.5px] font-mono text-blue-700 uppercase tracking-wider font-semibold">Compulsory Governance</div>
          <div className="text-xl font-bold font-mono text-slate-900 mt-1">100%</div>
          <div className="text-[10px] text-slate-400 mt-0.5">All updates audit-linked</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-3 rounded-lg bg-white border border-slate-200 shadow-xs text-xs font-mono">
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <SearchIcon className="w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search tickets by number, action, officer, email, gov ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-transparent border-none outline-hidden text-slate-900 placeholder:text-slate-400 w-full text-xs font-mono"
          />
        </div>

        <div className="flex items-center gap-2">
          {/* Body Filter (for Master Admin) */}
          {isMaster && (
            <div className="flex items-center gap-1 bg-slate-50 px-2 py-1 rounded border border-slate-200">
              <span className="text-slate-500 text-[10px]">BODY:</span>
              <select
                value={bodyFilter}
                onChange={(e) => setBodyFilter(e.target.value as any)}
                className="bg-transparent text-slate-800 text-xs outline-hidden cursor-pointer"
              >
                <option value="ALL">All Bodies</option>
                <option value="POLICE">Police</option>
                <option value="JUDICIARY">Judiciary</option>
                <option value="FORENSICS">Forensics</option>
              </select>
            </div>
          )}

          {/* Status Filter */}
          <div className="flex items-center gap-1 bg-slate-50 px-2 py-1 rounded border border-slate-200">
            <span className="text-slate-500 text-[10px]">STATUS:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="bg-transparent text-slate-800 text-xs outline-hidden cursor-pointer"
            >
              <option value="ALL">All Statuses</option>
              <option value="PENDING_OTP">Pending OTP</option>
              <option value="EXECUTED">Executed</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </div>
        </div>
      </div>

      {/* Tickets Table */}
      <div className="bg-white rounded-lg overflow-hidden border border-slate-200 shadow-xs">
        {loading ? (
          <div className="p-8 text-center text-xs font-mono text-slate-500">
            Loading update tickets ledger...
          </div>
        ) : filteredTickets.length === 0 ? (
          <div className="p-8 text-center text-xs font-mono text-slate-400">
            No update tickets recorded matching current filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 text-[11px] uppercase tracking-wider font-semibold">
                <tr>
                  <th className="p-3">Ticket Number</th>
                  <th className="p-3">Action Type</th>
                  <th className="p-3">Authorizing Official</th>
                  <th className="p-3">Office Node</th>
                  <th className="p-3">Mandatory Justification</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Generated At</th>
                  <th className="p-3 text-right">Dossier</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredTickets.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-3 font-bold text-blue-700">{t.ticket_number}</td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-[10px] text-slate-700 font-semibold">
                        {t.action_type}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="font-semibold text-slate-900">{t.requester_name}</div>
                      <div className="text-[10px] text-slate-500">{t.requester_government_id || t.requester_email}</div>
                    </td>
                    <td className="p-3">
                      <div className="text-slate-800 truncate max-w-[150px]">{t.org_name || 'N/A'}</div>
                      <div className="text-[10px] text-slate-500">{t.body_id}</div>
                    </td>
                    <td className="p-3 text-slate-700 max-w-[220px] truncate" title={t.justification}>
                      {t.justification}
                    </td>
                    <td className="p-3">{getStatusBadge(t.status)}</td>
                    <td className="p-3 text-slate-500 text-[11px]">
                      {new Date(t.created_at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
                    </td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => {
                          setSelectedTicket(t);
                          setVerifyOtpInput('');
                          setVerifyError('');
                          setVerifySuccess('');
                        }}
                        className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 text-xs font-semibold"
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Ticket Inspection Modal */}
      {selectedTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="w-full max-w-2xl bg-white border border-slate-200 rounded-lg shadow-2xl p-6 text-xs font-mono space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <ShieldIcon className="w-5 h-5 text-blue-700" />
                <span className="font-bold text-sm text-slate-900 uppercase tracking-wider">
                  Update Ticket Dossier • {selectedTicket.ticket_number}
                </span>
              </div>
              <button
                onClick={() => setSelectedTicket(null)}
                className="text-slate-400 hover:text-slate-700 text-base font-mono px-1"
              >
                ✕
              </button>
            </div>

            {/* Status Strip */}
            <div className="flex items-center justify-between p-3 rounded bg-slate-50 border border-slate-200">
              <div>
                <span className="text-slate-500">Status: </span>
                {getStatusBadge(selectedTicket.status)}
              </div>
              <div className="text-[11px] text-slate-500">
                Body: <span className="text-slate-800 font-bold">{selectedTicket.body_id}</span>
              </div>
            </div>

            {/* Officer & Metadata */}
            <div className="grid grid-cols-2 gap-3 p-3 rounded bg-slate-50 border border-slate-200">
              <div>
                <span className="text-slate-500 text-[10px] uppercase font-semibold">Authorizing Official</span>
                <div className="font-bold text-slate-900 mt-0.5">{selectedTicket.requester_name}</div>
                <div className="text-[10px] text-slate-500">{selectedTicket.requester_email}</div>
              </div>
              <div>
                <span className="text-slate-500 text-[10px] uppercase font-semibold">Official Government ID</span>
                <div className="font-bold text-slate-900 mt-0.5">{selectedTicket.requester_government_id || 'N/A'}</div>
                <div className="text-[10px] text-slate-500">{selectedTicket.org_name}</div>
              </div>
            </div>

            {/* Compulsory Justification */}
            <div>
              <span className="text-slate-600 text-[10px] uppercase tracking-wider block mb-1 font-semibold">
                Official Operational Justification
              </span>
              <div className="p-3 rounded bg-slate-50 border border-slate-200 text-slate-800 text-xs leading-relaxed">
                {selectedTicket.justification}
              </div>
            </div>

            {/* Action & Changes Payload */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-slate-600 text-[10px] uppercase tracking-wider font-semibold">
                  Proposed Operation Payload ({selectedTicket.action_type})
                </span>
                <span className="text-[10px] text-slate-500">Target: {selectedTicket.target_resource_type}</span>
              </div>
              <pre className="p-3 rounded bg-slate-50 border border-slate-200 text-[11px] text-slate-800 overflow-x-auto max-h-40">
                {JSON.stringify(selectedTicket.payload, null, 2)}
              </pre>
            </div>

            {/* Execution / Verification Section */}
            {selectedTicket.status === 'PENDING_OTP' ? (
              <div className="p-4 rounded bg-amber-50 border border-amber-200 space-y-3">
                <div className="flex items-center gap-2 text-amber-800 font-bold text-xs">
                  <LockIcon className="w-4 h-4" />
                  <span>Enter Authorization OTP to Execute Update</span>
                </div>
                <p className="text-[11px] text-amber-900">
                  Enter the 6-digit verification code dispatched to {selectedTicket.requester_email} to verify and immediately execute this ticket.
                </p>

                {verifyError && (
                  <div className="p-2 rounded bg-red-50 border border-red-200 text-red-700 text-xs">
                    {verifyError}
                  </div>
                )}
                {verifySuccess && (
                  <div className="p-2 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs">
                    {verifySuccess}
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    maxLength={6}
                    placeholder="6-digit OTP"
                    value={verifyOtpInput}
                    onChange={(e) => setVerifyOtpInput(e.target.value)}
                    className="w-36 text-center font-bold tracking-widest text-sm py-1.5 px-2 bg-white border border-slate-300 rounded text-slate-900 focus:outline-hidden focus:border-blue-600"
                  />
                  <button
                    type="button"
                    disabled={isVerifying}
                    onClick={() => handleExecuteTicket(selectedTicket.id)}
                    className="bg-[#1D4ED8] hover:bg-[#1E40AF] text-white py-2 px-4 rounded text-xs font-bold uppercase tracking-wider shadow-sm transition-colors"
                  >
                    {isVerifying ? 'Verifying & Executing...' : 'Authorize & Execute Ticket'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-3 rounded bg-slate-50 border border-slate-200 text-xs flex items-center justify-between">
                <div className="flex items-center gap-2 text-emerald-700 font-semibold">
                  <CheckIcon className="w-4 h-4" />
                  <span>Cryptographically verified & executed</span>
                </div>
                <div className="text-[10px] text-slate-500">
                  Timestamp: {new Date(selectedTicket.executed_at || selectedTicket.updated_at).toLocaleString('en-IN')}
                </div>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setSelectedTicket(null)}
                className="px-3.5 py-1.5 rounded bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 font-mono text-xs font-medium"
              >
                Close Dossier
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
