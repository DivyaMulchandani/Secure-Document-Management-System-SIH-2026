import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { StatusBadge } from '../components/ClassificationBadge';
import {
  SearchIcon, FileTextIcon, UsersIcon, ShieldIcon, ScaleIcon, ArrowRight
} from '../components/Icons';

export const Search: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<{
    cases: any[];
    persons: any[];
    evidence: any[];
    courtCases: any[];
  }>({ cases: [], persons: [], evidence: [], courtCases: [] });

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults({ cases: [], persons: [], evidence: [], courtCases: [] });
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await api.get<any>(`/search?q=${encodeURIComponent(query.trim())}`);
        setResults(res.results || { cases: [], persons: [], evidence: [], courtCases: [] });
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [query]);

  const totalResults =
    results.cases.length + results.persons.length + results.evidence.length + results.courtCases.length;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Search Header */}
      <div className="text-center space-y-2 py-4">
        <h1 className="text-2xl font-bold tracking-tight text-primary-text flex items-center justify-center gap-2">
          <SearchIcon className="w-6 h-6 text-accent" />
          <span>Global Scoped Justice Search</span>
        </h1>
        <p className="text-xs text-muted-text font-mono max-w-lg mx-auto">
          Multi-agency search engine across active cases, accused persons, evidence exhibits, and court dockets within your strict authorization boundary.
        </p>
      </div>

      {/* Main Search Input */}
      <div className="relative">
        <SearchIcon className="w-5 h-5 text-muted-text absolute left-4 top-3.5" />
        <input
          type="text"
          autoFocus
          placeholder="Search by FIR number, suspect name, Aadhaar, evidence tag, or CNR..."
          className="input-field pl-12 py-3 text-sm font-mono shadow-sm"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {loading && (
          <div className="absolute right-4 top-3.5 text-xs font-mono text-muted-text animate-pulse">
            Filtering Scope...
          </div>
        )}
      </div>

      {/* Scope Security Notice */}
      <div className="flex items-center justify-between p-3 rounded bg-surface border border-border text-xs font-mono text-muted-text">
        <span>Active Jurisdictional Envelope: <strong className="text-primary-text">{user?.organizationName}</strong></span>
        <span className="text-accent font-bold">Zero-Leakage Guarantee Active</span>
      </div>

      {/* Search Results Display */}
      {query.trim().length >= 2 && !loading && totalResults === 0 && (
        <div className="p-12 text-center text-xs text-muted-text glass-card border border-border">
          <SearchIcon className="w-10 h-10 text-muted-darker mx-auto mb-2" />
          <h3 className="text-sm font-semibold text-primary-text">No Matches Found</h3>
          <p className="mt-1">
            No authorized records matched &quot;{query}&quot; within your vertical subtree and participation scope.
          </p>
        </div>
      )}

      {totalResults > 0 && (
        <div className="space-y-6">
          {/* Cases Results */}
          {results.cases.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-mono font-bold uppercase text-muted-text">
                <FileTextIcon className="w-4 h-4 text-accent" />
                <span>Cases & FIRs ({results.cases.length})</span>
              </div>
              <div className="glass-card divide-y divide-border border border-border overflow-hidden">
                {results.cases.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => navigate(`/cases/${c.id}`)}
                    className="p-3.5 hover:bg-surface/60 cursor-pointer flex items-center justify-between text-xs transition-colors"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-accent">{c.fir_number}</span>
                        <span className="font-semibold text-primary-text">{c.title}</span>
                        <StatusBadge status={c.status} />
                      </div>
                      <div className="text-[11px] text-muted-text font-mono mt-0.5">
                        Station: {c.org_name} • Location: {c.incident_location} • Year: {c.year}
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-text" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Persons Results */}
          {results.persons.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-mono font-bold uppercase text-muted-text">
                <UsersIcon className="w-4 h-4 text-blue-400" />
                <span>Persons & Accused ({results.persons.length})</span>
              </div>
              <div className="glass-card divide-y divide-border border border-border overflow-hidden">
                {results.persons.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => navigate(`/cases/${p.case_id}`)}
                    className="p-3.5 hover:bg-surface/60 cursor-pointer flex items-center justify-between text-xs transition-colors"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-primary-text">{p.full_name}</span>
                        {p.alias && <span className="text-muted-text font-mono text-[11px]">({p.alias})</span>}
                        <span className="px-1.5 py-0.2 rounded font-mono text-[10px] bg-surface border border-border text-accent">
                          {p.role_in_case}
                        </span>
                      </div>
                      <div className="text-[11px] text-muted-text font-mono mt-0.5">
                        Case FIR: <span className="text-accent font-bold">{p.fir_number}</span>
                        {p.id_proof_number && ` • ID Proof: ${p.id_proof_number}`}
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-text" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Evidence Results */}
          {results.evidence.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-mono font-bold uppercase text-muted-text">
                <ShieldIcon className="w-4 h-4 text-purple-400" />
                <span>Physical / Digital Evidence Exhibits ({results.evidence.length})</span>
              </div>
              <div className="glass-card divide-y divide-border border border-border overflow-hidden">
                {results.evidence.map((ev) => (
                  <div
                    key={ev.id}
                    onClick={() => navigate(`/cases/${ev.case_id}`)}
                    className="p-3.5 hover:bg-surface/60 cursor-pointer flex items-center justify-between text-xs transition-colors"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-accent">{ev.evidence_tag}</span>
                        <span className="font-semibold text-primary-text">{ev.category}</span>
                        <span className="text-muted-text font-mono text-[11px] truncate max-w-md">{ev.description}</span>
                      </div>
                      <div className="text-[11px] text-muted-text font-mono mt-0.5">
                        Case: {ev.fir_number} • Current Custody: {ev.current_org_name}
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-text" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Court Cases Results */}
          {results.courtCases.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-mono font-bold uppercase text-muted-text">
                <ScaleIcon className="w-4 h-4 text-amber-400" />
                <span>Court Cases & CNR Records ({results.courtCases.length})</span>
              </div>
              <div className="glass-card divide-y divide-border border border-border overflow-hidden">
                {results.courtCases.map((cc) => (
                  <div
                    key={cc.id}
                    onClick={() => navigate(`/cases/${cc.case_id}`)}
                    className="p-3.5 hover:bg-surface/60 cursor-pointer flex items-center justify-between text-xs transition-colors"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-accent">{cc.cnr_number}</span>
                        <span className="font-semibold text-primary-text">{cc.case_title}</span>
                        <StatusBadge status={cc.status} />
                      </div>
                      <div className="text-[11px] text-muted-text font-mono mt-0.5">
                        Court: {cc.court_name} • Originating FIR: {cc.fir_number}
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-text" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

