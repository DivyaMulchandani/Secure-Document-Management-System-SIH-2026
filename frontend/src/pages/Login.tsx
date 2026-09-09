import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ShieldIcon, LockIcon } from '../components/Icons';

export const Login: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState('master_admin');
  const [password, setPassword] = useState('Gov@Secure2026!');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    const res = await login(username, password);
    setSubmitting(false);

    if (res.success) {
      navigate('/dashboard');
    } else {
      setError(res.error || 'Authentication Failed');
    }
  };

  const handleFillMasterAdmin = () => {
    setUsername('master_admin');
    setPassword('Gov@Secure2026!');
    setError('');
  };

  return (
    <div className="min-h-screen bg-bg flex flex-col justify-center items-center px-4 py-8 text-primary-text">
      <div className="w-full max-w-md">
        {/* Emblem & Header */}
        <div className="text-center mb-6">
          <div className="w-14 h-14 mx-auto mb-3 rounded-xl bg-accent/15 border border-accent/30 flex items-center justify-center text-accent shadow-sm">
            <ShieldIcon className="w-8 h-8" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-primary-text">
            SECURE MULTI-AGENCY PLATFORM
          </h1>
          <p className="text-xs text-muted-text mt-1 font-mono">
            State of Gujarat • Sovereign Law Enforcement, Judiciary & Forensics
          </p>
        </div>

        {/* Login Card */}
        <div className="glass-card p-6 border border-border shadow-lg">
          <div className="flex items-center justify-between pb-4 mb-4 border-b border-border-light">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-muted-text">
              Official Identity Gateway
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              RESTRICTED GOV ACCESS
            </span>
          </div>

          {error && (
            <div className="p-3 mb-4 rounded bg-danger-light border border-danger/30 text-danger text-xs font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-muted-text mb-1.5">
                Government Username / Official ID
              </label>
              <input
                type="text"
                required
                className="input-field font-mono"
                placeholder="e.g. master_admin or provisioned badge ID"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-text mb-1.5">
                Cryptographic Password
              </label>
              <input
                type="password"
                required
                className="input-field font-mono"
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full btn-primary py-2.5 mt-2"
            >
              <LockIcon className="w-4 h-4" />
              <span>{submitting ? 'Verifying Institutional Identity...' : 'Authenticate & Enter Portal'}</span>
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-border-light text-center">
            <div className="text-[11px] text-muted-darker">
              Unauthorized access attempts are monitored and logged under Indian IT Act 2000.
            </div>
          </div>
        </div>

        {/* System Initial Bootstrap Guidance */}
        <div className="mt-6 glass-card p-4 border border-border">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-bold text-accent flex items-center gap-1.5">
              <span>🏛️ System Bootstrap & Sovereign Governance</span>
            </div>
            <button
              type="button"
              onClick={handleFillMasterAdmin}
              className="text-[10px] px-2 py-0.5 rounded bg-accent/15 text-accent hover:bg-accent/25 border border-accent/30 font-mono transition-colors"
            >
              Fill Master Admin
            </button>
          </div>
          <p className="text-[11px] text-muted-text leading-relaxed">
            Per institutional governance standards, the database initializes with exactly <strong>one</strong> Apex Administrator: <code className="text-primary-text font-mono">master_admin</code>.
          </p>
          <div className="mt-2 text-[10.5px] text-muted-darker bg-surface p-2.5 rounded border border-border font-mono space-y-1">
            <div>1. Login as Master Admin (<span className="text-emerald-400">Gov@Secure2026!</span>)</div>
            <div>2. Provision Sovereign Body Admins for Police, Judiciary & Forensics</div>
            <div>3. Body Admins log in independently to provision layer personnel</div>
          </div>
        </div>
      </div>
    </div>
  );
};
