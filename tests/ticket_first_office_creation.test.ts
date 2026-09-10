import assert from 'assert';
import { seedDatabase } from '../backend/src/services/seed';
import { query } from '../backend/src/services/db';

const BASE_URL = 'http://localhost:5000/api';

async function apiRequest(method: string, endpoint: string, body?: any, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const contentType = res.headers.get('content-type');
  let data: any = null;
  if (contentType && contentType.includes('application/json')) {
    data = await res.json();
  } else {
    data = await res.text();
  }

  return { status: res.status, data };
}

async function runTestSuite() {
  console.log('================================================================');
  console.log('  🏢 TICKET-FIRST OFFICE ESTABLISHMENT & LAYER INHERITANCE SUITE');
  console.log('================================================================\n');

  console.log('Step 0: Establishing database baseline via seedDatabase()...');
  await seedDatabase();

  // Step 1: Login as Master Admin
  console.log('Step 1: Authenticating as Master Admin...');
  const loginRes = await apiRequest('POST', '/auth/login', {
    identifier: 'master.admin@gujarat.gov.in',
    password: 'Gov@Secure2026!',
  });
  assert.strictEqual(loginRes.status, 200);
  const masterToken = loginRes.data.token;
  console.log('  ✅ Master Admin authenticated.');

  // Step 2: Test Loophole 1: Direct POST /api/organizations/nodes without ticket MUST be rejected (403)
  console.log('Step 2: Testing Loophole 1 (Direct office creation without ticket rejected)...');
  const amdRes = await query(`SELECT id, hierarchy_path FROM organization_nodes WHERE code = 'GUJ-POL-COMM-AHMEDABAD';`);
  const ahmedabadId = amdRes.rows[0].id;

  const directCreateRes = await apiRequest('POST', '/organizations/nodes', {
    parentId: ahmedabadId,
    name: 'Illicit Bypass Station',
    code: 'GUJ-POL-BYPASS',
  }, masterToken);

  assert.strictEqual(directCreateRes.status, 403);
  assert.strictEqual(directCreateRes.data.code, 'TICKET_REQUIRED');
  console.log('  ✅ Loophole 1 Blocked: Direct creation rejected with 403 Ticket Authorization Required.');

  // Step 3: Fetch dynamic layers for Police
  console.log('Step 3: Fetching dynamic layers for POLICE sovereign body...');
  const levelsRes = await apiRequest('GET', '/organizations/admin-levels?body=POLICE', undefined, masterToken);
  assert.strictEqual(levelsRes.status, 200);
  const policeLayers = levelsRes.data.adminLevels || [];
  assert.ok(policeLayers.length > 0, 'Police admin levels must exist');
  const level3Layer = policeLayers.find((l: any) => l.level_number === 3);
  assert.ok(level3Layer, 'Level 3 layer must exist for Police');
  console.log(`  ✅ Retrieved Layer: Level ${level3Layer.level_number} - ${level3Layer.name} (Type: ${level3Layer.office_type_name || level3Layer.office_type_id})`);

  // Step 4: Step 1 of Ticket-First Flow - Generate Compulsory Update Ticket & OTP
  console.log('Step 4: Step 1 of Ticket-First Flow: Generating Compulsory Update Ticket...');
  const ticketGenRes = await apiRequest('POST', '/tickets/request-otp', {
    actionType: 'CREATE_OFFICE',
    targetResourceType: 'ORGANIZATION_NODE',
    justification: 'Sanctioned establishment of Satellite Division Command Office under Gujarat Police Act',
    payload: {
      adminLevelId: level3Layer.id,
      bodyId: 'POLICE',
    },
  }, masterToken);

  assert.strictEqual(ticketGenRes.status, 201);
  const ticketId = ticketGenRes.data.ticketId;
  const ticketNumber = ticketGenRes.data.ticketNumber;
  const otpCode = ticketGenRes.data.devOtpPreview;
  assert.ok(ticketNumber.startsWith('TCK-'), 'Ticket number must have TCK- prefix');
  assert.ok(otpCode, 'Dev OTP preview must be generated');
  console.log(`  ✅ Update Ticket Generated: ${ticketNumber} (ID: ${ticketId}) with OTP: [ ${otpCode} ]`);

  // Step 5: Step 2 of Ticket-First Flow - Execute Ticket with OTP & Office Specifications
  console.log('Step 5: Step 2 of Ticket-First Flow: Executing Ticket with OTP & Office Specifications...');
  const execRes = await apiRequest('POST', '/tickets/execute-with-otp', {
    ticketId,
    otp: otpCode,
    payload: {
      parentId: ahmedabadId,
      adminLevelId: level3Layer.id,
      name: 'Satellite Division Command Office',
      code: 'GUJ-POL-AMD-SATELLITE',
      jurisdictionArea: 'Satellite, Jodhpur, and Bopal Corridor',
    },
  }, masterToken);

  assert.strictEqual(execRes.status, 200);
  assert.strictEqual(execRes.data.status, 'EXECUTED');
  const createdOffice = execRes.data.result;
  assert.strictEqual(createdOffice.name, 'Satellite Division Command Office');
  assert.strictEqual(createdOffice.code, 'GUJ-POL-AMD-SATELLITE');
  assert.strictEqual(createdOffice.level, 3);
  assert.strictEqual(createdOffice.admin_level_id, level3Layer.id);
  assert.strictEqual(createdOffice.type_id, level3Layer.office_type_id);
  assert.ok(createdOffice.hierarchy_path.includes('guj_pol_amd_satellite'));
  console.log(`  ✅ Office Established: '${createdOffice.name}' linked directly to Layer ${level3Layer.name} (Level ${createdOffice.level})`);

  // Step 6: Test Loophole 4 - Sovereign Agency Boundary on Parent Node
  console.log('Step 6: Testing Loophole 4 (Cross-agency parent assignment strictly blocked)...');
  const hcRes = await query(`SELECT id FROM organization_nodes WHERE code = 'GUJ-HC-APEX';`);
  const highCourtId = hcRes.rows[0].id;

  const crossAgencyTicket = await apiRequest('POST', '/tickets/request-otp', {
    actionType: 'CREATE_OFFICE',
    targetResourceType: 'ORGANIZATION_NODE',
    justification: 'Attempt to attach Police office under High Court',
    payload: {
      adminLevelId: level3Layer.id,
      bodyId: 'POLICE',
    },
  }, masterToken);

  const crossExecRes = await apiRequest('POST', '/tickets/execute-with-otp', {
    ticketId: crossAgencyTicket.data.ticketId,
    otp: crossAgencyTicket.data.devOtpPreview,
    payload: {
      parentId: highCourtId, // Judiciary node!
      adminLevelId: level3Layer.id,
      name: 'Illegal Cross Police Station',
      code: 'GUJ-POL-ILLEGAL-CROSS',
    },
  }, masterToken);

  assert.strictEqual(crossExecRes.status, 500);
  assert.ok(crossExecRes.data.message.includes('Institutional Boundary Violation'));
  console.log('  ✅ Loophole 4 Blocked: Cross-agency parent assignment rejected with Institutional Boundary Violation.');

  // Step 7: Test Loophole 7 - Inverted Hierarchy Level Blocked
  console.log('Step 7: Testing Loophole 7 (Inverted hierarchy level strictly blocked)...');
  const level2Layer = policeLayers.find((l: any) => l.level_number === 2);
  assert.ok(level2Layer, 'Level 2 layer must exist');

  const invertedTicket = await apiRequest('POST', '/tickets/request-otp', {
    actionType: 'CREATE_OFFICE',
    targetResourceType: 'ORGANIZATION_NODE',
    justification: 'Attempt to attach Level 2 Commissionerate under Level 3 Division',
    payload: {
      adminLevelId: level2Layer.id,
      bodyId: 'POLICE',
    },
  }, masterToken);

  const invertedExecRes = await apiRequest('POST', '/tickets/execute-with-otp', {
    ticketId: invertedTicket.data.ticketId,
    otp: invertedTicket.data.devOtpPreview,
    payload: {
      parentId: createdOffice.id, // Parent is Level 3!
      adminLevelId: level2Layer.id, // Target is Level 2! Inversion!
      name: 'Inverted Commissionerate',
      code: 'GUJ-POL-INVERTED',
    },
  }, masterToken);

  assert.strictEqual(invertedExecRes.status, 500);
  assert.ok(invertedExecRes.data.message.includes('Inverted Hierarchy Violation'));
  console.log('  ✅ Loophole 7 Blocked: Inverted hierarchy level rejected with Inverted Hierarchy Violation.');

  // Step 8: Test Office Tracking on the newly established office
  console.log('Step 8: Calling GET /api/organizations/nodes/:id/tracking on newly established office...');
  const trackingRes = await apiRequest('GET', `/organizations/nodes/${createdOffice.id}/tracking`, undefined, masterToken);
  assert.strictEqual(trackingRes.status, 200);
  const track = trackingRes.data;

  assert.strictEqual(track.office.id, createdOffice.id);
  assert.strictEqual(track.office.admin_level_name, level3Layer.name);
  assert.ok(track.governance && track.governance.supervisingAdministrators, 'Supervising administrators map must exist');
  assert.ok(track.tickets && track.tickets.length > 0, 'Compulsory tickets ledger must record creation ticket');
  const creationTicketRecord = track.tickets.find((t: any) => t.ticket_number === ticketNumber);
  assert.ok(creationTicketRecord, `Creation ticket ${ticketNumber} must be present in tracking ledger`);
  assert.strictEqual(creationTicketRecord.status, 'EXECUTED');
  console.log(`  ✅ Office Tracking Verified: Ticket ${ticketNumber} tracked in office ledger with full provenance.`);

  console.log('\n================================================================');
  console.log('  🎉 ALL TICKET-FIRST & DYNAMIC LAYER HIERARCHY TESTS PASSED (100%)');
  console.log('================================================================\n');
}

runTestSuite().catch(err => {
  console.error('\n❌ Test Suite Failed:', err);
  process.exit(1);
});
