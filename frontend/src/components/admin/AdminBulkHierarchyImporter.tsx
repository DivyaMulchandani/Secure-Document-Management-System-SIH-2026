import React, { useState, useEffect } from 'react';
import { api } from '../../lib/api';

interface OfficeNode {
  id: string;
  name: string;
  code: string;
  level: number;
  hierarchy_path?: string;
  agency_branch: string;
  body_id?: string;
}

interface PreviewItem {
  index: number;
  name: string;
  code: string;
  level: number;
  parentIndex: number | null;
  parentName: string;
  hierarchyPath: string;
  typeId: string;
}

interface AdminBulkHierarchyImporterProps {
  onImportSuccess: () => void;
}

const TEMPLATES: Record<string, string> = {
  POLICE: `Director General of Police Headquarters (Apex)
  Ahmedabad City Police Commissionerate
    Zone 1 Central Division
      Navrangpura Police Station
      Ellisbridge Police Station
      University Police Station
    Zone 2 West Division
      Vastrapur Police Station
      Satellite Police Station
      Bodakdev Police Station
  Surat City Police Commissionerate
    Crime Branch Special Division
      Cyber Crime Police Station
      Economic Offences Wing Unit
  Gandhinagar District Range Office
    Gandhinagar Sector Division
      Sector 7 Police Station
      Sector 21 Police Station`,

  JUDICIARY: `High Court of Gujarat (State Apex Adjudication)
  Ahmedabad City Civil & Sessions Court
    Metropolitan Magistrate Division 1
      Court Room 101 - Commercial Disputes
      Court Room 102 - Serious Crimes
    Metropolitan Magistrate Division 2
      Court Room 201 - Summary Trials
  Surat District & Sessions Court
    Special CBI & Anti-Corruption Court
    Chief Judicial Magistrate Bench`,

  FORENSICS: `Directorate of Forensic Science Services Headquarters
  Regional Forensic Science Laboratory Ahmedabad
    Ballistics & Firearms Division
    Digital Evidence Analysis Wing
    DNA Profiling Division
  Regional Forensic Science Laboratory Surat
    Chemical & Toxicology Examination Division
    Questioned Documents Division
  Mobile Crime Scene Forensic Investigation Unit`,
};

