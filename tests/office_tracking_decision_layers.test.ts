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
      headers['Cookie'] = `auth_session_token=${token}`;
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
  console.log('  🏛️  OFFICE AUTHORITY, DECISION LAYERS & ACTIVITY TRACKING SUITE');
  console.log('================================================================\n');

  // Step 0: Ensure baseline seed
  console.log('Step 0: Establishing clean test baseline...');
  await seedDatabase();

  // Step 1: Login as Master Admin
  console.log('Step 1: Authenticating as Master Admin...');
  const loginRes = await apiRequest('POST', '/api/auth/login', {
    username: 'master_admin',
    password: 'Gov@Secure2026!',
  });
  assert.strictEqual(loginRes.status, 200, `Login failed: ${JSON.stringify(loginRes.data)}`);
  const masterToken = loginRes.data.token;
  console.log('  ✅ Master Admin authenticated successfully.');

  // Step 2: Test body-separated admin levels retrieval
  console.log('Step 2: Testing sovereign body-separated admin levels retrieval...');
  const policeLevelsRes = await apiRequest('GET', '/api/organizations/admin-levels?body=POLICE', undefined, masterToken);
  assert.strictEqual(policeLevelsRes.status, 200);
  const policeLevels = policeLevelsRes.data.adminLevels || policeLevelsRes.data.levels;
  assert(policeLevels && policeLevels.length >= 4, 'Police should have at least 4 hierarchy levels');
  assert(policeLevels.every((l: any) => l.body_id === 'POLICE'), 'All levels must belong to POLICE body');
  
  const dgpLevel = policeLevels.find((l: any) => l.name.includes('DGP') || l.id.includes('DGP'));
  assert(dgpLevel, 'Police DGP level should exist');
  assert.strictEqual(dgpLevel.manages_office_users, true);
  assert.strictEqual(dgpLevel.manages_subordinate_admins, true);
  assert.strictEqual(dgpLevel.can_create_sub_offices, true);
  assert.strictEqual(dgpLevel.can_approve_tickets, true);

  const judLevelsRes = await apiRequest('GET', '/api/organizations/admin-levels?body=JUDICIARY', undefined, masterToken);
  assert.strictEqual(judLevelsRes.status, 200);
  const judLevels = judLevelsRes.data.adminLevels || judLevelsRes.data.levels;
  assert(judLevels && judLevels.length >= 3, 'Judiciary should have at least 3 hierarchy levels');
  assert(judLevels.every((l: any) => l.body_id === 'JUDICIARY'), 'All levels must belong to JUDICIARY body');

  const fslLevelsRes = await apiRequest('GET', '/api/organizations/admin-levels?body=FORENSICS', undefined, masterToken);
  assert.strictEqual(fslLevelsRes.status, 200);
  const fslLevels = fslLevelsRes.data.adminLevels || fslLevelsRes.data.levels;
  assert(fslLevels && fslLevels.length >= 3, 'Forensics should have at least 3 hierarchy levels');
  assert(fslLevels.every((l: any) => l.body_id === 'FORENSICS'), 'All levels must belong to FORENSICS body');
  console.log('  ✅ Sovereign separation verified: POLICE, JUDICIARY, FORENSICS levels partitioned cleanly.');

  // Step 3: Define a custom decision-making admin level for POLICE
  console.log('Step 3: Creating a custom decision-making admin level for Police...');
  const newLevelRes = await apiRequest('POST', '/api/organizations/admin-levels', {
    name: 'Police Circle Inspectorate',
    levelNumber: 4,
    bodyId: 'POLICE',
    officeTypeId: 'POLICE_STATION',
    defaultRoleId: 'POLICE_ADMIN',
    managesOfficeUsers: true,
    managesSubordinateAdmins: true,
    canCreateSubOffices: true,
    canApproveTickets: false,
    maxClearanceAllowed: 'CONFIDENTIAL',
    description: 'Circle Inspector supervisory tier overseeing multiple local police outposts',
  }, masterToken);
  assert.strictEqual(newLevelRes.status, 201, `Failed to create level: ${JSON.stringify(newLevelRes.data)}`);
  const createdLevel = newLevelRes.data.adminLevel || newLevelRes.data.level;
  assert(createdLevel, 'Created level must exist in response');
  const createdLevelId = createdLevel.id;
  assert.strictEqual(createdLevel.name, 'Police Circle Inspectorate');
  assert.strictEqual(createdLevel.manages_subordinate_admins, true);
  console.log(`  ✅ Custom admin level created: ${createdLevelId} with decision-making governance flags.`);

  // Step 4: Locate an office node to map (Navrangpura Police Station)
  console.log('Step 4: Locating target office node (Navrangpura Police Station)...');
  const orgNodes = await query(`
    SELECT id, name, code, hierarchy_path, level, body_id
    FROM organization_nodes
    WHERE code = 'PS-NAVRANGPURA' OR name ILIKE '%Navrangpura%'
    LIMIT 1;
  `);
  assert(orgNodes.rows.length > 0, 'Navrangpura Police Station node must exist');
  const stationNode = orgNodes.rows[0];
  console.log(`  Found target office: ${stationNode.name} (${stationNode.id})`);

  // Step 5: Map the new admin level to the station node
  console.log('Step 5: Mapping newly created admin level to the station office node...');
  const mapRes = await apiRequest('PUT', `/api/organizations/nodes/${stationNode.id}/admin-level`, {
    adminLevelId: createdLevelId,
  }, masterToken);
  assert.strictEqual(mapRes.status, 200, `Failed to map admin level: ${JSON.stringify(mapRes.data)}`);
  console.log('  ✅ Admin level mapped successfully to office node.');

  // Step 6: Verify deletion safety dependency check (blocks deletion while office is mapped)
  console.log('Step 6: Verifying deletion safety dependency check...');
  const delBlockedRes = await apiRequest('DELETE', `/api/organizations/admin-levels/${createdLevelId}`, undefined, masterToken);
  assert.strictEqual(delBlockedRes.status, 400, 'Deleting a mapped admin level must return 400 Dependency Violation');
  assert(delBlockedRes.data.message.includes('currently mapped to this tier'), 'Must mention mapped office dependency');
  console.log('  ✅ Safe deletion constraint verified: cannot delete admin level with mapped offices.');

  // Step 7: Create a station admin and station officer to populate governance and activity
  console.log('Step 7: Provisioning Station Admin & Officer at target office...');
  const stationAdminRes = await apiRequest('POST', '/api/users', {
    username: 'sho_navrangpura_test',
    password: 'Station@Secure2026!',
    displayName: 'Inspector V. K. Jadeja (SHO)',
    email: 'sho.navrangpura.test@gujaratpolice.gov.in',
    badgeNumber: 'GJ-POL-8821',
    governmentId: 'GOV-INSP-8821',
    phoneNumber: '+91 98250 11223',
    designation: 'Station House Officer',
    departmentWing: 'Law & Order Division',
    clearanceLevel: 'SECRET',
    primaryRoleId: 'POLICE_ADMIN',
    primaryOrganizationId: stationNode.id,
    isLayerAdmin: true,
  }, masterToken);
  assert.strictEqual(stationAdminRes.status, 201, `Failed to create Station Admin: ${JSON.stringify(stationAdminRes.data)}`);
  const stationAdminId = stationAdminRes.data.user.id;

  const stationOfficerRes = await apiRequest('POST', '/api/users', {
    username: 'psi_patel_test',
    password: 'Officer@Secure2026!',
    displayName: 'Sub-Inspector R. Patel',
    email: 'psi.patel.test@gujaratpolice.gov.in',
    badgeNumber: 'GJ-POL-9932',
    governmentId: 'GOV-PSI-9932',
    phoneNumber: '+91 98250 44556',
    designation: 'Sub-Inspector',
    departmentWing: 'Investigation Desk',
    clearanceLevel: 'CONFIDENTIAL',
    primaryRoleId: 'POLICE_OFFICER',
    primaryOrganizationId: stationNode.id,
    isLayerAdmin: false,
  }, masterToken);
  assert.strictEqual(stationOfficerRes.status, 201, `Failed to create Officer: ${JSON.stringify(stationOfficerRes.data)}`);
  console.log('  ✅ Station Admin and operational officer provisioned.');

  // Step 8: Test GET /api/organizations/nodes/:id/tracking
  console.log('Step 8: Calling GET /api/organizations/nodes/:id/tracking...');
  const trackingRes = await apiRequest('GET', `/api/organizations/nodes/${stationNode.id}/tracking`, undefined, masterToken);
  assert.strictEqual(trackingRes.status, 200, `Tracking call failed: ${JSON.stringify(trackingRes.data)}`);

  const tracking = trackingRes.data;
  assert(tracking.office, 'Office details must be returned');
  assert.strictEqual(tracking.office.id, stationNode.id);
  assert.strictEqual(tracking.office.admin_level_name, 'Police Circle Inspectorate');

  // Verify "Who Can Change This Office" governance structure
  assert(tracking.governance, 'Governance structure must be returned');
  assert(Array.isArray(tracking.governance.directAdministrators), 'Must list direct administrators');
  const directSho = tracking.governance.directAdministrators.find((a: any) => a.id === stationAdminId);
  assert(directSho, 'Inspector V. K. Jadeja must be in direct administrators');
  assert.strictEqual(directSho.is_layer_admin, true);

  assert(Array.isArray(tracking.governance.supervisingAdministrators), 'Must list supervising parent administrators');
  console.log(`  Supervising parent chain admins count: ${tracking.governance.supervisingAdministrators.length}`);

  assert(Array.isArray(tracking.governance.masterAdministrators), 'Must list master administrators');
  const master = tracking.governance.masterAdministrators.find((m: any) => m.username === 'master_admin');
  assert(master, 'Master admin must be in master administrators list');

  assert(tracking.governance.rules, 'Governance rules must be provided');
  assert.strictEqual(tracking.governance.rules.directAdminPrivileges.canManageOfficeUsers, true);
  assert.strictEqual(tracking.governance.rules.directAdminPrivileges.canCreateSubOffices, true);
  assert(tracking.governance.rules.isolationRules.length >= 4, 'Must specify isolation rules');

  assert(tracking.stats.activeUsers >= 2, 'Must count at least 2 active users in office');
  console.log('  ✅ Governance map verified: Direct Admins, Ancestor Supervisors, Master Admins, and Isolation Rules.');

  // Step 9: Create and verify an update ticket on this office node
  console.log('Step 9: Generating LEA Update Ticket with OTP for station update...');
  const ticketReq = await apiRequest('POST', '/api/tickets/request-otp', {
    actionType: 'UPDATE_OFFICE',
    targetResourceType: 'ORGANIZATION_NODE',
    targetResourceId: stationNode.id,
    justification: 'Annual jurisdictional perimeter realignment and security hardening as ordered by DG&IGP.',
    payload: {
      jurisdictionArea: 'Navrangpura Commercial Core, University Belt, and CG Road North',
      metadata: { surveillanceCameras: 48, patrolVehicles: 6 },
    },
  }, masterToken);
  assert([200, 201].includes(ticketReq.status), `Failed to request ticket OTP: ${JSON.stringify(ticketReq.data)}`);
  const { ticketId, ticketNumber } = ticketReq.data;
  assert(ticketNumber.startsWith('TCK-'), `Ticket number must have TCK- prefix: ${ticketNumber}`);
  console.log(`  Generated Ticket: ${ticketNumber} (ID: ${ticketId})`);

  // Retrieve OTP from DB to simulate secure delivery
  const otpRes = await query(`SELECT otp_code FROM update_tickets WHERE id = $1;`, [ticketId]);
  const otpCode = otpRes.rows[0].otp_code;
  assert(otpCode, 'OTP code must exist in DB');

  // Verify OTP and execute ticket
  console.log('Step 10: Verifying OTP and executing ticket...');
  const verifyRes = await apiRequest('POST', '/api/tickets/execute-with-otp', {
    ticketId,
    otp: otpCode,
  }, masterToken);
  assert.strictEqual(verifyRes.status, 200, `Ticket verification failed: ${JSON.stringify(verifyRes.data)}`);
  assert.strictEqual(verifyRes.data.status, 'EXECUTED');
  console.log(`  ✅ Ticket ${ticketNumber} executed and verified with OTP.`);

  // Step 11: Re-inspect tracking endpoint to verify ticket and admin activity feed
  console.log('Step 11: Re-inspecting office tracking for ticket and administrative activity...');
  const updatedTrackingRes = await apiRequest('GET', `/api/organizations/nodes/${stationNode.id}/tracking`, undefined, masterToken);
  assert.strictEqual(updatedTrackingRes.status, 200);

  const updatedTracking = updatedTrackingRes.data;
  assert(updatedTracking.tickets.length > 0, 'Tickets ledger must contain the executed ticket');
  const foundTicket = updatedTracking.tickets.find((t: any) => t.ticket_number === ticketNumber);
  assert(foundTicket, `Ticket ${ticketNumber} must be present in office tickets ledger`);
  assert.strictEqual(foundTicket.status, 'EXECUTED');
  assert.strictEqual(foundTicket.target_resource_id, stationNode.id);
  assert(foundTicket.justification.includes('Annual jurisdictional perimeter realignment'));
  assert(foundTicket.executed_at, 'Ticket must record execution timestamp');

  assert(updatedTracking.adminActivity.length > 0, 'Admin activity feed must record office mutations');
  console.log(`  Recorded admin activity events: ${updatedTracking.adminActivity.length}`);
  console.log('  ✅ Ticket and mutational audit provenance verified in office tracking.');

  // Step 12: Sovereign Agency Boundary Test (Cross-Agency Boundary)
  console.log('Step 12: Testing sovereign agency boundary isolation on office tracking...');
  const judOrg = await query(`SELECT id FROM organization_nodes WHERE body_id = 'JUDICIARY' LIMIT 1;`);
  assert(judOrg.rows.length > 0, 'Judiciary org node must exist');

  const judUserRes = await apiRequest('POST', '/api/users', {
    username: 'judiciary_clerk_track_test',
    password: 'Judge@Secure2026!',
    displayName: 'District Court Clerk',
    email: 'clerk.track.test@gujaratjudiciary.gov.in',
    badgeNumber: 'GJ-JUD-5555',
    governmentId: 'GOV-JUD-5555',
    phoneNumber: '+91 98250 88990',
    designation: 'Court Clerk',
    departmentWing: 'Registry Desk',
    clearanceLevel: 'CONFIDENTIAL',
    primaryRoleId: 'COURT_USER',
    primaryOrganizationId: judOrg.rows[0].id,
    isLayerAdmin: false,
  }, masterToken);
  assert.strictEqual(judUserRes.status, 201);

  const judLoginRes = await apiRequest('POST', '/api/auth/login', {
    username: 'judiciary_clerk_track_test',
    password: 'Judge@Secure2026!',
  });
  assert.strictEqual(judLoginRes.status, 200);
  const judToken = judLoginRes.data.token;

  const crossRes = await apiRequest('GET', `/api/organizations/nodes/${stationNode.id}/tracking`, undefined, judToken);
  assert.strictEqual(crossRes.status, 403, 'Judiciary clerk must be blocked from inspecting Police office tracking (403)');
  assert(crossRes.data.message.includes('Cross-Agency Boundary'), 'Must state cross-agency boundary denial');
  console.log('  ✅ Sovereign Agency Boundary strictly enforced: Judiciary blocked from Police tracking (403).');

  console.log('\n================================================================');
  console.log('  🎉 ALL OFFICE TRACKING & DECISION LAYERS TESTS PASSED (100%)');
  console.log('================================================================\n');
}

runTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ Test Suite Failed:', err);
    process.exit(1);
  });
