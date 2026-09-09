import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { StatusBadge } from '../components/ClassificationBadge';
import { ScaleIcon, SearchIcon, PlusIcon, FileTextIcon } from '../components/Icons';

export const Court: React.FC = () => {
  const { user, hasPermission } = useAuth();
  const navigate = useNavigate();

  const [courtCases, setCourtCases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchCourtCases = async () => {
    setLoading(true);
    try {
      const res = await api.get<{ courtCases: any[] }>('/court/cases');
      setCourtCases(res.courtCases || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCourtCases();
  }, []);

  const filtered = courtCases.filter(cc => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      cc.cnr_number?.toLowerCase().includes(q) ||
      cc.case_title?.toLowerCase().includes(q) ||
      cc.fir_number?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-primary-text flex items-center gap-2">
            <ScaleIcon className="w-5 h-5 text-amber-400" />
            <span>Judicial Court & Trial Adjudication Workspace</span>
          </h1>
          <p className="text-xs text-muted-text font-mono mt-0.5">
            Gujarat High Court, Sessions Courts & Subdivisional Magistracy • Scope: {user?.organizationName}
          </p>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative max-w-md">
        <SearchIcon className="w-4 h-4 text-muted-text absolute left-3 top-2.5" />
        <input
          type="text"
          placeholder="Filter by CNR Number, FIR, or title..."
          className="input-field pl-9"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Cases Table */}
      <div className="glass-card overflow-hidden border border-border">
        {loading ? (
          <div className="p-8 text-center text-xs text-muted-text font-mono">Loading court docket...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-xs text-muted-text">
            <ScaleIcon className="w-10 h-10 text-muted-darker mx-auto mb-2" />
            <h3 className="text-sm font-semibold text-primary-text">No Court Cases Found</h3>
            <p className="mt-1">No court proceedings or docket entries recorded in your judicial jurisdiction.</p>
          </div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="bg-surface border-b border-border text-[11px] font-mono uppercase text-muted-text">
              <tr>
                <th className="py-3 px-4">CNR Number</th>
                <th className="py-3 px-4">Originating FIR & Title</th>
                <th className="py-3 px-4">Court Establishment</th>
                <th className="py-3 px-4">Presiding Judge</th>
                <th className="py-3 px-4">Trial Stage / Status</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((cc) => (
                <tr
                  key={cc.id}
                  onClick={() => navigate(`/cases/${cc.case_id}`)}
                  className="hover:bg-surface/50 cursor-pointer transition-colors"
                >
                  <td className="py-3 px-4 font-mono font-bold text-accent">
                    <div>{cc.cnr_number}</div>
                    <div className="text-[10px] text-muted-darker">Filed: {new Date(cc.filing_date).toLocaleDateString()}</div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="font-semibold text-primary-text">{cc.case_title}</div>
                    <div className="text-[11px] text-muted-text font-mono">FIR: {cc.fir_number}</div>
                  </td>
                  <td className="py-3 px-4 font-mono text-[11px]">
                    <div>{cc.court_organization_name}</div>
                    <div className="text-muted-darker">{cc.court_organization_code}</div>
                  </td>
                  <td className="py-3 px-4 text-primary-text font-mono text-[11px]">
                    {cc.presiding_judge_name || 'Designated Bench'}
                  </td>
                  <td className="py-3 px-4">
                    <StatusBadge status={cc.status} />
                  </td>
                  <td className="py-3 px-4 text-right">
                    <span className="text-xs font-semibold text-accent hover:underline">
                      Open Adjudication →
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

