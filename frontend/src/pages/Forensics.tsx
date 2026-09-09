import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { StatusBadge } from '../components/ClassificationBadge';
import { FlaskIcon, SearchIcon, PlusIcon, FileTextIcon, CheckIcon } from '../components/Icons';

export const Forensics: React.FC = () => {
  const { user, hasPermission } = useAuth();
  const navigate = useNavigate();

  const [submissions, setSubmissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [divisionFilter, setDivisionFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Modal: Issue Report
  const [showReportModal, setShowReportModal] = useState(false);
  const [selectedSubmission, setSelectedSubmission] = useState<any>(null);
  const [reportForm, setReportForm] = useState({
    reportNumber: '', summaryOfAnalysis: '', formalConclusion: ''
  });

  const fetchSubmissions = async () => {
    setLoading(true);
    try {
      const res = await api.get<{ submissions: any[] }>('/forensics/submissions');
      setSubmissions(res.submissions || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubmissions();
  }, []);

  const handleIssueReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSubmission) return;
    try {
      await api.post(`/forensics/submissions/${selectedSubmission.id}/reports`, reportForm);
      setShowReportModal(false);
      fetchSubmissions();
    } catch (err: any) {
      alert(err.message || 'Failed to issue report');
    }
  };

  const filtered = submissions.filter(sub => {
    if (divisionFilter && sub.scientific_division !== divisionFilter) return false;
    if (statusFilter && sub.status !== statusFilter) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-primary-text flex items-center gap-2">
            <FlaskIcon className="w-5 h-5 text-purple-400" />
            <span>Forensic Science Laboratory Workspace</span>
          </h1>
          <p className="text-xs text-muted-text font-mono mt-0.5">
            DFSS Gujarat State FSL Gandhinagar & Regional Laboratories • Scope: {user?.organizationName}
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="w-full sm:w-64">
          <select
            className="input-field"
            value={divisionFilter}
            onChange={(e) => setDivisionFilter(e.target.value)}
          >
            <option value="">All Scientific Divisions</option>
            <option value="BALLISTICS">Ballistics & Firearms</option>
            <option value="DIGITAL_FORENSICS">Cyber & Digital Forensics</option>
            <option value="DNA_BIOLOGY">DNA & Serology</option>
            <option value="CHEMISTRY_TOXICOLOGY">Chemistry & Toxicology</option>
            <option value="QUESTIONED_DOCUMENTS">Questioned Documents</option>
          </select>
        </div>

        <div className="w-full sm:w-48">
          <select
            className="input-field"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All Submission Statuses</option>
            <option value="SUBMITTED">Submitted / Pending</option>
            <option value="IN_PROGRESS">In Examination</option>
            <option value="REPORT_ISSUED">Report Issued</option>
          </select>
        </div>
      </div>

      {/* Submissions List */}
      <div className="space-y-4">
        {loading ? (
          <div className="p-8 text-center text-xs text-muted-text font-mono">Loading laboratory submissions...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-xs text-muted-text glass-card border border-border">
            <FlaskIcon className="w-10 h-10 text-muted-darker mx-auto mb-2" />
            <h3 className="text-sm font-semibold text-primary-text">No Submissions Found</h3>
            <p className="mt-1">No forensic submissions match your selected division or status filter.</p>
          </div>
        ) : (
          filtered.map((sub) => (
            <div key={sub.id} className="glass-card p-5 border border-border text-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-accent text-sm">MEMO: {sub.submission_memo_number}</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-surface border border-border text-purple-300">
                      {sub.scientific_division}
                    </span>
                  </div>
                  <div className="text-xs text-muted-text font-mono mt-1">
                    Originating Police: <span className="text-primary-text font-medium">{sub.requesting_org_name}</span> • Target Lab: {sub.target_lab_name}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <StatusBadge status={sub.status} />
                  <button
                    onClick={() => navigate(`/cases/${sub.case_id}`)}
                    className="btn-secondary text-xs"
                  >
                    Open Case Workspace →
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <span className="text-[10.5px] font-mono font-bold uppercase text-muted-text block mb-1">
                    EXAMINATION REQUEST & PURPOSE
                  </span>
                  <p className="font-mono text-primary-text/90 leading-relaxed bg-surface p-3 rounded border border-border">
                    {sub.examination_requested}
                  </p>
                </div>

                <div>
                  <span className="text-[10.5px] font-mono font-bold uppercase text-muted-text block mb-1">
                    REPORT STATUS & SCIENTIFIC FINDINGS
                  </span>
                  {sub.report_number ? (
                    <div className="bg-surface p-3 rounded border border-success/30 space-y-2">
                      <div className="flex items-center justify-between font-mono">
                        <span className="font-bold text-success">REPORT: {sub.report_number}</span>
                        <span className="text-[10px] text-muted-text">{sub.report_status}</span>
                      </div>
                      <div className="text-muted-text text-[11px]">Analysis: {sub.summary_of_analysis}</div>
                      <div className="text-primary-text font-semibold text-[11.5px] pt-1">
                        Conclusion: {sub.formal_conclusion}
                      </div>
                    </div>
                  ) : (
                    <div className="bg-surface p-4 rounded border border-border text-center space-y-2">
                      <span className="text-muted-text block text-[11px]">Laboratory analysis pending conclusion.</span>
                      {(user?.agencyBranch === 'FORENSICS' || user?.roleId === 'MASTER_ADMIN') && (
                        <button
                          onClick={() => {
                            setSelectedSubmission(sub);
                            setReportForm({
                              reportNumber: `RFSL-${sub.scientific_division.slice(0, 3)}-2026-${Math.floor(100 + Math.random() * 900)}`,
                              summaryOfAnalysis: '',
                              formalConclusion: ''
                            });
                            setShowReportModal(true);
                          }}
                          className="btn-primary text-xs"
                        >
                          Record Findings & Issue Sealed Report
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Report Modal */}
      {showReportModal && selectedSubmission && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="glass-card p-6 border border-border w-full max-w-lg space-y-4">
            <h3 className="text-sm font-bold text-primary-text">
              Issue Formal Sealed Forensic Report: <span className="text-accent font-mono">{selectedSubmission.submission_memo_number}</span>
            </h3>
            <form onSubmit={handleIssueReport} className="space-y-3 text-xs">
              <div>
                <label className="block text-muted-text mb-1">Official Report Number *</label>
                <input
                  required
                  type="text"
                  className="input-field font-mono"
                  value={reportForm.reportNumber}
                  onChange={(e) => setReportForm({ ...reportForm, reportNumber: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-muted-text mb-1">Summary of Scientific Methodology *</label>
                <textarea
                  required
                  rows={3}
                  placeholder="e.g. Microscopic examination and spectroscopic analysis conducted..."
                  className="input-field font-mono"
                  value={reportForm.summaryOfAnalysis}
                  onChange={(e) => setReportForm({ ...reportForm, summaryOfAnalysis: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-muted-text mb-1">Formal Opinion / Scientific Conclusion *</label>
                <textarea
                  required
                  rows={3}
                  placeholder="e.g. The sample positively matches standard controls..."
                  className="input-field font-mono"
                  value={reportForm.formalConclusion}
                  onChange={(e) => setReportForm({ ...reportForm, formalConclusion: e.target.value })}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowReportModal(false)} className="btn-secondary">Cancel</button>
                <button type="submit" className="btn-primary">Sign & Seal Report</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

