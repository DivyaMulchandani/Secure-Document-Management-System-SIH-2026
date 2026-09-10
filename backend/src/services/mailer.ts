import nodemailer from 'nodemailer';
import { query } from './db';

export interface SmtpConfig {
  mode: 'DEV_SIMULATION' | 'LIVE_SMTP';
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass?: string;
  fromEmail: string;
  fromName: string;
  lastTestedAt?: string | null;
  lastTestStatus?: 'SUCCESS' | 'FAILED' | null;
  lastTestMessage?: string | null;
}

const DEFAULT_CONFIG: SmtpConfig = {
  mode: 'DEV_SIMULATION',
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  secure: process.env.SMTP_SECURE === 'true',
  user: process.env.SMTP_USER || '',
  pass: process.env.SMTP_PASS || '',
  fromEmail: process.env.SMTP_FROM_EMAIL || 'lea-auth-gateway@gujarat.gov.in',
  fromName: process.env.SMTP_FROM_NAME || 'Gujarat Law Enforcement & Judicial Platform',
  lastTestedAt: null,
  lastTestStatus: null,
  lastTestMessage: null,
};

export async function getSmtpConfig(maskPassword = true): Promise<SmtpConfig> {
  try {
    const res = await query(`
      SELECT key, value FROM system_settings 
      WHERE key IN (
        'smtp_mode', 'smtp_host', 'smtp_port', 'smtp_secure',
        'smtp_user', 'smtp_pass', 'smtp_from_email', 'smtp_from_name',
        'smtp_last_tested_at', 'smtp_last_test_status', 'smtp_last_test_message'
      );
    `);

    const map = new Map<string, string>();
    res.rows.forEach(r => map.set(r.key, r.value));

    const rawPass = map.get('smtp_pass') || DEFAULT_CONFIG.pass || '';
    const hasPass = !!rawPass;

    return {
      mode: (map.get('smtp_mode') as 'DEV_SIMULATION' | 'LIVE_SMTP') || DEFAULT_CONFIG.mode,
      host: map.get('smtp_host') || DEFAULT_CONFIG.host,
      port: parseInt(map.get('smtp_port') || String(DEFAULT_CONFIG.port), 10),
      secure: (map.get('smtp_secure') || String(DEFAULT_CONFIG.secure)) === 'true',
      user: map.get('smtp_user') || DEFAULT_CONFIG.user,
      pass: maskPassword ? (hasPass ? '••••••••••••' : '') : rawPass,
      fromEmail: map.get('smtp_from_email') || DEFAULT_CONFIG.fromEmail,
      fromName: map.get('smtp_from_name') || DEFAULT_CONFIG.fromName,
      lastTestedAt: map.get('smtp_last_tested_at') || null,
      lastTestStatus: (map.get('smtp_last_test_status') as 'SUCCESS' | 'FAILED') || null,
      lastTestMessage: map.get('smtp_last_test_message') || null,
    };
  } catch (err) {
    console.error('[MAILER] Failed to read SMTP configuration from database:', err);
    return { ...DEFAULT_CONFIG, pass: maskPassword ? '••••••••••••' : DEFAULT_CONFIG.pass };
  }
}