export const AdminBulkHierarchyImporter: React.FC<AdminBulkHierarchyImporterProps> = ({ onImportSuccess }) => {
  const [bodyId, setBodyId] = useState<'POLICE' | 'JUDICIARY' | 'FORENSICS'>('POLICE');
  const [rootParentId, setRootParentId] = useState<string>('');
  const [availableRoots, setAvailableRoots] = useState<OfficeNode[]>([]);
  const [textOutline, setTextOutline] = useState<string>(TEMPLATES.POLICE);
  const [preview, setPreview] = useState<PreviewItem[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [importing, setImporting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Fetch available parent offices for the selected body
  useEffect(() => {
    api.get<{ organizations: OfficeNode[] }>(`/organizations?body=${bodyId}`)
      .then(res => {
        const orgs = res.organizations || [];
        setAvailableRoots(orgs);
        // Default to Level 1 Apex node if available
        const apex = orgs.find(o => o.level === 1);
        setRootParentId(apex ? apex.id : '');
      })
      .catch(console.error);
  }, [bodyId]);

  // Load template
  const handleLoadTemplate = (selectedBody: 'POLICE' | 'JUDICIARY' | 'FORENSICS') => {
    setBodyId(selectedBody);
    setTextOutline(TEMPLATES[selectedBody]);
    setStatusMessage(null);
  };

  // Run Dry-run preview
  const handleGeneratePreview = async () => {
    if (!textOutline.trim()) {
      setStatusMessage({ type: 'error', text: 'Please enter or paste an outline of office names.' });
      return;
    }

    setLoadingPreview(true);
    setStatusMessage(null);

    try {
      const res = await api.post<any>('/organizations/batch-layer-import', {
        bodyId,
        rootParentId: rootParentId || undefined,
        textOutline,
        dryRun: true,
      });

      if (res.success && res.preview) {
        setPreview(res.preview);
        setStatusMessage({
          type: 'success',
          text: `Dry run complete. Validated ${res.count} office nodes across multi-level layers. Ready for live batch creation.`,
        });
      }
    } catch (err: any) {
      console.error('Failed to generate preview:', err);
      setStatusMessage({ type: 'error', text: `Preview generation failed: ${err.message}` });
    } finally {
      setLoadingPreview(false);
    }
  };

  // Execute Live Batch Import
  const handleCommitBatch = async () => {
    if (!textOutline.trim()) return;

    if (!confirm(`Confirm live creation of ${preview.length || 'specified'} office nodes into the ${bodyId} sovereign hierarchy?`)) {
      return;
    }

    setImporting(true);
    setStatusMessage(null);

    try {
      const res = await api.post<any>('/organizations/batch-layer-import', {
        bodyId,
        rootParentId: rootParentId || undefined,
        textOutline,
        dryRun: false,
      });

      if (res.success) {
        setStatusMessage({
          type: 'success',
          text: `Institutional Success: ${res.count} offices created layer-by-layer and committed to PostgreSQL audit vault.`,
        });
        setPreview([]);
        onImportSuccess();
      }
    } catch (err: any) {
      console.error('Batch import commit failed:', err);
      setStatusMessage({ type: 'error', text: `Batch commit failed: ${err.message}` });
    } finally {
      setImporting(false);
    }
  };

  const getLayerBadgeStyle = (level: number) => {
    switch (level) {
      case 1: return 'bg-blue-900 text-white border-blue-950 font-bold';
      case 2: return 'bg-blue-100 text-blue-900 border-blue-400 font-bold';
      case 3: return 'bg-emerald-100 text-emerald-900 border-emerald-400 font-bold';
      case 4: return 'bg-indigo-100 text-indigo-900 border-indigo-400 font-semibold';
      default: return 'bg-slate-100 text-slate-800 border-slate-300 font-mono';
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner with Instructions */}
      <div className="bg-white border border-slate-300 rounded-lg p-5 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold font-mono text-slate-900 uppercase tracking-wide flex items-center gap-2">
              <span>Layer-wise Hierarchy Builder & Bulk Importer</span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-blue-50 text-blue-900 border border-blue-300">
                MULTI-LEVEL TREE ENGINE
              </span>
            </h2>
            <p className="text-xs text-slate-600 font-mono mt-1">
              Paste an indented outline or layer-labeled list of office names. The engine automatically parses depth, establishes parent-child linkages, generates canonical codes, and executes atomic PostgreSQL creation.
            </p>
          </div>

          {/* Quick Template Fillers */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-mono font-bold text-slate-500 mr-1">Templates:</span>
            <button
              onClick={() => handleLoadTemplate('POLICE')}
              className={`px-2.5 py-1 text-xs font-mono font-semibold rounded border transition-colors cursor-pointer ${
                bodyId === 'POLICE' ? 'bg-blue-700 text-white border-blue-800' : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
              }`}
            >
              Police HQ
            </button>
            <button
              onClick={() => handleLoadTemplate('JUDICIARY')}
              className={`px-2.5 py-1 text-xs font-mono font-semibold rounded border transition-colors cursor-pointer ${
                bodyId === 'JUDICIARY' ? 'bg-emerald-700 text-white border-emerald-800' : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
              }`}
            >
              Judiciary
            </button>
            <button
              onClick={() => handleLoadTemplate('FORENSICS')}
              className={`px-2.5 py-1 text-xs font-mono font-semibold rounded border transition-colors cursor-pointer ${
                bodyId === 'FORENSICS' ? 'bg-indigo-700 text-white border-indigo-800' : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
              }`}
            >
              Forensics
            </button>
          </div>
        </div>
      </div>

      {/* Configuration & Input Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Settings & Textarea (7 cols) */}
        <div className="lg:col-span-6 space-y-4">
          <div className="bg-white border border-slate-300 rounded-lg p-5 shadow-xs space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold font-mono text-slate-800 uppercase mb-1">
                  Sovereign Body
                </label>
                <select
                  value={bodyId}
                  onChange={(e) => setBodyId(e.target.value as any)}
                  className="w-full text-xs font-mono p-2 rounded bg-slate-50 border border-slate-300 text-slate-900 focus:border-blue-600 focus:outline-none"
                >
                  <option value="POLICE">Gujarat Police Department</option>
                  <option value="JUDICIARY">Gujarat State Judiciary & Courts</option>
                  <option value="FORENSICS">Forensic Science Services (DFSS)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold font-mono text-slate-800 uppercase mb-1">
                  Anchor Parent Node
                </label>
                <select
                  value={rootParentId}
                  onChange={(e) => setRootParentId(e.target.value)}
                  className="w-full text-xs font-mono p-2 rounded bg-slate-50 border border-slate-300 text-slate-900 focus:border-blue-600 focus:outline-none"
                >
                  <option value="">Auto-Detect Apex Root (Level 1)</option>
                  {availableRoots.map(o => (
                    <option key={o.id} value={o.id}>
                      {'—'.repeat(Math.max(0, o.level - 1))} L{o.level}: {o.name} [{o.code}]
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold font-mono text-slate-800 uppercase">
                  Hierarchical Office Names Outline
                </label>
                <span className="text-[11px] font-mono text-slate-500">
                  Tip: Use 2 spaces or tabs to indent child layers
                </span>
              </div>
              <textarea
                value={textOutline}
                onChange={(e) => setTextOutline(e.target.value)}
                rows={14}
                placeholder="Apex Office Name&#10;  Layer 2 Office Name&#10;    Layer 3 Office Name&#10;      Layer 4 Police Station"
                className="w-full font-mono text-xs p-3.5 rounded bg-slate-50 border border-slate-300 text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-none leading-relaxed resize-y"
              />
            </div>

            {/* Action Bar */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-200">
              <button
                onClick={() => setTextOutline('')}
                className="text-xs font-mono text-slate-600 hover:text-red-700 underline cursor-pointer"
              >
                Clear Textbox
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleGeneratePreview}
                  disabled={loadingPreview}
                  className="px-3.5 py-2 rounded bg-white hover:bg-slate-50 text-slate-900 font-mono text-xs font-bold border border-slate-300 transition-colors shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  {loadingPreview ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-slate-700 border-t-transparent rounded-full animate-spin" />
                      <span>Parsing...</span>
                    </>
                  ) : (
                    <span>Generate Dry Run Preview</span>
                  )}
                </button>

                <button
                  onClick={handleCommitBatch}
                  disabled={importing || preview.length === 0}
                  className="px-4 py-2 rounded bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white font-mono text-xs font-bold transition-colors shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  {importing ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Committing to DB...</span>
                    </>
                  ) : (
                    <span>Commit Hierarchy Layer-wise</span>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Status Message Banner */}
          {statusMessage && (
            <div
              className={`p-3.5 rounded-lg border text-xs font-mono leading-relaxed ${
                statusMessage.type === 'success'
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                  : 'bg-red-50 border-red-300 text-red-900'
              }`}
            >
              {statusMessage.text}
            </div>
          )}
        </div>

        {/* Right Column: Visual Tree & Preview Matrix (6 cols) */}
        <div className="lg:col-span-6">
          <div className="bg-white border border-slate-300 rounded-lg p-5 shadow-xs h-full flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between border-b border-slate-200 pb-3 mb-3">
                <div>
                  <h3 className="text-sm font-bold font-mono text-slate-900 uppercase tracking-wide">
                    Live Hierarchy Preview
                  </h3>
                  <p className="text-[11px] text-slate-500 font-mono">
                    {preview.length > 0 ? `${preview.length} nodes parsed and validated` : 'Click "Generate Dry Run Preview" to inspect hierarchy tree'}
                  </p>
                </div>
                {preview.length > 0 && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-50 text-emerald-800 border border-emerald-300">
                    VALIDATED READY
                  </span>
                )}
              </div>

              {preview.length === 0 ? (
                <div className="py-16 text-center text-slate-500 font-mono text-xs space-y-2">
                  <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-2 text-lg">
                    🌳
                  </div>
                  <div className="font-bold text-slate-700">No Preview Generated Yet</div>
                  <div className="text-[11px] max-w-sm mx-auto">
                    Input your office outline on the left and click <strong>"Generate Dry Run Preview"</strong> to visualize layers, codes, and parent-child linkages before writing to the database.
                  </div>
                </div>
              ) : (
                <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                  {preview.map((item, idx) => (
                    <div
                      key={idx}
                      style={{ marginLeft: `${Math.max(0, item.level - 1) * 16}px` }}
                      className="p-2.5 rounded bg-slate-50 border border-slate-200 hover:border-blue-400 hover:bg-blue-50/40 transition-colors font-mono text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 truncate">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider ${getLayerBadgeStyle(item.level)}`}>
                            L{item.level}
                          </span>
                          <span className="font-bold text-slate-900 truncate">
                            {item.name}
                          </span>
                        </div>
                        <span className="text-[10.5px] font-bold text-blue-900 shrink-0">
                          {item.code}
                        </span>
                      </div>

                      <div className="text-[10.5px] text-slate-500 mt-1 flex items-center justify-between border-t border-slate-200/60 pt-1">
                        <span>Parent: <strong className="text-slate-700">{item.parentName}</strong></span>
                        <span className="text-slate-400 text-[9.5px]">Type: {item.typeId}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-200 text-[11px] font-mono text-slate-500 flex items-center justify-between mt-4">
              <span>CANONICAL CODING: <strong className="text-blue-900">AUTO-SLUG</strong></span>
              <span>ISOLATION: <strong className="text-emerald-800">SUBTREE ENFORCED</strong></span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

