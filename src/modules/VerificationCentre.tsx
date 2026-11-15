import { useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Lock,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import {
  ModerationIndicator,
  RiskIndicator,
  VerificationIndicator,
} from '../components/RiskBadge';
import { submitModeratorDecision } from '../lib/firestoreQueries';
import type { ScamReport, UserRole } from '../types/scamshield';

interface VerificationCentreProps {
  reports: ScamReport[];
  role: UserRole;
  currentUid: string | null;
  onRefresh: () => Promise<void>;
}

export function VerificationCentre({
  reports,
  role,
  currentUid,
  onRefresh,
}: VerificationCentreProps) {
  const canModerate = role === 'moderator' || role === 'admin';
  const [selectedReport, setSelectedReport] = useState<ScamReport | null>(null);
  const [notes, setNotes] = useState('');
  const [rejectReason, setRejectReason] = useState<'dismissed' | 'false_positive'>('dismissed');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const reviewQueue = reports.filter((r) => r.moderationStatus === 'pending');
  const reviewedReports = reports.filter(
    (r) => r.moderationStatus === 'approved' || r.moderationStatus === 'rejected',
  );

  const handleDecision = async (decision: 'approved' | 'rejected') => {
    if (!selectedReport || !currentUid || !canModerate) return;
    if (selectedReport.userId === currentUid) {
      setErrorMsg('Self-approval blocked: moderators cannot approve or reject their own reports.');
      return;
    }

    setBusy(true);
    setErrorMsg(null);
    setFeedback(null);
    try {
      await submitModeratorDecision({
        report: selectedReport,
        moderatorId: currentUid,
        decision,
        rejectReason: decision === 'rejected' ? rejectReason : undefined,
        notes,
      });
      await onRefresh();
      setFeedback(
        decision === 'approved'
          ? `Approved "${selectedReport.title}" — now publicly visible in Community Warnings.`
          : `Rejected "${selectedReport.title}" — remains private to the submitter.`,
      );
      setSelectedReport(null);
      setNotes('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to record moderation decision.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <h1 className="text-2xl font-bold text-white tracking-tight">Verification Centre</h1>
        <p className="text-sm text-slate-400 max-w-3xl">
          Every community report enters as <strong className="text-amber-300">Pending</strong> and
          stays private until reviewed by an authorized Moderator or Administrator. Approved reports
          publish to the Community Dashboard; rejected reports remain private. Moderators cannot
          approve their own submissions.
        </p>
      </header>

      {/* Pipeline Explanation */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-800 bg-[#0B1120] p-4 space-y-1">
          <p className="text-xs font-mono text-amber-300">STAGE 1 · AI TRIAGE</p>
          <h2 className="text-sm font-semibold text-white">AI Suspected</h2>
          <p className="text-xs text-slate-400">
            Gemini evaluates indicators and masks PII, keeping reports private and unverified.
          </p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-[#0B1120] p-4 space-y-1">
          <p className="text-xs font-mono text-blue-400">STAGE 2 · PENDING QUEUE</p>
          <h2 className="text-sm font-semibold text-white">Private Until Approved</h2>
          <p className="text-xs text-slate-400">
            New submissions start with moderationStatus=pending and visibility=private.
          </p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-[#0B1120] p-4 space-y-1">
          <p className="text-xs font-mono text-emerald-400">STAGE 3 · MODERATOR AUDIT</p>
          <h2 className="text-sm font-semibold text-white">Approve or Reject</h2>
          <p className="text-xs text-slate-400">
            Authorized moderators approve to publish publicly or reject while keeping reports private.
          </p>
        </div>
      </section>

      {!canModerate && (
        <div className="rounded-xl border border-slate-800 bg-[#0B1120] p-4 flex items-center gap-3 text-xs text-slate-300">
          <Lock className="w-4 h-4 text-slate-400 shrink-0" />
          <span>
            Your current role is <strong className="text-white uppercase">{role}</strong>. Moderator
            or Administrator privileges are required to approve or reject pending reports.
          </span>
        </div>
      )}

      {feedback && (
        <div className="rounded-xl border border-emerald-500/35 bg-emerald-500/10 p-3.5 text-xs text-emerald-300">
          {feedback}
        </div>
      )}
      {errorMsg && (
        <div className="rounded-xl border border-red-500/35 bg-red-500/10 p-3.5 text-xs text-red-300">
          {errorMsg}
        </div>
      )}

      {/* Pending Moderation Queue */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">
            Pending Moderation Queue ({reviewQueue.length})
          </h2>
        </div>

        {reviewQueue.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-800 bg-[#0B1120] p-6 text-center space-y-2">
            <Clock className="w-7 h-7 text-slate-500 mx-auto" />
            <p className="text-sm font-medium text-slate-200">Moderation queue is clear</p>
            <p className="text-xs text-slate-400">
              Pending user submissions awaiting moderator approval will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {reviewQueue.map((rep) => {
              const isSelfReport = Boolean(currentUid && rep.userId === currentUid);
              return (
                <div
                  key={rep.id}
                  className="rounded-2xl border border-slate-800 bg-[#0B1120] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <RiskIndicator level={rep.riskLevel} />
                      <ModerationIndicator status={rep.moderationStatus} />
                      <VerificationIndicator status={rep.verificationStatus} />
                      <span className="text-xs font-mono text-slate-400">
                        {rep.confidence}% confidence
                      </span>
                    </div>
                    <h3 className="text-sm font-semibold text-white">{rep.title}</h3>
                    <p className="text-xs text-slate-400 line-clamp-2">{rep.description}</p>
                    {rep.deletionRequested && (
                      <p className="text-xs text-amber-300">
                        Note: Author requested deletion of this report.
                      </p>
                    )}
                    {isSelfReport && canModerate && (
                      <p className="text-xs text-amber-300 flex items-center gap-1">
                        <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                        <span>Self-approval disabled: submitted by your own account.</span>
                      </p>
                    )}
                  </div>

                  {canModerate && (
                    <button
                      type="button"
                      disabled={isSelfReport}
                      onClick={() => {
                        setSelectedReport(rep);
                        setNotes(rep.moderatorNotes || '');
                        setErrorMsg(null);
                      }}
                      className="min-h-[44px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-45 disabled:cursor-not-allowed text-xs font-semibold text-white whitespace-nowrap shrink-0"
                    >
                      {isSelfReport ? 'Self-Review Blocked' : 'Review Submission'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Completed Decisions */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">
          Completed Moderation Decisions ({reviewedReports.length})
        </h2>
        {reviewedReports.length === 0 ? (
          <p className="text-xs text-slate-400">No moderator-reviewed decisions recorded yet.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {reviewedReports.map((rep) => (
              <div
                key={rep.id}
                className="rounded-xl border border-slate-800 bg-[#0B1120] p-4 space-y-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <ModerationIndicator status={rep.moderationStatus} />
                  <RiskIndicator level={rep.riskLevel} />
                </div>
                <h3 className="text-sm font-semibold text-white">{rep.title}</h3>
                <p className="text-xs text-slate-400">
                  Visibility: <span className="capitalize text-slate-200">{rep.visibility}</span>
                </p>
                {rep.moderatorNotes && (
                  <p className="text-xs text-slate-400">Moderator note: {rep.moderatorNotes}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Moderator Review Modal */}
      {selectedReport && canModerate && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          <div className="w-full max-w-xl rounded-t-3xl sm:rounded-2xl border border-slate-700 bg-[#0B1120] p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-white">Moderator Approval / Rejection</h3>
            <div className="space-y-1">
              <p className="text-sm text-white font-semibold">{selectedReport.title}</p>
              <p className="text-xs text-slate-400">
                {selectedReport.category} · {selectedReport.scamChannel} · Consent given:{' '}
                {selectedReport.consentGiven ? 'Yes' : 'No'}
              </p>
            </div>

            <div className="rounded-xl border border-slate-800 bg-[#060913] p-3 text-xs font-mono text-slate-300 max-h-32 overflow-y-auto whitespace-pre-wrap">
              {selectedReport.description}
            </div>

            {selectedReport.optionalEvidence && (
              <div className="rounded-xl border border-slate-800 bg-[#060913] p-3 text-xs font-mono text-slate-400">
                Evidence Note: {selectedReport.optionalEvidence}
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="mod-notes" className="block text-xs font-medium text-slate-300">
                Verification Audit Notes (Required)
              </label>
              <textarea
                id="mod-notes"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Document corroborating scam indicators for approval, or reason for rejection..."
                className="w-full rounded-xl border border-slate-700 bg-[#060913] p-3 text-xs text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="reject-reason" className="block text-xs font-medium text-slate-300">
                Rejection Classification (if rejecting)
              </label>
              <select
                id="reject-reason"
                value={rejectReason}
                onChange={(e) =>
                  setRejectReason(e.target.value as 'dismissed' | 'false_positive')
                }
                className="w-full min-h-[40px] rounded-xl border border-slate-700 bg-[#060913] px-3 text-xs text-slate-200"
              >
                <option value="dismissed">Dismissed / Unverified (Keep Private)</option>
                <option value="false_positive">False Positive / Legitimate (Keep Private)</option>
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                disabled={busy || !selectedReport.consentGiven}
                onClick={() => handleDecision('approved')}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-xs font-semibold text-white inline-flex items-center justify-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Approve &amp; Publish</span>
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => handleDecision('rejected')}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 text-xs font-semibold text-white inline-flex items-center justify-center gap-1.5"
              >
                <XCircle className="w-4 h-4" />
                <span>Reject (Keep Private)</span>
              </button>
            </div>

            {!selectedReport.consentGiven && (
              <p className="text-[11px] text-amber-300">
                This report was saved as a private draft without community consent, so it cannot be
                published publicly (can only be rejected/dismissed).
              </p>
            )}

            <button
              type="button"
              onClick={() => setSelectedReport(null)}
              className="w-full min-h-[40px] rounded-xl text-xs text-slate-400 hover:text-white"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
