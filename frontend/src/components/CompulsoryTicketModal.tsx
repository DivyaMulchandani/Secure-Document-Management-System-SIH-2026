import React, { useState } from 'react';
import { api } from '../lib/api';
import { ShieldIcon, LockIcon, CheckIcon } from './Icons';

export interface TicketSummaryItem {
  label: string;
  value: string;
  highlight?: boolean;
}

interface CompulsoryTicketModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  actionType:
    | 'CREATE_OFFICE'
    | 'UPDATE_OFFICE'
    | 'UPDATE_OFFICE_STATUS'
    | 'DELETE_OFFICE'
    | 'CREATE_USER'
    | 'UPDATE_USER'
    | 'UPDATE_USER_STATUS'
    | 'DELETE_USER'
    | 'CREATE_ADMIN_LEVEL'
    | 'CREATE_OFFICE_POSITION';
  targetResourceType: 'ORGANIZATION_NODE' | 'ORG' | 'USER' | 'OFFICE_POSITION' | 'ADMIN_LEVEL';
  targetResourceId?: string;
  payload: any;
  summaryItems?: TicketSummaryItem[];
  onSuccess: (result: any) => void;
}

export const CompulsoryTicketModal: React.FC<CompulsoryTicketModalProps> = ({
  isOpen,
  onClose,
  title,
  actionType,
  targetResourceType,
  targetResourceId,
  payload,
  summaryItems = [],
  onSuccess,
}) => {
  const [step, setStep] = useState<'JUSTIFICATION' | 'OTP' | 'SUCCESS'>('JUSTIFICATION');
  const [justification, setJustification] = useState('');
  const [ticketId, setTicketId] = useState<string | null>(null);
  const [ticketNumber, setTicketNumber] = useState<string | null>(null);
  const [maskedEmail, setMaskedEmail] = useState<string | null>(null);
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (justification.trim().length < 5) {
      setError('A valid operational justification (minimum 5 characters) is mandatory.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await api.post<{
        success: boolean;
        ticketId: string;
        ticketNumber: string;
        actionType: string;
        requesterEmail: string;
        devOtpPreview?: string;
        message: string;
      }>('/tickets/request-otp', {
        actionType,
        targetResourceType,
        targetResourceId,
        justification: justification.trim(),
        payload,
      });

      setTicketId(res.ticketId);
      setTicketNumber(res.ticketNumber);
      setMaskedEmail(res.requesterEmail);
      if (res.devOtpPreview) {
        setDevOtp(res.devOtpPreview);
      }
      setStep('OTP');
    } catch (err: any) {
      setError(err.message || 'Failed to generate compulsory update ticket');
    } finally {
      setLoading(false);
    }
  };

  const handleExecuteWithOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketId || otpCode.trim().length !== 6) {
      setError('Please enter the valid 6-digit authorization OTP.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await api.post<{
        success: boolean;
        ticketNumber: string;
        actionType: string;
        status: string;
        result: any;
        message: string;
      }>('/tickets/execute-with-otp', {
        ticketId,
        otp: otpCode.trim(),
      });

      setStep('SUCCESS');
      setTimeout(() => {
        onSuccess(res.result);
        handleClose();
      }, 1200);
    } catch (err: any) {
      setError(err.message || 'Failed to verify OTP and execute update');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setStep('JUSTIFICATION');
    setJustification('');
    setTicketId(null);
    setTicketNumber(null);
    setMaskedEmail(null);
    setDevOtp(null);
    setOtpCode('');
    setError(null);
    setLoading(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-lg w-full max-w-lg shadow-xl overflow-hidden text-xs">
        {/* Header - Turtleneck institutional header */}
        <div className="px-5 py-3.5 bg-white border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-700">
              <ShieldIcon className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 font-mono tracking-tight flex items-center gap-2">
                <span>{title}</span>
              </h3>
              <p className="text-[10.5px] text-slate-500 font-mono">
                Compulsory Update Ticket Protocol • {actionType}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            disabled={loading}
            className="text-slate-400 hover:text-slate-700 font-mono text-base px-1"
          >
            ✕
          </button>
        </div>

        {/* Error Notice */}
        {error && (
          <div className="mx-5 mt-4 p-3 rounded bg-red-50 border border-red-200 text-red-700 font-mono text-xs">
            ⚠️ {error}
          </div>
        )}

        {/* STEP 1: Justification Review */}
        {step === 'JUSTIFICATION' && (
          <form onSubmit={handleRequestOtp} className="p-5 space-y-4">
            {summaryItems.length > 0 && (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded space-y-1.5 font-mono">
                <div className="text-[10px] uppercase text-slate-500 font-bold tracking-wider">
                  Target Operation Parameters
                </div>
                <div className="grid grid-cols-2 gap-2 text-slate-800">
                  {summaryItems.map((item, idx) => (
                    <div key={idx} className="truncate">
                      <span className="text-slate-500 text-[10.5px]">{item.label}: </span>
                      <span className="font-semibold text-slate-900">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="p-3 rounded bg-blue-50 border border-blue-200 text-[11px] text-blue-900 leading-relaxed">
              <span className="font-bold text-blue-800 font-mono">LEA MANDATORY PROTOCOL:</span> All administrative creations, modifications, and deletions require an immutable update ticket. Enter the formal operational justification below. An authorization OTP will be dispatched to your registered official email.
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1 font-mono">
                Operational Justification & Authority Reference *
              </label>
              <textarea
                required
                rows={3}
                placeholder="e.g. Government Gazette Order No. 441/2026 or Scheduled quarterly personnel reorganization authorized by SP Surat"
                className="w-full bg-white border border-slate-300 rounded p-2.5 text-slate-900 placeholder-slate-400 focus:outline-hidden focus:border-blue-600 focus:ring-1 focus:ring-blue-600 text-xs font-mono"
                value={justification}
                onChange={(e) => setJustification(e.target.value)}
              />
              <span className="text-[10px] text-slate-500 font-mono mt-0.5 block">
                Minimum 5 characters. Stored in state judicial audit archives.
              </span>
            </div>

            <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={handleClose}
                disabled={loading}
                className="px-3.5 py-1.5 rounded bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 font-mono text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-1.5 rounded bg-[#1D4ED8] hover:bg-[#1E40AF] text-white font-mono font-semibold flex items-center gap-1.5 shadow-sm text-xs"
              >
                <LockIcon className="w-3.5 h-3.5" />
                <span>{loading ? 'Generating Ticket...' : 'Generate Ticket & Request OTP'}</span>
              </button>
            </div>
          </form>
        )}

        {/* STEP 2: OTP Verification */}
        {step === 'OTP' && (
          <form onSubmit={handleExecuteWithOtp} className="p-5 space-y-4">
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded font-mono space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">TICKET NUMBER:</span>
                <span className="font-bold text-blue-700 text-sm">{ticketNumber}</span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-500">DISPATCHED TO:</span>
                <span className="text-slate-800 font-semibold">{maskedEmail}</span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-500">STATUS:</span>
                <span className="text-amber-700 font-bold">AWAITING AUTHORIZATION OTP</span>
              </div>
            </div>

            {/* Dev OTP Helper */}
            {devOtp && (
              <div className="p-2.5 rounded bg-blue-50 border border-blue-200 font-mono text-[11px] text-blue-900 flex items-center justify-between">
                <span className="text-slate-600">LEA Secure Mail Relay Simulation:</span>
                <span className="font-bold text-blue-800 tracking-wider">
                  OTP: {devOtp}
                </span>
              </div>
            )}

            <div>
              <label className="block text-slate-700 font-semibold mb-1 text-center font-mono">
                Enter 6-Digit Authorization OTP *
              </label>
              <input
                required
                type="text"
                maxLength={6}
                autoFocus
                placeholder="••••••"
                className="w-full text-center tracking-[0.4em] font-mono text-xl py-2 bg-white border border-slate-300 rounded text-slate-900 focus:outline-hidden focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
              />
              <span className="text-[10.5px] text-slate-500 text-center block mt-1 font-mono">
                Code expires in 10 minutes.
              </span>
            </div>

            <div className="flex justify-between items-center pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setStep('JUSTIFICATION')}
                disabled={loading}
                className="text-xs text-slate-500 hover:text-slate-800 font-mono font-medium"
              >
                ← Back to Justification
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={loading}
                  className="px-3 py-1.5 rounded bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 font-mono text-xs"
                >
                  Abort
                </button>
                <button
                  type="submit"
                  disabled={loading || otpCode.length !== 6}
                  className="px-4 py-1.5 rounded bg-[#1D4ED8] hover:bg-[#1E40AF] disabled:opacity-50 text-white font-mono font-semibold flex items-center gap-1.5 shadow-sm text-xs"
                >
                  <CheckIcon className="w-3.5 h-3.5" />
                  <span>{loading ? 'Executing...' : 'Verify OTP & Execute Update'}</span>
                </button>
              </div>
            </div>
          </form>
        )}

        {/* STEP 3: Execution Confirmed */}
        {step === 'SUCCESS' && (
          <div className="p-8 text-center space-y-3 font-mono">
            <div className="w-10 h-10 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center mx-auto text-lg">
              ✓
            </div>
            <h4 className="text-sm font-bold text-slate-900">
              Ticket {ticketNumber} Authorized & Executed
            </h4>
            <p className="text-xs text-slate-500">
              Operation committed to database and sealed in immutable audit ledger.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
