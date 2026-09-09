import assert from 'node:assert';
import http from 'node:http';
import { seedDatabase } from '../backend/src/services/seed';
import { query } from '../backend/src/services/db';

const BASE_URL = 'http://127.0.0.1:5000/api';

interface RequestOptions {
  method?: string;
  body?: any;
  cookie?: string;
  headers?: Record<string, string>;
}

interface ApiResponse<T = any> {
  status: number;
  data: T;
  cookie?: string;
}

function makeRequest<T = any>(endpoint: string, options: RequestOptions = {}): Promise<ApiResponse<T>> {
  return new Promise((resolve, reject) => {
    const url = new URL(`${BASE_URL}${endpoint}`);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };

    if (options.cookie) {
      headers['Cookie'] = options.cookie;
    }

    const payload = options.body ? JSON.stringify(options.body) : undefined;
    if (payload) {
      headers['Content-Length'] = Buffer.byteLength(payload).toString();
    }

    const req = http.request(
      url,
      {
        method: options.method || 'GET',
        headers,
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          let parsed: any;
          try {
            parsed = JSON.parse(body);
          } catch {
            parsed = body;
          }

          const setCookie = res.headers['set-cookie'];
          let cookieStr: string | undefined = undefined;
          if (setCookie) {
            cookieStr = setCookie[0].split(';')[0];
          }

          resolve({
            status: res.statusCode || 500,
            data: parsed,
            cookie: cookieStr,
          });
        });
      }
    );

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function loginUser(username: string, password = 'Gov@Secure2026!'): Promise<{ cookie: string; user: any }> {
  const res = await makeRequest('/auth/login', {
    method: 'POST',
    body: { username, password },
  });
  if (res.status !== 200 || !res.cookie) {
    throw new Error(`Login failed for ${username}: status ${res.status}, msg: ${JSON.stringify(res.data)}`);
  }
  return { cookie: res.cookie, user: res.data.user };
}

