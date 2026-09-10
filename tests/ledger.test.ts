/**
 * Hash-chained integrity ledger -- tamper-evidence tests.
 *
 * Run:  cd backend && npm run test:ledger
 * (requires the PostgreSQL database to be up and initialised)
 */
import assert from 'node:assert';
import { pool, query, withTransaction, initDatabase } from '../backend/src/services/db';
import { appendLedgerBlock, verifyLedger, canonicalJson, createCheckpoint, inclusionProof } from '../backend/src/services/ledger';
import { merkleRoot, buildProof, verifyProof } from '../backend/src/services/merkle';
import { runConsensusRound, getBlockConsensus, quorumSize } from '../backend/src/services/consensus';
import { anchorLatestCheckpoint, listAnchors } from '../backend/src/services/anchor';

async function run() {
  console.log('================================================================');
  console.log('  🔗  LEDGER INTEGRITY / TAMPER-EVIDENCE TEST SUITE');
  console.log('================================================================\n');

  await initDatabase();

  // ---------------------------------------------------------------
  // 1. canonicalJson is order-independent (stable hashing input)
  // ---------------------------------------------------------------
  console.log('▶ TEST 1: canonical JSON is key-order independent');
  assert.strictEqual(
    canonicalJson({ b: 1, a: { d: 4, c: 3 } }),
    canonicalJson({ a: { c: 3, d: 4 }, b: 1 })
  );
  assert.notStrictEqual(canonicalJson({ a: 1 }), canonicalJson({ a: 2 }));
  console.log('  ✔ deterministic serialisation verified.\n');

  // ---------------------------------------------------------------
  // 2. Append a run of blocks, then verify the whole chain
  // ---------------------------------------------------------------
  console.log('▶ TEST 2: append blocks and verify chain end-to-end');
  await query('TRUNCATE TABLE ledger_blocks, ledger_block_signatures, ledger_checkpoints, ledger_anchors RESTART IDENTITY CASCADE;');

  await withTransaction(async (tx) => {
    for (let i = 0; i < 5; i++) {
      await appendLedgerBlock(tx, {
        eventType: 'TEST_EVENT',
        refTable: 'test',
        refId: `row-${i}`,
        bodyId: 'POLICE',
        payload: { i, note: `block ${i}` },
      });
    }
  });

  let result = await verifyLedger();
  assert.strictEqual(result.valid, true, 'freshly built chain must verify');
  assert.strictEqual(result.totalBlocks, 5);
  assert.ok(result.checkedSignatures === 5, 'every block should carry a body signature');
  console.log(`  ✔ ${result.totalBlocks} blocks, ${result.checkedSignatures} signatures, chain intact.\n`);

  // ---------------------------------------------------------------
  // 3. Append-only trigger blocks direct UPDATE / DELETE
  // ---------------------------------------------------------------
  console.log('▶ TEST 3: database rejects direct mutation of ledger_blocks');
  await assert.rejects(
    () => query(`UPDATE ledger_blocks SET payload_hash = repeat('0',64) WHERE seq = 3;`),
    /append-only/i,
    'UPDATE on ledger_blocks must be rejected by the append-only trigger'
  );
  await assert.rejects(
    () => query(`DELETE FROM ledger_blocks WHERE seq = 3;`),
    /append-only/i,
    'DELETE on ledger_blocks must be rejected by the append-only trigger'
  );
  console.log('  ✔ direct UPDATE and DELETE both rejected.\n');

  // ---------------------------------------------------------------
  // 4. Forced tamper (trigger disabled) is detected by verifyLedger
  // ---------------------------------------------------------------
  console.log('▶ TEST 4: verifyLedger detects a forced historical edit');
  await withTransaction(async (tx) => {
    await tx.query('ALTER TABLE ledger_blocks DISABLE TRIGGER trg_ledger_blocks_append_only;');
    await tx.query(`UPDATE ledger_blocks SET payload_hash = repeat('a',64) WHERE seq = 3;`);
    await tx.query('ALTER TABLE ledger_blocks ENABLE TRIGGER trg_ledger_blocks_append_only;');
  });

  result = await verifyLedger();
  assert.strictEqual(result.valid, false, 'tampered chain must fail verification');
  assert.strictEqual(result.brokenAt, 3, 'break must be reported at the edited block');
  console.log(`  ✔ tamper detected at block #${result.brokenAt}: ${result.reason}\n`);

  // reset to a clean chain for the Phase 1-3 tests below
  await query('TRUNCATE TABLE ledger_blocks, ledger_block_signatures, ledger_checkpoints, ledger_anchors RESTART IDENTITY CASCADE;');

  // ---------------------------------------------------------------
  // 5. Merkle proof math is self-consistent and tamper-sensitive
  // ---------------------------------------------------------------
  console.log('▶ TEST 5: Merkle root + inclusion proof (pure math)');
  const leaves = Array.from({ length: 7 }, (_, i) => require('crypto').createHash('sha256').update(`leaf${i}`).digest('hex'));
  const root = merkleRoot(leaves);
  for (let i = 0; i < leaves.length; i++) {
    const proof = buildProof(leaves, i);
    assert.strictEqual(proof.root, root, `proof root must equal tree root for leaf ${i}`);
    assert.ok(verifyProof(proof), `proof for leaf ${i} must verify`);
  }
  // A tampered leaf must fail verification against the honest root.
  const bad = buildProof(leaves, 2);
  bad.leaf = require('crypto').createHash('sha256').update('forged').digest('hex');
  assert.strictEqual(verifyProof(bad), false, 'forged leaf must NOT verify against the real root');
  console.log(`  ✔ ${leaves.length} leaves: every inclusion proof verifies, forgery rejected.\n`);

  // ---------------------------------------------------------------
  // 6. Checkpoint + end-to-end inclusion proof over real blocks
  // ---------------------------------------------------------------
  console.log('▶ TEST 6: checkpoint seals blocks and record inclusion proves out');
  await withTransaction(async (tx) => {
    for (let i = 0; i < 6; i++) {
      await appendLedgerBlock(tx, {
        eventType: 'CASE_CREATED', refTable: 'cases', refId: `case-${i}`,
        bodyId: 'POLICE', payload: { i, note: `case ${i}` },
      });
    }
  });
  const cp = await withTransaction((tx) => createCheckpoint(tx));
  assert.ok(cp && cp.blockCount === 6, 'checkpoint must seal all 6 new blocks');
  const incl = await inclusionProof('cases', 'case-3');
  assert.ok(incl.found && incl.proof, 'record must be found in the ledger');
  assert.strictEqual(incl.againstLiveTip, false, 'case-3 must be covered by the sealed checkpoint');
  assert.strictEqual(incl.checkpointSeq, cp!.checkpointSeq, 'proof must cite the sealing checkpoint');
  assert.strictEqual(incl.proof!.root, cp!.merkleRoot, 'proof root must equal the checkpoint root');
  assert.ok(verifyProof(incl.proof!), 'real-block inclusion proof must verify');
  console.log(`  ✔ case-3 proven in checkpoint #${cp!.checkpointSeq} against root ${cp!.merkleRoot.slice(0, 12)}…\n`);

  // ---------------------------------------------------------------
  // 7. Consensus: quorum of bodies co-sign => block becomes FINAL
  // ---------------------------------------------------------------
  console.log('▶ TEST 7: quorum consensus finalises proposed blocks');
  const before = await getBlockConsensus(1);
  assert.strictEqual(before!.state, 'PROPOSED', 'a fresh block starts PROPOSED');
  const roundRes = await runConsensusRound();
  assert.ok(roundRes.processed >= 6, 'all proposed blocks should finalise in one round');
  const after = await getBlockConsensus(1);
  assert.strictEqual(after!.state, 'FINAL', 'block must be FINAL after quorum co-signs');
  assert.ok(after!.validSignatures >= quorumSize(), 'valid signatures must meet quorum');
  console.log(`  ✔ ${roundRes.processed} blocks finalised, ${after!.validSignatures}/${quorumSize()} bodies co-signed block #1.\n`);

  // ---------------------------------------------------------------
  // 8. External anchor: checkpoint root gets a verifiable receipt
  // ---------------------------------------------------------------
  console.log('▶ TEST 8: checkpoint root is anchored with a verifiable receipt');
  const anchorRes = await withTransaction((tx) => anchorLatestCheckpoint(tx));
  assert.ok(anchorRes.anchored, 'latest checkpoint must anchor');
  const anchorList = await listAnchors();
  assert.ok(anchorList.length >= 1 && anchorList[0].receiptValid, 'anchor receipt must re-verify');
  assert.strictEqual(anchorList[0].root, cp!.merkleRoot, 'anchored root must match the checkpoint root');
  console.log(`  ✔ root anchored via ${anchorList[0].target}, receipt re-verified.\n`);

  // clean up test rows
  await query('TRUNCATE TABLE ledger_blocks, ledger_block_signatures, ledger_checkpoints, ledger_anchors RESTART IDENTITY CASCADE;');

  console.log('================================================================');
  console.log('  ✨ ALL LEDGER + BLOCKCHAIN TESTS PASSED');
  console.log('================================================================');
}

run()
  .then(() => pool.end())
  .catch((err) => {
    console.error('❌ LEDGER TEST SUITE FAILED:', err);
    pool.end();
    process.exit(1);
  });
