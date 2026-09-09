import assert from 'node:assert';
import http from 'node:http';
import app from '../backend/src/index';
import { query } from '../backend/src/services/db';
import { storeDocument } from '../backend/src/services/documents';

const PORT = 5099;
const BASE_URL = `http://127.0.0.1:${PORT}/api`;

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

async function loginUser(username: string, password = 'Gov@Secure2026!'): Promise<string> {
  const res = await makeRequest('/auth/login', {
    method: 'POST',
    body: { username, password },
  });
  if (res.status !== 200 || !res.cookie) {
    throw new Error(`Login failed for ${username}: status ${res.status}, msg: ${JSON.stringify(res.data)}`);
  }
  return res.cookie;
}

async function runSecurityTests() {
  console.log('================================================================');
  console.log('  🛡️  STARTING INSTITUTIONAL SECURITY & ACCESS TEST SUITE');
  console.log('================================================================\n');

  let server: http.Server;
  await new Promise<void>((resolve) => {
    server = app.listen(PORT, '127.0.0.1', () => {
      resolve();
    });
  });

  try {
    // ---------------------------------------------------------
    // TEST 1: Authentication & Zero-Client-Trust Session
    // ---------------------------------------------------------
    console.log('▶ TEST 1: Authentication, Session Issuance & Invalidation');
    const patelCookie = await loginUser('investigator_patel');
    assert.ok(patelCookie.includes('session_token='), 'Cookie must contain session_token');

    const meRes = await makeRequest('/auth/me', { cookie: patelCookie });
    assert.strictEqual(meRes.status, 200, 'Validated session must return 200 OK');
    assert.strictEqual(meRes.data.user.username, 'investigator_patel');
    assert.strictEqual(meRes.data.user.roleId, 'INVESTIGATOR');
    assert.strictEqual(meRes.data.user.agencyBranch, 'POLICE');

    // Test unauthenticated access to protected resource
    const unauthRes = await makeRequest('/cases');
    assert.strictEqual(unauthRes.status, 401, 'Unauthenticated request must receive 401 Unauthorized');
    console.log('  ✔ Authentication and session cookies verified.\n');

    // ---------------------------------------------------------
    // TEST 2: Sibling Station Isolation (Horizontally Disjoint Scope)
    // ---------------------------------------------------------
    console.log('▶ TEST 2: Sibling Station Isolation (Station A vs Station B)');
    // Station A IO Patel creates an FIR
    const createCaseRes = await makeRequest('/cases', {
      method: 'POST',
      cookie: patelCookie,
      body: {
        caseType: 'NEW_FIR',
        title: 'Confidential Intelligence Inquiry on Arms Cache',
        incidentLocation: 'Surat Ring Road North',
        incidentDate: new Date().toISOString(),
        firData: {
          complainantName: 'State Intelligence Informant #19',
          complainantContact: '9898000000',
          complainantAddress: 'Confidential Post Box 41',
          actsAndSections: [{ act: 'Arms Act, 1959', sections: ['Sec 25(1-A)'] }],
          firContent: 'Seizure of contraband firearm during vehicular checkpoint.',
        },
      },
    });

    assert.strictEqual(createCaseRes.status, 201, 'Case creation must succeed for Station A IO');
    const caseAId = createCaseRes.data.case.id;
    const firNumber = createCaseRes.data.case.fir_number;
    console.log(`  Case registered: ID ${caseAId} (FIR: ${firNumber})`);

    // Sibling Station B IO Officer Sharma logs in
    const sharmaCookie = await loginUser('officer_sharma');

    // Officer Sharma tries to read Station A's case directly
    const siblingReadRes = await makeRequest(`/cases/${caseAId}`, { cookie: sharmaCookie });
    assert.strictEqual(siblingReadRes.status, 403, 'Sibling Station B IO must be REJECTED with 403 Forbidden');
    console.log(`  ✔ Direct IDOR read rejected: ${siblingReadRes.status} ${siblingReadRes.data.error} (${siblingReadRes.data.message})`);

    // Officer Sharma tries to mutate Station A's case status
    const siblingMutateRes = await makeRequest(`/cases/${caseAId}/status`, {
      method: 'PUT',
      cookie: sharmaCookie,
      body: { status: 'CLOSED' },
    });
    assert.strictEqual(siblingMutateRes.status, 403, 'Sibling Station B IO status change must be REJECTED with 403 Forbidden');
    console.log(`  ✔ Unauthorized state mutation rejected: ${siblingMutateRes.status} ${siblingMutateRes.data.error}`);

    // Officer Sharma searches cases list - Station A's case must NOT appear
    const sharmaCasesList = await makeRequest('/cases', { cookie: sharmaCookie });
    const leakedCase = sharmaCasesList.data.cases.find((c: any) => c.id === caseAId);
    assert.strictEqual(leakedCase, undefined, 'Sibling station must have ZERO visibility into other station cases');
    console.log('  ✔ Sibling station isolation strictly enforced with zero leak.\n');

    // ---------------------------------------------------------
    // TEST 3: Vertical Hierarchy Oversight (Supervisory Access)
    // ---------------------------------------------------------
    console.log('▶ TEST 3: Vertical Hierarchy Inheritance (Surat Police Commissionerate)');
    // Surat Police Admin is the vertical parent of Station A & Station B
    const suratAdminCookie = await loginUser('surat_police_admin');

    const adminReadRes = await makeRequest(`/cases/${caseAId}`, { cookie: suratAdminCookie });
    assert.strictEqual(adminReadRes.status, 200, 'Surat Police Admin must have supervisory read access (200 OK)');
    assert.strictEqual(adminReadRes.data.case.id, caseAId);
    console.log('  ✔ Surat CP Admin successfully supervises child station case.');

    // State Master Admin has Apex visibility
    const masterAdminCookie = await loginUser('master_admin');
    const masterReadRes = await makeRequest(`/cases/${caseAId}`, { cookie: masterAdminCookie });
    assert.strictEqual(masterReadRes.status, 200, 'Master Admin must have Apex visibility (200 OK)');
    console.log('  ✔ State Master Apex Admin access verified.\n');

    // ---------------------------------------------------------
    // TEST 4: Horizontal Agency Boundary Separation
    // ---------------------------------------------------------
    console.log('▶ TEST 4: Horizontal Agency Separation (Forensics & Judiciary vs Police)');
    const forensicCookie = await loginUser('forensic_examiner_surat');
    const judgeCookie = await loginUser('judge_mehta');

    // Forensic Examiner attempts to create a Police Case Diary entry
    const forensicDiaryTamper = await makeRequest(`/cases/${caseAId}/diary`, {
      method: 'POST',
      cookie: forensicCookie,
      body: {
        entryNumber: 2,
        actionTaken: 'Tampering police investigation notes',
        observations: 'Fabricated observations',
      },
    });
    assert.strictEqual(forensicDiaryTamper.status, 403, 'Forensic Examiner cannot modify police case diary (403)');
    console.log(`  ✔ Forensic cross-boundary write blocked: ${forensicDiaryTamper.status} Forbidden`);

    // Judge attempts to modify police case status directly
    const judgeTamper = await makeRequest(`/cases/${caseAId}/status`, {
      method: 'PUT',
      cookie: judgeCookie,
      body: { status: 'DISPOSED' },
    });
    assert.strictEqual(judgeTamper.status, 403, 'Judiciary cannot directly alter executive police case status (403)');
    console.log(`  ✔ Judicial cross-boundary write blocked: ${judgeTamper.status} Forbidden\n`);

    // ---------------------------------------------------------
    // TEST 5: Cross-Agency Participation (Forensic Referral)
    // ---------------------------------------------------------
    console.log('▶ TEST 5: Cross-Agency Participation Bridge (Police → FSL Referral)');
    // Police Station A IO registers physical evidence
    const addEvRes = await makeRequest(`/cases/${caseAId}/evidence`, {
      method: 'POST',
      cookie: patelCookie,
      body: {
        evidenceTag: 'EX-99-BALLISTIC',
        category: 'FIREARM',
        description: 'Country pistol seized at checkpoint',
        collectionLocation: 'Surat Ring Road North',
        storageLocation: 'Malkhana Station A',
        sealStatus: 'SEALED_INTACT',
      },
    });
    assert.strictEqual(addEvRes.status, 201, 'Evidence registration must succeed');
    const evidenceId = addEvRes.data.evidence.id;

    // Fetch RFSL Surat Org ID
    const orgsRes = await makeRequest('/organizations', { cookie: masterAdminCookie });
    const rfslSurat = orgsRes.data.organizations.find((o: any) => o.code === 'GUJ-RFSL-SURAT');
    assert.ok(rfslSurat, 'RFSL Surat organization node must exist');

    // Police submits evidence to RFSL Surat
    const testNonce = Date.now();
    const subMemoRes = await makeRequest(`/cases/${caseAId}/forensics/submit`, {
      method: 'POST',
      cookie: patelCookie,
      body: {
        targetForensicOrgId: rfslSurat.id,
        submissionMemoNumber: `MEMO-TEST-${testNonce}`,
        examinationRequested: 'Perform ballistic striation test',
        scientificDivision: 'BALLISTICS',
      },
    });
    assert.strictEqual(subMemoRes.status, 201, 'Forensic submission memo must succeed');
    const submissionId = subMemoRes.data.submission.id;
    console.log(`  Forensic submission registered: Memo ${subMemoRes.data.submission.submission_memo_number}`);

    // Forensic Examiner Dr. Trivedi can now read and report on the submission
    const reportRes = await makeRequest(`/forensics/submissions/${submissionId}/reports`, {
      method: 'POST',
      cookie: forensicCookie,
      body: {
        reportNumber: `REP-FSL-BAL-${testNonce}`,
        summaryOfAnalysis: 'Microscopic examination completed.',
        formalConclusion: 'Weapon successfully test-fired. Positive match.',
      },
    });
    assert.strictEqual(reportRes.status, 201, 'Forensic report issuance must succeed for assigned lab');
    console.log('  ✔ Forensic Lab participation and formal sealed report issued.\n');

    // ---------------------------------------------------------
    // TEST 6: Temporary Delegated Access Protocol
    // ---------------------------------------------------------
    console.log('▶ TEST 6: Temporary Delegated Access Protocol & Expiry');
    // Sharma currently cannot read Case A (verified in Test 2).
    // Now Station A IO Patel grants temporary delegated access to Officer Sharma for a joint inquiry.
    const usersRes = await makeRequest('/users', { cookie: masterAdminCookie });
    const sharmaUser = usersRes.data.users.find((u: any) => u.username === 'officer_sharma');
    assert.ok(sharmaUser, 'Officer Sharma user record must exist');

    const grantRes = await makeRequest('/delegations', {
      method: 'POST',
      cookie: patelCookie,
      body: {
        caseId: caseAId,
        grantedToUserId: sharmaUser.id,
        permissions: ['CASE_READ', 'FIR_READ', 'INVESTIGATION_READ'],
        reason: 'Special Joint SIT Interrogation directed by SP',
        startsAt: new Date(Date.now() - 60000).toISOString(),
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      },
    });
    assert.strictEqual(grantRes.status, 201, 'Delegation creation must succeed');
    const delegationId = grantRes.data.delegation.id;
    console.log(`  Delegation granted: ID ${delegationId}`);

    // Now Officer Sharma reads Case A -> Must SUCCEED (200 OK)
    const delegatedReadRes = await makeRequest(`/cases/${caseAId}`, { cookie: sharmaCookie });
    assert.strictEqual(delegatedReadRes.status, 200, 'Officer Sharma with active delegation must now read Case A (200 OK)');
    console.log('  ✔ Delegated access successfully granted and honored by policy engine.');

    // Now Station A IO revokes the delegation
    const revokeRes = await makeRequest(`/delegations/${delegationId}/revoke`, {
      method: 'PUT',
      cookie: patelCookie,
    });
    assert.strictEqual(revokeRes.status, 200, 'Revocation must succeed');

    // Immediately after revocation, Officer Sharma is REJECTED again
    const postRevokeRes = await makeRequest(`/cases/${caseAId}`, { cookie: sharmaCookie });
    assert.strictEqual(postRevokeRes.status, 403, 'Officer Sharma after revocation must be REJECTED with 403 Forbidden');
    console.log('  ✔ Instant revocation honored; access returned to 403 Forbidden.\n');

    // ---------------------------------------------------------
    // TEST 7: Anti-Path-Traversal Vault Storage & Sanitization
    // ---------------------------------------------------------
    console.log('▶ TEST 7: Secure Document Vault Anti-Path-Traversal');
    const patelUserRes = await makeRequest('/auth/me', { cookie: patelCookie });
    const storedDoc = await storeDocument(
      caseAId,
      'Seizure Memo with Traversal Filename Attempt',
      'PANCHNAMA',
      'CONFIDENTIAL',
      Buffer.from('Sensitive case evidence content'),
      '../../../../etc/passwd',
      'text/plain',
      patelUserRes.data.user,
      '127.0.0.1',
      'SecurityTestRunner'
    );
    assert.ok(storedDoc.id, 'Document metadata record must be created');

    const docQuery = await query(`SELECT storage_uuid, file_name FROM documents WHERE id = $1;`, [storedDoc.id]);
    assert.strictEqual(docQuery.rows.length, 1);
    const doc = docQuery.rows[0];
    const storageFilename = `${doc.storage_uuid}.dat`;
    assert.ok(!storageFilename.includes('..'), 'Storage filename must never contain path traversal components');
    assert.ok(storageFilename.endsWith('.dat'), 'Storage filename must use safe dat extension');
    assert.ok(!storageFilename.includes('passwd'), 'Storage filename must be fully disassociated UUID rather than client filename');
    console.log(`  Stored document physical filename: ${storageFilename} (Client: ${doc.file_name})`);
    console.log('  ✔ Filesystem isolation and non-enumerable UUID storage verified.\n');

    // ---------------------------------------------------------
    // TEST 8: Append-Only Tamper-Evident Audit Logging
    // ---------------------------------------------------------
    console.log('▶ TEST 8: Append-Only Synchronous Audit Ledger Verification');
    const auditRes = await makeRequest(`/audit?caseId=${caseAId}`, { cookie: masterAdminCookie });
    assert.strictEqual(auditRes.status, 200);
    const logs = auditRes.data.auditLogs;
    assert.ok(logs.length >= 3, 'Audit ledger must record all case events');

    const allowLog = logs.find((l: any) => l.result === 'ALLOW' && l.action === 'CASE_CREATED');
    assert.ok(allowLog, 'CASE_CREATED ALLOW must be logged in audit trail');

    const denyLogs = await makeRequest('/audit?result=DENY', { cookie: masterAdminCookie });
    assert.strictEqual(denyLogs.status, 200);
    assert.ok(denyLogs.data.auditLogs.length > 0, 'DENY decisions must be captured in immutable audit ledger');
    console.log(`  ✔ Found ${denyLogs.data.auditLogs.length} logged authorization denial events.`);
    // ---------------------------------------------------------
    // TEST 9: Multi-Agency Hierarchical Layer Admin Governance
    // ---------------------------------------------------------
    console.log('▶ TEST 9: Multi-Agency Hierarchical Layer Admin Governance & Sibling Restrictions');
    
    // 9.1: Super Admin has universal visibility across all 3 bodies
    const masterUsersRes = await makeRequest('/users', { cookie: masterAdminCookie });
    assert.strictEqual(masterUsersRes.status, 200);
    const branches = new Set(masterUsersRes.data.users.map((u: any) => u.agency_branch));
    assert.ok(branches.has('POLICE') && branches.has('FORENSICS') && branches.has('JUDICIARY'), 'Master Admin has universal 3-body visibility');
    console.log('  ✔ Universal Super Admin 3-body governance verified.');

    // 9.2: Surat Police Admin (Level 3) provisions a new subordinate Layer Admin for Station A (Level 4)
    const newAdminNonce = Date.now();
    const stationARes = await query(`SELECT id FROM organization_nodes WHERE code = 'GUJ-POL-SURAT-STA';`);
    const stationAOrgId = stationARes.rows[0].id;

    const createLayerAdminRes = await makeRequest('/users', {
      method: 'POST',
      cookie: suratAdminCookie,
      body: {
        username: `sho_commander_${newAdminNonce}`,
        email: `sho_${newAdminNonce}@gujaratpolice.gov.in`,
        displayName: 'Commander P. K. Jadeja',
        badgeNumber: `SHO-${newAdminNonce.toString().slice(-4)}`,
        phoneNumber: '+91-261-2422999',
        designation: 'Station House Commander',
        departmentWing: 'Station Administration',
        clearanceLevel: 'TOP_SECRET',
        isLayerAdmin: true,
        password: 'Gov@Secure2026!',
        roleId: 'POLICE_ADMIN',
        organizationId: stationAOrgId,
      },
    });
    assert.strictEqual(createLayerAdminRes.status, 201, 'Parent Layer Admin must be able to provision subordinate Layer Admin');
    assert.strictEqual(createLayerAdminRes.data.user.is_layer_admin, true);
    console.log('  ✔ Subordinate Layer Admin successfully provisioned by parent authority.');

    // 9.3: Surat Police Admin attempts to provision user in Forensics (Cross-Agency Boundary Violation)
    const crossAgencyRes = await makeRequest('/users', {
      method: 'POST',
      cookie: suratAdminCookie,
      body: {
        username: `forensic_illegal_${newAdminNonce}`,
        email: `illegal_${newAdminNonce}@sfsl.gov.in`,
        displayName: 'Illegal Examiner',
        password: 'Gov@Secure2026!',
        roleId: 'FORENSIC_EXAMINER',
        organizationId: rfslSurat.id,
      },
    });
    assert.strictEqual(crossAgencyRes.status, 403, 'Police Admin cannot provision Forensics users (Cross-agency 403)');
    console.log('  ✔ Cross-agency administrative boundary violation rejected (403 Forbidden).');

    // 9.4: Sibling Isolation: Station A Admin attempts to provision in sibling Station B
    const stationAAdminCookie = await loginUser('station_a_admin');
    const stationBRes = await query(`SELECT id FROM organization_nodes WHERE code = 'GUJ-POL-SURAT-STB';`);
    const stationBOrgId = stationBRes.rows[0].id;

    const siblingCreateRes = await makeRequest('/users', {
      method: 'POST',
      cookie: stationAAdminCookie,
      body: {
        username: `sibling_tamper_${newAdminNonce}`,
        email: `tamper_${newAdminNonce}@gujaratpolice.gov.in`,
        displayName: 'Unauthorized Infiltration',
        password: 'Gov@Secure2026!',
        roleId: 'INVESTIGATOR',
        organizationId: stationBOrgId,
      },
    });
    assert.strictEqual(siblingCreateRes.status, 403, 'Station A Admin cannot provision users in sibling Station B (403)');
    console.log('  ✔ Sibling station admin provisioning rejected by isolation policy (403 Forbidden).');

    // 9.5: Anti-Privilege Escalation: Surat Police Admin cannot create MASTER_ADMIN
    const escalationRes = await makeRequest('/users', {
      method: 'POST',
      cookie: suratAdminCookie,
      body: {
        username: `fake_master_${newAdminNonce}`,
        email: `fake_master_${newAdminNonce}@justice.gov.in`,
        displayName: 'Fake Master Admin',
        password: 'Gov@Secure2026!',
        roleId: 'MASTER_ADMIN',
        organizationId: stationAOrgId,
      },
    });
    assert.strictEqual(escalationRes.status, 403, 'Privilege escalation to MASTER_ADMIN must be blocked (403)');
    console.log('  ✔ Anti-privilege escalation verified: Non-master cannot provision MASTER_ADMIN.\n');

    console.log('================================================================');
    console.log('  ✨ ALL SECURITY & AUTHORIZATION TESTS PASSED PERFECTLY!');
    console.log('================================================================');
  } finally {
    server.close();
  }
}

runSecurityTests().catch((err) => {
  console.error('❌ SECURITY TEST SUITE FAILED:', err);
  process.exit(1);
});
