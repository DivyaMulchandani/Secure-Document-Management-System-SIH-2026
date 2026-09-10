import React, { useState, useEffect } from 'react';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar,
  PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend
} from 'recharts';
import { api } from '../../lib/api';
import { StatusBadge } from '../ClassificationBadge';

interface AnalyticsData {
  summary: {
    totalTickets: number;
    executedTickets: number;
    pendingOtpTickets: number;
    rejectedTickets: number;
    complianceRate: number;
    successfulLogins: number;
    failedAttempts: number;
    lockouts: number;
  };
  ticketStatus: Array<{ name: string; value: number; color: string }>;
  actionTypes: Array<{ action: string; count: number }>;
  timeline: Array<{ date: string; day: string; generated: number; executed: number }>;
  agencyDistribution: Array<{
    id: string;
    name: string;
    code: string;
    offices: number;
    personnel: number;
    admins: number;
    cases: number;
  }>;
  hierarchyLevels: Array<{
    level: number;
    label: string;
    total: number;
    police: number;
    judiciary: number;
    forensics: number;
  }>;
  recentTickets: Array<{
    id: string;
    ticket_number: string;
    action_type: string;
    status: string;
    requester_name: string;
    requester_email: string;
    created_at: string;
    executed_at: string;
    org_name: string;
  }>;
}

