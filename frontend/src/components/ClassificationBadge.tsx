import React from 'react';

export const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  let color = 'text-muted-text bg-surface border-border';
  let label = status.replace(/_/g, ' ');

  switch (status) {
    case 'UNDER_INVESTIGATION':
      color = 'text-warning bg-warning-light border-warning/30';
      break;
    case 'CHARGESHEETED':
      color = 'text-accent bg-accent-light border-accent/30';
      break;
    case 'TRIAL_IN_PROGRESS':
      color = 'text-blue-400 bg-blue-500/10 border-blue-500/30';
      break;
    case 'DISPOSED':
    case 'REPORT_ISSUED':
    case 'ACTIVE':
      color = 'text-success bg-success-light border-success/30';
      break;
    case 'LOCKED':
    case 'SUSPENDED':
    case 'REVOKED':
      color = 'text-danger bg-danger-light border-danger/30';
      break;
    default:
      break;
  }

  return (
    <span className={`inline-flex items-center text-[10.5px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${color}`}>
      {label}
    </span>
  );
};

export const AgencyBadge: React.FC<{ branch: string; className?: string }> = ({ branch, className = '' }) => {
  let badgeStyle = 'bg-slate-800 text-slate-200 border-slate-700';
  let label = branch;

  switch (branch) {
    case 'POLICE':
      badgeStyle = 'bg-blue-950/70 text-blue-300 border-blue-800/60';
      label = 'POLICE WING';
      break;
    case 'FORENSICS':
      badgeStyle = 'bg-purple-950/70 text-purple-300 border-purple-800/60';
      label = 'FORENSIC SCIENCE';
      break;
    case 'JUDICIARY':
      badgeStyle = 'bg-amber-950/70 text-amber-300 border-amber-800/60';
      label = 'JUDICIARY';
      break;
    case 'MASTER':
      badgeStyle = 'bg-emerald-950/70 text-emerald-300 border-emerald-800/60';
      label = 'APEX JUSTICE COMMAND';
      break;
  }

  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-wider px-2.5 py-0.5 rounded border ${badgeStyle} ${className}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />
      {label}
    </span>
  );
};
