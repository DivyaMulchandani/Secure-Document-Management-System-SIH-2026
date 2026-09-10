import React from 'react';

export const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  let color = 'text-slate-800 bg-slate-100 border-slate-300';
  let label = status.replace(/_/g, ' ');

  switch (status) {
    case 'UNDER_INVESTIGATION':
      color = 'text-amber-900 bg-amber-50 border-amber-300 font-semibold';
      break;
    case 'CHARGESHEETED':
      color = 'text-blue-900 bg-blue-50 border-blue-300 font-semibold';
      break;
    case 'TRIAL_IN_PROGRESS':
      color = 'text-indigo-900 bg-indigo-50 border-indigo-300 font-semibold';
      break;
    case 'DISPOSED':
    case 'REPORT_ISSUED':
    case 'ACTIVE':
    case 'EXECUTED':
      color = 'text-emerald-900 bg-emerald-50 border-emerald-300 font-semibold';
      break;
    case 'LOCKED':
    case 'SUSPENDED':
    case 'REVOKED':
    case 'DISABLED':
    case 'REJECTED':
      color = 'text-red-900 bg-red-50 border-red-300 font-semibold';
      break;
    default:
      break;
  }

  return (
    <span className={`inline-flex items-center text-[10.5px] font-mono uppercase tracking-wider px-2.5 py-0.5 rounded border shadow-xs ${color}`}>
      {label}
    </span>
  );
};

export const AgencyBadge: React.FC<{ branch: string; className?: string }> = ({ branch, className = '' }) => {
  let badgeStyle = 'bg-slate-100 text-slate-900 border-slate-400';
  let label = branch;
  let dotColor = 'bg-slate-700';

  switch (branch) {
    case 'POLICE':
      badgeStyle = 'bg-blue-50 text-blue-900 border-blue-300';
      label = 'GUJARAT POLICE // COMMAND';
      dotColor = 'bg-[#1E40AF]';
      break;
    case 'FORENSICS':
      badgeStyle = 'bg-indigo-50 text-indigo-900 border-indigo-300';
      label = 'FORENSICS // DFSS LABS';
      dotColor = 'bg-indigo-700';
      break;
    case 'JUDICIARY':
      badgeStyle = 'bg-emerald-50 text-emerald-900 border-emerald-300';
      label = 'JUDICIARY // HIGH COURT';
      dotColor = 'bg-emerald-700';
      break;
    case 'MASTER':
      badgeStyle = 'bg-slate-100 text-slate-900 border-slate-400';
      label = 'APEX SOVEREIGN GOVERNANCE';
      dotColor = 'bg-blue-800';
      break;
  }

  return (
    <span className={`inline-flex items-center gap-2 text-[10.5px] font-mono font-bold uppercase tracking-wider px-2.5 py-1 rounded border shadow-xs ${badgeStyle} ${className}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
      <span>{label}</span>
    </span>
  );
};