export const AdminAnalyticsDashboard: React.FC = () => {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<any>('/system/analytics/dashboard');
      if (res.success) {
        setData(res);
      }
    } catch (err: any) {
      console.error('Failed to load analytics dashboard:', err);
      setError(err.message || 'Failed to load telemetry metrics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, []);

  if (loading) {
    return (
      <div className="p-12 text-center bg-white border border-slate-300 rounded-lg shadow-xs">
        <div className="w-8 h-8 border-3 border-blue-700 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <div className="text-xs font-mono font-bold text-slate-700 uppercase tracking-wider">
          Aggregating High-Security Telemetry & Visual Audit Metrics...
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-8 text-center bg-white border border-red-300 rounded-lg text-red-900 shadow-xs">
        <div className="font-bold text-sm mb-1 font-mono uppercase">Telemetry Aggregation Failure</div>
        <p className="text-xs text-slate-600 mb-4">{error}</p>
        <button
          onClick={fetchAnalytics}
          className="px-3 py-1.5 bg-blue-700 hover:bg-blue-800 text-white rounded font-mono text-xs font-semibold cursor-pointer"
        >
          Retry Telemetry Query
        </button>
      </div>
    );
  }

  const { summary } = data;

  return (
    <div className="space-y-6">
      {/* Telemetry Summary Counters */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-300 rounded-lg p-4 shadow-xs">
          <div className="flex items-center justify-between text-[11px] font-mono font-bold uppercase text-slate-500 mb-1">
            <span>Compulsory Tickets</span>
            <span className="w-2 h-2 rounded-full bg-blue-600" />
          </div>
          <div className="text-2xl font-bold font-mono text-slate-900">
            {summary.totalTickets}
          </div>
          <div className="text-[11px] font-mono text-slate-600 mt-1 flex items-center justify-between">
            <span>Executed: <strong className="text-emerald-700">{summary.executedTickets}</strong></span>
            <span>Pending: <strong className="text-amber-700">{summary.pendingOtpTickets}</strong></span>
          </div>
        </div>

        <div className="bg-white border border-slate-300 rounded-lg p-4 shadow-xs">
          <div className="flex items-center justify-between text-[11px] font-mono font-bold uppercase text-slate-500 mb-1">
            <span>Authorization Rate</span>
            <span className="w-2 h-2 rounded-full bg-emerald-600" />
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-700">
            {summary.complianceRate}%
          </div>
          <div className="text-[11px] font-mono text-slate-600 mt-1">
            OTP Verified & Executed Actions
          </div>
        </div>

        <div className="bg-white border border-slate-300 rounded-lg p-4 shadow-xs">
          <div className="flex items-center justify-between text-[11px] font-mono font-bold uppercase text-slate-500 mb-1">
            <span>Authentication Velocity</span>
            <span className="w-2 h-2 rounded-full bg-indigo-600" />
          </div>
          <div className="text-2xl font-bold font-mono text-slate-900">
            {summary.successfulLogins}
          </div>
          <div className="text-[11px] font-mono text-slate-600 mt-1">
            Successful Passwordless Logins
          </div>
        </div>

        <div className="bg-white border border-slate-300 rounded-lg p-4 shadow-xs">
          <div className="flex items-center justify-between text-[11px] font-mono font-bold uppercase text-slate-500 mb-1">
            <span>Security Denials</span>
            <span className="w-2 h-2 rounded-full bg-red-600" />
          </div>
          <div className="text-2xl font-bold font-mono text-red-700">
            {summary.failedAttempts}
          </div>
          <div className="text-[11px] font-mono text-slate-600 mt-1">
            Lockouts Enforced: <strong className="text-red-800">{summary.lockouts}</strong>
          </div>
        </div>
      </div>

      {/* Main Graphs Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Ticket Throughput & Execution Velocity Area Chart */}
        <div className="bg-white border border-slate-300 rounded-lg p-5 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3 mb-4">
            <div>
              <h3 className="text-sm font-bold font-mono text-slate-900 uppercase tracking-wide">
                Ticket Throughput & Execution Velocity (7 Days)
              </h3>
              <p className="text-[11px] text-slate-500 font-mono">
                Daily update tickets requested vs verified and executed
              </p>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-50 text-blue-800 border border-blue-300">
              AUDITED TIMELINE
            </span>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.timeline} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorGenerated" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#1E40AF" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#1E40AF" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="colorExecuted" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#059669" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#059669" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="day" stroke="#64748B" fontSize={11} fontStyle="bold" />
                <YAxis stroke="#64748B" fontSize={11} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#FFFFFF',
                    borderColor: '#CBD5E1',
                    borderRadius: '4px',
                    fontSize: '11.5px',
                    fontFamily: 'monospace',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', fontFamily: 'monospace' }} />
                <Area type="monotone" dataKey="generated" name="Tickets Generated" stroke="#1E40AF" strokeWidth={2} fillOpacity={1} fill="url(#colorGenerated)" />
                <Area type="monotone" dataKey="executed" name="Tickets Executed" stroke="#059669" strokeWidth={2} fillOpacity={1} fill="url(#colorExecuted)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Ticket Status Breakdown Donut Chart */}
        <div className="bg-white border border-slate-300 rounded-lg p-5 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3 mb-4">
            <div>
              <h3 className="text-sm font-bold font-mono text-slate-900 uppercase tracking-wide">
                Update Ticket Lifecycle Resolution
              </h3>
              <p className="text-[11px] text-slate-500 font-mono">
                Current status distribution across all governance tickets
              </p>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-100 text-slate-800 border border-slate-300">
              STATUS BREAKDOWN
            </span>
          </div>

          <div className="h-64 w-full flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data.ticketStatus}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={4}
                  dataKey="value"
                  label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`}
                >
                  {data.ticketStatus.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} stroke="#FFFFFF" strokeWidth={2} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#FFFFFF',
                    borderColor: '#CBD5E1',
                    borderRadius: '4px',
                    fontSize: '11.5px',
                    fontFamily: 'monospace',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', fontFamily: 'monospace' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Second Row: Sovereign Agency Distribution & Hierarchy Depth */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sovereign Agency Distribution Bar Chart */}
        <div className="bg-white border border-slate-300 rounded-lg p-5 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3 mb-4">
            <div>
              <h3 className="text-sm font-bold font-mono text-slate-900 uppercase tracking-wide">
                Sovereign Agency Deployment Distribution
              </h3>
              <p className="text-[11px] text-slate-500 font-mono">
                Offices, Personnel, and Active Administrators per sovereign body
              </p>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-50 text-blue-800 border border-blue-300">
              3-BODY MATRIX
            </span>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.agencyDistribution} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="code" stroke="#64748B" fontSize={11} fontStyle="bold" />
                <YAxis stroke="#64748B" fontSize={11} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#FFFFFF',
                    borderColor: '#CBD5E1',
                    borderRadius: '4px',
                    fontSize: '11.5px',
                    fontFamily: 'monospace',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', fontFamily: 'monospace' }} />
                <Bar dataKey="offices" name="Offices" fill="#1E40AF" radius={[2, 2, 0, 0]} />
                <Bar dataKey="personnel" name="Personnel" fill="#059669" radius={[2, 2, 0, 0]} />
                <Bar dataKey="admins" name="Admins" fill="#D97706" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Hierarchy Depth Distribution */}
        <div className="bg-white border border-slate-300 rounded-lg p-5 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3 mb-4">
            <div>
              <h3 className="text-sm font-bold font-mono text-slate-900 uppercase tracking-wide">
                Hierarchy Depth & Layer Distribution
              </h3>
              <p className="text-[11px] text-slate-500 font-mono">
                Total nodes organized across institutional command levels
              </p>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-100 text-slate-800 border border-slate-300">
              DEPTH PROFILE
            </span>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.hierarchyLevels} layout="vertical" margin={{ top: 10, right: 20, left: 40, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis type="number" stroke="#64748B" fontSize={11} />
                <YAxis type="category" dataKey="label" stroke="#64748B" fontSize={10} width={130} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#FFFFFF',
                    borderColor: '#CBD5E1',
                    borderRadius: '4px',
                    fontSize: '11.5px',
                    fontFamily: 'monospace',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', fontFamily: 'monospace' }} />
                <Bar dataKey="police" name="Police" fill="#1E40AF" stackId="a" radius={[0, 2, 2, 0]} />
                <Bar dataKey="judiciary" name="Judiciary" fill="#059669" stackId="a" />
                <Bar dataKey="forensics" name="Forensics" fill="#4338CA" stackId="a" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Recent High-Impact Governance Tickets Feed */}
      <div className="bg-white border border-slate-300 rounded-lg p-5 shadow-xs">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3 mb-4">
          <div>
            <h3 className="text-sm font-bold font-mono text-slate-900 uppercase tracking-wide">
              Recent High-Impact Institutional Update Tickets
            </h3>
            <p className="text-[11px] text-slate-500 font-mono">
              Cryptographically verified tickets modifying organizational nodes and user credentials
            </p>
          </div>
          <button
            onClick={fetchAnalytics}
            className="px-2.5 py-1 text-xs font-mono font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded transition-colors cursor-pointer"
          >
            Refresh Telemetry
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-300 text-slate-800 font-bold">
                <th className="py-2.5 px-3">Ticket Number</th>
                <th className="py-2.5 px-3">Action Type</th>
                <th className="py-2.5 px-3">Target Office</th>
                <th className="py-2.5 px-3">Requester Official</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {data.recentTickets.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                  <td className="py-2.5 px-3 font-bold text-blue-900">{t.ticket_number}</td>
                  <td className="py-2.5 px-3 text-slate-700">{t.action_type}</td>
                  <td className="py-2.5 px-3 text-slate-800 font-semibold">{t.org_name || 'System Root'}</td>
                  <td className="py-2.5 px-3 text-slate-600">
                    <div>{t.requester_name || 'Admin'}</div>
                    <div className="text-[10px] text-slate-400">{t.requester_email}</div>
                  </td>
                  <td className="py-2.5 px-3">
                    <StatusBadge status={t.status} />
                  </td>
                  <td className="py-2.5 px-3 text-slate-500 text-[11px]">
                    {new Date(t.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
              {data.recentTickets.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-6 text-slate-500 font-mono text-xs">
                    No recent governance tickets found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

