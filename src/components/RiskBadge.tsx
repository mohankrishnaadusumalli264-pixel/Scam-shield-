import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Cpu,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import type { ModerationStatus, RiskLevel, VerificationStatus } from '../types/scamshield';

export function RiskIndicator({ level }: { level: RiskLevel }) {
  const styles: Record<RiskLevel, { classes: string; icon: typeof ShieldCheck; label: string }> = {
    Safe: {
      classes: 'bg-emerald-500/12 text-emerald-400 border-emerald-500/30',
      icon: ShieldCheck,
      label: 'Safe',
    },
    Low: {
      classes: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25',
      icon: CheckCircle2,
      label: 'Low Risk',
    },
    Medium: {
      classes: 'bg-amber-500/12 text-amber-300 border-amber-500/30',
      icon: AlertTriangle,
      label: 'Medium Risk',
    },
    High: {
      classes: 'bg-red-500/14 text-red-400 border-red-500/35',
      icon: ShieldAlert,
      label: 'High Danger',
    },
    Critical: {
      classes: 'bg-red-600/20 text-red-300 border-red-500/50',
      icon: AlertOctagon,
      label: 'Critical Threat',
    },
  };

  const config = styles[level] || styles.Medium;
  const Icon = config.icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-medium whitespace-nowrap shrink-0 ${config.classes}`}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>{config.label}</span>
    </span>
  );
}

export function VerificationIndicator({ status }: { status: VerificationStatus }) {
  const map: Record<
    VerificationStatus,
    { classes: string; icon: typeof ShieldCheck; label: string }
  > = {
    unreviewed: {
      classes: 'bg-slate-800/90 text-slate-300 border-slate-700',
      icon: Clock,
      label: 'Unreviewed Draft',
    },
    ai_suspected: {
      classes: 'bg-amber-500/12 text-amber-300 border-amber-500/30',
      icon: Cpu,
      label: 'AI Suspected (Unverified)',
    },
    pending_review: {
      classes: 'bg-blue-500/12 text-blue-300 border-blue-500/30',
      icon: Clock,
      label: 'Pending Moderator Review',
    },
    verified_scam: {
      classes: 'bg-red-500/15 text-red-300 border-red-500/40',
      icon: AlertOctagon,
      label: 'Moderator Verified Scam',
    },
    false_positive: {
      classes: 'bg-emerald-500/12 text-emerald-300 border-emerald-500/30',
      icon: ShieldCheck,
      label: 'Verified Safe / False Positive',
    },
    dismissed: {
      classes: 'bg-slate-800 text-slate-400 border-slate-700',
      icon: XCircle,
      label: 'Rejected / Dismissed',
    },
  };

  const cfg = map[status] || map.ai_suspected;
  const Icon = cfg.icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-medium whitespace-nowrap shrink-0 ${cfg.classes}`}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>{cfg.label}</span>
    </span>
  );
}

export function ModerationIndicator({ status }: { status: ModerationStatus }) {
  const map: Record<
    ModerationStatus,
    { classes: string; icon: typeof Clock; label: string }
  > = {
    pending: {
      classes: 'bg-amber-500/12 text-amber-300 border-amber-500/30',
      icon: Clock,
      label: 'Moderation: Pending',
    },
    approved: {
      classes: 'bg-emerald-500/12 text-emerald-300 border-emerald-500/30',
      icon: CheckCircle2,
      label: 'Moderation: Approved',
    },
    rejected: {
      classes: 'bg-red-500/12 text-red-300 border-red-500/30',
      icon: XCircle,
      label: 'Moderation: Rejected (Private)',
    },
  };

  const cfg = map[status] || map.pending;
  const Icon = cfg.icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-medium whitespace-nowrap shrink-0 ${cfg.classes}`}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>{cfg.label}</span>
    </span>
  );
}
