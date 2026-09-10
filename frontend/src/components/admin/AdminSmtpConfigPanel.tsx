import React, { useState, useEffect } from 'react';
import { api } from '../../lib/api';

interface SmtpConfig {
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

export const AdminSmtpConfigPanel: React.FC = () => {
  const [config, setConfig] = useState<SmtpConfig>({
    mode: 'DEV_SIMULATION',
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    user: '',
    pass: '',
    fromEmail: 'lea-auth-gateway@gujarat.gov.in',
    fromName: 'Gujarat Law Enforcement & Judicial Platform',
    lastTestedAt: null,
    lastTestStatus: null,
    lastTestMessage: null,
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    diagnostics?: any;
  } | null>(null);
  const [saveStatus, setSaveStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const res = await api.get<{ success: boolean; config: SmtpConfig }>('/system/smtp/config');
      if (res.success && res.config) {
        setConfig(res.config);
      }
    } catch (err: any) {
      console.error('Failed to load SMTP config:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveStatus(null);

    try {
      const res = await api.post<any>('/system/smtp/config', config);
      if (res.success) {
        setConfig(res.config);
        setSaveStatus({
          type: 'success',
          text: `SMTP configuration saved and activated in ${res.config.mode} mode.`,
        });
      }
    } catch (err: any) {
      setSaveStatus({ type: 'error', text: `Save failed: ${err.message}` });
    } finally {
      setSaving(false);
    }
  };

  const handleRunTest = async () => {
    if (!testEmail || !testEmail.includes('@')) {
      alert('Please enter a valid recipient email address for diagnostic testing.');
      return;
    }

    setTesting(true);
    setTestResult(null);

    try {
      const res = await api.post<any>('/system/smtp/test', { targetEmail: testEmail });
      setTestResult(res);
      fetchConfig();
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || 'Diagnostic connection failed',
      });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="p-12 text-center bg-white border border-slate-300 rounded-lg shadow-xs">
        <div className="w-8 h-8 border-3 border-blue-700 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <div className="text-xs font-mono font-bold text-slate-700 uppercase tracking-wider">
          Querying SMTP Relay Security Parameters...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Advisory Banner */}
      <div className="bg-white border border-slate-300 rounded-lg p-5 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold font-mono text-slate-900 uppercase tracking-wide flex items-center gap-2">
              <span>Live Email Authentication & SMTP Relay Configuration</span>
              <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                config.mode === 'LIVE_SMTP'
                  ? 'bg-emerald-100 text-emerald-900 border border-emerald-400'
                  : 'bg-amber-100 text-amber-900 border border-amber-400'
              }`}>
                {config.mode === 'LIVE_SMTP' ? '● LIVE TLS DISPATCH ACTIVE' : '○ SIMULATION MODE ACTIVE'}
              </span>
            </h2>
            <p className="text-xs text-slate-600 font-mono mt-1">
              Configure outgoing SMTP transport for real-time Passwordless Login OTPs and Compulsory Update Ticket authorizations (similar to TerrorDB configuration).
            </p>
          </div>

          {/* Mode Switcher */}
          <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-300 font-mono text-xs font-bold">
            <button
              type="button"
              onClick={() => setConfig({ ...config, mode: 'DEV_SIMULATION' })}
              className={`px-3 py-1.5 rounded transition-colors cursor-pointer ${
                config.mode === 'DEV_SIMULATION'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              Dev Simulation
            </button>
            <button
              type="button"
              onClick={() => setConfig({ ...config, mode: 'LIVE_SMTP' })}
              className={`px-3 py-1.5 rounded transition-colors cursor-pointer ${
                config.mode === 'LIVE_SMTP'
                  ? 'bg-blue-700 text-white shadow-xs'
                  : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              Live SMTP Relay
            </button>
          </div>
        </div>
      </div>

      {saveStatus && (
        <div
          className={`p-3.5 rounded-lg border text-xs font-mono leading-relaxed ${
            saveStatus.type === 'success'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
              : 'bg-red-50 border-red-300 text-red-900'
          }`}
        >
          {saveStatus.text}
        </div>
      )}

      {/* Main Configuration Form & Diagnostic Tester Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Form Column (7 cols) */}
        <div className="lg:col-span-7">
          <form onSubmit={handleSave} className="bg-white border border-slate-300 rounded-lg p-5 shadow-xs space-y-4">
            <div className="border-b border-slate-200 pb-2">
              <h3 className="text-sm font-bold font-mono text-slate-900 uppercase tracking-wide">
                SMTP Server Credentials & Transport
              </h3>
              <p className="text-[11px] text-slate-500 font-mono">
                Supports Gmail SMTP, SendGrid, Amazon SES, or internal Gujarat Government mail relays
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold font-mono text-slate-800 uppercase mb-1">
                  SMTP Host / Relay Server
                </label>
                <input
                  type="text"
                  value={config.host}
                  onChange={(e) => setConfig({ ...config, host: e.target.value })}
                  placeholder="smtp.gmail.com"
                  required
                  className="w-full text-xs font-mono p-2.5 rounded bg-slate-50 border border-slate-300 text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold font-mono text-slate-800 uppercase mb-1">
                  Relay Port
                </label>
                <input
                  type="number"
                  value={config.port}
                  onChange={(e) => setConfig({ ...config, port: parseInt(e.target.value, 10) || 587 })}
                  placeholder="587"
                  required
                  className="w-full text-xs font-mono p-2.5 rounded bg-slate-50 border border-slate-300 text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1 pb-1">
              <input
                type="checkbox"
                id="smtpSecureCheckbox"
                checked={config.secure}
                onChange={(e) => setConfig({ ...config, secure: e.target.checked })}
                className="w-4 h-4 text-blue-700 border-slate-300 rounded focus:ring-blue-500 cursor-pointer"
              />
              <label htmlFor="smtpSecureCheckbox" className="text-xs font-mono font-bold text-slate-800 cursor-pointer">
                Use Implicit SSL/TLS (Enable for port 465; leave disabled for STARTTLS port 587)
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-200">
              <div>
                <label className="block text-xs font-bold font-mono text-slate-800 uppercase mb-1">
                  SMTP Username / Account
                </label>
                <input
                  type="text"
                  value={config.user}
                  onChange={(e) => setConfig({ ...config, user: e.target.value })}
                  placeholder="lea-gateway@gmail.com"
                  className="w-full text-xs font-mono p-2.5 rounded bg-slate-50 border border-slate-300 text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold font-mono text-slate-800 uppercase">
                    SMTP Password / App Password
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-[10.5px] font-mono text-blue-700 hover:underline cursor-pointer"
                  >
                    {showPassword ? 'Hide' : 'Reveal'}
                  </button>
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={config.pass || ''}
                  onChange={(e) => setConfig({ ...config, pass: e.target.value })}
                  placeholder="••••••••••••"
                  className="w-full text-xs font-mono p-2.5 rounded bg-slate-50 border border-slate-300 text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-200">
              <div>
                <label className="block text-xs font-bold font-mono text-slate-800 uppercase mb-1">
                  Sender From Email Address
                </label>
                <input
                  type="email"
                  value={config.fromEmail}
                  onChange={(e) => setConfig({ ...config, fromEmail: e.target.value })}
                  placeholder="investigations-noreply@gujarat.gov.in"
                  required
                  className="w-full text-xs font-mono p-2.5 rounded bg-slate-50 border border-slate-300 text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold font-mono text-slate-800 uppercase mb-1">
                  Sender Organization Display Name
                </label>
                <input
                  type="text"
                  value={config.fromName}
                  onChange={(e) => setConfig({ ...config, fromName: e.target.value })}
                  placeholder="Gujarat Law Enforcement & Judicial Platform"
                  required
                  className="w-full text-xs font-mono p-2.5 rounded bg-slate-50 border border-slate-300 text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-none"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
              <div className="text-[11px] font-mono text-slate-500">
                Credentials stored encrypted in PostgreSQL <code>system_settings</code>
              </div>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 rounded bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white font-mono text-xs font-bold transition-colors shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                {saving ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <span>Save Configuration</span>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Diagnostic Connection Tester Column (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white border border-slate-300 rounded-lg p-5 shadow-xs space-y-4">
            <div className="border-b border-slate-200 pb-2">
              <h3 className="text-sm font-bold font-mono text-slate-900 uppercase tracking-wide">
                Live Connection & Dispatch Tester
              </h3>
              <p className="text-[11px] text-slate-500 font-mono">
                Initiates TLS handshake with server and transmits diagnostic test email
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold font-mono text-slate-800 uppercase mb-1">
                Target Recipient Email
              </label>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  placeholder="your.email@gmail.com"
                  className="flex-1 text-xs font-mono p-2.5 rounded bg-slate-50 border border-slate-300 text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleRunTest}
                  disabled={testing}
                  className="px-3.5 py-2 rounded bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-mono text-xs font-bold transition-colors cursor-pointer shrink-0"
                >
                  {testing ? 'Testing...' : 'Send Test'}
                </button>
              </div>
            </div>

            {/* Diagnostic Output Console */}
            {testResult && (
              <div className={`p-3.5 rounded border font-mono text-xs space-y-2 ${
                testResult.success
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                  : 'bg-red-50 border-red-300 text-red-950'
              }`}>
                <div className="flex items-center justify-between font-bold">
                  <span>{testResult.success ? 'DIAGNOSTIC PASSED' : 'CONNECTION FAILED'}</span>
                  {testResult.diagnostics?.latencyMs && (
                    <span className="text-[11px] font-semibold">{testResult.diagnostics.latencyMs} ms</span>
                  )}
                </div>
                <div className="text-[11.5px] leading-relaxed break-all">
                  {testResult.message}
                </div>
                {testResult.diagnostics?.messageId && (
                  <div className="text-[10px] text-slate-600 border-t border-emerald-200 pt-1.5 truncate">
                    Message ID: {testResult.diagnostics.messageId}
                  </div>
                )}
              </div>
            )}

            {/* Last Test Telemetry Card */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded font-mono text-[11px] text-slate-600 space-y-1.5">
              <div className="flex items-center justify-between">
                <span>Last Telemetry Test:</span>
                <span className="font-bold text-slate-800">
                  {config.lastTestedAt ? new Date(config.lastTestedAt).toLocaleString() : 'Never'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Last Handshake Status:</span>
                <span className={`font-bold ${
                  config.lastTestStatus === 'SUCCESS'
                    ? 'text-emerald-700'
                    : config.lastTestStatus === 'FAILED'
                    ? 'text-red-700'
                    : 'text-slate-500'
                }`}>
                  {config.lastTestStatus || 'N/A'}
                </span>
              </div>
              {config.lastTestMessage && (
                <div className="text-[10.5px] text-slate-500 truncate pt-1 border-t border-slate-200">
                  Result: {config.lastTestMessage}
                </div>
              )}
            </div>

            <div className="text-[11px] font-mono text-slate-500 leading-relaxed">
              <strong>Operational Note:</strong> When mode is set to <strong>"Live SMTP Relay"</strong>, all one-time passwordless codes and ticket authorizations are dispatched via real email to official personnel mailboxes.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

