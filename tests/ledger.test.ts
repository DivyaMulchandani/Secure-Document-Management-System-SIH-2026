/**
 * Hash-chained integrity ledger -- tamper-evidence tests.
 *
 * Run:  cd backend && npm run test:ledger
 * (requires the PostgreSQL database to be up and initialised)
 */
import assert from 'node:assert';
import { pool, query, withTransaction, initDatabase } from '../backend/src/services/db';
import { appendLedgerBlock, verifyLedger, canonicalJson } from '../backend/src/services/ledger';

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
  await query('TRUNCATE TABLE ledger_blocks;');

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

  // clean up test rows
  await query('TRUNCATE TABLE ledger_blocks;');

  console.log('================================================================');
  console.log('  ✨ ALL LEDGER INTEGRITY TESTS PASSED');
  console.log('================================================================');
}

run()
  .then(() => pool.end())
  .catch((err) => {
    console.error('❌ LEDGER TEST SUITE FAILED:', err);
    pool.end();
    process.exit(1);
  });
