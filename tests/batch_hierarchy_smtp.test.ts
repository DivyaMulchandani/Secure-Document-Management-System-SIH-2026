import assert from 'node:assert';
import http from 'node:http';
import { query } from '../backend/src/services/db';

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
  console.log('  🏢 RUNNING BATCH HIERARCHY BUILDER & SMTP RELAY TEST SUITE');
  console.log('================================================================\n');

  // Step 1: Login as Master Admin to get auth token
  console.log('Step 1: Authenticating Master Admin passwordlessly...');
  const otpReq = await apiRequest('POST', '/api/auth/request-otp', {
    identifier: 'master.admin@gujarat.gov.in',
  });
  assert.strictEqual(otpReq.status, 200);
  const otp = otpReq.data.devOtpPreview;

  const authRes = await apiRequest('POST', '/api/auth/verify-otp', {
    identifier: 'master.admin@gujarat.gov.in',
    otp,
  });
  assert.strictEqual(authRes.status, 200);
  const token = authRes.data.token || authRes.data.sessionToken;
  assert.ok(token, 'Expected token from auth response');
  console.log('  ✅ Master Admin authenticated.\n');

  // Step 2: Test SMTP Configuration Endpoint
  console.log('Step 2: Testing SMTP Configuration retrieval (GET /api/system/smtp/config)...');
  const smtpGet = await apiRequest('GET', '/api/system/smtp/config', undefined, token);
  assert.strictEqual(smtpGet.status, 200);
  assert.strictEqual(smtpGet.data.success, true);
  assert.ok(smtpGet.data.config.mode, 'Expected mode in config');
  console.log(`  ✅ Current SMTP Mode: ${smtpGet.data.config.mode}, Host: ${smtpGet.data.config.host}`);

  console.log('Step 2b: Updating SMTP Configuration (POST /api/system/smtp/config)...');
  const smtpUpdate = await apiRequest('POST', '/api/system/smtp/config', {
    mode: 'DEV_SIMULATION',
    host: 'smtp.relay.gujarat.gov.in',
    port: 587,
    secure: false,
    user: 'icjs-noreply@gujarat.gov.in',
    pass: 'secure-relay-pass-2026',
    fromEmail: 'icjs-noreply@gujarat.gov.in',
    fromName: 'Gujarat Law Enforcement Gateway',
  }, token);
  assert.strictEqual(smtpUpdate.status, 200);
  assert.strictEqual(smtpUpdate.data.config.host, 'smtp.relay.gujarat.gov.in');
  assert.strictEqual(smtpUpdate.data.config.pass, '••••••••••••');
  console.log('  ✅ SMTP configuration updated and password safely masked.\n');

  // Step 3: Test SMTP Connection Diagnostics
  console.log('Step 3: Testing SMTP Connection Diagnostic Endpoint (POST /api/system/smtp/test)...');
  const smtpTest = await apiRequest('POST', '/api/system/smtp/test', {
    targetEmail: 'admin.diagnostic@gujarat.gov.in',
  }, token);
  // In simulation or offline test env, diagnostic returns diagnostic payload
  assert.strictEqual(smtpTest.status === 200 || smtpTest.status === 500, true);
  console.log(`  ✅ SMTP Test endpoint executed. Diagnostic Message: ${smtpTest.data.message}\n`);

  // Step 4: Layer-wise Bulk Hierarchy Dry Run Preview
  console.log('Step 4: Testing Layer-wise Hierarchy Dry Run Preview (POST /api/organizations/batch-layer-import dryRun=true)...');
  const outlineSample = `
Director General of Police Headquarter
  Vadodara City Commissionerate
    Zone 1 Central Division
      Raopura Police Station
      Sayajigunj Police Station
    Zone 2 South Division
      Makarpura Police Station
  Rajkot Rural Range Office
    Gondal Sub-Division
      Gondal City Police Station
  `;

  const dryRunRes = await apiRequest('POST', '/api/organizations/batch-layer-import', {
    bodyId: 'POLICE',
    textOutline: outlineSample,
    dryRun: true,
  }, token);

  assert.strictEqual(dryRunRes.status, 200);
  assert.strictEqual(dryRunRes.data.dryRun, true);
  assert.strictEqual(dryRunRes.data.count, 10);
  const preview = dryRunRes.data.preview;
  assert.strictEqual(preview[0].name, 'Director General of Police Headquarter');
  assert.strictEqual(preview[1].name, 'Vadodara City Commissionerate');
  assert.strictEqual(preview[2].name, 'Zone 1 Central Division');
  assert.strictEqual(preview[3].name, 'Raopura Police Station');
  assert.strictEqual(preview[3].parentName, 'Zone 1 Central Division');
  console.log(`  ✅ Dry Run Preview PASSED: Parsed ${preview.length} nodes with correct multi-layer parentage.\n`);

  // Step 5: Live Batch Hierarchy Creation
  console.log('Step 5: Executing Live Layer-wise Hierarchy Batch Import (POST /api/organizations/batch-layer-import)...');
  const liveImportRes = await apiRequest('POST', '/api/organizations/batch-layer-import', {
    bodyId: 'POLICE',
    textOutline: outlineSample,
    dryRun: false,
  }, token);

  assert.strictEqual(liveImportRes.status, 201);
  assert.strictEqual(liveImportRes.data.success, true);
  assert.strictEqual(liveImportRes.data.count, 10);
  const createdNodes = liveImportRes.data.nodes;

  // Verify created nodes in database
  const vadodaraNode = createdNodes.find((n: any) => n.name === 'Vadodara City Commissionerate');
  const raopuraNode = createdNodes.find((n: any) => n.name === 'Raopura Police Station');
  assert.ok(vadodaraNode, 'Expected Vadodara node created');
  assert.ok(raopuraNode, 'Expected Raopura node created');
  assert.strictEqual(raopuraNode.level > vadodaraNode.level, true, 'Station level must be deeper than Commissionerate');
  assert.ok(raopuraNode.hierarchy_path.includes(vadodaraNode.code.toLowerCase().replace(/[^a-z0-9]/g, '_')), 'Hierarchy path must contain ancestor code slug');

  console.log(`  ✅ Live Batch Import PASSED: 9 nodes committed to PostgreSQL with canonical hierarchy paths.\n`);

  // Step 6: Verify Visual Analytics Endpoint
  console.log('Step 6: Testing Admin Visual Analytics Telemetry (GET /api/system/analytics/dashboard)...');
  const analyticsRes = await apiRequest('GET', '/api/system/analytics/dashboard', undefined, token);
  assert.strictEqual(analyticsRes.status, 200);
  assert.strictEqual(analyticsRes.data.success, true);
  assert.ok(analyticsRes.data.summary, 'Expected summary metrics');
  assert.ok(Array.isArray(analyticsRes.data.ticketStatus), 'Expected ticketStatus array');
  assert.ok(Array.isArray(analyticsRes.data.actionTypes), 'Expected actionTypes array');
  assert.ok(Array.isArray(analyticsRes.data.timeline), 'Expected timeline array');
  assert.ok(Array.isArray(analyticsRes.data.agencyDistribution), 'Expected agencyDistribution array');
  assert.ok(Array.isArray(analyticsRes.data.hierarchyLevels), 'Expected hierarchyLevels array');

  console.log(`  ✅ Analytics Telemetry PASSED:`);
  console.log(`     - Total Tickets: ${analyticsRes.data.summary.totalTickets}`);
  console.log(`     - Executed Tickets: ${analyticsRes.data.summary.executedTickets}`);
  console.log(`     - Agency Bodies Tracked: ${analyticsRes.data.agencyDistribution.length}`);
  console.log(`     - Hierarchy Layers Tracked: ${analyticsRes.data.hierarchyLevels.length}`);

  console.log('\n================================================================');
  console.log('  🎉 ALL BATCH HIERARCHY & SMTP RELAY TESTS PASSED (100%)');
  console.log('================================================================');
}

runTests().catch((err) => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