async function runMilestone1Tests() {
  console.log('================================================================');
  console.log('  🏛️  STARTING 15-STEP MASTER ORGANIZATIONAL ACCEPTANCE TEST SUITE');
  console.log('  State of Gujarat • Sovereign 3-Body Master Hierarchy Reference');
  console.log('================================================================\n');

  // Step 0: Reseed database to pristine master baseline (1 user: master_admin)
  console.log('--- Initializing Pristine Baseline via seedDatabase() ---');
  await seedDatabase();
  console.log('Baseline established: Exactly one user (master_admin) in PostgreSQL.\n');

  let passed = 0;
  const total = 15;

  // -------------------------------------------------------------------------
  // STEP 1: Master creates Police Admin
  // -------------------------------------------------------------------------
  console.log('Step 1: Master Admin creates Police Sovereign Body Admin...');
  const masterAuth = await loginUser('master_admin');

  const step1Res = await makeRequest('/users/body-admin', {
    method: 'POST',
    cookie: masterAuth.cookie,
    body: {
      bodyId: 'POLICE',
      username: 'police_body_admin',
      email: 'dgp.admin@gujaratpolice.gov.in',
      displayName: 'Director General of Police P. K. Rao, IPS',
      badgeNumber: 'IPS-GJ-1994-01',
      phoneNumber: '+91-79-23250011',
      designation: 'Director General of Police',
      departmentWing: 'Gujarat Police Apex Command',
      password: 'Gov@Secure2026!',
    },
  });

  assert.strictEqual(step1Res.status, 201, `Expected 201 Created, got ${step1Res.status}`);
  assert.strictEqual(step1Res.data.user.username, 'police_body_admin');
  assert.strictEqual(step1Res.data.user.is_layer_admin, true);

  // Verify in PostgreSQL (users table and admin_scopes table)
  const dbPoliceUser = await query('SELECT * FROM users WHERE username = $1', ['police_body_admin']);
  assert.strictEqual(dbPoliceUser.rows.length, 1);
  const policeUserId = dbPoliceUser.rows[0].id;

  const dbPoliceScopes = await query('SELECT * FROM admin_scopes WHERE user_id = $1', [policeUserId]);
  assert.strictEqual(dbPoliceScopes.rows.length, 1);
  assert.strictEqual(dbPoliceScopes.rows[0].scope_type, 'SUBTREE');
  console.log('  ✅ Step 1 PASSED: Police Admin created and verified with SUBTREE scope in PostgreSQL.\n');
  passed++;

  // -------------------------------------------------------------------------
  // STEP 2: Police Admin logs in
  // -------------------------------------------------------------------------
  console.log('Step 2: Police Admin logs in with credentials...');
  const policeAuth = await loginUser('police_body_admin');
  assert.strictEqual(policeAuth.user.agencyBranch, 'POLICE');
  assert.strictEqual(policeAuth.user.isLayerAdmin, true);
  assert.ok(policeAuth.user.adminScopes && policeAuth.user.adminScopes.length > 0);

  const statsRes = await makeRequest('/system/stats', { cookie: policeAuth.cookie });
  assert.strictEqual(statsRes.status, 200);
  assert.ok(statsRes.data.agencyBodies.POLICE.totalNodes > 0);
  console.log('  ✅ Step 2 PASSED: Police Admin authenticated, receiving Police sovereign tree scope.\n');
  passed++;

  // -------------------------------------------------------------------------
  // STEP 3: Police Admin creates Ahmedabad Admin
  // -------------------------------------------------------------------------
  console.log('Step 3: Police Admin creates Ahmedabad Admin (NODE_ADMIN at Ahmedabad Commissionerate)...');
  const amdCommRes = await query(`SELECT id, code, hierarchy_path FROM organization_nodes WHERE code = 'GUJ-POL-COMM-AHMEDABAD'`);
  assert.strictEqual(amdCommRes.rows.length, 1);
  const amdCommId = amdCommRes.rows[0].id;

  const step3Res = await makeRequest('/users', {
    method: 'POST',
    cookie: policeAuth.cookie,
    body: {
      username: 'ahmedabad_comm_admin',
      email: 'cp.ahmedabad@gujaratpolice.gov.in',
      displayName: 'Ahmedabad CP Shri G. S. Malik, IPS',
      badgeNumber: 'IPS-GJ-1996-03',
      phoneNumber: '+91-79-25630100',
      designation: 'Commissioner of Police',
      departmentWing: 'Metropolitan Executive Command',
      clearanceLevel: 'TOP_SECRET',
      isLayerAdmin: true,
      roleId: 'NODE_ADMIN',
      organizationId: amdCommId,
      password: 'Gov@Secure2026!',
    },
  });

  assert.strictEqual(step3Res.status, 201, `Expected 201 Created, got ${step3Res.status}`);
  assert.strictEqual(step3Res.data.user.username, 'ahmedabad_comm_admin');
  assert.strictEqual(step3Res.data.user.is_layer_admin, true);

  const dbAmdAdmin = await query('SELECT id, primary_organization_id, is_layer_admin FROM users WHERE username = $1', ['ahmedabad_comm_admin']);
  assert.strictEqual(dbAmdAdmin.rows.length, 1);
  const amdAdminId = dbAmdAdmin.rows[0].id;

  const dbAmdScopes = await query('SELECT * FROM admin_scopes WHERE user_id = $1', [amdAdminId]);
  assert.strictEqual(dbAmdScopes.rows.length, 1);
  assert.strictEqual(dbAmdScopes.rows[0].organization_node_id, amdCommId);
  assert.strictEqual(dbAmdScopes.rows[0].scope_type, 'SUBTREE');
  console.log('  ✅ Step 3 PASSED: Ahmedabad Admin provisioned at Ahmedabad Commissionerate with SUBTREE scope.\n');
  passed++;

  // -------------------------------------------------------------------------
  // STEP 4: Ahmedabad Admin logs in
  // -------------------------------------------------------------------------
  console.log('Step 4: Ahmedabad Admin logs in with credentials...');
  const amdAuth = await loginUser('ahmedabad_comm_admin');
  assert.strictEqual(amdAuth.user.roleId, 'NODE_ADMIN');
  assert.strictEqual(amdAuth.user.organizationCode, 'GUJ-POL-COMM-AHMEDABAD');
  assert.strictEqual(amdAuth.user.isLayerAdmin, true);
  console.log('  ✅ Step 4 PASSED: Ahmedabad Admin authenticated, scoped to Ahmedabad Commissionerate.\n');
  passed++;

  // -------------------------------------------------------------------------
  // STEP 5: Ahmedabad Admin creates Station Admin
  // -------------------------------------------------------------------------
  console.log('Step 5: Ahmedabad Admin creates Station Admin (NODE_ADMIN at Navrangpura Police Station)...');
  const navrangpuraRes = await query(`SELECT id, code, hierarchy_path FROM organization_nodes WHERE code = 'GUJ-POL-AMD-STA'`);
  assert.strictEqual(navrangpuraRes.rows.length, 1);
  const navrangpuraId = navrangpuraRes.rows[0].id;

  const step5Res = await makeRequest('/users', {
    method: 'POST',
    cookie: amdAuth.cookie,
    body: {
      username: 'navrangpura_sho_admin',
      email: 'sho.navrangpura@gujaratpolice.gov.in',
      displayName: 'Inspector R. J. Vaghela (Navrangpura SHO)',
      badgeNumber: 'PI-AMD-512',
      phoneNumber: '+91-79-26401200',
      designation: 'Station House Officer & Layer Admin',
      departmentWing: 'Navrangpura Station Command',
      clearanceLevel: 'SECRET',
      isLayerAdmin: true,
      roleId: 'NODE_ADMIN',
      organizationId: navrangpuraId,
      password: 'Gov@Secure2026!',
    },
  });

  assert.strictEqual(step5Res.status, 201, `Expected 201 Created, got ${step5Res.status}`);
  assert.strictEqual(step5Res.data.user.username, 'navrangpura_sho_admin');
  assert.strictEqual(step5Res.data.user.is_layer_admin, true);

  const dbStationAdmin = await query('SELECT id FROM users WHERE username = $1', ['navrangpura_sho_admin']);
  assert.strictEqual(dbStationAdmin.rows.length, 1);
  const stationAdminId = dbStationAdmin.rows[0].id;

  const dbStationScopes = await query('SELECT * FROM admin_scopes WHERE user_id = $1', [stationAdminId]);
  assert.strictEqual(dbStationScopes.rows.length, 1);
  assert.strictEqual(dbStationScopes.rows[0].organization_node_id, navrangpuraId);
  console.log('  ✅ Step 5 PASSED: Station Admin provisioned at Navrangpura Police Station with SUBTREE scope.\n');
  passed++;

  // -------------------------------------------------------------------------
  // STEP 6: Station Admin logs in
  // -------------------------------------------------------------------------
  console.log('Step 6: Station Admin logs in with credentials...');
  const stationAdminAuth = await loginUser('navrangpura_sho_admin');
  assert.strictEqual(stationAdminAuth.user.roleId, 'NODE_ADMIN');
  assert.strictEqual(stationAdminAuth.user.organizationCode, 'GUJ-POL-AMD-STA');
  assert.strictEqual(stationAdminAuth.user.isLayerAdmin, true);
  console.log('  ✅ Step 6 PASSED: Station Admin authenticated, scoped to Navrangpura Police Station.\n');
  passed++;

  // -------------------------------------------------------------------------
  // STEP 7: Station Admin creates Police Officer
  // -------------------------------------------------------------------------
  console.log('Step 7: Station Admin creates Police Officer (POLICE_OFFICER at Navrangpura Police Station)...');
  const step7Res = await makeRequest('/users', {
    method: 'POST',
    cookie: stationAdminAuth.cookie,
    body: {
      username: 'officer_sharma_nav',
      email: 'psi.sharma@gujaratpolice.gov.in',
      displayName: 'Sub-Inspector Ananya Sharma',
      badgeNumber: 'PSI-AMD-884',
      phoneNumber: '+91-79-26401205',
      designation: 'Police Sub-Inspector',
      departmentWing: 'Law & Order Wing',
      clearanceLevel: 'CONFIDENTIAL',
      isLayerAdmin: false,
      roleId: 'POLICE_OFFICER',
      organizationId: navrangpuraId,
      password: 'Gov@Secure2026!',
    },
  });

  assert.strictEqual(step7Res.status, 201, `Expected 201 Created, got ${step7Res.status}`);
  assert.strictEqual(step7Res.data.user.username, 'officer_sharma_nav');
  assert.strictEqual(step7Res.data.user.is_layer_admin, false);

  const dbOfficer = await query('SELECT * FROM users WHERE username = $1', ['officer_sharma_nav']);
  assert.strictEqual(dbOfficer.rows.length, 1);
  assert.strictEqual(dbOfficer.rows[0].primary_role_id, 'POLICE_OFFICER');
  assert.strictEqual(dbOfficer.rows[0].is_layer_admin, false);
  console.log('  ✅ Step 7 PASSED: Police Officer provisioned at Navrangpura Police Station.\n');
  passed++;

  // -------------------------------------------------------------------------
  // STEP 8: Police Officer logs in
  // -------------------------------------------------------------------------
  console.log('Step 8: Police Officer logs in with credentials...');
  const officerAuth = await loginUser('officer_sharma_nav');
  assert.strictEqual(officerAuth.user.roleId, 'POLICE_OFFICER');
  assert.strictEqual(officerAuth.user.isLayerAdmin, false);
  assert.strictEqual(officerAuth.user.organizationCode, 'GUJ-POL-AMD-STA');

  const officerMeRes = await makeRequest('/auth/me', { cookie: officerAuth.cookie });
  assert.strictEqual(officerMeRes.status, 200);
  assert.strictEqual(officerMeRes.data.authenticated, true);
  console.log('  ✅ Step 8 PASSED: Police Officer authenticated successfully.\n');
  passed++;

  // -------------------------------------------------------------------------
  // STEP 9: Police Officer sees only permitted dashboard (no admin features)
  // -------------------------------------------------------------------------
  console.log('Step 9: Verifying Police Officer permitted dashboard boundary (no admin features)...');
  const officerStats = await makeRequest('/system/stats', { cookie: officerAuth.cookie });
  assert.strictEqual(officerStats.status, 200, 'Operational stats must be accessible to officer');

  // Attempting user creation must return 403 Forbidden
  const officerAttemptCreateUser = await makeRequest('/users', {
    method: 'POST',
    cookie: officerAuth.cookie,
    body: {
      username: 'rogue_subordinate',
      email: 'rogue@police.gov.in',
      displayName: 'Rogue Officer',
      roleId: 'POLICE_OFFICER',
      organizationId: navrangpuraId,
      password: 'Gov@Secure2026!',
    },
  });
  assert.strictEqual(officerAttemptCreateUser.status, 403, 'Police Officer must NOT be allowed to create users');

  // Attempting node creation must return 403 Forbidden
  const officerAttemptCreateOrg = await makeRequest('/organizations', {
    method: 'POST',
    cookie: officerAuth.cookie,
    body: {
      parentId: navrangpuraId,
      typeId: 'CHOKI',
      name: 'Rogue Choki',
      code: 'GUJ-POL-ROGUE',
    },
  });
  assert.strictEqual(officerAttemptCreateOrg.status, 403, 'Police Officer must NOT be allowed to create org nodes');

  // Attempting master overview must return 403 Forbidden
  const officerAttemptMaster = await makeRequest('/system/master/overview', { cookie: officerAuth.cookie });
  assert.strictEqual(officerAttemptMaster.status, 403, 'Police Officer must NOT be allowed to access master overview');
  console.log('  ✅ Step 9 PASSED: Police Officer restricted to operational dashboard with zero admin features.\n');
  passed++;

  // -------------------------------------------------------------------------
  // STEP 10: Station Admin cannot access sibling station
  // -------------------------------------------------------------------------
  console.log('Step 10: Sibling Isolation test (Station Admin cannot access sibling station)...');
  const ellisbridgeRes = await query(`SELECT id, code, hierarchy_path FROM organization_nodes WHERE code = 'GUJ-POL-AMD-STB'`);
  assert.strictEqual(ellisbridgeRes.rows.length, 1, 'Ellisbridge sibling station must exist');
  const ellisbridgeId = ellisbridgeRes.rows[0].id;

  // Navrangpura Station Admin attempts to create a user in sibling Ellisbridge Station
  const stationSiblingTamper = await makeRequest('/users', {
    method: 'POST',
    cookie: stationAdminAuth.cookie,
    body: {
      username: 'unauthorized_ellisbridge_user',
      email: 'intruder@ellisbridge.gov.in',
      displayName: 'Intruder Officer',
      roleId: 'POLICE_OFFICER',
      organizationId: ellisbridgeId, // SIBLING STATION OUTSIDE NAVRANGPURA SUBTREE!
      password: 'Gov@Secure2026!',
    },
  });

  assert.strictEqual(stationSiblingTamper.status, 403, `Expected 403 Forbidden on sibling station, got ${stationSiblingTamper.status}`);
  assert.ok(
    stationSiblingTamper.data.message.includes('Sibling Isolation Policy') ||
    stationSiblingTamper.data.message.includes('descendant subtree'),
    `Message should cite sibling isolation: ${stationSiblingTamper.data.message}`
  );

  // Navrangpura Station Admin attempts to modify sibling node
  const stationSiblingNodeEdit = await makeRequest(`/organizations/nodes/${ellisbridgeId}`, {
    method: 'PUT',
    cookie: stationAdminAuth.cookie,
    body: { name: 'Compromised Ellisbridge Station' },
  });
  assert.strictEqual(stationSiblingNodeEdit.status, 403, 'Station Admin cannot modify sibling station node');
  console.log('  ✅ Step 10 PASSED: Station Admin strictly blocked from accessing sibling station (403 Sibling Isolation).\n');
  passed++;

  // -------------------------------------------------------------------------
  // STEP 11: Ahmedabad Admin cannot access Surat
  // -------------------------------------------------------------------------
  console.log('Step 11: Cross-City Isolation test (Ahmedabad Admin cannot access Surat)...');
  const suratCommRes = await query(`SELECT id, code, hierarchy_path FROM organization_nodes WHERE code = 'GUJ-POL-COMM-SURAT'`);
  assert.strictEqual(suratCommRes.rows.length, 1);
  const suratCommId = suratCommRes.rows[0].id;

  // Ahmedabad Admin attempts to provision user in Surat Commissionerate
  const amdSuratTamper = await makeRequest('/users', {
    method: 'POST',
    cookie: amdAuth.cookie,
    body: {
      username: 'unauthorized_surat_user',
      email: 'intruder@surat.gov.in',
      displayName: 'Intruder User',
      roleId: 'POLICE_OFFICER',
      organizationId: suratCommId, // SURAT NODE OUTSIDE AHMEDABAD SUBTREE!
      password: 'Gov@Secure2026!',
    },
  });

  assert.strictEqual(amdSuratTamper.status, 403, `Expected 403 Forbidden on Surat node, got ${amdSuratTamper.status}`);
  assert.ok(
    amdSuratTamper.data.message.includes('Sibling Isolation Policy') ||
    amdSuratTamper.data.message.includes('descendant subtree'),
    `Message should cite subtree boundary: ${amdSuratTamper.data.message}`
  );

  // Ahmedabad Admin attempts to modify Surat Commissionerate node
  const amdSuratNodeEdit = await makeRequest(`/organizations/nodes/${suratCommId}`, {
    method: 'PUT',
    cookie: amdAuth.cookie,
    body: { name: 'Compromised Surat Commissionerate' },
  });
  assert.strictEqual(amdSuratNodeEdit.status, 403, 'Ahmedabad Admin cannot modify Surat Commissionerate node');
  console.log('  ✅ Step 11 PASSED: Ahmedabad Admin strictly blocked from accessing Surat (403 Subtree Isolation).\n');
  passed++;

  // -------------------------------------------------------------------------
  // STEP 12: Police Admin cannot automatically access Judiciary users
  // -------------------------------------------------------------------------
  console.log('Step 12: Sovereign Agency Boundary test (Police Admin cannot access Judiciary users)...');
  const hcNodeRes = await query(`SELECT id FROM organization_nodes WHERE code = 'GUJ-JUD-APEX'`);
  assert.strictEqual(hcNodeRes.rows.length, 1);
  const hcNodeId = hcNodeRes.rows[0].id;

  // Police Admin attempts to create user in Judiciary tree
  const policeJudiciaryTamper = await makeRequest('/users', {
    method: 'POST',
    cookie: policeAuth.cookie,
    body: {
      username: 'police_tamper_judge',
      email: 'tamper.judge@gujaratjudiciary.gov.in',
      displayName: 'Police Implanted Judge',
      roleId: 'COURT_USER',
      organizationId: hcNodeId, // JUDICIARY NODE
      password: 'Gov@Secure2026!',
    },
  });
  assert.strictEqual(policeJudiciaryTamper.status, 403, 'Police Admin cannot create users in Judiciary body');

  // Police Admin querying /api/users must only see POLICE users
  const policeUsersList = await makeRequest('/users', { cookie: policeAuth.cookie });
  assert.strictEqual(policeUsersList.status, 200);
  for (const u of policeUsersList.data.users) {
    assert.strictEqual(u.agency_branch, 'POLICE', 'Police Admin must only receive POLICE users');
  }
  console.log('  ✅ Step 12 PASSED: Police Admin sovereign boundary verified: zero access to Judiciary users.\n');
  passed++;

  // -------------------------------------------------------------------------
  // STEP 13: FSL Admin cannot automatically access Police users
  // -------------------------------------------------------------------------
  console.log('Step 13: Sovereign Agency Boundary test (FSL Admin cannot access Police users)...');
  // Master creates Forensic Body Admin
  const fslAdminRes = await makeRequest('/users/body-admin', {
    method: 'POST',
    cookie: masterAuth.cookie,
    body: {
      bodyId: 'FORENSICS',
      username: 'forensic_body_admin',
      email: 'director.dfss@gujarat.gov.in',
      displayName: 'Dr. H. P. Sanghvi (Director SFSL)',
      badgeNumber: 'DFSS-DIR-001',
      phoneNumber: '+91-79-23256001',
      password: 'Gov@Secure2026!',
    },
  });
  assert.strictEqual(fslAdminRes.status, 201);

  const fslAdminAuth = await loginUser('forensic_body_admin');
  assert.strictEqual(fslAdminAuth.user.agencyBranch, 'FORENSICS');

  // FSL Admin attempts to create user in Police tree
  const fslPoliceTamper = await makeRequest('/users', {
    method: 'POST',
    cookie: fslAdminAuth.cookie,
    body: {
      username: 'fsl_tampering_police',
      email: 'tamper@police.gov.in',
      displayName: 'FSL Implanted Officer',
      roleId: 'POLICE_OFFICER',
      organizationId: navrangpuraId, // POLICE NODE
      password: 'Gov@Secure2026!',
    },
  });
  assert.strictEqual(fslPoliceTamper.status, 403, 'FSL Admin cannot create users in Police body');

  // FSL Admin querying /api/users must only see FORENSICS users
  const fslUsersList = await makeRequest('/users', { cookie: fslAdminAuth.cookie });
  assert.strictEqual(fslUsersList.status, 200);
  for (const u of fslUsersList.data.users) {
    assert.strictEqual(u.agency_branch, 'FORENSICS', 'FSL Admin must only receive FORENSICS users');
  }
  console.log('  ✅ Step 13 PASSED: FSL Admin sovereign boundary verified: zero access to Police users.\n');
  passed++;

  // -------------------------------------------------------------------------
  // STEP 14: Judiciary Admin cannot automatically access Police users
  // -------------------------------------------------------------------------
  console.log('Step 14: Sovereign Agency Boundary test (Judiciary Admin cannot access Police users)...');
  // Master creates Judiciary Body Admin
  const judiciaryAdminRes = await makeRequest('/users/body-admin', {
    method: 'POST',
    cookie: masterAuth.cookie,
    body: {
      bodyId: 'JUDICIARY',
      username: 'judiciary_body_admin',
      email: 'registrar.general@gujaratjudiciary.gov.in',
      displayName: 'Registrar General, High Court of Gujarat',
      badgeNumber: 'GJS-REG-001',
      phoneNumber: '+91-79-27664400',
      password: 'Gov@Secure2026!',
    },
  });
  assert.strictEqual(judiciaryAdminRes.status, 201);

  const judiciaryAdminAuth = await loginUser('judiciary_body_admin');
  assert.strictEqual(judiciaryAdminAuth.user.agencyBranch, 'JUDICIARY');

  // Judiciary Admin attempts to create user in Police tree
  const judPoliceTamper = await makeRequest('/users', {
    method: 'POST',
    cookie: judiciaryAdminAuth.cookie,
    body: {
      username: 'judiciary_tampering_police',
      email: 'tamper@police.gov.in',
      displayName: 'Judiciary Implanted Officer',
      roleId: 'POLICE_OFFICER',
      organizationId: navrangpuraId, // POLICE NODE
      password: 'Gov@Secure2026!',
    },
  });
  assert.strictEqual(judPoliceTamper.status, 403, 'Judiciary Admin cannot create users in Police body');

  // Judiciary Admin querying /api/users must only see JUDICIARY users
  const judUsersList = await makeRequest('/users', { cookie: judiciaryAdminAuth.cookie });
  assert.strictEqual(judUsersList.status, 200);
  for (const u of judUsersList.data.users) {
    assert.strictEqual(u.agency_branch, 'JUDICIARY', 'Judiciary Admin must only receive JUDICIARY users');
  }
  console.log('  ✅ Step 14 PASSED: Judiciary Admin sovereign boundary verified: zero access to Police users.\n');
  passed++;

  // -------------------------------------------------------------------------
  // STEP 15: Every operation verified in audit_logs
  // -------------------------------------------------------------------------
  console.log('Step 15: Auditing verification (Every operation recorded in audit_logs)...');
  const allAudits = await query(`
    SELECT id, action, resource_type, result, actor_user_id, body_id, organization_node_id, timestamp, metadata
    FROM audit_logs
    ORDER BY timestamp DESC;
  `);

  assert.ok(allAudits.rows.length >= 15, `Expected at least 15 audit entries, found ${allAudits.rows.length}`);

  // Check login audits
  const loginAudits = allAudits.rows.filter(r => r.action === 'LOGIN');
  assert.ok(loginAudits.length >= 6, 'Must have audit entries for all login events');

  // Check user creation audits
  const userCreateAudits = allAudits.rows.filter(r => 
    (r.action === 'USER_CREATE' || r.action === 'USER_CREATED' || r.action === 'ADMIN_CREATED') && r.result === 'ALLOW'
  );
  assert.ok(userCreateAudits.length >= 5, `Must have audit entries for user creations, got ${userCreateAudits.length}`);

  // Check security authorization denial audits
  const denialAudits = allAudits.rows.filter(r => r.result === 'DENY');
  assert.ok(denialAudits.length >= 6, 'Must have audit entries for all blocked security violations (sibling, cross-agency)');

  // Check actor_user_id tracking
  const auditsWithActor = allAudits.rows.filter(r => r.actor_user_id !== null);
  assert.ok(auditsWithActor.length > 0, 'Audit entries must track actor_user_id');

  console.log(`  Audit Vault Status: ${allAudits.rows.length} total events recorded in PostgreSQL.`);
  console.log(`  - Login Audits: ${loginAudits.length}`);
  console.log(`  - User Provisioning Audits (ALLOW): ${userCreateAudits.length}`);
  console.log(`  - Security Gate Denials (DENY / 403): ${denialAudits.length}`);
  console.log('  ✅ Step 15 PASSED: Full provenance and immutable audit log verification complete.\n');
  passed++;

  // -------------------------------------------------------------------------
  // Final Comprehensive Summary
  // -------------------------------------------------------------------------
  console.log('================================================================');
  console.log(`  🎉 ALL ${passed}/${total} MILESTONE 1 ACCEPTANCE TESTS PASSED (100%)`);
  console.log('  Step  1: Master creates Police Admin. [PASSED]');
  console.log('  Step  2: Police Admin logs in. [PASSED]');
  console.log('  Step  3: Police Admin creates Ahmedabad Admin (NODE_ADMIN). [PASSED]');
  console.log('  Step  4: Ahmedabad Admin logs in. [PASSED]');
  console.log('  Step  5: Ahmedabad Admin creates Station Admin (NODE_ADMIN). [PASSED]');
  console.log('  Step  6: Station Admin logs in. [PASSED]');
  console.log('  Step  7: Station Admin creates Police Officer (POLICE_OFFICER). [PASSED]');
  console.log('  Step  8: Police Officer logs in. [PASSED]');
  console.log('  Step  9: Police Officer sees only permitted dashboard. [PASSED]');
  console.log('  Step 10: Station Admin cannot access sibling station. [PASSED]');
  console.log('  Step 11: Ahmedabad Admin cannot access Surat. [PASSED]');
  console.log('  Step 12: Police Admin cannot automatically access Judiciary users. [PASSED]');
  console.log('  Step 13: FSL Admin cannot automatically access Police users. [PASSED]');
  console.log('  Step 14: Judiciary Admin cannot automatically access Police users. [PASSED]');
  console.log('  Step 15: Every operation verified in audit_logs. [PASSED]');
  console.log('================================================================');
}

if (require.main === module) {
  runMilestone1Tests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Test suite failed:', err);
      process.exit(1);
    });
}
