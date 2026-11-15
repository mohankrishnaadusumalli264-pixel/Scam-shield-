import { useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  EyeOff,
  FileWarning,
  Lock,
  Search,
  Share2,
  Trash2,
} from 'lucide-react';
import {
  ModerationIndicator,
  RiskIndicator,
  VerificationIndicator,
} from '../components/RiskBadge';
import {
  deleteReportFirestore,
  requestReportDeletionFirestore,
  withdrawReportToPrivate,
} from '../lib/firestoreQueries';
import type { ModerationStatus, RiskLevel, ScamReport } from '../types/scamshield';

interface CommunityReportsProps {
  publicReports: ScamReport[];
  myReports: ScamReport[];
  loading: boolean;
  isAuthenticated: boolean;
  currentUid: string | null;
  initialTab?: 'public' | 'mine';
  onRefresh: () => Promise<void>;
  onShareReport: (report: ScamReport) => void;
  onGoToScanner: () => void;
}

const RISK_RANK: Record<RiskLevel, number> = {
  Critical: 5,
  High: 4,
  Medium: 3,
  Low: 2,
  Safe: 1,
};

export function CommunityReports({
  publicReports,
  myReports,
  loading,
  isAuthenticated,
  currentUid,
  initialTab = 'public',
  onRefresh,
  onShareReport,
  onGoToScanner,
}: CommunityReportsProps) {
  const [tab, setTab] = useState<'public' | 'mine'>(initialTab);
  const [myStatusFilter, setMyStatusFilter] = useState<'all' | ModerationStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [riskFilter, setRiskFilter] = useState<'ALL' | RiskLevel>('ALL');
  const [sortOrder, setSortOrder] = useState<'latest' | 'oldest' | 'highest_risk'>('latest');

  const [selectedReport, setSelectedReport] = useState<ScamReport | null>(null);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  // Public dashboard strictly shows approved & public reports only
  const approvedPublicReports = useMemo(
    () =>
      publicReports.filter(
        (r) => r.visibility === 'public' && r.moderationStatus === 'approved',
      ),
    [publicReports],
  );

  const myCounts = useMemo(
    () => ({
      all: myReports.length,
      pending: myReports.filter((r) => r.moderationStatus === 'pending').length,
      approved: myReports.filter((r) => r.moderationStatus === 'approved').length,
      rejected: myReports.filter((r) => r.moderationStatus === 'rejected').length,
    }),
    [myReports],
  );

  const activeSource = useMemo(() => {
    if (tab === 'public') return approvedPublicReports;
    if (myStatusFilter === 'all') return myReports;
    return myReports.filter((r) => r.moderationStatus === myStatusFilter);
  }, [tab, approvedPublicReports, myReports, myStatusFilter]);

  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of activeSource) {
      if (r.category) set.add(r.category);
    }
    return Array.from(set).sort();
  }, [activeSource]);

  const filteredReports = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = activeSource.filter((r) => {
      if (categoryFilter !== 'ALL' && r.category !== categoryFilter) return false;
      if (riskFilter !== 'ALL' && r.riskLevel !== riskFilter) return false;
      if (!q) return true;
      return (
        r.title.toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        r.scamChannel.toLowerCase().includes(q) ||
        r.suspiciousIndicators.some((ind) => ind.toLowerCase().includes(q))
      );
    });

    return [...list].sort((a, b) => {
      if (sortOrder === 'oldest') {
        return a.createdAt.localeCompare(b.createdAt);
      }
      if (sortOrder === 'highest_risk') {
        const diff = (RISK_RANK[b.riskLevel] || 0) - (RISK_RANK[a.riskLevel] || 0);
        if (diff !== 0) return diff;
      }
      return b.createdAt.localeCompare(a.createdAt);
    });
  }, [activeSource, categoryFilter, riskFilter, searchQuery, sortOrder]);

  const handleWithdraw = async (reportId: string) => {
    setActionBusyId(reportId);
    setActionError(null);
    setActionSuccess(null);
    try {
      await withdrawReportToPrivate(reportId);
      await onRefresh();
      setSelectedReport(null);
      setActionSuccess('Report withdrawn to private visibility.');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to make report private.');
    } finally {
      setActionBusyId(null);
    }
  };

  const handleRequestDeletion = async (reportId: string) => {
    setActionBusyId(reportId);
    setActionError(null);
    setActionSuccess(null);
    try {
      await requestReportDeletionFirestore(reportId);
      await onRefresh();
      setSelectedReport(null);
      setActionSuccess('Deletion requested. Report has been set to private.');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to request report deletion.');
    } finally {
      setActionBusyId(null);
    }
  };

  const handleDelete = async (reportId: string) => {
    setActionBusyId(reportId);
    setActionError(null);
    setActionSuccess(null);
    try {
      await deleteReportFirestore(reportId);
      await onRefresh();
      setSelectedReport(null);
      setActionSuccess('Report permanently deleted from Cloud Firestore.');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to delete report.');
    } finally {
      setActionBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-1.5">
          <h1 className="text-2xl font-bold text-white tracking-tight">Community Reports</h1>
          <p className="text-sm text-slate-400">
            {tab === 'public'
              ? 'Public dashboard displays moderator-approved community warnings only.'
              : 'Manage your submitted reports across Pending, Approved, and Rejected states.'}
          </p>
        </div>

        {/* Segmented Tab Bar */}
        <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-[#0B1120] border border-slate-800 self-start">
          <button
            type="button"
            onClick={() => {
              setTab('public');
              setCategoryFilter('ALL');
            }}
            className={`min-h-[40px] px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
              tab === 'public'
                ? 'bg-blue-600 text-white'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            Approved Warnings ({approvedPublicReports.length})
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('mine');
              setCategoryFilter('ALL');
            }}
            className={`min-h-[40px] px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
              tab === 'mine'
                ? 'bg-blue-600 text-white'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            My Reports ({isAuthenticated ? myReports.length : 0})
          </button>
        </div>
      </header>

      {/* User Dashboard Status Sub-Filters */}
      {tab === 'mine' && isAuthenticated && (
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              { id: 'all', label: `All (${myCounts.all})` },
              { id: 'pending', label: `Pending (${myCounts.pending})` },
              { id: 'approved', label: `Approved (${myCounts.approved})` },
              { id: 'rejected', label: `Rejected (${myCounts.rejected})` },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setMyStatusFilter(item.id)}
              className={`min-h-[38px] px-3.5 py-1.5 rounded-xl border text-xs font-medium transition-colors ${
                myStatusFilter === item.id
                  ? 'border-blue-500 bg-blue-600/20 text-white'
                  : 'border-slate-800 bg-[#0B1120] text-slate-300 hover:bg-slate-800/60'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}

      {/* Search, Category, Risk & Latest Sort Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3">
        <div className="relative lg:col-span-5">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by title, description, indicator, or channel..."
            className="w-full min-h-[44px] rounded-xl border border-slate-800 bg-[#0B1120] pl-10 pr-4 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>

        <select
          aria-label="Filter by scam category"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="lg:col-span-3 min-h-[44px] rounded-xl border border-slate-800 bg-[#0B1120] px-3.5 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
        >
          <option value="ALL">All Categories</option>
          {categoryOptions.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>

        <select
          aria-label="Filter by risk level"
          value={riskFilter}
          onChange={(e) => setRiskFilter(e.target.value as 'ALL' | RiskLevel)}
          className="lg:col-span-2 min-h-[44px] rounded-xl border border-slate-800 bg-[#0B1120] px-3.5 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
        >
          <option value="ALL">All Risks</option>
          <option value="Critical">Critical Threat</option>
          <option value="High">High Danger</option>
          <option value="Medium">Medium Risk</option>
          <option value="Low">Low Risk</option>
          <option value="Safe">Safe</option>
        </select>

        <select
          aria-label="Sort reports"
          value={sortOrder}
          onChange={(e) =>
            setSortOrder(e.target.value as 'latest' | 'oldest' | 'highest_risk')
          }
          className="lg:col-span-2 min-h-[44px] rounded-xl border border-slate-800 bg-[#0B1120] px-3.5 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
        >
          <option value="latest">Latest Reports</option>
          <option value="highest_risk">Highest Risk</option>
          <option value="oldest">Oldest First</option>
        </select>
      </div>

      {actionSuccess && (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs text-emerald-300">
          {actionSuccess}
        </div>
      )}
      {actionError && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-300">
          {actionError}
        </div>
      )}

      {/* Report List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 rounded-xl border border-slate-800 bg-[#0B1120] animate-pulse" />
          ))}
        </div>
      ) : tab === 'mine' && !isAuthenticated ? (
        <div className="rounded-2xl border border-slate-800 bg-[#0B1120] p-8 text-center space-y-2">
          <Lock className="w-8 h-8 text-slate-500 mx-auto" />
          <p className="text-sm font-semibold text-white">Sign in to access your reports</p>
          <p className="text-xs text-slate-400">
            Track pending, approved, and rejected submissions tied to your Firebase Authentication UID.
          </p>
        </div>
      ) : filteredReports.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-800 bg-[#0B1120] p-10 text-center space-y-3">
          <FileWarning className="w-8 h-8 text-slate-500 mx-auto" />
          <p className="text-sm font-semibold text-white">
            {tab === 'public'
              ? 'No approved community reports match your filters'
              : `No ${myStatusFilter === 'all' ? '' : myStatusFilter + ' '}reports found`}
          </p>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            {tab === 'public'
              ? 'Reports appear here only after passing PII redaction, user consent, and independent moderator approval.'
              : 'Run an AI threat scan to submit a community warning or save a private draft.'}
          </p>
          <button
            type="button"
            onClick={onGoToScanner}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white"
          >
            Go to AI Scam Scanner
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filteredReports.map((report) => {
            const isOwner = Boolean(currentUid && report.userId === currentUid);
            return (
              <article
                key={report.id}
                className="rounded-2xl border border-slate-800 bg-[#0B1120] p-5 space-y-3 hover:border-slate-700 transition-colors"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <h2 className="text-base font-semibold text-white">{report.title}</h2>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                      <span>{report.category}</span>
                      <span aria-hidden="true">·</span>
                      <span>{report.scamChannel}</span>
                      <span aria-hidden="true">·</span>
                      <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                        <Calendar className="w-3 h-3" />
                        {new Date(report.createdAt).toLocaleDateString()}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{report.visibility === 'public' ? 'Public' : 'Private'}</span>
                      {report.deletionRequested && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-amber-300 font-medium">Deletion Requested</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <RiskIndicator level={report.riskLevel} />
                    <VerificationIndicator status={report.verificationStatus} />
                    {tab === 'mine' && <ModerationIndicator status={report.moderationStatus} />}
                  </div>
                </div>

                <p className="text-slate-300 bg-[#060913] border border-slate-800/80 rounded-xl p-3.5 font-mono text-xs leading-relaxed">
                  {report.description}
                </p>

                {tab === 'mine' && report.moderatorNotes && (
                  <p className="text-xs text-blue-200 bg-blue-500/10 border border-blue-500/25 rounded-lg px-3 py-2">
                    <strong>Moderator Note:</strong> {report.moderatorNotes}
                  </p>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => setSelectedReport(report)}
                    className="min-h-[40px] px-3 py-1.5 rounded-lg border border-slate-700 text-xs font-medium text-slate-200 hover:bg-slate-800"
                  >
                    View Report Details
                  </button>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onShareReport(report)}
                      className="min-h-[40px] px-3 py-1.5 rounded-lg bg-blue-600/15 border border-blue-500/30 text-xs font-medium text-blue-300 hover:bg-blue-600/25 inline-flex items-center gap-1.5"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                      <span>Share</span>
                    </button>

                    {isOwner && report.visibility === 'public' && (
                      <button
                        type="button"
                        disabled={actionBusyId === report.id}
                        onClick={() => handleWithdraw(report.id)}
                        className="min-h-[40px] px-3 py-1.5 rounded-lg border border-slate-700 text-xs font-medium text-slate-300 hover:bg-slate-800 inline-flex items-center gap-1.5"
                      >
                        <EyeOff className="w-3.5 h-3.5" />
                        <span>Make Private</span>
                      </button>
                    )}

                    {isOwner && !report.deletionRequested && (
                      <button
                        type="button"
                        disabled={actionBusyId === report.id}
                        onClick={() => handleRequestDeletion(report.id)}
                        className="min-h-[40px] px-3 py-1.5 rounded-lg border border-amber-500/30 text-xs font-medium text-amber-300 hover:bg-amber-500/10 inline-flex items-center gap-1.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Request Deletion</span>
                      </button>
                    )}

                    {isOwner && (
                      <button
                        type="button"
                        disabled={actionBusyId === report.id}
                        onClick={() => handleDelete(report.id)}
                        className="min-h-[40px] px-3 py-1.5 rounded-lg border border-red-500/30 text-xs font-medium text-red-300 hover:bg-red-500/10 inline-flex items-center gap-1.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete</span>
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Report Detail Modal */}
      {selectedReport && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          <div className="w-full max-w-2xl max-h-[88vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl border border-slate-700 bg-[#0B1120] p-6 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-white">{selectedReport.title}</h3>
                <p className="text-xs text-slate-400">
                  {selectedReport.category} · {selectedReport.scamChannel} · Reported{' '}
                  {new Date(selectedReport.createdAt).toLocaleString()}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedReport(null)}
                className="min-h-[40px] px-3 rounded-lg border border-slate-700 text-xs text-slate-300 hover:bg-slate-800"
              >
                Close
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <RiskIndicator level={selectedReport.riskLevel} />
              <VerificationIndicator status={selectedReport.verificationStatus} />
              <ModerationIndicator status={selectedReport.moderationStatus} />
              <span className="text-xs font-mono text-slate-400">
                Confidence: {selectedReport.confidence}%
              </span>
            </div>

            <div className="space-y-1">
              <h4 className="text-xs font-semibold text-slate-300">Redacted Scam Description</h4>
              <p className="text-xs font-mono text-slate-200 bg-[#060913] border border-slate-800 rounded-xl p-3 leading-relaxed whitespace-pre-wrap">
                {selectedReport.description}
              </p>
            </div>

            {selectedReport.optionalEvidence && (
              <div className="space-y-1">
                <h4 className="text-xs font-semibold text-slate-300">Optional Redacted Evidence</h4>
                <p className="text-xs font-mono text-slate-300 bg-[#060913] border border-slate-800 rounded-xl p-3">
                  {selectedReport.optionalEvidence}
                </p>
              </div>
            )}

            <div className="space-y-1">
              <h4 className="text-xs font-semibold text-slate-300">AI Assessment Explanation</h4>
              <p className="text-sm text-slate-200 leading-relaxed">{selectedReport.explanation}</p>
            </div>

            {selectedReport.suspiciousIndicators.length > 0 && (
              <div className="space-y-1.5">
                <h4 className="text-xs font-semibold text-slate-300">Observed Indicators</h4>
                <ul className="list-disc pl-5 space-y-1 text-xs text-slate-300">
                  {selectedReport.suspiciousIndicators.map((ind, idx) => (
                    <li key={idx}>{ind}</li>
                  ))}
                </ul>
              </div>
            )}

            {selectedReport.safetyRecommendations.length > 0 && (
              <div className="space-y-1.5">
                <h4 className="text-xs font-semibold text-slate-300">Safety Recommendations</h4>
                <ul className="list-disc pl-5 space-y-1 text-xs text-emerald-300">
                  {selectedReport.safetyRecommendations.map((rec, idx) => (
                    <li key={idx}>{rec}</li>
                  ))}
                </ul>
              </div>
            )}

            {selectedReport.moderatorNotes && (
              <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-3.5 space-y-1">
                <h4 className="text-xs font-semibold text-blue-300">Moderator Review Notes</h4>
                <p className="text-xs text-slate-200">{selectedReport.moderatorNotes}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
