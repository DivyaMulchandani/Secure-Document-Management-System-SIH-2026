import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { StatusBadge } from '../components/ClassificationBadge';
import { PlusIcon, SearchIcon, FileTextIcon, Filter, X, AlertTriangle } from '../components/Icons';

export const Cases: React.FC = () => {
  const { user, hasPermission } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [cases, setCases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [showNewModal, setShowNewModal] = useState(searchParams.get('new') === 'true');
  const [showLegacyModal, setShowLegacyModal] = useState(false);

  // New FIR Form State
  const [newTitle, setNewTitle] = useState('');
  const [newLocation, setNewLocation] = useState('');
  const [newIncidentDate, setNewIncidentDate] = useState('');
  const [complainantName, setComplainantName] = useState('');
  const [complainantContact, setComplainantContact] = useState('');
  const [complainantAddress, setComplainantAddress] = useState('');
  const [actsSections, setActsSections] = useState('Bharatiya Nyaya Sanhita, 2023: Sec 309(4), Sec 311');
  const [firContent, setFirContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  // Legacy FIR State
  const [legacyFirNumber, setLegacyFirNumber] = useState('');
  const [legacyTitle, setLegacyTitle] = useState('');
  const [legacyYear, setLegacyYear] = useState('2024');
  const [legacyContent, setLegacyContent] = useState('');
  const [duplicateWarning, setDuplicateWarning] = useState<any>(null);

  const fetchCases = async () => {
    setLoading(true);
    try {
      let url = '/cases?';
      if (statusFilter) url += `status=${statusFilter}&`;
      if (searchQuery) url += `search=${encodeURIComponent(searchQuery)}&`;
      const res = await api.get<{ cases: any[] }>(url);
      setCases(res.cases || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCases();
  }, [statusFilter, searchQuery]);

  const handleCreateNewFir = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setSubmitting(true);

    try {
      const res = await api.post<any>('/cases', {
        caseType: 'NEW_FIR',
        title: newTitle,
        incidentLocation: newLocation,
        incidentDate: newIncidentDate || new Date(),
        originatingOrganizationId: user?.organizationId,
        firData: {
          complainantName,
          complainantContact,
          complainantAddress,
          actsAndSections: [{ act: 'Bharatiya Nyaya Sanhita, 2023', sections: actsSections.split(',') }],
          firContent,
        },
      });

      setShowNewModal(false);
      setSearchParams({});
      navigate(`/cases/${res.case.id}`);
    } catch (err: any) {
      setFormError(err.message || 'Failed to register FIR');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateLegacyFir = async (override = false) => {
    setFormError('');
    setSubmitting(true);

    try {
      const res = await api.post<any>('/cases', {
        caseType: 'LEGACY_FIR',
        legacyFirNumber,
        title: legacyTitle,
        year: parseInt(legacyYear, 10),
        originatingOrganizationId: user?.organizationId,
        confirmDuplicateOverride: override,
        firData: {
          complainantName: 'Historical Record',
          firContent: legacyContent || 'Migrated historical record',
          actsAndSections: [{ act: 'Indian Penal Code / Legacy Act', sections: ['Historical Sections'] }],
        },
      });

      setShowLegacyModal(false);
      setDuplicateWarning(null);
      navigate(`/cases/${res.case.id}`);
    } catch (err: any) {
      if (err.data?.warning && err.data?.existingCase) {
        setDuplicateWarning(err.data);
      } else {
        setFormError(err.message || 'Failed to ingest legacy case');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-primary-text">
            FIR & Case Workspaces
          </h1>
          <p className="text-xs text-muted-text font-mono">
            Originating & Participating Investigation Workspaces
          </p>
        </div>

        {hasPermission('CASE_CREATE') && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowLegacyModal(true)}
              className="btn-secondary"
            >
              <span>+ Ingest Legacy FIR</span>
            </button>
            <button
              onClick={() => setShowNewModal(true)}
              className="btn-primary"
            >
              <PlusIcon className="w-4 h-4" />
              <span>Register New FIR</span>
            </button>
          </div>
        )}
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <SearchIcon className="w-4 h-4 text-muted-text absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Filter by FIR number, case title, or location..."
            className="input-field pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="w-full sm:w-56">
          <select
            className="input-field"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All Lifecycle Stages</option>
            <option value="UNDER_INVESTIGATION">Under Investigation</option>
            <option value="CHARGESHEETED">Chargesheeted</option>
            <option value="TRIAL_IN_PROGRESS">Trial in Progress</option>
            <option value="DISPOSED">Disposed / Judgement</option>
          </select>
        </div>
      </div>

      {/* Cases Table */}
      <div className="glass-card overflow-hidden border border-border">
        {loading ? (
          <div className="p-8 text-center text-xs text-muted-text">Loading authorized cases...</div>
        ) : cases.length === 0 ? (
          <div className="p-12 text-center">
            <FileTextIcon className="w-10 h-10 text-muted-darker mx-auto mb-2" />
            <h3 className="text-sm font-semibold text-primary-text">No Cases Found</h3>
            <p className="text-xs text-muted-text mt-1 max-w-sm mx-auto">
              No cases match your filters within your jurisdictional scope.
            </p>
          </div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="bg-surface border-b border-border text-[11px] font-mono uppercase text-muted-text">
              <tr>
                <th className="py-3 px-4">FIR Number</th>
                <th className="py-3 px-4">Title & Occurrence</th>
                <th className="py-3 px-4">Originating Station</th>
                <th className="py-3 px-4">Investigator</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {cases.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => navigate(`/cases/${c.id}`)}
                  className="hover:bg-surface/60 cursor-pointer transition-colors"
                >
                  <td className="py-3 px-4 font-mono font-bold text-accent">
                    <div>{c.fir_number}</div>
                    {c.is_legacy && (
                      <span className="text-[9.5px] font-mono px-1 py-0.2 rounded bg-warning-light text-warning border border-warning/30">
                        LEGACY
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 max-w-xs">
                    <div className="font-semibold text-primary-text truncate">{c.title}</div>
                    <div className="text-[11px] text-muted-text truncate">{c.incident_location}</div>
                  </td>
                  <td className="py-3 px-4 font-mono text-[11px]">
                    <div>{c.originating_org_name}</div>
                    <div className="text-muted-darker">{c.originating_org_code}</div>
                  </td>
                  <td className="py-3 px-4 text-muted-text">
                    {c.lead_investigator_name || 'Unassigned'}
                  </td>
                  <td className="py-3 px-4">
                    <StatusBadge status={c.status} />
                  </td>
                  <td className="py-3 px-4 text-right">
                    <span className="text-xs font-semibold text-accent hover:underline">
                      Open Workspace →
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal: Register New FIR */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="glass-card max-w-xl w-full p-6 border border-border shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-border">
              <div>
                <h3 className="text-base font-bold text-primary-text">Register New First Information Report (FIR)</h3>
                <p className="text-xs text-muted-text font-mono">Automatic FIR Numbering & Case Workspace Provisioning</p>
              </div>
              <button onClick={() => setShowNewModal(false)} className="text-muted-text hover:text-primary-text">
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3 mb-4 rounded bg-danger-light border border-danger/30 text-danger text-xs font-medium">
                {formError}
              </div>
            )}

            <form onSubmit={handleCreateNewFir} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-muted-text mb-1">Case Title / Incident Heading *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Armed Robbery and Aggravated Assault at Commercial Vault"
                  className="input-field"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-muted-text mb-1">Incident Date & Time</label>
                  <input
                    type="datetime-local"
                    className="input-field font-mono"
                    value={newIncidentDate}
                    onChange={(e) => setNewIncidentDate(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block font-semibold text-muted-text mb-1">Incident Location / Scene *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Ring Road Basement Bay 3, Surat"
                    className="input-field"
                    value={newLocation}
                    onChange={(e) => setNewLocation(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-muted-text mb-1">Complainant Full Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="Full name of informant/complainant"
                    className="input-field"
                    value={complainantName}
                    onChange={(e) => setComplainantName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block font-semibold text-muted-text mb-1">Complainant Contact</label>
                  <input
                    type="text"
                    placeholder="+91-98250-XXXXX"
                    className="input-field"
                    value={complainantContact}
                    onChange={(e) => setComplainantContact(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-muted-text mb-1">Complainant Address</label>
                <input
                  type="text"
                  placeholder="Residential / office address"
                  className="input-field"
                  value={complainantAddress}
                  onChange={(e) => setComplainantAddress(e.target.value)}
                />
              </div>

              <div>
                <label className="block font-semibold text-muted-text mb-1">Applicable Penal Acts & Sections *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Bharatiya Nyaya Sanhita, 2023: Sec 309(4), Sec 311"
                  className="input-field font-mono"
                  value={actsSections}
                  onChange={(e) => setActsSections(e.target.value)}
                />
              </div>

              <div>
                <label className="block font-semibold text-muted-text mb-1">FIR Substance / Incident Narrative *</label>
                <textarea
                  required
                  rows={4}
                  placeholder="Enter detailed facts of the case..."
                  className="input-field"
                  value={firContent}
                  onChange={(e) => setFirContent(e.target.value)}
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="btn-primary"
                >
                  {submitting ? 'Registering FIR...' : 'Submit & Create Workspace'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Ingest Legacy Case */}
      {showLegacyModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="glass-card max-w-lg w-full p-6 border border-border shadow-2xl">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-border">
              <div>
                <h3 className="text-base font-bold text-primary-text">Ingest Historical / Legacy FIR</h3>
                <p className="text-xs text-muted-text font-mono">Preserve original historical identifiers with duplicate checks</p>
              </div>
              <button onClick={() => { setShowLegacyModal(false); setDuplicateWarning(null); }} className="text-muted-text hover:text-primary-text">
                <X className="w-5 h-5" />
              </button>
            </div>

            {duplicateWarning ? (
              <div className="space-y-4 text-xs">
                <div className="p-4 rounded bg-warning-light border border-warning/40 text-primary-text space-y-2">
                  <div className="flex items-center gap-2 font-bold text-warning">
                    <AlertTriangle className="w-5 h-5 shrink-0" />
                    <span>Potential Duplicate Case Detected</span>
                  </div>
                  <p className="text-xs text-muted-text">
                    A record with legacy FIR <strong>{duplicateWarning.existingCase?.fir_number}</strong> already exists in this organization.
                  </p>
                  <div className="p-2 rounded bg-bg font-mono text-[11px]">
                    Title: {duplicateWarning.existingCase?.title}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    onClick={() => setDuplicateWarning(null)}
                    className="btn-secondary"
                  >
                    Back to Edit
                  </button>
                  <button
                    onClick={() => handleCreateLegacyFir(true)}
                    className="btn-primary bg-warning hover:bg-warning/80"
                  >
                    Confirm & Proceed Override
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4 text-xs">
                {formError && (
                  <div className="p-3 rounded bg-danger-light border border-danger/30 text-danger text-xs font-medium">
                    {formError}
                  </div>
                )}

                <div>
                  <label className="block font-semibold text-muted-text mb-1">Original / Legacy FIR Number *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 142/2019"
                    className="input-field font-mono"
                    value={legacyFirNumber}
                    onChange={(e) => setLegacyFirNumber(e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-muted-text mb-1">Registration Year *</label>
                    <input
                      type="number"
                      required
                      className="input-field font-mono"
                      value={legacyYear}
                      onChange={(e) => setLegacyYear(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-muted-text mb-1">Originating Station</label>
                    <input
                      type="text"
                      disabled
                      className="input-field font-mono bg-bg text-muted-text"
                      value={user?.organizationCode}
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-muted-text mb-1">Case Title *</label>
                  <input
                    type="text"
                    required
                    placeholder="Brief description of historical case..."
                    className="input-field"
                    value={legacyTitle}
                    onChange={(e) => setLegacyTitle(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block font-semibold text-muted-text mb-1">Historical Notes / General Diary Ref</label>
                  <textarea
                    rows={3}
                    placeholder="Details from physical paper ledger..."
                    className="input-field"
                    value={legacyContent}
                    onChange={(e) => setLegacyContent(e.target.value)}
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                  <button
                    type="button"
                    onClick={() => setShowLegacyModal(false)}
                    className="btn-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => handleCreateLegacyFir(false)}
                    className="btn-primary"
                  >
                    {submitting ? 'Verifying...' : 'Validate & Ingest Legacy File'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