export async function saveSmtpConfig(config: Partial<SmtpConfig>): Promise<SmtpConfig> {
  const current = await getSmtpConfig(false);

  const merged: SmtpConfig = {
    mode: config.mode || current.mode,
    host: config.host !== undefined ? config.host : current.host,
    port: config.port !== undefined ? Number(config.port) : current.port,
    secure: config.secure !== undefined ? Boolean(config.secure) : current.secure,
    user: config.user !== undefined ? config.user : current.user,
    // If pass is sent as masked dots or undefined/empty, preserve existing password
    pass: (config.pass && !config.pass.includes('••••')) ? config.pass : current.pass,
    fromEmail: config.fromEmail !== undefined ? config.fromEmail : current.fromEmail,
    fromName: config.fromName !== undefined ? config.fromName : current.fromName,
    lastTestedAt: config.lastTestedAt !== undefined ? config.lastTestedAt : current.lastTestedAt,
    lastTestStatus: config.lastTestStatus !== undefined ? config.lastTestStatus : current.lastTestStatus,
    lastTestMessage: config.lastTestMessage !== undefined ? config.lastTestMessage : current.lastTestMessage,
  };

  const entries: [string, string][] = [
    ['smtp_mode', merged.mode],
    ['smtp_host', merged.host],
    ['smtp_port', String(merged.port)],
    ['smtp_secure', String(merged.secure)],
    ['smtp_user', merged.user],
    ['smtp_pass', merged.pass || ''],
    ['smtp_from_email', merged.fromEmail],
    ['smtp_from_name', merged.fromName],
  ];

  if (merged.lastTestedAt !== undefined) entries.push(['smtp_last_tested_at', merged.lastTestedAt || '']);
  if (merged.lastTestStatus !== undefined) entries.push(['smtp_last_test_status', merged.lastTestStatus || '']);
  if (merged.lastTestMessage !== undefined) entries.push(['smtp_last_test_message', merged.lastTestMessage || '']);

  for (const [key, value] of entries) {
    await query(`
      INSERT INTO system_settings (key, value, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();
    `, [key, value]);
  }

  return getSmtpConfig(true);
}

