import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { LinkIcon, LockIcon } from '../components/Icons';

interface Block {
  seq: number;
  prev_hash: string;
  event_type: string;
  event_ref_table: string | null;
  event_ref_id: string | null;
  body_id: string | null;
  payload_hash: string;
  block_hash: string;
  merkle_root: string | null;
  consensus_state: string;
  signed: boolean;
  created_at: string;
  org_code?: string | null;
  fir_number?: string | null;
  cosign_count?: number;
}

const short = (h?: string | null) => (h ? `${h.slice(0, 10)}…${h.slice(-6)}` : '—');

export const Ledger: React.FC = () => {
  const { user } = useAuth();
  const isMaster = user?.roleId === 'MASTER_ADMIN' || user?.roleId === 'SYSTEM_MASTER_ADMIN';

  const [blocks, setBlocks] = useState<Block[]>([]);
  const [integrity, setIntegrity] = useState<any>(null);
  const [config, setConfig] = useState<{ quorum: number; anchorTarget: string } | null>(null);
  const [checkpoints, setCheckpoints] = useState<any[]>([]);
  const [anchors, setAnchors] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Inclusion-proof verifier state
  const [refTable, setRefTable] = useState('cases');
  const [refId, setRefId] = useState('');
  const [proofResult, setProofResult] = useState<any>(null);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [b, v, c, cp, an] = await Promise.all([
        api.get<{ blocks: Block[] }>('/ledger?limit=200'),
        api.get<any>('/ledger/verify'),
        api.get<any>('/ledger/config'),
        api.get<{ checkpoints: any[] }>('/ledger/checkpoints'),
        api.get<{ anchors: any[] }>('/ledger/anchors'),
      ]);
      setBlocks(b.blocks || []);
      setIntegrity(v);
      setConfig(c);
      setCheckpoints(cp.checkpoints || []);
      setAnchors(an.anchors || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, []);

  const run = async (label: string, fn: () => Promise<any>) => {
    setBusy(label);
    try {
      await fn();
      await loadAll();
    } catch (err) {
      console.error(err);
    } finally {
      setBusy(null);
    }
  };

  const openBlock = async (seq: number) => {
    try {
      const res = await api.get<any>(`/ledger/block/${seq}`);
      setSelected(res);
    } catch (err) {
      console.error(err);
    }
  };

  // Fetch an inclusion proof, then INDEPENDENTLY re-verify it on the server's
  // pure recompute endpoint to demonstrate third-party verifiability.
  const verifyInclusion = async () => {
    setProofResult({ loading: true });
    try {
      const proof = await api.get<any>(`/ledger/proof/${encodeURIComponent(refTable)}/${encodeURIComponent(refId)}`);
      const check = await api.post<any>('/ledger/verify-proof', { proof: proof.proof });
      setProofResult({ ...proof, verified: check.valid });
    } catch (err: any) {
      setProofResult({ error: err?.message || 'record not anchored in the ledger' });
    }
  };

  const stateBadge = (s: string) => (
    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
      s === 'FINAL' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    : 'bg-amber-100 text-amber-800 border border-amber-300'
    }`}>{s}</span>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-primary-text flex items-center gap-2">
            <LinkIcon className="w-5 h-5 text-accent" />
            <span>Permissioned Blockchain Explorer</span>
          </h1>
          <p className="text-xs text-muted-text font-mono mt-0.5">
            Hash-Chain • Ed25519 Multi-Body Consensus • Merkle Inclusion Proofs • External Anchoring
          </p>
        </div>
        <button onClick={loadAll} disabled={loading} className="btn-secondary text-xs self-start sm:self-auto">
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {/* Integrity + config banner */}
      <div className={`glass-card p-4 border ${
        integrity == null ? 'border-border'
          : integrity.valid ? 'border-emerald-600/40 bg-emerald-50/20' : 'border-red-600/50 bg-red-50/20'
      }`}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <div className="text-xs font-bold text-primary-text flex items-center gap-2">
              <span>🔗 Chain Integrity</span>
              {integrity != null && (
                <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                  integrity.valid ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                  : 'bg-red-100 text-red-800 border border-red-300'
                }`}>{integrity.valid ? 'CHAIN INTACT ✓' : 'CHAIN BROKEN ✗'}</span>
              )}
            </div>
            <p className="text-[11px] text-muted-text font-mono mt-1">
              {integrity == null ? 'Not yet verified.'
                : integrity.valid
                  ? `${integrity.totalBlocks} blocks • ${integrity.checkedSignatures} body signatures verified`
                  : `Tamper at block #${integrity.brokenAt ?? '?'} — ${integrity.reason}`}
            </p>
          </div>
          {config && (
            <div className="flex items-center gap-4 text-[11px] font-mono text-muted-text">
              <div><span className="text-muted-darker">Quorum:</span> <span className="text-accent font-bold">{config.quorum} / 4 bodies</span></div>
              <div><span className="text-muted-darker">Anchor:</span> <span className="text-accent font-bold">{config.anchorTarget}</span></div>
            </div>
          )}
        </div>

        {isMaster && (
          <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-border/60">
            <button onClick={() => run('consensus', () => api.post('/ledger/consensus/round'))}
              disabled={!!busy} className="btn-secondary text-[11px]">
              {busy === 'consensus' ? 'Running…' : '⚖️ Run Consensus Round'}
            </button>
            <button onClick={() => run('checkpoint', () => api.post('/ledger/checkpoint'))}
              disabled={!!busy} className="btn-secondary text-[11px]">
              {busy === 'checkpoint' ? 'Sealing…' : '🧾 Seal Merkle Checkpoint'}
            </button>
            <button onClick={() => run('anchor', () => api.post('/ledger/anchor'))}
              disabled={!!busy} className="btn-secondary text-[11px]">
              {busy === 'anchor' ? 'Anchoring…' : '⚓ Anchor Checkpoint Externally'}
            </button>
          </div>
        )}
      </div>

      {/* Inclusion proof verifier */}
      <div className="glass-card p-4 border border-border">
        <div className="text-xs font-bold text-primary-text mb-2 flex items-center gap-2">
          <LockIcon className="w-4 h-4 text-accent" /> Merkle Inclusion Proof
        </div>
        <p className="text-[11px] text-muted-text font-mono mb-3">
          Prove one record's block is committed to a checkpoint root without revealing any other block.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="text-[10px] font-mono text-muted-darker block mb-0.5">Ref table</label>
            <select className="input-field text-xs" value={refTable} onChange={(e) => setRefTable(e.target.value)}>
              <option value="cases">cases</option>
              <option value="evidence">evidence</option>
              <option value="documents">documents</option>
              <option value="users">users</option>
              <option value="audit_logs">audit_logs</option>
            </select>
          </div>
          <div className="flex-1 min-w-[180px]">
            <label className="text-[10px] font-mono text-muted-darker block mb-0.5">Ref id</label>
            <input className="input-field text-xs" value={refId} onChange={(e) => setRefId(e.target.value)}
              placeholder="record UUID / id" />
          </div>
          <button onClick={verifyInclusion} disabled={!refId} className="btn-secondary text-xs">Generate & Verify</button>
        </div>

        {proofResult && !proofResult.loading && (
          <div className="mt-3 text-[11px] font-mono">
            {proofResult.error ? (
              <span className="text-red-700">✗ {proofResult.error}</span>
            ) : (
              <div className={`p-3 rounded border ${proofResult.verified ? 'border-emerald-300 bg-emerald-50/40' : 'border-red-300 bg-red-50/40'}`}>
                <div className="font-bold mb-1">
                  {proofResult.verified ? '✓ INCLUSION VERIFIED' : '✗ PROOF INVALID'}
                  {proofResult.againstLiveTip && <span className="ml-2 text-amber-700">(against live tip — not yet checkpointed)</span>}
                </div>
                <div className="text-muted-text">Block #{proofResult.blockSeq} • {proofResult.eventType}
                  {proofResult.checkpointSeq != null && ` • checkpoint #${proofResult.checkpointSeq}`}</div>
                <div className="text-muted-darker">root {short(proofResult.proof?.root)} • {proofResult.proof?.path?.length} sibling hashes</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Checkpoints + anchors */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="glass-card p-4 border border-border">
          <div className="text-xs font-bold text-primary-text mb-2">🧾 Merkle Checkpoints ({checkpoints.length})</div>
          {checkpoints.length === 0 ? (
            <p className="text-[11px] text-muted-text font-mono">None sealed yet.</p>
          ) : (
            <div className="space-y-1.5 max-h-56 overflow-y-auto font-mono text-[10.5px]">
              {checkpoints.map((c) => (
                <div key={c.checkpoint_seq} className="flex items-center justify-between p-2 bg-surface rounded border border-border">
                  <span className="text-primary-text font-bold">#{c.checkpoint_seq}</span>
                  <span className="text-muted-text">blk {c.from_seq}–{c.to_seq}</span>
                  <span className="text-accent">{short(c.merkle_root)}</span>
                  <span className={c.anchor_status ? 'text-emerald-700' : 'text-muted-darker'}>
                    {c.anchor_status ? `⚓ ${c.anchor_target}` : 'unanchored'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="glass-card p-4 border border-border">
          <div className="text-xs font-bold text-primary-text mb-2">⚓ External Anchors ({anchors.length})</div>
          {anchors.length === 0 ? (
            <p className="text-[11px] text-muted-text font-mono">No roots anchored externally yet.</p>
          ) : (
            <div className="space-y-1.5 max-h-56 overflow-y-auto font-mono text-[10.5px]">
              {anchors.map((a) => (
                <div key={a.checkpointSeq} className="flex items-center justify-between p-2 bg-surface rounded border border-border">
                  <span className="text-primary-text font-bold">cp #{a.checkpointSeq}</span>
                  <span className="text-muted-text">{a.target}</span>
                  <span className="text-accent">{short(a.root)}</span>
                  <span className={a.receiptValid ? 'text-emerald-700' : 'text-red-700'}>
                    {a.receiptValid ? 'receipt ✓' : a.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Blocks table */}
      <div className="glass-card overflow-hidden border border-border">
        <div className="px-4 py-2 border-b border-border text-xs font-bold text-primary-text">Blocks (newest first)</div>
        {loading ? (
          <div className="p-8 text-center text-xs text-muted-text font-mono">Loading chain…</div>
        ) : blocks.length === 0 ? (
          <div className="p-12 text-center text-xs text-muted-text">No blocks in scope.</div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="bg-surface border-b border-border text-[11px] font-mono uppercase text-muted-text">
              <tr>
                <th className="py-2.5 px-4">#</th>
                <th className="py-2.5 px-4">Event</th>
                <th className="py-2.5 px-4">Body</th>
                <th className="py-2.5 px-4">Block Hash</th>
                <th className="py-2.5 px-4">Consensus</th>
                <th className="py-2.5 px-4 text-right">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border font-mono text-[11px]">
              {blocks.map((b) => (
                <tr key={b.seq} onClick={() => openBlock(b.seq)} className="hover:bg-surface/50 cursor-pointer transition-colors">
                  <td className="py-2.5 px-4 font-bold text-primary-text">{b.seq}</td>
                  <td className="py-2.5 px-4">
                    <span className="text-primary-text font-semibold">{b.event_type}</span>
                    {b.fir_number && <div className="text-[10px] text-muted-darker">{b.fir_number}</div>}
                  </td>
                  <td className="py-2.5 px-4 text-muted-text">{b.body_id || '—'}</td>
                  <td className="py-2.5 px-4 text-accent">{short(b.block_hash)}</td>
                  <td className="py-2.5 px-4">
                    {stateBadge(b.consensus_state)}
                    {config && <span className="ml-1.5 text-[10px] text-muted-darker">{b.cosign_count ?? 0}/{config.quorum}</span>}
                  </td>
                  <td className="py-2.5 px-4 text-right text-[10px] text-muted-text">{new Date(b.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Block detail modal */}
      {selected && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setSelected(null)}>
          <div className="glass-card p-6 border border-border w-full max-w-2xl space-y-4 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="text-base font-bold font-mono text-primary-text flex items-center gap-2">
                Block #{selected.block.seq}
                {stateBadge(selected.block.consensus_state)}
              </div>
              <button onClick={() => setSelected(null)} className="text-muted-text hover:text-primary-text">✕</button>
            </div>

            <div className="space-y-1.5 font-mono text-[11px]">
              {[
                ['Event', selected.block.event_type],
                ['Originating body', selected.block.body_id || '—'],
                ['Anchors', selected.block.event_ref_table ? `${selected.block.event_ref_table}:${selected.block.event_ref_id}` : '—'],
                ['prev_hash', selected.block.prev_hash],
                ['payload_hash', selected.block.payload_hash],
                ['block_hash', selected.block.block_hash],
                ['merkle_root', selected.block.merkle_root || '—'],
              ].map(([k, v]) => (
                <div key={k as string} className="flex gap-2">
                  <span className="text-muted-darker w-28 shrink-0">{k}</span>
                  <span className="text-primary-text break-all">{v as string}</span>
                </div>
              ))}
            </div>

            {selected.consensus && (
              <div className="pt-2 border-t border-border">
                <div className="text-xs font-bold text-primary-text mb-2">
                  Consensus • {selected.consensus.validSignatures}/{selected.consensus.quorum} valid co-signatures
                </div>
                {selected.consensus.signatures.length === 0 ? (
                  <p className="text-[11px] text-muted-text font-mono">No co-signatures yet — run a consensus round.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {selected.consensus.signatures.map((s: any) => (
                      <div key={s.bodyId} className="p-2 bg-surface rounded border border-border font-mono text-[10.5px] flex items-center justify-between">
                        <span className="text-primary-text font-bold">{s.bodyId}</span>
                        <span className={s.valid ? 'text-emerald-700' : 'text-red-700'}>{s.valid ? 'signed ✓' : 'invalid ✗'}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
