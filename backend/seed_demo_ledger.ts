/**
 * Demo data for the Blockchain Explorer.
 * Persists a realistic set of blocks so the Explorer page is populated:
 *   - a batch that is finalised + checkpointed + anchored (fully "settled")
 *   - a later batch left PROPOSED / un-checkpointed (shows pending + live-tip proof)
 * Safe to re-run: it only tops up if the chain looks empty.
 */
import { pool, query, withTransaction } from './src/services/db';
import { appendLedgerBlock, createCheckpoint } from './src/services/ledger';
import { runConsensusRound } from './src/services/consensus';
import { anchorLatestCheckpoint } from './src/services/anchor';

async function main() {
  const existing = Number((await query('SELECT COUNT(*)::int AS n FROM ledger_blocks')).rows[0].n);
  if (existing > 0) {
    console.log(`Ledger already has ${existing} blocks — clearing and reseeding demo data.`);
    await query('TRUNCATE TABLE ledger_blocks, ledger_block_signatures, ledger_checkpoints, ledger_anchors RESTART IDENTITY CASCADE;');
  }

  // Batch 1 — settled history (will be finalised + checkpointed + anchored)
  const batch1 = [
    { eventType: 'CASE_CREATED',       refTable: 'cases',    refId: 'FIR-2026-0001', caseId: null, bodyId: 'POLICE',    payload: { fir: 'FIR-2026-0001', crime: 'BNS 303 (theft)', station: 'Gandhinagar Sector-7' } },
    { eventType: 'EVIDENCE_CUSTODY',   refTable: 'evidence', refId: 'EV-1001',        caseId: null, bodyId: 'POLICE',    payload: { item: 'Samsung A54 phone', from: 'scene', to: 'malkhana', officer: 'PSI Patel' } },
    { eventType: 'FORENSIC_REPORT',    refTable: 'evidence', refId: 'EV-1001',        caseId: null, bodyId: 'FORENSICS', payload: { report: 'IMEI + call-log extracted', tool: 'Cellebrite' } },
    { eventType: 'CASE_CREATED',       refTable: 'cases',    refId: 'FIR-2026-0002', caseId: null, bodyId: 'POLICE',    payload: { fir: 'FIR-2026-0002', crime: 'BNS 318 (cheating)' } },
    { eventType: 'COURT_ORDER',        refTable: 'cases',    refId: 'FIR-2026-0001', caseId: null, bodyId: 'JUDICIARY', payload: { court: 'CJM Gandhinagar', order: 'remand 14 days' } },
  ];

  // Batch 2 — fresh activity (left PROPOSED, not yet checkpointed)
  const batch2 = [
    { eventType: 'EVIDENCE_CUSTODY',   refTable: 'evidence', refId: 'EV-1002',        caseId: null, bodyId: 'POLICE',    payload: { item: 'blood sample', from: 'scene', to: 'FSL' } },
    { eventType: 'FORENSIC_REPORT',    refTable: 'evidence', refId: 'EV-1002',        caseId: null, bodyId: 'FORENSICS', payload: { report: 'DNA profile', match: 'pending' } },
    { eventType: 'DOCUMENT_ANCHOR',    refTable: 'documents', refId: 'DOC-55',        caseId: null, bodyId: 'POLICE',    payload: { title: 'charge sheet draft', sha256: 'd1f2...' } },
  ];

  console.log('Appending batch 1 (settled history)…');
  await withTransaction(async (tx) => {
    for (const e of batch1) await appendLedgerBlock(tx, e as any);
  });

  console.log('Running consensus round → finalising batch 1…');
  await runConsensusRound();

  console.log('Sealing a Merkle checkpoint over batch 1…');
  const cp = await withTransaction((tx) => createCheckpoint(tx));
  console.log(`  checkpoint #${cp?.checkpointSeq} root ${cp?.merkleRoot.slice(0, 16)}…`);

  console.log('Anchoring the checkpoint root externally (LOCAL_NOTARY)…');
  const anc = await withTransaction((tx) => anchorLatestCheckpoint(tx));
  console.log(`  anchored via ${anc.target} (${anc.status})`);

  console.log('Appending batch 2 (left PROPOSED, un-checkpointed)…');
  await withTransaction(async (tx) => {
    for (const e of batch2) await appendLedgerBlock(tx, e as any);
  });

  const total = Number((await query('SELECT COUNT(*)::int AS n FROM ledger_blocks')).rows[0].n);
  console.log('\n================================================================');
  console.log(`  ✅ DEMO LEDGER READY — ${total} blocks`);
  console.log('  Try in the Explorer inclusion-proof box:');
  console.log('     evidence / EV-1001   → proven inside checkpoint #1');
  console.log('     evidence / EV-1002   → proven against the LIVE TIP (not yet sealed)');
  console.log('     cases    / FIR-2026-0001');
  console.log('  Batch 2 blocks show as PROPOSED until you press "Run Consensus Round".');
  console.log('================================================================');
}

main().then(() => pool.end()).catch((e) => { console.error(e); pool.end(); process.exit(1); });
