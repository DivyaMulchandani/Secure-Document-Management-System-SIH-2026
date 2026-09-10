import assert from 'node:assert';
import http from 'node:http';
import { query } from '../backend/src/services/db';
import { seedDatabase } from '../backend/src/services/seed';

const BASE_URL = 'http://127.0.0.1:5000';

function apiRequest(
  method: string,
  path: string,
  body?: any,
  token?: string
): Promise<{ status: number; data: any; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const postData = body ? JSON.stringify(body) : '';

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
      headers['Cookie'] = `session_token=${token}`;
    }
    if (body) {
      headers['Content-Length'] = Buffer.byteLength(postData).toString();
    }

    const req = http.request(
      url,
      {
        method,
        headers,
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          let data = null;
          try {
            data = JSON.parse(raw);
          } catch {
            data = raw;
          }
          resolve({ status: res.statusCode || 500, data, headers: res.headers });
        });
      }
    );

    req.on('error', reject);
    if (body) req.write(postData);
    req.end();
  });
}

async function runTests() {
  console.log('================================================================');
  console.log('  🏛️  RUNNING PASSWORDLESS OTP & COMPULSORY TICKETS TEST SUITE');
  console.log('================================================================\n');

  // Step 0: Ensure clean seed
  console.log('Step 0: Establishing database baseline via seedDatabase()...');
  await seedDatabase();

  // Test 1: Passwordless OTP Request for Master Admin
  console.log('\nTest 1: Requesting passwordless login OTP for Master Admin (master.admin@gujarat.gov.in)...');
  const otpReq = await apiRequest('POST', '/api/auth/request-otp', {
    identifier: 'master.admin@gujarat.gov.in',
  });
  assert.strictEqual(otpReq.status, 200, `Expected 200, got ${otpReq.status}`);
  assert.strictEqual(otpReq.data.success, true);
  assert.ok(otpReq.data.devOtpPreview, 'Expected devOtpPreview in response');
  const masterOtp = otpReq.data.devOtpPreview;
  console.log(`  ✅ Test 1 PASSED: OTP requested. Dev OTP Preview: [ ${masterOtp} ]`);

  // Test 2: Verify Passwordless Login OTP
  console.log('\nTest 2: Verifying passwordless login OTP...');
  const otpVerify = await apiRequest('POST', '/api/auth/verify-otp', {
    identifier: 'master.admin@gujarat.gov.in',
    otp: masterOtp,
  });
  assert.strictEqual(otpVerify.status, 200, `Expected 200, got ${otpVerify.status}`);
  assert.strictEqual(otpVerify.data.success, true);
  assert.ok(otpVerify.data.token, 'Expected session token');
  assert.ok(['MASTER_ADMIN', 'SYSTEM_MASTER_ADMIN'].includes(otpVerify.data.user.roleId));
  assert.ok(otpVerify.data.user.governmentId, 'Expected governmentId on user');
  const masterToken = otpVerify.data.token;
  console.log(`  ✅ Test 2 PASSED: Authenticated passwordlessly. User: ${otpVerify.data.user.displayName} (${otpVerify.data.user.governmentId})`);

  // Test 3: Office Positions Catalog Query (3 bodies)
  console.log('\nTest 3: Querying Office Positions Catalog grouped for all 3 sovereign bodies...');
  const posRes = await apiRequest('GET', '/api/organizations/office-positions', undefined, masterToken);
  assert.strictEqual(posRes.status, 200);
  assert.ok(posRes.data.grouped.POLICE?.length > 0, 'Expected Police office positions');
  assert.ok(posRes.data.grouped.JUDICIARY?.length > 0, 'Expected Judiciary office positions');
  assert.ok(posRes.data.grouped.FORENSICS?.length > 0, 'Expected Forensics office positions');
  console.log(`  ✅ Test 3 PASSED: Positions verified - Police: ${posRes.data.grouped.POLICE.length}, Judiciary: ${posRes.data.grouped.JUDICIARY.length}, Forensics: ${posRes.data.grouped.FORENSICS.length}`);

  // Test 4: Define a new Office Position Tag via compulsory ticket
  console.log('\nTest 4: Defining new Office Position via compulsory update ticket...');
  const newPosReq = await apiRequest('POST', '/api/tickets/request-otp', {
    actionType: 'CREATE_OFFICE_POSITION',
    targetResourceType: 'OFFICE_POSITION',
    justification: 'State Gazette Notification establishing Specialized Cyber Crime Units',
    payload: {
      bodyId: 'POLICE',
      name: 'Specialized Cyber Investigation Unit',
      code: 'CYBER_INVESTIGATION_UNIT',
      description: 'District level cyber offense investigation wing',
    },
  }, masterToken);
  assert.strictEqual(newPosReq.status, 201);
  assert.ok(newPosReq.data.ticketId);
  const posTicketId = newPosReq.data.ticketId;
  const posTicketOtp = newPosReq.data.devOtpPreview;

  const newPosExec = await apiRequest('POST', '/api/tickets/execute-with-otp', {
    ticketId: posTicketId,
    otp: posTicketOtp,
  }, masterToken);
  assert.strictEqual(newPosExec.status, 200);
  assert.strictEqual(newPosExec.data.status, 'EXECUTED');
  console.log(`  ✅ Test 4 PASSED: Office Position ticket ${newPosReq.data.ticketNumber} executed and verified.`);

  // Test 5: Office-First Admin Creation Flow:
  // Step 5a: Establish new subordinate office (Ellisbridge Division) via ticket
  console.log('\nTest 5a: Establishing new subordinate office (Ellisbridge Division) under Ahmedabad Commissionerate via ticket...');
  const ahmedabadOrgRes = await query(`SELECT id FROM organization_nodes WHERE code = 'GUJ-POL-COMM-AHMEDABAD';`);
  const ahmedabadId = ahmedabadOrgRes.rows[0].id;

  const createOfficeTicket = await apiRequest('POST', '/api/tickets/request-otp', {
    actionType: 'CREATE_OFFICE',
    targetResourceType: 'ORGANIZATION_NODE',
    justification: 'Home Department Sanction Order for Ahmedabad West Sector Expansion',
    payload: {
      parentId: ahmedabadId,
      typeId: 'POLICE_STATION',
      name: 'Ellisbridge Division Command Office',
      code: 'GUJ-POL-AMD-ELLISBRIDGE',
      jurisdictionArea: 'Ellisbridge, Paldi, and VS Hospital Corridor',
    },
  }, masterToken);
  assert.strictEqual(createOfficeTicket.status, 201);
  const officeTicketId = createOfficeTicket.data.ticketId;
  const officeTicketOtp = createOfficeTicket.data.devOtpPreview;

  const officeExec = await apiRequest('POST', '/api/tickets/execute-with-otp', {
    ticketId: officeTicketId,
    otp: officeTicketOtp,
  }, masterToken);
  assert.strictEqual(officeExec.status, 200);
  assert.strictEqual(officeExec.data.status, 'EXECUTED');
  const ellisbridgeOffice = officeExec.data.result;
  assert.ok(ellisbridgeOffice.id);
  console.log(`  ✅ Test 5a PASSED: Office created. Name: ${ellisbridgeOffice.name}, Code: ${ellisbridgeOffice.code}, Level: ${ellisbridgeOffice.level}`);

  // Step 5b: Station an Administrator in the newly established office
  console.log('\nTest 5b: Provisioning Station Administrator stationed at Ellisbridge with Government ID...');
  const adminTicket = await apiRequest('POST', '/api/tickets/request-otp', {
    actionType: 'CREATE_USER',
    targetResourceType: 'USER',
    justification: 'Deployment Order No. 881: ACP Ellisbridge Division Command',
    payload: {
      username: 'acp.ellisbridge',
      email: 'acp.ellisbridge@gujarat.gov.in',
      displayName: 'ACP V. K. Jadeja',
      governmentId: 'GJ-GOV-771234',
      badgeNumber: 'IPS-GJ-771',
      phoneNumber: '+91-79-26561100',
      designation: 'Assistant Commissioner of Police',
      departmentWing: 'Executive Policing & Investigation',
      clearanceLevel: 'TOP_SECRET',
      isLayerAdmin: true,
      roleId: 'NODE_ADMIN',
      organizationId: ellisbridgeOffice.id,
    },
  }, masterToken);
  assert.strictEqual(adminTicket.status, 201);
  const adminTicketId = adminTicket.data.ticketId;
  const adminTicketOtp = adminTicket.data.devOtpPreview;

  const adminExec = await apiRequest('POST', '/api/tickets/execute-with-otp', {
    ticketId: adminTicketId,
    otp: adminTicketOtp,
  }, masterToken);
  assert.strictEqual(adminExec.status, 200);
  const ellisbridgeAdmin = adminExec.data.result;
  assert.strictEqual(ellisbridgeAdmin.government_id, 'GJ-GOV-771234');
  console.log(`  ✅ Test 5b PASSED: Administrator provisioned. Name: ${ellisbridgeAdmin.display_name}, Gov ID: ${ellisbridgeAdmin.government_id}`);

  // Test 6: Newly Provisioned Admin Logs In Passwordlessly via Email + OTP
  console.log('\nTest 6: Ellisbridge Admin logs in passwordlessly via email and OTP...');
  const ellisLoginReq = await apiRequest('POST', '/api/auth/request-otp', {
    identifier: 'acp.ellisbridge@gujarat.gov.in',
  });
  assert.strictEqual(ellisLoginReq.status, 200);
  const ellisOtp = ellisLoginReq.data.devOtpPreview;

  const ellisLoginVerify = await apiRequest('POST', '/api/auth/verify-otp', {
    identifier: 'acp.ellisbridge@gujarat.gov.in',
    otp: ellisOtp,
  });
  assert.strictEqual(ellisLoginVerify.status, 200);
  assert.strictEqual(ellisLoginVerify.data.user.governmentId, 'GJ-GOV-771234');
  const ellisToken = ellisLoginVerify.data.token;
  console.log(`  ✅ Test 6 PASSED: Ellisbridge Admin authenticated passwordlessly. Scoped to: ${ellisLoginVerify.data.user.organizationName}`);

  // Test 7: Ellisbridge Admin creates officer in their office via compulsory ticket
  console.log('\nTest 7: Ellisbridge Admin enrolls investigating officer with Gov ID via compulsory ticket...');
  const officerTicket = await apiRequest('POST', '/api/tickets/request-otp', {
    actionType: 'CREATE_USER',
    targetResourceType: 'USER',
    justification: 'Induction of Field Investigator per SP Circular 2026/04',
    payload: {
      username: 'psi.rathod',
      email: 'psi.rathod@gujarat.gov.in',
      displayName: 'PSI D. S. Rathod',
      governmentId: 'GJ-GOV-554433',
      badgeNumber: 'PSI-AMD-884',
      phoneNumber: '+91-79-26561102',
      designation: 'Police Sub-Inspector',
      departmentWing: 'Law & Order Investigation',
      clearanceLevel: 'CONFIDENTIAL',
      isLayerAdmin: false,
      roleId: 'POLICE_OFFICER',
      organizationId: ellisbridgeOffice.id,
    },
  }, ellisToken);
  assert.strictEqual(officerTicket.status, 201);
  const officerTicketId = officerTicket.data.ticketId;
  const officerTicketOtp = officerTicket.data.devOtpPreview;

  const officerExec = await apiRequest('POST', '/api/tickets/execute-with-otp', {
    ticketId: officerTicketId,
    otp: officerTicketOtp,
  }, ellisToken);
  assert.strictEqual(officerExec.status, 200);
  const enrolledOfficer = officerExec.data.result;
  assert.strictEqual(enrolledOfficer.government_id, 'GJ-GOV-554433');
  console.log(`  ✅ Test 7 PASSED: Officer enrolled via update ticket ${officerTicket.data.ticketNumber}. Gov ID: ${enrolledOfficer.government_id}`);

  // Test 8: Ellisbridge Admin locks user via compulsory ticket
  console.log('\nTest 8: Ellisbridge Admin locks officer account via compulsory ticket...');
  const lockTicket = await apiRequest('POST', '/api/tickets/request-otp', {
    actionType: 'UPDATE_USER_STATUS',
    targetResourceType: 'USER',
    targetResourceId: enrolledOfficer.id,
    justification: 'Temporary security lock pending annual vigilance clearance',
    payload: {
      status: 'LOCKED',
    },
  }, ellisToken);
  assert.strictEqual(lockTicket.status, 201);
  const lockTicketId = lockTicket.data.ticketId;
  const lockTicketOtp = lockTicket.data.devOtpPreview;

  const lockExec = await apiRequest('POST', '/api/tickets/execute-with-otp', {
    ticketId: lockTicketId,
    otp: lockTicketOtp,
  }, ellisToken);
  assert.strictEqual(lockExec.status, 200);
  assert.strictEqual(lockExec.data.result.status, 'LOCKED');
  console.log(`  ✅ Test 8 PASSED: User status updated to LOCKED via ticket ${lockTicket.data.ticketNumber}.`);

  // Test 9: Subtree boundary check: Ellisbridge Admin is blocked from modifying Surat users
  console.log('\nTest 9: Verifying subtree boundary isolation: Ellisbridge Admin cannot modify Surat office nodes...');
  const suratOrgRes = await query(`SELECT id FROM organization_nodes WHERE code = 'GUJ-POL-COMM-SURAT';`);
  const suratId = suratOrgRes.rows[0].id;

  const illegalTicket = await apiRequest('POST', '/api/tickets/request-otp', {
    actionType: 'UPDATE_OFFICE',
    targetResourceType: 'ORGANIZATION_NODE',
    targetResourceId: suratId,
    justification: 'Attempting unauthorized modification of Surat office',
    payload: {
      name: 'Unauthorized Hack Name',
    },
  }, ellisToken);
  // Should fail with 403 Access Denied or Boundary Violation
  assert.strictEqual(illegalTicket.status, 403, `Expected 403, got ${illegalTicket.status}`);
  console.log(`  ✅ Test 9 PASSED: Unauthorized cross-subtree ticket request strictly rejected (403).`);

  // Test 10: Verify Ticket Ledger & Immutable Audit Trail
  console.log('\nTest 10: Verifying update tickets ledger and PostgreSQL audit trail...');
  const ticketsList = await apiRequest('GET', '/api/tickets', undefined, masterToken);
  assert.strictEqual(ticketsList.status, 200);
  assert.ok(ticketsList.data.tickets.length >= 4, 'Expected at least 4 update tickets recorded');

  const auditRes = await query(`SELECT COUNT(*) as count FROM audit_logs WHERE action IN ('TICKET_GENERATED', 'TICKET_EXECUTED');`);
  const auditCount = parseInt(auditRes.rows[0].count, 10);
  assert.ok(auditCount >= 8, `Expected at least 8 ticket audit events, found ${auditCount}`);
  console.log(`  ✅ Test 10 PASSED: Verified ${ticketsList.data.tickets.length} tickets in ledger and ${auditCount} immutable ticket audit records in audit_logs.`);

  // Test 11: Admin Levels Catalog Retrieval & Mapping to Office Node
  console.log('\nTest 11: Admin Levels Catalog retrieval & Mapping to Office Node...');
  const ellisId = ellisbridgeOffice.id;
  const adminLevelsRes = await apiRequest('GET', '/api/organizations/admin-levels', undefined, masterToken);
  const adminLevels = adminLevelsRes.data.adminLevels || [];
  assert.ok(adminLevels.length > 0, 'Expected seeded admin levels');
  const policeLevel3 = adminLevels.find((l: any) => l.body_id === 'POLICE' && l.level_number === 3);
  assert.ok(policeLevel3, 'Expected Level 3 Police admin level');

  const mapRes = await apiRequest('PUT', `/api/organizations/nodes/${ellisId}/admin-level`, {
    adminLevelId: policeLevel3.id,
  }, masterToken);
  assert.strictEqual(mapRes.status, 200);
  const verifyMappedNode = await apiRequest('GET', `/api/organizations/nodes/${ellisId}`, undefined, masterToken);
  assert.strictEqual(verifyMappedNode.status, 200);
  assert.strictEqual(verifyMappedNode.data.organization.admin_level_id, policeLevel3.id);
  console.log(`  ✅ Test 11 PASSED: Admin level '${policeLevel3.name}' mapped to Ellisbridge office node.`);

  // Test 12: Organization Tag Creation & Attachment
  console.log('\nTest 12: Organization Tag creation & Attachment to Office Node...');
  const newTagRes = await apiRequest('POST', '/api/organizations/tags', {
    name: 'Rapid Response Sector',
    color: '#0284c7',
    bodyId: 'POLICE',
    category: 'JURISDICTION',
    description: 'High-priority rapid intervention patrol grid',
  }, masterToken);
  assert.strictEqual(newTagRes.status, 201);
  const createdTag = newTagRes.data.tag;

  const attachRes = await apiRequest('POST', `/api/organizations/nodes/${ellisId}/tags`, {
    tagId: createdTag.id,
  }, masterToken);
  assert.strictEqual(attachRes.status, 200);

  const verifyTagNode = await apiRequest('GET', `/api/organizations/nodes/${ellisId}`, undefined, masterToken);
  assert.strictEqual(verifyTagNode.status, 200);
  const attachedTags = verifyTagNode.data.tags || [];
  assert.ok(attachedTags.some((t: any) => t.id === createdTag.id), 'Expected new tag to be attached to Ellisbridge node');
  console.log(`  ✅ Test 12 PASSED: Created tag '${createdTag.name}' and attached to Ellisbridge office.`);

  // Test 13: Office Status Disabling via Compulsory Ticket
  console.log('\nTest 13: Office Status Disabling via Compulsory Update Ticket...');
  const disableTicketReq = await apiRequest('POST', '/api/tickets/request-otp', {
    actionType: 'UPDATE_OFFICE_STATUS',
    targetResourceType: 'ORGANIZATION_NODE',
    targetResourceId: ellisId,
    justification: 'Quarterly boundary reassessment - temporarily disable Ellisbridge node',
    payload: { status: 'DISABLED' },
  }, masterToken);
  assert.strictEqual(disableTicketReq.status, 201);
  const disableExec = await apiRequest('POST', '/api/tickets/execute-with-otp', {
    ticketId: disableTicketReq.data.ticketId,
    otp: disableTicketReq.data.devOtpPreview,
  }, masterToken);
  assert.strictEqual(disableExec.status, 200);

  const disabledNodeRes = await query(`SELECT status FROM organization_nodes WHERE id = $1;`, [ellisId]);
  assert.strictEqual(disabledNodeRes.rows[0].status, 'DISABLED');
  console.log(`  ✅ Test 13 PASSED: Ellisbridge office status transitioned to DISABLED via ticket.`);

  // Test 14: Safety checks on Office Deletion (Rejection on child offices & personnel)
  console.log('\nTest 14: Safety checks on Office Deletion (Dependency violations rejection)...');
  // Direct DELETE request on Ahmedabad Commissionerate (has children & personnel)
  const failedDeleteRes = await apiRequest('DELETE', `/api/organizations/nodes/${ahmedabadId}`, undefined, masterToken);
  assert.strictEqual(failedDeleteRes.status, 400, 'Expected 400 Dependency Violation');
  assert.ok(failedDeleteRes.data.message.includes('subordinate child office(s) exist'), 'Expected child office rejection message');
  console.log(`  ✅ Test 14 PASSED: Deletion of office with dependencies strictly blocked (400 Dependency Violation).`);

  // Test 15: Authorized deletion of clean leaf office via Compulsory Ticket
  console.log('\nTest 15: Authorized deletion of clean leaf office via Compulsory Ticket...');
  // First create a clean leaf office under Ellisbridge
  const leafTicketReq = await apiRequest('POST', '/api/tickets/request-otp', {
    actionType: 'CREATE_OFFICE',
    targetResourceType: 'ORGANIZATION_NODE',
    justification: 'Deploying temporary beat post for religious festival security',
    payload: {
      parentId: ellisId,
      typeId: 'CHOKI',
      name: 'Riverfront Temporary Beat Post',
      code: 'GUJ-POL-AMD-RIVERFRONT-BEAT',
      jurisdictionArea: 'Riverfront Promenade Sector 1',
    },
  }, masterToken);
  assert.strictEqual(leafTicketReq.status, 201);
  const leafExec = await apiRequest('POST', '/api/tickets/execute-with-otp', {
    ticketId: leafTicketReq.data.ticketId,
    otp: leafTicketReq.data.devOtpPreview,
  }, masterToken);
  assert.strictEqual(leafExec.status, 200);
  const leafNodeId = leafExec.data.result.id;

  // Now delete this clean leaf office via DELETE_OFFICE ticket
  const delTicketReq = await apiRequest('POST', '/api/tickets/request-otp', {
    actionType: 'DELETE_OFFICE',
    targetResourceType: 'ORGANIZATION_NODE',
    targetResourceId: leafNodeId,
    justification: 'Festival conclusion: decommissioning temporary riverfront beat post',
    payload: {},
  }, masterToken);
  assert.strictEqual(delTicketReq.status, 201);
  const delExec = await apiRequest('POST', '/api/tickets/execute-with-otp', {
    ticketId: delTicketReq.data.ticketId,
    otp: delTicketReq.data.devOtpPreview,
  }, masterToken);
  assert.strictEqual(delExec.status, 200);

  // Verify node is gone
  const checkDeleted = await query(`SELECT COUNT(*) as count FROM organization_nodes WHERE id = $1;`, [leafNodeId]);
  assert.strictEqual(parseInt(checkDeleted.rows[0].count, 10), 0);
  console.log(`  ✅ Test 15 PASSED: Clean leaf office decommissioned and deleted via ticket ${delTicketReq.data.ticketNumber}.`);

  console.log('\n================================================================');
  console.log('  🎉 ALL 15/15 PASSWORDLESS, TICKETS, ADMIN LEVELS & DELETION TESTS PASSED (100%)');
  console.log('================================================================\n');
}

runTests()
  .then(() => {
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Test suite failed with exception:', err);
    process.exit(1);
  });