function createTransporter(config: SmtpConfig) {
  const options: any = {
    host: config.host,
    port: config.port,
    secure: config.secure,
    tls: {
      rejectUnauthorized: false, // Allows institutional self-signed or enterprise certs
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
  };

  if (config.user && config.pass) {
    options.auth = {
      user: config.user,
      pass: config.pass,
    };
  }

  return nodemailer.createTransport(options);
}

export async function testSmtpConnection(targetEmail: string): Promise<{
  success: boolean;
  message: string;
  diagnostics?: {
    latencyMs: number;
    host: string;
    port: number;
    secure: boolean;
    authConfigured: boolean;
    recipient: string;
    messageId?: string;
  };
}> {
  const config = await getSmtpConfig(false);
  const startTime = Date.now();

  try {
    const transporter = createTransporter(config);

    // Verify SMTP connection and handshake
    await transporter.verify();

    // Dispatch verification test email
    const info = await transporter.sendMail({
      from: `"${config.fromName}" <${config.fromEmail}>`,
      to: targetEmail,
      subject: `[SECURE LEA GATEWAY] SMTP Live Relay Verification Transmission`,
      headers: {
        'X-LEA-Transmission-Class': 'CONFIDENTIAL-DIAGNOSTIC',
        'X-LEA-Originating-Agency': 'GUJARAT_POLICE_JUDICIAL_PLATFORM',
      },
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #0f172a; }
            .container { max-width: 580px; margin: 0 auto; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 6px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
            .header { background: #1e40af; color: #ffffff; padding: 18px 24px; border-bottom: 2px solid #1e3a8a; }
            .title { font-size: 15px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase; margin: 0; }
            .subtitle { font-size: 11px; color: #bfdbfe; font-family: monospace; margin-top: 4px; }
            .content { padding: 24px; }
            .alert-box { background: #eff6ff; border-left: 4px solid #2563eb; padding: 14px; margin-bottom: 20px; font-size: 13px; color: #1e3a8a; }
            .diag-table { width: 100%; border-collapse: collapse; font-family: monospace; font-size: 12px; margin-top: 16px; }
            .diag-table td { padding: 8px; border: 1px solid #e2e8f0; }
            .diag-label { background: #f1f5f9; font-weight: 600; width: 35%; color: #334155; }
            .footer { background: #f8fafc; padding: 14px 24px; font-size: 11px; color: #64748b; font-family: monospace; border-top: 1px solid #e2e8f0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="title">State of Gujarat // Law Enforcement Command</div>
              <div class="subtitle">Inter-Operable Criminal Justice System (ICJS) &bull; Security Relay Gateway</div>
            </div>
            <div class="content">
              <div class="alert-box">
                <strong>SMTP Live Relay Diagnostic Test Passed.</strong><br>
                This test confirms that your live institutional mail transport is operational and ready to dispatch real-time multi-factor authentication OTPs and compulsory update ticket authorizations.
              </div>
              <table class="diag-table">
                <tr><td class="diag-label">SMTP Relay Host</td><td>${config.host}</td></tr>
                <tr><td class="diag-label">Relay Port</td><td>${config.port} (${config.secure ? 'SSL/TLS Implicit' : 'STARTTLS Explicit'})</td></tr>
                <tr><td class="diag-label">Sender Address</td><td>${config.fromEmail}</td></tr>
                <tr><td class="diag-label">Recipient Target</td><td>${targetEmail}</td></tr>
                <tr><td class="diag-label">Timestamp</td><td>${new Date().toISOString()}</td></tr>
                <tr><td class="diag-label">Latency</td><td>${Date.now() - startTime} ms</td></tr>
              </table>
            </div>
            <div class="footer">
              OFFICIAL GOVERNMENT OF GUJARAT LEA NOTIFICATION &bull; CONFIDENTIAL &bull; SECURE HSM DISPATCH
            </div>
          </div>
        </body>
        </html>
      `,
      text: `[SECURE LEA GATEWAY] SMTP Live Relay Test Successful. Host: ${config.host}:${config.port}. Latency: ${Date.now() - startTime}ms.`,
    });

    const latencyMs = Date.now() - startTime;
    const nowIso = new Date().toISOString();

    // Update diagnostic stats in system_settings
    await query(`
      INSERT INTO system_settings (key, value, updated_at)
      VALUES 
        ('smtp_last_tested_at', $1, NOW()),
        ('smtp_last_test_status', 'SUCCESS', NOW()),
        ('smtp_last_test_message', $2, NOW())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();
    `, [nowIso, `Success (${latencyMs}ms) to ${targetEmail}`]);

    return {
      success: true,
      message: `SMTP connection established and test dispatch verified in ${latencyMs} ms.`,
      diagnostics: {
        latencyMs,
        host: config.host,
        port: config.port,
        secure: config.secure,
        authConfigured: !!(config.user && config.pass),
        recipient: targetEmail,
        messageId: info.messageId,
      },
    };
  } catch (err: any) {
    const latencyMs = Date.now() - startTime;
    const errorMsg = err.message || 'SMTP Handshake / Transmission Failure';

    await query(`
      INSERT INTO system_settings (key, value, updated_at)
      VALUES 
        ('smtp_last_tested_at', $1, NOW()),
        ('smtp_last_test_status', 'FAILED', NOW()),
        ('smtp_last_test_message', $2, NOW())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();
    `, [new Date().toISOString(), errorMsg.slice(0, 500)]);

    return {
      success: false,
      message: `SMTP Connection Failed: ${errorMsg}`,
      diagnostics: {
        latencyMs,
        host: config.host,
        port: config.port,
        secure: config.secure,
        authConfigured: !!(config.user && config.pass),
        recipient: targetEmail,
      },
    };
  }
}

export async function sendOtpEmail(
  toEmail: string,
  otpCode: string,
  purpose: 'LOGIN_AUTHENTICATION' | 'UPDATE_TICKET_AUTHORIZATION',
  meta: {
    displayName?: string;
    ticketNumber?: string;
    actionType?: string;
    ipAddress?: string;
  } = {}
): Promise<{ delivered: boolean; mode: string; messageId?: string; error?: string }> {
  const config = await getSmtpConfig(false);

  // If in simulation mode, log and return simulated delivery
  if (config.mode !== 'LIVE_SMTP') {
    console.log(`[LEA MAILER DEV_SIMULATION] ${purpose} OTP for ${toEmail}: [ ${otpCode} ] (Valid 10 mins)`);
    return {
      delivered: true,
      mode: 'DEV_SIMULATION',
    };
  }

  // Live SMTP Delivery Mode
  try {
    const transporter = createTransporter(config);
    const isLogin = purpose === 'LOGIN_AUTHENTICATION';

    const subject = isLogin
      ? `[LEA SECURITY] Verification Code for Gujarat Justice Portal: ${otpCode}`
      : `[LEA AUTHORIZATION] Update Ticket OTP [${meta.ticketNumber || 'ACTION'}]: ${otpCode}`;

    const purposeTitle = isLogin
      ? 'Passwordless Identity Authentication'
      : `Compulsory Update Ticket Authorization (${meta.ticketNumber || 'TICKET'})`;

    const actionDetails = !isLogin && meta.actionType ? `
      <div style="margin-top: 10px; padding: 10px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 4px; font-family: monospace; font-size: 11.5px;">
        <strong>Ticket Action:</strong> ${meta.actionType}<br>
        <strong>Ticket Reference:</strong> ${meta.ticketNumber || 'PENDING'}<br>
        <strong>Authorized Official:</strong> ${meta.displayName || toEmail}
      </div>
    ` : '';

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #0f172a; }
          .card { max-width: 540px; margin: 0 auto; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 6px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
          .header { background: #1e40af; color: #ffffff; padding: 18px 24px; border-bottom: 2px solid #1e3a8a; }
          .title { font-size: 14px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase; margin: 0; }
          .subtitle { font-size: 11px; color: #bfdbfe; font-family: monospace; margin-top: 3px; }
          .body { padding: 24px; }
          .salutation { font-size: 13.5px; margin-bottom: 12px; color: #1e293b; }
          .otp-container { text-align: center; margin: 24px 0; }
          .otp-box { display: inline-block; background: #f1f5f9; border: 2px solid #1e40af; border-radius: 6px; padding: 14px 28px; font-family: 'JetBrains Mono', Consolas, monospace; font-size: 32px; font-weight: 700; letter-spacing: 6px; color: #1e40af; }
          .expiry-note { font-size: 12px; color: #b91c1c; font-weight: 600; margin-top: 8px; }
          .security-warning { background: #fffbeb; border-left: 3px solid #d97706; padding: 12px; font-size: 12px; color: #78350f; margin-top: 20px; line-height: 1.4; }
          .footer { background: #f8fafc; padding: 14px 24px; font-size: 11px; color: #64748b; font-family: monospace; border-top: 1px solid #e2e8f0; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="header">
            <div class="title">Government of Gujarat &bull; Law Enforcement Gateway</div>
            <div class="subtitle">Inter-Operable Criminal Justice System &bull; CCTNS-HSM Gateway</div>
          </div>
          <div class="body">
            <div class="salutation">
              Official Personnel Security Notice:
            </div>
            <p style="font-size: 13px; color: #334155; margin: 0 0 16px 0;">
              A request for <strong>${purposeTitle}</strong> was initiated for your registered government identity (<code>${toEmail}</code>).
            </p>

            ${actionDetails}

            <div class="otp-container">
              <div class="otp-box">${otpCode}</div>
              <div class="expiry-note">&bull; EXPIRES IN 10 MINUTES &bull; SINGLE USE ONLY</div>
            </div>

            <div class="security-warning">
              <strong>CONFIDENTIAL INSTITUTIONAL SECURITY NOTICE:</strong><br>
              Never disclose this one-time authorization code to anyone, including system administrators. 
              ${meta.ipAddress ? `Originating IP: <code>${meta.ipAddress}</code>.` : ''}
              If you did not initiate this action, immediately report to the State Cyber Crime Command.
            </div>
          </div>
          <div class="footer">
            CONFIDENTIAL &bull; FOR AUTHORIZED LAW ENFORCEMENT & JUDICIAL PERSONNEL ONLY
          </div>
        </div>
      </body>
      </html>
    `;

    const info = await transporter.sendMail({
      from: `"${config.fromName}" <${config.fromEmail}>`,
      to: toEmail,
      subject,
      headers: {
        'X-LEA-Authorization-Type': purpose,
        'X-LEA-Priority': 'HIGH',
      },
      html: htmlContent,
      text: `[GUJARAT LEA GATEWAY] ${purposeTitle}. Your one-time verification code is: ${otpCode}. Valid for 10 minutes.`,
    });

    console.log(`[LEA MAILER LIVE] OTP successfully dispatched to ${toEmail}. Message ID: ${info.messageId}`);
    return {
      delivered: true,
      mode: 'LIVE_SMTP',
      messageId: info.messageId,
    };
  } catch (err: any) {
    console.error(`[LEA MAILER LIVE ERROR] Failed to dispatch live OTP to ${toEmail}:`, err);
    return {
      delivered: false,
      mode: 'LIVE_SMTP_FAILED',
      error: err.message,
    };
  }
}

