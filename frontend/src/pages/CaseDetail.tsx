import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { StatusBadge } from '../components/ClassificationBadge';
import {
  FileTextIcon, ShieldIcon, FlaskIcon, ScaleIcon, UsersIcon,
  PlusIcon, DownloadIcon, LockIcon, ActivityIcon,
  AlertCircleIcon, ChevronRightIcon, ClockIcon, BuildingIcon
} from '../components/Icons';

export const CaseDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { user, hasPermission } = useAuth();
  const navigate = useNavigate();

  const [caseData, setCaseData] = useState<any>(null);
  const [firData, setFirData] = useState<any>(null);
  const [participatingAgencies, setParticipatingAgencies] = useState<any[]>([]);
  const [authorizedTabs, setAuthorizedTabs] = useState<any>({});
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Sub-resource state
  const [investigationData, setInvestigationData] = useState<any>(null);
  const [evidenceList, setEvidenceList] = useState<any[]>([]);
  const [forensicSubmissions, setForensicSubmissions] = useState<any[]>([]);
  const [courtData, setCourtData] = useState<any>(null);
  const [documents, setDocuments] = useState<any[]>([]);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);

  // Modals
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [newStatus, setNewStatus] = useState('');

  const [showPersonModal, setShowPersonModal] = useState(false);
  const [personForm, setPersonForm] = useState({
    fullName: '', alias: '', idProofType: 'AADHAAR', idProofNumber: '',
    gender: 'MALE', phone: '', roleInCase: 'SUSPECT', custodyStatus: 'NONE', notes: ''
  });

  const [showDiaryModal, setShowDiaryModal] = useState(false);
  const [diaryForm, setDiaryForm] = useState({
    entryNumber: 1, actionTaken: '', observations: '', locationVisited: ''
  });

  const [showPanchnamaModal, setShowPanchnamaModal] = useState(false);
  const [panchnamaForm, setPanchnamaForm] = useState({
    panchnamaType: 'SEIZURE', location: '', panchas: '1. Ramesh Patel, 2. Suresh Shah',
    seizedItems: '', observations: ''
  });

  const [showEvidenceModal, setShowEvidenceModal] = useState(false);
  const [evidenceForm, setEvidenceForm] = useState({
    evidenceTag: '', category: 'PHYSICAL', description: '', collectionLocation: '',
    storageLocation: 'Malkhana Lockup 1', sealStatus: 'SEALED_INTACT'
  });

  const [showCustodyModal, setShowCustodyModal] = useState(false);
  const [selectedEvidence, setSelectedEvidence] = useState<any>(null);
  const [custodyHistory, setCustodyHistory] = useState<any[]>([]);

  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferForm, setTransferForm] = useState({
    toUserId: '', toOrganizationId: '', actionType: 'HANDOFF', purpose: '', notes: ''
  });

  const [showForensicSubmitModal, setShowForensicSubmitModal] = useState(false);
  const [forensicSubmitForm, setForensicSubmitForm] = useState({
    targetForensicOrgId: '', submissionMemoNumber: '', examinationRequested: '',
    scientificDivision: 'BALLISTICS'
  });

  const [showForensicReportModal, setShowForensicReportModal] = useState(false);
  const [selectedSubmissionId, setSelectedSubmissionId] = useState('');
  const [forensicReportForm, setForensicReportForm] = useState({
    reportNumber: '', summaryOfAnalysis: '', formalConclusion: ''
  });

  const [showCourtRegisterModal, setShowCourtRegisterModal] = useState(false);
  const [courtRegisterForm, setCourtRegisterForm] = useState({
    courtOrganizationId: '', cnrNumber: '', presidingJudgeId: ''
  });

  const [showProceedingModal, setShowProceedingModal] = useState(false);
  const [proceedingForm, setProceedingForm] = useState({
    hearingDate: new Date().toISOString().split('T')[0],
    stage: 'ARGUMENTS_ON_CHARGE', proceedingsSummary: '', nextHearingDate: ''
  });

  const [showCourtOrderModal, setShowCourtOrderModal] = useState(false);
  const [courtOrderForm, setCourtOrderForm] = useState({
    orderType: 'BAIL_ORDER', orderSummary: '', operativeText: ''
  });

  const [showJudgementModal, setShowJudgementModal] = useState(false);
  const [judgementForm, setJudgementForm] = useState({
    verdict: 'CONVICTED', sentenceSummary: '', fullJudgementText: ''
  });

  const [showChargesheetModal, setShowChargesheetModal] = useState(false);
  const [chargesheetForm, setChargesheetForm] = useState({
    chargesheetNumber: '', targetCourtId: '', sectionsApplied: '',
    summaryOfEvidence: '', accusedChargesheeted: ''
  });

  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadCategory, setUploadCategory] = useState('FIR_COPY');
  const [uploadClassification, setUploadClassification] = useState('RESTRICTED');

  const [organizationsList, setOrganizationsList] = useState<any[]>([]);
  const [usersList, setUsersList] = useState<any[]>([]);

  // Load Primary Case Data
  const loadCase = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get<any>(`/cases/${id}`);
      setCaseData(res.case);
      setFirData(res.fir);
      setParticipatingAgencies(res.participatingAgencies || []);
      setAuthorizedTabs(res.authorizedTabs || {});
    } catch (err: any) {
      setError(err.message || 'Failed to load case workspace');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) loadCase();
  }, [id]);

  // Load Sub-resources when tab opens
  useEffect(() => {
    if (!id || !caseData) return;

    if (activeTab === 'investigation' || activeTab === 'persons' || activeTab === 'chargesheet') {
      api.get<any>(`/cases/${id}/investigation`).then(setInvestigationData).catch(console.error);
    } else if (activeTab === 'evidence') {
      api.get<any>(`/cases/${id}/evidence`).then(res => setEvidenceList(res.evidence || [])).catch(console.error);
    } else if (activeTab === 'forensics') {
      api.get<any>(`/cases/${id}/forensics`).then(res => setForensicSubmissions(res.submissions || [])).catch(console.error);
    } else if (activeTab === 'court') {
      api.get<any>(`/cases/${id}/court`).then(setCourtData).catch(console.error);
    } else if (activeTab === 'documents') {
      api.get<any>(`/cases/${id}/documents`).then(res => setDocuments(res.documents || [])).catch(console.error);
    } else if (activeTab === 'timeline') {
      api.get<any>(`/cases/${id}/timeline`).then(res => setTimeline(res.timeline || [])).catch(console.error);
    } else if (activeTab === 'audit') {
      api.get<any>(`/audit?caseId=${id}`).then(res => setAuditLogs(res.auditLogs || [])).catch(console.error);
    }
  }, [activeTab, id, caseData]);

  // Load lookups for modals
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

  // Status Change
  const handleUpdateStatus = async () => {
    if (!newStatus) return;
    try {
      await api.put(`/cases/${id}/status`, { status: newStatus });
      setShowStatusModal(false);
      loadCase();
    } catch (err: any) {
      alert(err.message || 'Failed to update status');
    }
  };

  // Create Person
  const handleAddPerson = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post(`/cases/${id}/persons`, personForm);
      setShowPersonModal(false);
      const res = await api.get<any>(`/cases/${id}/investigation`);
      setInvestigationData(res);
    } catch (err: any) {
      alert(err.message || 'Failed to link person');
    }
  };

  // Create Diary
  const handleAddDiary = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post(`/cases/${id}/diary`, diaryForm);
      setShowDiaryModal(false);
      const res = await api.get<any>(`/cases/${id}/investigation`);
      setInvestigationData(res);
    } catch (err: any) {
      alert(err.message || 'Failed to add diary entry');
    }
  };

  // Record Panchnama
  const handleAddPanchnama = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post(`/cases/${id}/panchnamas`, panchnamaForm);
      setShowPanchnamaModal(false);
      const res = await api.get<any>(`/cases/${id}/investigation`);
      setInvestigationData(res);
    } catch (err: any) {
      alert(err.message || 'Failed to record Panchnama');
    }
  };

  // Add Evidence
  const handleAddEvidence = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post(`/cases/${id}/evidence`, {
        ...evidenceForm,
        collectedAt: new Date().toISOString()
      });
      setShowEvidenceModal(false);
      const res = await api.get<any>(`/cases/${id}/evidence`);
      setEvidenceList(res.evidence || []);
    } catch (err: any) {
      alert(err.message || 'Failed to register evidence');
    }
  };

  // View Custody History
  const handleViewCustody = async (ev: any) => {
    setSelectedEvidence(ev);
    try {
      const res = await api.get<any>(`/evidence/${ev.id}/custody`);
      setCustodyHistory(res.custodyHistory || []);
      setShowCustodyModal(true);
    } catch (err: any) {
      alert(err.message || 'Failed to fetch chain of custody');
    }
  };

  // Transfer Custody
  const handleTransferCustody = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEvidence) return;
    try {
      await api.post(`/evidence/${selectedEvidence.id}/transfer`, transferForm);
      setShowTransferModal(false);
      const res = await api.get<any>(`/cases/${id}/evidence`);
      setEvidenceList(res.evidence || []);
    } catch (err: any) {
      alert(err.message || 'Failed to transfer custody');
    }
  };

  // Submit to Forensics
  const handleForensicSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post(`/cases/${id}/forensics/submit`, forensicSubmitForm);
      setShowForensicSubmitModal(false);
      const res = await api.get<any>(`/cases/${id}/forensics`);
      setForensicSubmissions(res.submissions || []);
    } catch (err: any) {
      alert(err.message || 'Failed to submit to forensic lab');
    }
  };

  // Issue Forensic Report
  const handleForensicReport = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post(`/forensics/submissions/${selectedSubmissionId}/reports`, forensicReportForm);
      setShowForensicReportModal(false);
      const res = await api.get<any>(`/cases/${id}/forensics`);
      setForensicSubmissions(res.submissions || []);
    } catch (err: any) {
      alert(err.message || 'Failed to issue sealed forensic report');
    }
  };

  // Register Court Case
  const handleCourtRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post(`/cases/${id}/court/register`, courtRegisterForm);
      setShowCourtRegisterModal(false);
      const res = await api.get<any>(`/cases/${id}/court`);
      setCourtData(res);
    } catch (err: any) {
      alert(err.message || 'Failed to register in court');
    }
  };

  // Record Proceeding
  const handleCourtProceeding = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post(`/cases/${id}/court/proceedings`, proceedingForm);
      setShowProceedingModal(false);
      const res = await api.get<any>(`/cases/${id}/court`);
      setCourtData(res);
    } catch (err: any) {
      alert(err.message || 'Failed to record proceeding');
    }
  };

  // Issue Court Order
  const handleCourtOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post(`/cases/${id}/court/orders`, courtOrderForm);
      setShowCourtOrderModal(false);
      const res = await api.get<any>(`/cases/${id}/court`);
      setCourtData(res);
    } catch (err: any) {
      alert(err.message || 'Failed to issue order');
    }
  };

  // Pronounce Judgement
  const handleCourtJudgement = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post(`/cases/${id}/court/judgements`, judgementForm);
      setShowJudgementModal(false);
      loadCase();
    } catch (err: any) {
      alert(err.message || 'Failed to pronounce judgement');
    }
  };

  // File Chargesheet
  const handleFileChargesheet = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post(`/cases/${id}/chargesheet`, {
        ...chargesheetForm,
        sectionsApplied: chargesheetForm.sectionsApplied.split(','),
        accusedChargesheeted: chargesheetForm.accusedChargesheeted.split(',')
      });
      setShowChargesheetModal(false);
      loadCase();
    } catch (err: any) {
      alert(err.message || 'Failed to file chargesheet');
    }
  };

  // Document Upload
  const handleUploadDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) return;
    const formData = new FormData();
    formData.append('file', uploadFile);
    formData.append('title', uploadTitle);
    formData.append('category', uploadCategory);
    formData.append('classification', uploadClassification);

    try {
      await api.post(`/cases/${id}/documents`, formData);
      setShowUploadModal(false);
      setUploadFile(null);
      setUploadTitle('');
      const res = await api.get<any>(`/cases/${id}/documents`);
      setDocuments(res.documents || []);
    } catch (err: any) {
      alert(err.message || 'Failed to upload document');
    }
  };

  if (loading) {
    return (
      <div className="p-12 text-center text-xs font-mono text-muted-text">
        <ActivityIcon className="w-6 h-6 mx-auto mb-3 animate-spin text-accent" />
        Evaluating Multi-Agency Access Authorization & Decrypting Workspace...
      </div>
    );
  }

  if (error || !caseData) {
    return (
      <div className="p-8 max-w-lg mx-auto text-center glass-card border border-danger/30">
        <AlertCircleIcon className="w-10 h-10 text-danger mx-auto mb-3" />
        <h2 className="text-base font-bold text-primary-text mb-1">Access Denied or Not Found</h2>
        <p className="text-xs text-muted-text mb-4">
          {error || 'You lack authorization to access this case under vertical subtree or sibling isolation policies.'}
        </p>
        <button onClick={() => navigate('/cases')} className="btn-secondary">
          ← Return to Cases Registry
        </button>
      </div>
    );
  }

  const tabs = [
    { id: 'overview', label: 'Case Overview', icon: FileTextIcon, visible: true },
    { id: 'fir', label: 'Official FIR Record', icon: FileTextIcon, visible: authorizedTabs.fir },
    { id: 'persons', label: 'Persons & Accused', icon: UsersIcon, visible: authorizedTabs.persons },
    { id: 'investigation', label: 'Case Diary & Panchnama', icon: ShieldIcon, visible: authorizedTabs.investigation },
    { id: 'evidence', label: 'Evidence & Custody', icon: ShieldIcon, visible: authorizedTabs.evidence },
    { id: 'forensics', label: 'Forensic Lab Handoff', icon: FlaskIcon, visible: authorizedTabs.forensics },
    { id: 'court', label: 'Court & Adjudication', icon: ScaleIcon, visible: authorizedTabs.court },
    { id: 'chargesheet', label: 'Final Chargesheet', icon: FileTextIcon, visible: authorizedTabs.chargesheet },
    { id: 'documents', label: 'Tamper-Proof Vault', icon: LockIcon, visible: authorizedTabs.documents },
    { id: 'timeline', label: 'Unified Timeline', icon: ClockIcon, visible: authorizedTabs.timeline },
    { id: 'audit', label: 'Immutable Audit Log', icon: LockIcon, visible: authorizedTabs.audit },
  ];

  return (
    <div className="space-y-6">
      {/* Breadcrumb & Top Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-border">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-text mb-1.5">
            <span onClick={() => navigate('/cases')} className="hover:text-primary-text cursor-pointer">Cases</span>
            <ChevronRightIcon className="w-3 h-3" />
            <span className="font-mono text-primary-text">{caseData.fir_number}</span>
            {caseData.is_legacy && (
              <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-warning-light text-warning border border-warning/30">
                LEGACY ARCHIVE
              </span>
            )}
          </div>
          <h1 className="text-xl font-bold tracking-tight text-primary-text flex items-center gap-3">
            <span>{caseData.title}</span>
            <StatusBadge status={caseData.status} />
          </h1>
          <div className="text-xs text-muted-text mt-1 flex flex-wrap items-center gap-2 font-mono">
            <span>Origin: {caseData.originating_org_name} ({caseData.originating_org_code})</span>
            <span>•</span>
            <span>IO: {caseData.lead_investigator_name || 'Unassigned'}</span>
            <span>•</span>
            <span>Incident Date: {new Date(caseData.incident_date).toLocaleDateString()}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {hasPermission('CASE_UPDATE') && (
            <button
              onClick={() => { setNewStatus(caseData.status); setShowStatusModal(true); }}
              className="btn-secondary"
            >
              <span>Transition Lifecycle</span>
            </button>
          )}
          {authorizedTabs.documents && (
            <button
              onClick={() => setShowUploadModal(true)}
              className="btn-primary"
            >
              <PlusIcon className="w-3.5 h-3.5" />
              <span>Upload Record</span>
            </button>
          )}
        </div>
      </div>

      {/* Participating Agencies Banner */}
      {participatingAgencies.length > 0 && (
        <div className="glass-card p-3 border border-border flex items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-2 text-muted-text">
            <BuildingIcon className="w-4 h-4 text-accent" />
            <span className="font-semibold text-primary-text">Authorized Cross-Agency Bridge:</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {participatingAgencies.map((agency) => (
              <span key={agency.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-surface border border-border text-[11px] font-mono">
                <span className="font-semibold text-accent">{agency.org_name}</span>
                <span className="text-muted-darker">({agency.agency_branch})</span>
                <span className="text-[9px] px-1 py-0.2 rounded bg-bg text-muted-text border border-border">{agency.access_role}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Tabs Navigation Bar */}
      <div className="border-b border-border flex items-center gap-1 overflow-x-auto">
        {tabs.filter(t => t.visible).map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-3.5 py-2.5 text-xs font-medium border-b-2 whitespace-nowrap transition-colors ${
                isActive
                  ? 'border-accent text-accent font-semibold'
                  : 'border-transparent text-muted-text hover:text-primary-text hover:border-border'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Contents */}
      <div className="space-y-6">
        {/* OVERVIEW TAB */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2 space-y-6">
              <div className="glass-card p-5 border border-border space-y-4">
                <h3 className="text-sm font-bold text-primary-text border-b border-border pb-2">Case Narrative & Summary</h3>
                <p className="text-xs text-primary-text/90 leading-relaxed whitespace-pre-wrap">
                  {caseData.description || 'No descriptive statement provided.'}
                </p>
                <div className="grid grid-cols-2 gap-4 pt-3 border-t border-border text-xs">
                  <div>
                    <span className="text-muted-text block text-[11px] font-mono">INCIDENT LOCATION</span>
                    <span className="font-medium text-primary-text">{caseData.incident_location}</span>
                  </div>
                  <div>
                    <span className="text-muted-text block text-[11px] font-mono">REGISTRATION YEAR</span>
                    <span className="font-mono text-primary-text">{caseData.year}</span>
                  </div>
                </div>
              </div>

              {firData && (
                <div className="glass-card p-5 border border-border space-y-4">
                  <div className="flex items-center justify-between border-b border-border pb-2">
                    <h3 className="text-sm font-bold text-primary-text">First Information Report (FIR) Extract</h3>
                    <span className="text-[11px] font-mono text-muted-text">GD Ref: {firData.general_diary_reference || 'N/A'}</span>
                  </div>
                  <div className="text-xs space-y-2">
                    <div>
                      <span className="text-muted-text block text-[11px] font-mono">COMPLAINANT</span>
                      <span className="font-semibold text-primary-text">{firData.complainant_name}</span>
                      {firData.complainant_contact && <span className="text-muted-text ml-2">({firData.complainant_contact})</span>}
                    </div>
                    <div>
                      <span className="text-muted-text block text-[11px] font-mono">ACTS & PENAL SECTIONS</span>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {firData.acts_and_sections?.map((item: any, idx: number) => (
                          <span key={idx} className="px-2 py-0.5 rounded bg-surface border border-border font-mono text-[11px] text-accent">
                            {item.act}: {Array.isArray(item.sections) ? item.sections.join(', ') : item.sections}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Sidebar Metadata */}
            <div className="space-y-4">
              <div className="glass-card p-4 border border-border space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-text font-mono border-b border-border pb-1.5">
                  Institutional Custody
                </h4>
                <div className="text-xs space-y-2 font-mono">
                  <div>
                    <span className="text-muted-text block text-[10.5px]">CASE UUID</span>
                    <span className="text-primary-text text-[11px] break-all">{caseData.id}</span>
                  </div>
                  <div>
                    <span className="text-muted-text block text-[10.5px]">POLICE BRANCH</span>
                    <span className="text-primary-text">{caseData.originating_org_name}</span>
                  </div>
                  <div>
                    <span className="text-muted-text block text-[10.5px]">INVESTIGATING OFFICER</span>
                    <span className="text-primary-text">{caseData.lead_investigator_name} ({caseData.lead_investigator_badge || 'PI'})</span>
                  </div>
                  <div>
                    <span className="text-muted-text block text-[10.5px]">INITIAL REGISTRATION</span>
                    <span className="text-primary-text">{new Date(caseData.created_at).toLocaleString()}</span>
                  </div>
                </div>
              </div>

              <div className="glass-card p-4 border border-border space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-text font-mono border-b border-border pb-1.5">
                  Agency Separation Envelope
                </h4>
                <p className="text-[11px] text-muted-text leading-relaxed">
                  Only authorized branches in the horizontal criminal justice chain have active partitions in this case. Non-participating siblings are mathematically isolated.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* FIR TAB */}
        {activeTab === 'fir' && firData && (
          <div className="glass-card p-6 border border-border space-y-6">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div>
                <span className="text-xs font-mono text-muted-text">GOVERNMENT OF GUJARAT • POLICE DEPARTMENT</span>
                <h2 className="text-lg font-bold text-primary-text">First Information Report Under Sec 173 BNSS / 154 CrPC</h2>
              </div>
              <div className="text-right font-mono">
                <div className="text-sm font-bold text-accent">{caseData.fir_number}</div>
                <div className="text-xs text-muted-text">{new Date(firData.fir_date).toLocaleString()}</div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="p-3 bg-surface rounded border border-border space-y-2">
                <span className="text-[11px] font-mono text-muted-text font-bold block">1. COMPLAINANT / INFORMANT DETAILS</span>
                <div><strong>Full Name:</strong> {firData.complainant_name}</div>
                <div><strong>Contact Phone:</strong> {firData.complainant_contact || 'Not Recorded'}</div>
                <div><strong>Residential Address:</strong> {firData.complainant_address || 'Not Recorded'}</div>
              </div>

              <div className="p-3 bg-surface rounded border border-border space-y-2">
                <span className="text-[11px] font-mono text-muted-text font-bold block">2. INCIDENT OCCURRENCE</span>
                <div><strong>Date & Time of Occurrence:</strong> {new Date(caseData.incident_date).toLocaleString()}</div>
                <div><strong>Place of Occurrence:</strong> {caseData.incident_location}</div>
                <div><strong>Police Station:</strong> {caseData.originating_org_name}</div>
              </div>
            </div>

            <div className="p-4 bg-surface rounded border border-border space-y-2 text-xs">
              <span className="text-[11px] font-mono text-muted-text font-bold block">3. PENAL OFFENCES CHARGED</span>
              {firData.acts_and_sections?.map((item: any, idx: number) => (
                <div key={idx} className="font-mono text-accent">
                  • {item.act}: {Array.isArray(item.sections) ? item.sections.join(', ') : item.sections}
                </div>
              ))}
            </div>

            <div className="p-4 bg-surface rounded border border-border space-y-2 text-xs">
              <span className="text-[11px] font-mono text-muted-text font-bold block">4. COMPLETE FIR NARRATIVE STATEMENT</span>
              <p className="font-mono whitespace-pre-wrap leading-relaxed text-primary-text/90">
                {firData.fir_content}
              </p>
            </div>
          </div>
        )}

        {/* PERSONS TAB */}
        {activeTab === 'persons' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-primary-text">Accused, Victims & Witnesses</h3>
              {hasPermission('INVESTIGATION_CREATE') && (
                <button onClick={() => setShowPersonModal(true)} className="btn-primary">
                  <PlusIcon className="w-3.5 h-3.5" />
                  <span>Record Person</span>
                </button>
              )}
            </div>

            <div className="glass-card overflow-hidden border border-border">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface border-b border-border text-[11px] font-mono uppercase text-muted-text">
                  <tr>
                    <th className="py-3 px-4">Name & Alias</th>
                    <th className="py-3 px-4">Role in Case</th>
                    <th className="py-3 px-4">Custody Status</th>
                    <th className="py-3 px-4">ID Proof</th>
                    <th className="py-3 px-4">Phone</th>
                    <th className="py-3 px-4">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {investigationData?.persons?.length === 0 ? (
                    <tr><td colSpan={6} className="py-6 text-center text-muted-text">No individuals recorded in this case yet.</td></tr>
                  ) : (
                    investigationData?.persons?.map((p: any) => (
                      <tr key={p.id} className="hover:bg-surface/50">
                        <td className="py-3 px-4">
                          <div className="font-bold text-primary-text">{p.full_name}</div>
                          {p.alias && <div className="text-[11px] text-muted-text font-mono">Alias: {p.alias}</div>}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-0.5 rounded font-mono text-[10.5px] font-bold ${
                            p.role_in_case === 'ACCUSED' ? 'bg-danger-light text-danger border border-danger/30' :
                            p.role_in_case === 'VICTIM' ? 'bg-warning-light text-warning border border-warning/30' :
                            'bg-surface text-muted-text border border-border'
                          }`}>
                            {p.role_in_case}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px]">
                          {p.custody_status}
                          {p.arrest_date && <div className="text-muted-darker text-[10px]">Arrested: {new Date(p.arrest_date).toLocaleDateString()}</div>}
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px]">
                          {p.id_proof_type ? `${p.id_proof_type}: ${p.id_proof_number || 'Confidential'}` : 'None'}
                        </td>
                        <td className="py-3 px-4 font-mono text-muted-text">{p.phone || 'N/A'}</td>
                        <td className="py-3 px-4 text-muted-text max-w-xs truncate">{p.notes || '-'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* INVESTIGATION TAB */}
        {activeTab === 'investigation' && (
          <div className="space-y-6">
            {/* Case Diary */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-primary-text">Official Case Diary Entries (Sec 175 BNSS / 172 CrPC)</h3>
                {hasPermission('INVESTIGATION_CREATE') && (
                  <button onClick={() => setShowDiaryModal(true)} className="btn-primary">
                    <PlusIcon className="w-3.5 h-3.5" />
                    <span>New Diary Entry</span>
                  </button>
                )}
              </div>

              <div className="space-y-3">
                {investigationData?.caseDiary?.length === 0 ? (
                  <div className="glass-card p-6 text-center text-xs text-muted-text border border-border">
                    No case diary entries recorded yet.
                  </div>
                ) : (
                  investigationData?.caseDiary?.map((entry: any) => (
                    <div key={entry.id} className="glass-card p-4 border border-border text-xs space-y-2">
                      <div className="flex items-center justify-between border-b border-border pb-2">
                        <span className="font-mono font-bold text-accent">
                          DIARY ENTRY #{entry.diary_entry_number} • {new Date(entry.entry_date).toLocaleDateString()}
                        </span>
                        <span className="text-muted-text font-mono">
                          IO: {entry.officer_name} ({entry.officer_badge || 'PI'})
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-[11px] font-mono text-muted-text">
                        <div>Location: <span className="text-primary-text">{entry.location_visited || 'Police Station'}</span></div>
                        <div>Action: <span className="text-primary-text">{entry.action_taken}</span></div>
                      </div>
                      <p className="text-primary-text/90 leading-relaxed font-mono pt-1 text-[11.5px] whitespace-pre-wrap">
                        {entry.observations}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Panchnamas */}
            <div className="space-y-3 pt-4 border-t border-border">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-primary-text">Panchnama Records</h3>
                {hasPermission('INVESTIGATION_CREATE') && (
                  <button onClick={() => setShowPanchnamaModal(true)} className="btn-secondary">
                    <PlusIcon className="w-3.5 h-3.5" />
                    <span>Record Panchnama</span>
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {investigationData?.panchnamas?.map((p: any) => (
                  <div key={p.id} className="glass-card p-4 border border-border text-xs space-y-2">
                    <div className="flex items-center justify-between font-mono">
                      <span className="font-bold text-accent">{p.panchnama_type} PANCHNAMA</span>
                      <span className="text-muted-text text-[10.5px]">{new Date(p.conducted_at).toLocaleString()}</span>
                    </div>
                    <div><strong>Location:</strong> {p.location}</div>
                    <div><strong>Independent Panchas:</strong> {p.panchas}</div>
                    <div><strong>Seized Articles:</strong> {p.seized_items || 'None'}</div>
                    <p className="text-muted-text text-[11px] pt-1">{p.observations}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* EVIDENCE TAB */}
        {activeTab === 'evidence' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-primary-text">Physical & Digital Evidence Registry</h3>
              {hasPermission('EVIDENCE_CREATE') && (
                <button onClick={() => setShowEvidenceModal(true)} className="btn-primary">
                  <PlusIcon className="w-3.5 h-3.5" />
                  <span>Register Evidence Item</span>
                </button>
              )}
            </div>

            <div className="glass-card overflow-hidden border border-border">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface border-b border-border text-[11px] font-mono uppercase text-muted-text">
                  <tr>
                    <th className="py-3 px-4">Tag / Barcode</th>
                    <th className="py-3 px-4">Category & Description</th>
                    <th className="py-3 px-4">Collection Details</th>
                    <th className="py-3 px-4">Current Custody</th>
                    <th className="py-3 px-4">Seal State</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {evidenceList.length === 0 ? (
                    <tr><td colSpan={6} className="py-6 text-center text-muted-text">No evidence logged for this case.</td></tr>
                  ) : (
                    evidenceList.map((ev: any) => (
                      <tr key={ev.id} className="hover:bg-surface/50">
                        <td className="py-3 px-4 font-mono font-bold text-accent">{ev.evidence_tag}</td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-primary-text">{ev.category}</div>
                          <div className="text-muted-text text-[11px]">{ev.description}</div>
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px]">
                          <div>{ev.collection_location}</div>
                          <div className="text-muted-darker">{new Date(ev.collected_at).toLocaleDateString()} by {ev.collected_by_name}</div>
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px]">
                          <div className="text-primary-text">{ev.current_custodian_name}</div>
                          <div className="text-muted-darker">{ev.current_organization_name}</div>
                        </td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-success-light text-success border border-success/30">
                            {ev.seal_status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right space-x-2">
                          <button
                            onClick={() => handleViewCustody(ev)}
                            className="text-xs text-accent hover:underline font-semibold"
                          >
                            Custody Chain
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
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* FORENSICS TAB */}
        {activeTab === 'forensics' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-primary-text">Forensic Science Laboratory Submissions</h3>
                <p className="text-xs text-muted-text">Directorate of Forensic Sciences (DFSS) / SFSL Gujarat Gandhinagar</p>
              </div>
              {hasPermission('FORENSIC_CREATE') && (
                <button onClick={async () => { await loadLookups(); setShowForensicSubmitModal(true); }} className="btn-primary">
                  <PlusIcon className="w-3.5 h-3.5" />
                  <span>Request Forensic Examination</span>
                </button>
              )}
            </div>

            <div className="space-y-4">
              {forensicSubmissions.length === 0 ? (
                <div className="glass-card p-8 text-center text-xs text-muted-text border border-border">
                  No forensic submissions logged for this case.
                </div>
              ) : (
                forensicSubmissions.map((sub: any) => (
                  <div key={sub.id} className="glass-card p-5 border border-border text-xs space-y-3">
                    <div className="flex items-center justify-between border-b border-border pb-2.5">
                      <div>
                        <span className="font-mono font-bold text-accent text-sm">MEMO: {sub.submission_memo_number}</span>
                        <div className="text-[11px] text-muted-text font-mono">
                          Target Lab: {sub.target_lab_name} ({sub.target_lab_code}) • Division: {sub.scientific_division}
                        </div>
                      </div>
                      <StatusBadge status={sub.status} />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <span className="text-[11px] font-mono text-muted-text font-bold block">EXAMINATION REQUESTED</span>
                        <p className="mt-1 text-primary-text/90 font-mono leading-relaxed">{sub.examination_requested}</p>
                      </div>

                      <div>
                        {sub.report_id ? (
                          <div className="p-3 bg-surface rounded border border-success/30 space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="font-mono font-bold text-success">SEALED FORENSIC REPORT: {sub.report_number}</span>
                              <span className="text-[10px] font-mono text-muted-text">{new Date(sub.report_signed_at).toLocaleDateString()}</span>
                            </div>
                            <div><strong>Lead Examiner:</strong> {sub.lead_examiner_name}</div>
                            <div className="text-muted-text"><strong>Analysis:</strong> {sub.summary_of_analysis}</div>
                            <div className="text-primary-text font-semibold pt-1"><strong>Conclusion:</strong> {sub.formal_conclusion}</div>
                          </div>
                        ) : (
                          <div className="p-4 bg-surface rounded border border-border text-center space-y-2">
                            <span className="text-muted-text block text-[11px]">Examination pending or in progress in laboratory.</span>
                            {(user?.agencyBranch === 'FORENSICS' || user?.roleId === 'MASTER_ADMIN') && (
                              <button
                                onClick={() => { setSelectedSubmissionId(sub.id); setShowForensicReportModal(true); }}
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
          </div>
        )}

        {/* COURT TAB */}
        {activeTab === 'court' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-primary-text">Judicial Trial & Court Case Workspace</h3>
                <p className="text-xs text-muted-text">Gujarat High Court & District Judiciary Establishment</p>
              </div>
              {!courtData?.courtCase && (hasPermission('COURT_CREATE') || user?.agencyBranch === 'JUDICIARY' || user?.roleId === 'MASTER_ADMIN') && (
                <button onClick={async () => { await loadLookups(); setShowCourtRegisterModal(true); }} className="btn-primary">
                  <PlusIcon className="w-3.5 h-3.5" />
                  <span>Register Court Case (CNR)</span>
                </button>
              )}
            </div>

            {!courtData?.courtCase ? (
              <div className="glass-card p-8 text-center text-xs text-muted-text border border-border">
                Case has not been registered in Judicial Court yet. Typically initiated following chargesheet submission.
              </div>
            ) : (
              <div className="space-y-6">
                {/* Court Case Card */}
                <div className="glass-card p-5 border border-border text-xs space-y-3">
                  <div className="flex items-center justify-between border-b border-border pb-2.5">
                    <div>
                      <span className="text-[11px] font-mono text-muted-text block">CASE NUMBER RECORD (CNR)</span>
                      <span className="text-base font-bold font-mono text-accent">{courtData.courtCase.cnr_number}</span>
                    </div>
                    <div className="text-right">
                      <StatusBadge status={courtData.courtCase.status} />
                      <div className="text-[11px] font-mono text-muted-text mt-1">
                        Court: {courtData.courtCase.court_organization_name}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 pt-2">
                    {(hasPermission('COURT_HEARING_RECORD') || user?.agencyBranch === 'JUDICIARY') && (
                      <button onClick={() => setShowProceedingModal(true)} className="btn-secondary text-xs">
                        <PlusIcon className="w-3.5 h-3.5" />
                        <span>Record Hearing Proceeding</span>
                      </button>
                    )}
                    {(hasPermission('COURT_ORDER_ISSUE') || user?.agencyBranch === 'JUDICIARY') && (
                      <button onClick={() => setShowCourtOrderModal(true)} className="btn-secondary text-xs">
                        <PlusIcon className="w-3.5 h-3.5" />
                        <span>Issue Judicial Order</span>
                      </button>
                    )}
                    {(hasPermission('COURT_JUDGEMENT') || user?.roleId === 'JUDGE') && (
                      <button onClick={() => setShowJudgementModal(true)} className="btn-primary text-xs">
                        <ScaleIcon className="w-3.5 h-3.5" />
                        <span>Pronounce Final Judgement</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Proceedings Ledger */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase font-mono text-muted-text tracking-wider">Hearing Proceedings</h4>
                  {courtData.proceedings?.length === 0 ? (
                    <div className="text-xs text-muted-text p-4 glass-card border border-border text-center">No hearings logged yet.</div>
                  ) : (
                    courtData.proceedings?.map((proc: any) => (
                      <div key={proc.id} className="glass-card p-4 border border-border text-xs space-y-1.5 font-mono">
                        <div className="flex items-center justify-between text-accent font-bold">
                          <span>STAGE: {proc.stage}</span>
                          <span>{new Date(proc.hearing_date).toLocaleDateString()}</span>
                        </div>
                        <p className="text-primary-text font-sans">{proc.proceedings_summary}</p>
                        {proc.next_hearing_date && (
                          <div className="text-muted-darker text-[11px] pt-1">
                            Next Hearing Scheduled: {new Date(proc.next_hearing_date).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>

                {/* Orders */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase font-mono text-muted-text tracking-wider">Judicial Orders Issued</h4>
                  {courtData.orders?.map((ord: any) => (
                    <div key={ord.id} className="glass-card p-4 border border-border text-xs space-y-2">
                      <div className="flex items-center justify-between font-mono">
                        <span className="font-bold text-accent">ORDER #{ord.order_number} ({ord.order_type})</span>
                        <span className="text-muted-text">{new Date(ord.order_date).toLocaleDateString()}</span>
                      </div>
                      <div><strong>Summary:</strong> {ord.order_summary}</div>
                      <p className="p-2.5 bg-surface rounded border border-border font-mono text-primary-text/90">
                        {ord.operative_text}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Judgement if pronounced */}
                {courtData.judgements?.length > 0 && (
                  <div className="p-5 bg-surface rounded border-2 border-accent/40 space-y-3 text-xs">
                    <div className="flex items-center justify-between border-b border-border pb-2">
                      <span className="font-bold text-accent text-sm font-mono">FINAL JUDICIAL VERDICT & JUDGEMENT</span>
                      <span className="px-2 py-0.5 rounded font-mono font-bold bg-accent-light text-accent border border-accent/30">
                        {courtData.judgements[0].verdict}
                      </span>
                    </div>
                    <div><strong>Pronounced By:</strong> {courtData.judgements[0].pronounced_by_name}</div>
                    <div><strong>Sentence / Disposition:</strong> {courtData.judgements[0].sentence_summary}</div>
                    <div className="p-3 bg-bg rounded border border-border font-mono whitespace-pre-wrap">
                      {courtData.judgements[0].full_judgement_text}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* CHARGESHEET TAB */}
        {activeTab === 'chargesheet' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-primary-text">Police Final Form / Chargesheet (Sec 193 BNSS / 173 CrPC)</h3>
              {!investigationData?.chargesheet && hasPermission('INVESTIGATION_CREATE') && (
                <button onClick={async () => { await loadLookups(); setShowChargesheetModal(true); }} className="btn-primary">
                  <PlusIcon className="w-3.5 h-3.5" />
                  <span>File Final Chargesheet</span>
                </button>
              )}
            </div>

            {!investigationData?.chargesheet ? (
              <div className="glass-card p-8 text-center text-xs text-muted-text border border-border">
                Chargesheet has not been finalized or submitted for this investigation.
              </div>
            ) : (
              <div className="glass-card p-6 border border-border text-xs space-y-5">
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <div>
                    <span className="font-mono font-bold text-accent text-base">
                      CHARGESHEET NO: {investigationData.chargesheet.chargesheet_number}
                    </span>
                    <div className="text-muted-text text-[11px] font-mono mt-0.5">
                      Target Court: {investigationData.chargesheet.target_court_name || 'Designated Court'}
                    </div>
                  </div>
                  <div className="text-right font-mono text-muted-text">
                    Filed On: {new Date(investigationData.chargesheet.filing_date).toLocaleDateString()}
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <span className="text-[11px] font-mono text-muted-text font-bold block">ACCUSED CHARGESHEETED</span>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {investigationData.chargesheet.accused_chargesheeted?.map((acc: string, idx: number) => (
                        <span key={idx} className="px-2 py-0.5 rounded bg-danger-light text-danger border border-danger/30 font-mono text-[11px]">
                          {acc}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div>
                    <span className="text-[11px] font-mono text-muted-text font-bold block">SECTIONS APPLIED</span>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {investigationData.chargesheet.sections_applied?.map((sec: string, idx: number) => (
                        <span key={idx} className="px-2 py-0.5 rounded bg-surface border border-border font-mono text-[11px] text-accent">
                          {sec}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div>
                    <span className="text-[11px] font-mono text-muted-text font-bold block">SUMMARY OF EVIDENCE</span>
                    <p className="p-3 bg-surface rounded border border-border font-mono leading-relaxed mt-1 text-primary-text/90">
                      {investigationData.chargesheet.summary_of_evidence}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* DOCUMENTS TAB */}
        {activeTab === 'documents' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-primary-text">Tamper-Evident Evidence Vault</h3>
                <p className="text-xs text-muted-text">Cryptographic SHA-256 Verified Records with Path-Traversal Isolation</p>
              </div>
              {hasPermission('DOCUMENT_UPLOAD') && (
                <button onClick={() => setShowUploadModal(true)} className="btn-primary">
                  <PlusIcon className="w-3.5 h-3.5" />
                  <span>Upload Sealed Document</span>
                </button>
              )}
            </div>

            <div className="glass-card overflow-hidden border border-border">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface border-b border-border text-[11px] font-mono uppercase text-muted-text">
                  <tr>
                    <th className="py-3 px-4">Title & Classification</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4">File Name & Size</th>
                    <th className="py-3 px-4">SHA-256 Integrity Hash</th>
                    <th className="py-3 px-4">Uploaded By</th>
                    <th className="py-3 px-4 text-right">Download</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {documents.length === 0 ? (
                    <tr><td colSpan={6} className="py-6 text-center text-muted-text">No documents stored in vault for this case.</td></tr>
                  ) : (
                    documents.map((doc: any) => (
                      <tr key={doc.id} className="hover:bg-surface/50">
                        <td className="py-3 px-4">
                          <div className="font-semibold text-primary-text">{doc.title}</div>
                          <span className="text-[9.5px] font-mono px-1.5 py-0.2 rounded bg-surface border border-border text-muted-text">
                            {doc.classification}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px] text-accent">{doc.category}</td>
                        <td className="py-3 px-4 font-mono text-[11px]">
                          <div>{doc.file_name}</div>
                          <div className="text-muted-darker">{(doc.file_size_bytes / 1024).toFixed(1)} KB</div>
                        </td>
                        <td className="py-3 px-4 font-mono text-[10px] text-muted-text max-w-xs truncate" title={doc.sha256_hash}>
                          {doc.sha256_hash}
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px]">
                          <div>{doc.uploaded_by_name}</div>
                          <div className="text-muted-darker">{new Date(doc.created_at).toLocaleDateString()}</div>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <a
                            href={`/api/documents/${doc.id}`}
                            download
                            className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline"
                          >
                            <DownloadIcon className="w-3.5 h-3.5" />
                            <span>Download</span>
                          </a>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TIMELINE TAB */}
        {activeTab === 'timeline' && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-primary-text">Unified Case Event Progression</h3>
            <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-border">
              {timeline.map((item: any) => (
                <div key={item.id} className="relative text-xs space-y-1">
                  <div className="absolute -left-6 top-1 w-2.5 h-2.5 rounded-full bg-accent border-2 border-bg" />
                  <div className="flex items-center justify-between font-mono">
                    <span className="font-bold text-primary-text">{item.title}</span>
                    <span className="text-muted-text text-[11px]">{new Date(item.occurred_at).toLocaleString()}</span>
                  </div>
                  <p className="text-muted-text font-mono text-[11px]">{item.description}</p>
                  <div className="text-[10px] font-mono text-muted-darker">
                    Actor: {item.actor_name} ({item.actor_badge || 'OFFICER'}) • Org: {item.organization_name}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* AUDIT TAB */}
        {activeTab === 'audit' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-primary-text">Append-Only Security Audit Vault</h3>
              <span className="text-[11px] font-mono text-muted-text">Filtered to Case Scope</span>
            </div>

            <div className="glass-card overflow-hidden border border-border">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface border-b border-border text-[11px] font-mono uppercase text-muted-text">
                  <tr>
                    <th className="py-3 px-4">Timestamp</th>
                    <th className="py-3 px-4">Action</th>
                    <th className="py-3 px-4">Decision</th>
                    <th className="py-3 px-4">Actor</th>
                    <th className="py-3 px-4">Organization</th>
                    <th className="py-3 px-4">IP Address</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border font-mono text-[11px]">
                  {auditLogs.length === 0 ? (
                    <tr><td colSpan={6} className="py-6 text-center text-muted-text font-sans">No audit events found.</td></tr>
                  ) : (
                    auditLogs.map((log: any) => (
                      <tr key={log.id} className="hover:bg-surface/50">
                        <td className="py-2.5 px-4 text-muted-text">{new Date(log.timestamp).toLocaleString()}</td>
                        <td className="py-2.5 px-4 font-bold text-primary-text">{log.action}</td>
                        <td className="py-2.5 px-4">
                          <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                            log.result === 'ALLOW' ? 'bg-success-light text-success' : 'bg-danger-light text-danger'
                          }`}>
                            {log.result}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-accent">{log.display_name || log.username || 'System'}</td>
                        <td className="py-2.5 px-4 text-muted-text">{log.org_code || log.organization_id}</td>
                        <td className="py-2.5 px-4 text-muted-darker">{log.ip_address || 'Internal'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* --- MODALS --- */}
      {/* Status Modal */}
      {showStatusModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="glass-card p-6 border border-border w-full max-w-md space-y-4">
            <h3 className="text-sm font-bold text-primary-text">Transition Case Lifecycle Status</h3>
            <div>
              <label className="text-xs text-muted-text block mb-1.5">Target Status</label>
              <select
                className="input-field"
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value)}
              >
                <option value="REGISTERED">Registered</option>
                <option value="UNDER_INVESTIGATION">Under Investigation</option>
                <option value="CHARGESHEETED">Chargesheeted</option>
                <option value="TRIAL_IN_PROGRESS">Trial In Progress</option>
                <option value="DISPOSED">Disposed / Judgement</option>
                <option value="CLOSED">Closed</option>
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowStatusModal(false)} className="btn-secondary text-xs">Cancel</button>
              <button onClick={handleUpdateStatus} className="btn-primary text-xs">Confirm Transition</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Person Modal */}
      {showPersonModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="glass-card p-6 border border-border w-full max-w-lg space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-sm font-bold text-primary-text">Record Person in Investigation</h3>
            <form onSubmit={handleAddPerson} className="space-y-3 text-xs">
              <div>
                <label className="block text-muted-text mb-1">Full Legal Name *</label>
                <input
                  required
                  type="text"
                  className="input-field"
                  value={personForm.fullName}
                  onChange={(e) => setPersonForm({ ...personForm, fullName: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-muted-text mb-1">Alias / Moniker</label>
                  <input
                    type="text"
                    className="input-field"
                    value={personForm.alias}
                    onChange={(e) => setPersonForm({ ...personForm, alias: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-muted-text mb-1">Role in Case *</label>
                  <select
                    className="input-field"
                    value={personForm.roleInCase}
                    onChange={(e) => setPersonForm({ ...personForm, roleInCase: e.target.value })}
                  >
                    <option value="SUSPECT">Suspect</option>
                    <option value="ACCUSED">Accused</option>
                    <option value="VICTIM">Victim</option>
                    <option value="EYEWITNESS">Eyewitness</option>
                    <option value="INDEPENDENT_WITNESS">Independent Witness</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-muted-text mb-1">ID Proof Type</label>
                  <select
                    className="input-field"
                    value={personForm.idProofType}
                    onChange={(e) => setPersonForm({ ...personForm, idProofType: e.target.value })}
                  >
                    <option value="AADHAAR">Aadhaar</option>
                    <option value="PAN">PAN Card</option>
                    <option value="VOTER_ID">Voter ID</option>
                    <option value="PASSPORT">Passport</option>
                  </select>
                </div>
                <div>
                  <label className="block text-muted-text mb-1">ID Proof Number</label>
                  <input
                    type="text"
                    className="input-field"
                    value={personForm.idProofNumber}
                    onChange={(e) => setPersonForm({ ...personForm, idProofNumber: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className="block text-muted-text mb-1">Custody Status</label>
                <select
                  className="input-field"
                  value={personForm.custodyStatus}
                  onChange={(e) => setPersonForm({ ...personForm, custodyStatus: e.target.value })}
                >
                  <option value="NONE">Not in Custody</option>
                  <option value="POLICE_CUSTODY">Police Custody (Remand)</option>
                  <option value="JUDICIAL_CUSTODY">Judicial Custody (Jail)</option>
                  <option value="ON_BAIL">Released on Bail</option>
                  <option value="ABSCONDING">Absconding</option>
                </select>
              </div>
              <div>
                <label className="block text-muted-text mb-1">Investigative Notes</label>
                <textarea
                  rows={2}
                  className="input-field"
                  value={personForm.notes}
                  onChange={(e) => setPersonForm({ ...personForm, notes: e.target.value })}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowPersonModal(false)} className="btn-secondary">Cancel</button>
                <button type="submit" className="btn-primary">Save Person Record</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Diary Modal */}
      {showDiaryModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="glass-card p-6 border border-border w-full max-w-lg space-y-4">
            <h3 className="text-sm font-bold text-primary-text">Add Official Case Diary Entry</h3>
            <form onSubmit={handleAddDiary} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-muted-text mb-1">Entry Sequence #</label>
                  <input
                    type="number"
                    className="input-field"
                    value={diaryForm.entryNumber}
                    onChange={(e) => setDiaryForm({ ...diaryForm, entryNumber: parseInt(e.target.value, 10) })}
                  />
                </div>
                <div>
                  <label className="block text-muted-text mb-1">Location Visited</label>
                  <input
                    type="text"
                    className="input-field"
                    value={diaryForm.locationVisited}
                    onChange={(e) => setDiaryForm({ ...diaryForm, locationVisited: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className="block text-muted-text mb-1">Action Taken *</label>
                <input
                  required
                  type="text"
                  placeholder="e.g. Examined crime scene and questioned shopkeeper"
                  className="input-field"
                  value={diaryForm.actionTaken}
                  onChange={(e) => setDiaryForm({ ...diaryForm, actionTaken: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-muted-text mb-1">Observations & Facts Ascertained *</label>
                <textarea
                  required
                  rows={4}
                  className="input-field font-mono"
                  value={diaryForm.observations}
                  onChange={(e) => setDiaryForm({ ...diaryForm, observations: e.target.value })}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowDiaryModal(false)} className="btn-secondary">Cancel</button>
                <button type="submit" className="btn-primary">Commit Entry</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Panchnama Modal */}
      {showPanchnamaModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="glass-card p-6 border border-border w-full max-w-lg space-y-4">
            <h3 className="text-sm font-bold text-primary-text">Record Formal Panchnama</h3>
            <form onSubmit={handleAddPanchnama} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-muted-text mb-1">Panchnama Type</label>
                  <select
                    className="input-field"
                    value={panchnamaForm.panchnamaType}
                    onChange={(e) => setPanchnamaForm({ ...panchnamaForm, panchnamaType: e.target.value })}
                  >
                    <option value="SCENE_OF_CRIME">Scene of Crime</option>
                    <option value="SEIZURE">Seizure of Articles</option>
                    <option value="ARREST">Arrest Panchnama</option>
                    <option value="INQUEST">Inquest Panchnama</option>
                  </select>
                </div>
                <div>
                  <label className="block text-muted-text mb-1">Location Conducted *</label>
                  <input
                    required
                    type="text"
                    className="input-field"
                    value={panchnamaForm.location}
                    onChange={(e) => setPanchnamaForm({ ...panchnamaForm, location: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className="block text-muted-text mb-1">Panch Witnesses (Names & Addresses) *</label>
                <input
                  required
                  type="text"
                  className="input-field"
                  value={panchnamaForm.panchas}
                  onChange={(e) => setPanchnamaForm({ ...panchnamaForm, panchas: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-muted-text mb-1">Articles Seized & Labelled</label>
                <input
                  type="text"
                  placeholder="e.g. 1 Country pistol marked Ex-1, 2 Empty cartridges Ex-2"
                  className="input-field"
                  value={panchnamaForm.seizedItems}
                  onChange={(e) => setPanchnamaForm({ ...panchnamaForm, seizedItems: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-muted-text mb-1">Physical Observations</label>
                <textarea
                  rows={3}
                  className="input-field font-mono"
                  value={panchnamaForm.observations}
                  onChange={(e) => setPanchnamaForm({ ...panchnamaForm, observations: e.target.value })}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowPanchnamaModal(false)} className="btn-secondary">Cancel</button>
                <button type="submit" className="btn-primary">Record Panchnama</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Evidence Modal */}
      {showEvidenceModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="glass-card p-6 border border-border w-full max-w-lg space-y-4">
            <h3 className="text-sm font-bold text-primary-text">Register Physical / Digital Evidence Item</h3>
            <form onSubmit={handleAddEvidence} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-muted-text mb-1">Evidence Tag / Exhibit # *</label>
                  <input
                    required
                    type="text"
                    placeholder="e.g. EX-01-GUN"
                    className="input-field font-mono"
                    value={evidenceForm.evidenceTag}
                    onChange={(e) => setEvidenceForm({ ...evidenceForm, evidenceTag: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-muted-text mb-1">Category *</label>
                  <select
                    className="input-field"
                    value={evidenceForm.category}
                    onChange={(e) => setEvidenceForm({ ...evidenceForm, category: e.target.value })}
                  >
                    <option value="PHYSICAL">Physical Article</option>
                    <option value="FIREARM">Firearm / Weapon</option>
                    <option value="DIGITAL">Digital Device / Phone / Laptop</option>
                    <option value="BIOLOGICAL">Biological / Blood / Hair</option>
                    <option value="DOCUMENT">Questioned Document</option>
                    <option value="NARCOTIC">Narcotic / Contraband</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-muted-text mb-1">Item Description & Identifying Marks *</label>
                <input
                  required
                  type="text"
                  placeholder="e.g. 7.65mm country-made semi-automatic pistol, black finish"
                  className="input-field"
                  value={evidenceForm.description}
                  onChange={(e) => setEvidenceForm({ ...evidenceForm, description: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-muted-text mb-1">Collection Location *</label>
                  <input
                    required
                    type="text"
                    className="input-field"
                    value={evidenceForm.collectionLocation}
                    onChange={(e) => setEvidenceForm({ ...evidenceForm, collectionLocation: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-muted-text mb-1">Storage Location *</label>
                  <input
                    required
                    type="text"
                    className="input-field"
                    value={evidenceForm.storageLocation}
                    onChange={(e) => setEvidenceForm({ ...evidenceForm, storageLocation: e.target.value })}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowEvidenceModal(false)} className="btn-secondary">Cancel</button>
                <button type="submit" className="btn-primary">Register Item</button>
              </div>
            </form>
          </div>
        </div>
      )}

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

            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase font-mono text-muted-text tracking-wider">
                Cryptographic Chain of Custody Log
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

      {/* Forensic Submit Modal */}
      {showForensicSubmitModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="glass-card p-6 border border-border w-full max-w-lg space-y-4">
            <h3 className="text-sm font-bold text-primary-text">Dispatch Evidence to Forensic Laboratory</h3>
            <form onSubmit={handleForensicSubmit} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-muted-text mb-1">Target Forensic Lab *</label>
                  <select
                    required
                    className="input-field"
                    value={forensicSubmitForm.targetForensicOrgId}
                    onChange={(e) => setForensicSubmitForm({ ...forensicSubmitForm, targetForensicOrgId: e.target.value })}
                  >
                    <option value="">Select Lab</option>
                    {organizationsList.filter((o: any) => o.agency_branch === 'FORENSICS').map((org: any) => (
                      <option key={org.id} value={org.id}>{org.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-muted-text mb-1">Scientific Division *</label>
                  <select
                    className="input-field"
                    value={forensicSubmitForm.scientificDivision}
                    onChange={(e) => setForensicSubmitForm({ ...forensicSubmitForm, scientificDivision: e.target.value })}
                  >
                    <option value="BALLISTICS">Ballistics & Firearms</option>
                    <option value="DIGITAL_FORENSICS">Cyber & Digital Forensics</option>
                    <option value="DNA_BIOLOGY">DNA & Serology</option>
                    <option value="CHEMISTRY_TOXICOLOGY">Chemistry & Toxicology</option>
                    <option value="QUESTIONED_DOCUMENTS">Questioned Documents & Fingerprints</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-muted-text mb-1">Forwarding Memo Number *</label>
                <input
                  required
                  type="text"
                  placeholder="e.g. FSL/MEMO/2026/089"
                  className="input-field font-mono"
                  value={forensicSubmitForm.submissionMemoNumber}
                  onChange={(e) => setForensicSubmitForm({ ...forensicSubmitForm, submissionMemoNumber: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-muted-text mb-1">Specific Examination Requested *</label>
                <textarea
                  required
                  rows={3}
                  placeholder="e.g. Determine if test-fired cartridges match evidence exhibit EX-01"
                  className="input-field font-mono"
                  value={forensicSubmitForm.examinationRequested}
                  onChange={(e) => setForensicSubmitForm({ ...forensicSubmitForm, examinationRequested: e.target.value })}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowForensicSubmitModal(false)} className="btn-secondary">Cancel</button>
                <button type="submit" className="btn-primary">Dispatch Memo</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Forensic Report Modal */}
      {showForensicReportModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="glass-card p-6 border border-border w-full max-w-lg space-y-4">
            <h3 className="text-sm font-bold text-primary-text">Issue & Seal Formal Forensic Report</h3>
            <form onSubmit={handleForensicReport} className="space-y-3 text-xs">
              <div>
                <label className="block text-muted-text mb-1">Official Report Number *</label>
                <input
                  required
                  type="text"
                  placeholder="e.g. RFSL-SRT-BAL-2026-441"
                  className="input-field font-mono"
                  value={forensicReportForm.reportNumber}
                  onChange={(e) => setForensicReportForm({ ...forensicReportForm, reportNumber: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-muted-text mb-1">Summary of Scientific Examination & Methodology *</label>
                <textarea
                  required
                  rows={3}
                  placeholder="e.g. Microscopic comparison analysis of breech face and striker pin impressions..."
                  className="input-field font-mono"
                  value={forensicReportForm.summaryOfAnalysis}
                  onChange={(e) => setForensicReportForm({ ...forensicReportForm, summaryOfAnalysis: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-muted-text mb-1">Formal Scientific Conclusion *</label>
                <textarea
                  required
                  rows={3}
                  placeholder="e.g. The questioned cartridge cases were fired through the seized 7.65mm pistol to the exclusion of all other weapons."
                  className="input-field font-mono"
                  value={forensicReportForm.formalConclusion}
                  onChange={(e) => setForensicReportForm({ ...forensicReportForm, formalConclusion: e.target.value })}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowForensicReportModal(false)} className="btn-secondary">Cancel</button>
                <button type="submit" className="btn-primary">Sign & Seal Report</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Court Register Modal */}
      {showCourtRegisterModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="glass-card p-6 border border-border w-full max-w-lg space-y-4">
            <h3 className="text-sm font-bold text-primary-text">Register Case in Judicial Court</h3>
            <form onSubmit={handleCourtRegister} className="space-y-3 text-xs">
              <div>
                <label className="block text-muted-text mb-1">Target Court Establishment *</label>
                <select
                  required
                  className="input-field"
                  value={courtRegisterForm.courtOrganizationId}
                  onChange={(e) => setCourtRegisterForm({ ...courtRegisterForm, courtOrganizationId: e.target.value })}
                >
                  <option value="">Select Court</option>
                  {organizationsList.filter((o: any) => o.agency_branch === 'JUDICIARY').map((org: any) => (
                    <option key={org.id} value={org.id}>{org.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-muted-text mb-1">Case Number Record (CNR) *</label>
                <input
                  required
                  type="text"
                  placeholder="e.g. GJSR01-004412-2026"
                  className="input-field font-mono"
                  value={courtRegisterForm.cnrNumber}
                  onChange={(e) => setCourtRegisterForm({ ...courtRegisterForm, cnrNumber: e.target.value })}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowCourtRegisterModal(false)} className="btn-secondary">Cancel</button>
                <button type="submit" className="btn-primary">Register Court Case</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Hearing Proceeding Modal */}
      {showProceedingModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="glass-card p-6 border border-border w-full max-w-lg space-y-4">
            <h3 className="text-sm font-bold text-primary-text">Log Judicial Hearing Proceeding</h3>
            <form onSubmit={handleCourtProceeding} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-muted-text mb-1">Hearing Date *</label>
                  <input
                    required
                    type="date"
                    className="input-field"
                    value={proceedingForm.hearingDate}
                    onChange={(e) => setProceedingForm({ ...proceedingForm, hearingDate: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-muted-text mb-1">Stage of Proceedings *</label>
                  <select
                    className="input-field"
                    value={proceedingForm.stage}
                    onChange={(e) => setProceedingForm({ ...proceedingForm, stage: e.target.value })}
                  >
                    <option value="APPEARANCE">First Appearance / Remand</option>
                    <option value="ARGUMENTS_ON_CHARGE">Framing of Charges</option>
                    <option value="PROSECUTION_EVIDENCE">Prosecution Witness Examination</option>
                    <option value="DEFENSE_EVIDENCE">Defense Evidence</option>
                    <option value="FINAL_ARGUMENTS">Final Arguments</option>
                    <option value="JUDGEMENT">Judgement</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-muted-text mb-1">Proceedings Notes & Summary *</label>
                <textarea
                  required
                  rows={3}
                  className="input-field font-mono"
                  value={proceedingForm.proceedingsSummary}
                  onChange={(e) => setProceedingForm({ ...proceedingForm, proceedingsSummary: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-muted-text mb-1">Next Hearing Date</label>
                <input
                  type="date"
                  className="input-field"
                  value={proceedingForm.nextHearingDate}
                  onChange={(e) => setProceedingForm({ ...proceedingForm, nextHearingDate: e.target.value })}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowProceedingModal(false)} className="btn-secondary">Cancel</button>
                <button type="submit" className="btn-primary">Commit Proceeding</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Court Order Modal */}
      {showCourtOrderModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="glass-card p-6 border border-border w-full max-w-lg space-y-4">
            <h3 className="text-sm font-bold text-primary-text">Issue Formal Court Order</h3>
            <form onSubmit={handleCourtOrder} className="space-y-3 text-xs">
              <div>
                <label className="block text-muted-text mb-1">Order Type *</label>
                <select
                  className="input-field"
                  value={courtOrderForm.orderType}
                  onChange={(e) => setCourtOrderForm({ ...courtOrderForm, orderType: e.target.value })}
                >
                  <option value="BAIL_ORDER">Bail Order (Granted / Rejected)</option>
                  <option value="POLICE_REMAND">Police Custody Remand</option>
                  <option value="SUMMONS_WARRANT">Witness Summons / Arrest Warrant</option>
                  <option value="EVIDENCE_DIRECTION">Direction for Forensic Re-examination</option>
                  <option value="INTERIM_ORDER">Interim Injunction / Direction</option>
                </select>
              </div>
              <div>
                <label className="block text-muted-text mb-1">Order Title / Summary *</label>
                <input
                  required
                  type="text"
                  placeholder="e.g. Regular Bail Application of Accused No. 1 Rejected"
                  className="input-field"
                  value={courtOrderForm.orderSummary}
                  onChange={(e) => setCourtOrderForm({ ...courtOrderForm, orderSummary: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-muted-text mb-1">Operative Text of Order *</label>
                <textarea
                  required
                  rows={4}
                  className="input-field font-mono"
                  value={courtOrderForm.operativeText}
                  onChange={(e) => setCourtOrderForm({ ...courtOrderForm, operativeText: e.target.value })}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowCourtOrderModal(false)} className="btn-secondary">Cancel</button>
                <button type="submit" className="btn-primary">Issue Order</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Judgement Modal */}
      {showJudgementModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="glass-card p-6 border border-border w-full max-w-lg space-y-4">
            <h3 className="text-sm font-bold text-primary-text">Pronounce Final Judicial Verdict</h3>
            <form onSubmit={handleCourtJudgement} className="space-y-3 text-xs">
              <div>
                <label className="block text-muted-text mb-1">Final Verdict *</label>
                <select
                  className="input-field font-mono"
                  value={judgementForm.verdict}
                  onChange={(e) => setJudgementForm({ ...judgementForm, verdict: e.target.value })}
                >
                  <option value="CONVICTED">CONVICTED</option>
                  <option value="ACQUITTED">ACQUITTED</option>
                  <option value="PARTIALLY_CONVICTED">PARTIALLY CONVICTED</option>
                  <option value="DISCHARGED">DISCHARGED</option>
                </select>
              </div>
              <div>
                <label className="block text-muted-text mb-1">Sentence / Disposition Summary *</label>
                <input
                  required
                  type="text"
                  placeholder="e.g. Accused sentenced to 7 years Rigorous Imprisonment with fine"
                  className="input-field"
                  value={judgementForm.sentenceSummary}
                  onChange={(e) => setJudgementForm({ ...judgementForm, sentenceSummary: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-muted-text mb-1">Full Operative Judgement Text *</label>
                <textarea
                  required
                  rows={4}
                  className="input-field font-mono"
                  value={judgementForm.fullJudgementText}
                  onChange={(e) => setJudgementForm({ ...judgementForm, fullJudgementText: e.target.value })}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowJudgementModal(false)} className="btn-secondary">Cancel</button>
                <button type="submit" className="btn-primary">Pronounce Judgement</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Chargesheet Modal */}
      {showChargesheetModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="glass-card p-6 border border-border w-full max-w-lg space-y-4">
            <h3 className="text-sm font-bold text-primary-text">Prepare and File Police Chargesheet</h3>
            <form onSubmit={handleFileChargesheet} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-muted-text mb-1">Chargesheet # *</label>
                  <input
                    required
                    type="text"
                    placeholder="e.g. CS/04/2026"
                    className="input-field font-mono"
                    value={chargesheetForm.chargesheetNumber}
                    onChange={(e) => setChargesheetForm({ ...chargesheetForm, chargesheetNumber: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-muted-text mb-1">Target Court *</label>
                  <select
                    required
                    className="input-field"
                    value={chargesheetForm.targetCourtId}
                    onChange={(e) => setChargesheetForm({ ...chargesheetForm, targetCourtId: e.target.value })}
                  >
                    <option value="">Select Court</option>
                    {organizationsList.filter((o: any) => o.agency_branch === 'JUDICIARY').map((org: any) => (
                      <option key={org.id} value={org.id}>{org.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-muted-text mb-1">Accused Chargesheeted (Comma separated) *</label>
                <input
                  required
                  type="text"
                  placeholder="e.g. Rajesh alias Raju, Suresh Kumar"
                  className="input-field"
                  value={chargesheetForm.accusedChargesheeted}
                  onChange={(e) => setChargesheetForm({ ...chargesheetForm, accusedChargesheeted: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-muted-text mb-1">Penal Sections Applied (Comma separated) *</label>
                <input
                  required
                  type="text"
                  placeholder="e.g. BNS Sec 309(4), BNS Sec 311, Arms Act Sec 25(1-B)"
                  className="input-field font-mono"
                  value={chargesheetForm.sectionsApplied}
                  onChange={(e) => setChargesheetForm({ ...chargesheetForm, sectionsApplied: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-muted-text mb-1">Summary of Evidence & Facts *</label>
                <textarea
                  required
                  rows={4}
                  className="input-field font-mono"
                  value={chargesheetForm.summaryOfEvidence}
                  onChange={(e) => setChargesheetForm({ ...chargesheetForm, summaryOfEvidence: e.target.value })}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowChargesheetModal(false)} className="btn-secondary">Cancel</button>
                <button type="submit" className="btn-primary">Submit Chargesheet</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="glass-card p-6 border border-border w-full max-w-md space-y-4">
            <h3 className="text-sm font-bold text-primary-text">Upload Document to Tamper-Proof Vault</h3>
            <form onSubmit={handleUploadDocument} className="space-y-3 text-xs">
              <div>
                <label className="block text-muted-text mb-1">Document Title *</label>
                <input
                  required
                  type="text"
                  placeholder="e.g. Signed FIR Copy or Ballistic Photo"
                  className="input-field"
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-muted-text mb-1">Category</label>
                  <select
                    className="input-field"
                    value={uploadCategory}
                    onChange={(e) => setUploadCategory(e.target.value)}
                  >
                    <option value="FIR_COPY">FIR Copy</option>
                    <option value="PANCHNAMA">Panchnama Sheet</option>
                    <option value="WITNESS_STATEMENT">Witness Statement</option>
                    <option value="FORENSIC_REPORT">Forensic Report</option>
                    <option value="COURT_ORDER">Court Order</option>
                    <option value="CHARGESHEET">Chargesheet</option>
                  </select>
                </div>
                <div>
                  <label className="block text-muted-text mb-1">Classification</label>
                  <select
                    className="input-field"
                    value={uploadClassification}
                    onChange={(e) => setUploadClassification(e.target.value)}
                  >
                    <option value="RESTRICTED">Restricted</option>
                    <option value="CONFIDENTIAL">Confidential</option>
                    <option value="SECRET">Secret</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-muted-text mb-1">Select File *</label>
                <input
                  required
                  type="file"
                  className="input-field py-1.5"
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowUploadModal(false)} className="btn-secondary">Cancel</button>
                <button type="submit" className="btn-primary">Upload & Hash</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

