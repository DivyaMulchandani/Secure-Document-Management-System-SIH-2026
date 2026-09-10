import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ShieldIcon, LockIcon } from '../components/Icons';

export const Login: React.FC = () => {
  const { requestOtp, verifyOtp, login } = useAuth();
  const navigate = useNavigate();

  // Authentication mode: 'OTP' (Passwordless default) or 'PASSWORD' (Legacy fallback)
  const [authMode, setAuthMode] = useState<'OTP' | 'PASSWORD'>('OTP');

  // Form State
  const [identifier, setIdentifier] = useState('master.admin@gujarat.gov.in');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('Gov@Secure2026!');
  const [step, setStep] = useState<'IDENTIFIER' | 'OTP'>('IDENTIFIER');
  const [maskedEmail, setMaskedEmail] = useState('');
  const [devOtpPreview, setDevOtpPreview] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Request OTP Step
  const handleRequestOtp = async (e?: React.FormEvent, customId?: string) => {
    if (e) e.preventDefault();
    setError('');
    setInfoMsg('');
    setDevOtpPreview(null);
    const target = (customId || identifier).trim();

    if (!target) {
      setError('Please enter your official email address or Government ID.');
      return;
    }

    setSubmitting(true);
    const res = await requestOtp(target);
    setSubmitting(false);

    if (res.success) {
      setStep('OTP');
      setMaskedEmail(res.emailMasked || target);
      setInfoMsg(res.message || 'OTP dispatched to registered government email');
      if (res.devOtpPreview) {
        setDevOtpPreview(res.devOtpPreview);
        setOtp(res.devOtpPreview); // Auto-fill in dev mode for maximum testing ease
      }
    } else {
      setError(res.error || 'Failed to dispatch verification code');
    }
  };

  // Verify OTP Step
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    const res = await verifyOtp(identifier.trim(), otp.trim());
    setSubmitting(false);

    if (res.success) {
      navigate('/dashboard');
    } else {
      setError(res.error || 'Invalid or expired OTP code');
    }
  };

  // Password Login Fallback
  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    const res = await login(identifier.trim(), password);
    setSubmitting(false);

    if (res.success) {
      navigate('/dashboard');
    } else {
      setError(res.error || 'Authentication Failed');
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col justify-center items-center px-4 py-8 text-slate-900 selection:bg-blue-700 selection:text-white">
      <div className="w-full max-w-lg">
        {/* Emblem & Official Header */}
        <div className="text-center mb-6">
          <div className="w-14 h-14 mx-auto mb-3 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-700 shadow-sm">
            <ShieldIcon className="w-8 h-8" />
          </div>
          <h1 className="text-base font-bold tracking-wider text-slate-900 uppercase">
            State of Gujarat • Law Enforcement & Judicial Platform
          </h1>
          <p className="text-xs text-slate-500 mt-1 font-mono tracking-wide">
            CCTNS // ICJS INTER-OPERABLE CRIMINAL JUSTICE SYSTEM
          </p>
          <div className="mt-2.5 inline-flex items-center gap-2 text-[11px] font-mono text-slate-600 px-3 py-1 rounded bg-white border border-slate-200 shadow-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-600" />
            <span>INSTITUTIONAL ZERO-CLIENT-TRUST HSM GATEWAY</span>
          </div>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-lg p-6 border border-slate-200 shadow-sm relative">
          <div className="flex items-center justify-between pb-3.5 mb-4 border-b border-slate-200">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2">
              <span className="w-1 h-3.5 bg-blue-700 rounded-xs inline-block"></span>
              <LockIcon className="w-3.5 h-3.5 text-blue-700" />
              <span>Official Personnel Authentication</span>
            </span>
            <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200">
              RESTRICTED LEA ACCESS
            </span>
          </div>

          {/* Mode Switcher */}
          <div className="flex items-center gap-1 p-1 mb-4 rounded bg-slate-100 border border-slate-200 text-xs font-mono">
            <button
              type="button"
              onClick={() => { setAuthMode('OTP'); setStep('IDENTIFIER'); setError(''); }}
              className={`flex-1 py-1.5 rounded text-center transition-colors ${
                authMode === 'OTP' ? 'bg-[#1D4ED8] text-white font-bold shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Passwordless (Email + OTP)
            </button>
            <button
              type="button"
              onClick={() => { setAuthMode('PASSWORD'); setError(''); }}
              className={`flex-1 py-1.5 rounded text-center transition-colors ${
                authMode === 'PASSWORD' ? 'bg-[#1D4ED8] text-white font-bold shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Password Fallback
            </button>
          </div>

          {error && (
            <div className="p-3 mb-4 rounded bg-red-50 border border-red-200 text-red-700 text-xs font-mono flex items-center gap-2">
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}

          {infoMsg && (
            <div className="p-3 mb-4 rounded bg-blue-50 border border-blue-200 text-blue-800 text-xs font-mono flex items-center gap-2">
              <span>ℹ️</span>
              <span>{infoMsg}</span>
            </div>
          )}

          {/* MODE 1: PASSWORDLESS EMAIL + OTP */}
          {authMode === 'OTP' && (
            <div>
              {step === 'IDENTIFIER' ? (
                <form onSubmit={handleRequestOtp} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5 font-mono">
                      Official Government Email or Government Service ID
                    </label>
                    <input
                      type="text"
                      required
                      className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded font-mono text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
                      placeholder="e.g. officer@gujaratpolice.gov.in or IPS-GJ-1994-01"
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                    />
                    <p className="text-[11px] text-slate-500 mt-1 font-mono">
                      A 6-digit cryptographic verification code will be sent to the official registered address.
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full bg-[#1D4ED8] hover:bg-[#1E40AF] text-white py-2.5 mt-2 rounded font-mono text-xs tracking-wider uppercase font-bold transition-all shadow-sm flex items-center justify-center gap-2"
                  >
                    <LockIcon className="w-4 h-4" />
                    <span>{submitting ? 'Generating Verification OTP...' : 'Authenticate via Security OTP'}</span>
                  </button>
                </form>
              ) : (
                <form onSubmit={handleVerifyOtp} className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-semibold text-slate-700 font-mono">
                        Enter 6-Digit Authorization Code
                      </label>
                      <button
                        type="button"
                        onClick={() => setStep('IDENTIFIER')}
                        className="text-[11px] text-blue-700 hover:underline font-mono font-medium"
                      >
                        Change Identifier
                      </button>
                    </div>

                    <input
                      type="text"
                      required
                      maxLength={6}
                      autoFocus
                      className="w-full px-3 py-2 text-lg bg-white border border-slate-300 rounded font-mono text-center tracking-[0.3em] font-bold text-slate-900 focus:outline-hidden focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
                      placeholder="••••••"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value)}
                    />
                    <div className="flex items-center justify-between mt-1.5 text-[11px] font-mono text-slate-500">
                      <span>Recipient: {maskedEmail}</span>
                      <button
                        type="button"
                        onClick={() => handleRequestOtp()}
                        disabled={submitting}
                        className="text-blue-700 hover:underline font-medium"
                      >
                        Resend OTP
                      </button>
                    </div>
                  </div>

                  {devOtpPreview && (
                    <div className="p-2.5 rounded bg-slate-50 border border-slate-200 text-xs font-mono">
                      <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">
                        LEA Terminal Test Verification Code
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-blue-900 tracking-widest text-sm">{devOtpPreview}</span>
                        <span className="text-[10px] text-emerald-700 font-semibold">Valid for 10 minutes</span>
                      </div>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full bg-[#1D4ED8] hover:bg-[#1E40AF] text-white py-2.5 mt-2 rounded font-mono text-xs tracking-wider uppercase font-bold transition-all shadow-sm flex items-center justify-center gap-2"
                  >
                    <LockIcon className="w-4 h-4" />
                    <span>{submitting ? 'Verifying Authorization...' : 'Verify OTP & Access Gateway'}</span>
                  </button>
                </form>
              )}
            </div>
          )}

          {/* MODE 2: PASSWORD FALLBACK */}
          {authMode === 'PASSWORD' && (
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5 font-mono">
                  Official Identifier (Username / Email)
                </label>
                <input
                  type="text"
                  required
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded font-mono text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
                  placeholder="e.g. master_admin, police_body_admin..."
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5 font-mono">
                  Institutional Password
                </label>
                <input
                  type="password"
                  required
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded font-mono text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-[#1D4ED8] hover:bg-[#1E40AF] text-white py-2.5 mt-2 rounded font-mono text-xs tracking-wider uppercase font-bold transition-all shadow-sm flex items-center justify-center gap-2"
              >
                <LockIcon className="w-4 h-4" />
                <span>{submitting ? 'Verifying Credentials...' : 'Authenticate & Access Platform'}</span>
              </button>
            </form>
          )}

          {/* Quick Personnel Credentials Helper */}
          <div className="mt-4 pt-3 border-t border-slate-100">
            <div className="text-[10px] font-mono text-slate-500 font-semibold uppercase tracking-wider mb-2 flex items-center justify-between">
              <span>Quick Demo Credentials:</span>
              <span className="text-[9px] text-blue-700 font-normal">Click to auto-fill</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setIdentifier('master.admin@gujarat.gov.in');
                  setPassword('Gov@Secure2026!');
                  setError('');
                }}
                className="text-left p-2 rounded bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 transition-colors"
              >
                <div className="text-[11px] font-bold text-slate-800 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-700 inline-block"></span>
                  <span>Master Apex Admin</span>
                </div>
                <div className="text-[10px] font-mono text-slate-500 truncate">master.admin@gujarat.gov.in</div>
                <div className="text-[9px] font-mono text-slate-400">Gov@Secure2026!</div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIdentifier('acp.ellisbridge@gujarat.gov.in');
                  setPassword('Gov@Secure2026!');
                  setError('');
                }}
                className="text-left p-2 rounded bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 transition-colors"
              >
                <div className="text-[11px] font-bold text-slate-800 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 inline-block"></span>
                  <span>ACP Ellisbridge</span>
                </div>
                <div className="text-[10px] font-mono text-slate-500 truncate">acp.ellisbridge@gujarat.gov.in</div>
                <div className="text-[9px] font-mono text-slate-400">Gov@Secure2026!</div>
              </button>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-200 text-center">
            <div className="text-[11px] font-mono text-slate-500">
              Official government portal. All authentication events are cryptographically recorded in the state audit ledger.
            </div>
          </div>
        </div>

        {/* Institutional Credential Policy Advisory Banner (Self-registration strictly disabled) */}
        <div className="mt-5 bg-white rounded-lg p-4 border border-slate-200 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded bg-blue-50 border border-blue-200 text-blue-700 flex items-center justify-center shrink-0 mt-0.5">
              <ShieldIcon className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold font-mono text-slate-900 uppercase tracking-wider mb-1 flex items-center gap-2">
                <span>Access Provisioning Policy</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 font-semibold">
                  NO PUBLIC REGISTRATION
                </span>
              </div>
              <p className="text-[11.5px] text-slate-600 leading-relaxed font-sans">
                Self-service account creation and public credential requests are strictly disabled under state LEA protocol. Official credentials can only be provisioned by the appointed Administrator of your designated organizational command office via an authorized compulsory ticket.
              </p>
              <div className="mt-2 text-[10.5px] font-mono text-slate-500 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-700"></span>
                <span>Contact your respective Departmental / Office Administrator for onboarding.</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
