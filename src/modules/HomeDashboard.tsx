import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Database,
  FileWarning,
  Lock,
  ScanSearch,
  Share2,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { RiskIndicator, VerificationIndicator } from '../components/RiskBadge';
import type { FirestoreConnectionState } from '../lib/firebase';
import type { AppHealthStatus, ScamReport, ThreatCampaign } from '../types/scamshield';

export type ModuleId =
  | 'home'
  | 'scanner'
  | 'reports'
  | 'intelligence'
  | 'share'
  | 'verification'
  | 'profile'
  | 'admin';

interface HomeDashboardProps {
  health: AppHealthStatus | null;
  firestoreState: FirestoreConnectionState;
  publicReports: ScamReport[];
  myReports: ScamReport[];
  campaigns: ThreatCampaign[];
  isAuthenticated: boolean;
  onNavigate: (module: ModuleId) => void;
  onSelectReportForShare: (report: ScamReport) => void;
}

export function HomeDashboard({
  health,
  firestoreState,
  publicReports,
  myReports,
  campaigns,
  isAuthenticated,
  onNavigate,
  onSelectReportForShare,
}: HomeDashboardProps) {
  const approvedPublic = publicReports.filter(
    (r) => r.visibility === 'public' && r.moderationStatus === 'approved',
  );
  const verifiedCount = approvedPublic.filter((r) => r.verificationStatus === 'verified_scam').length;
  const pendingCount = myReports.filter((r) => r.moderationStatus === 'pending').length;

  return (
    <div className="space-y-8">
      {/* Primary Hero Anchor */}
      <section className="relative overflow-hidden rounded-2xl border border-slate-800 bg-[#0B1120] p-6 lg:p-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          <div className="lg:col-span-8 space-y-4">
            <p className="text-xs font-mono tracking-wide text-blue-400">
              SCAMSHIELD · PRIVACY-FIRST DEFENSIVE SECURITY
            </p>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white tracking-tight text-balance">
              Detect Scams. Share Warnings. Protect Everyone.
            </h1>
            <p className="text-sm sm:text-base text-slate-300 max-w-2xl leading-relaxed">
              Analyze suspicious SMS messages, payment requests, links, and screenshots with
              server-side Gemini AI triage. Uploads stay private by default, personal credentials
              are redacted automatically, and human moderators verify community warnings.
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => onNavigate('scanner')}
                className="inline-flex items-center gap-2 px-5 py-3 min-h-[44px] rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors whitespace-nowrap shrink-0"
              >
                <ScanSearch className="w-4 h-4" />
                <span>Scan Suspicious Message</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigate('reports')}
                className="inline-flex items-center gap-2 px-4 py-3 min-h-[44px] rounded-xl bg-[#111A2E] hover:bg-slate-800 border border-slate-700 text-slate-200 text-sm font-medium transition-colors whitespace-nowrap shrink-0"
              >
                <FileWarning className="w-4 h-4 text-slate-400" />
                <span>Community Warnings</span>
              </button>
            </div>
          </div>

          <div className="lg:col-span-4 flex justify-center lg:justify-end">
            <div className="w-40 h-40 sm:w-48 sm:h-48 rounded-2xl overflow-hidden border border-slate-800 bg-[#060913] flex items-center justify-center">
              <img
                src="/src/assets/images/scamshield_crest_1794674219115.jpg"
                alt="SCAMSHIELD obsidian security shield emblem"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Live Infrastructure Readiness Strip */}
      <section aria-label="Service Configuration Status" className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-800 bg-[#0B1120] p-4 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-400">Gemini AI Triage</span>
            {health?.geminiConfigured ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Ready</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-300">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Key Missing</span>
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            {health?.geminiConfigured
              ? 'Server-side GEMINI_API_KEY active for text and in-memory screenshot triage.'
              : 'Configure GEMINI_API_KEY on the server to enable AI threat analysis.'}
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-[#0B1120] p-4 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-400">Cloud Firestore</span>
            {firestoreState === 'connected' ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                <Database className="w-3.5 h-3.5" />
                <span>Connected</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-300">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>{firestoreState === 'checking' ? 'Checking' : 'Check Config'}</span>
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 leading-relaxed font-mono truncate">
            {health?.firebaseProjectId
              ? `${health.firebaseProjectId}`
              : 'Firestore not configured'}
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-[#0B1120] p-4 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-400">Firebase Authentication</span>
            {isAuthenticated ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                <Lock className="w-3.5 h-3.5" />
                <span>Signed In</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-300">
                <Lock className="w-3.5 h-3.5" />
                <span>Guest</span>
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            {isAuthenticated
              ? 'Verified Google session active for private drafts, reporting, and alerts.'
              : 'Sign in with Google via Profile to save private drafts and submit warnings.'}
          </p>
        </div>
      </section>

      {/* Live Firestore Counts */}
      <section aria-label="Live Firestore Metrics" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-800 bg-[#0B1120] p-5">
          <p className="text-xs text-slate-400">Approved Community Reports</p>
          <p className="mt-2 text-2xl font-bold text-white font-mono tabular-nums">
            {approvedPublic.length}
          </p>
          <p className="mt-1 text-xs text-slate-500">Live Firestore count</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-[#0B1120] p-5">
          <p className="text-xs text-slate-400">Moderator Verified Scams</p>
          <p className="mt-2 text-2xl font-bold text-red-400 font-mono tabular-nums">
            {verifiedCount}
          </p>
          <p className="mt-1 text-xs text-slate-500">Human-reviewed only</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-[#0B1120] p-5">
          <p className="text-xs text-slate-400">Your Pending Reports</p>
          <p className="mt-2 text-2xl font-bold text-amber-300 font-mono tabular-nums">
            {isAuthenticated ? pendingCount : '—'}
          </p>
          <p className="mt-1 text-xs text-slate-500">In moderation queue</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-[#0B1120] p-5">
          <p className="text-xs text-slate-400">Your Saved Reports</p>
          <p className="mt-2 text-2xl font-bold text-blue-400 font-mono tabular-nums">
            {isAuthenticated ? myReports.length : '—'}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {isAuthenticated ? 'Private by default' : 'Sign in to view'}
          </p>
        </div>
      </section>

      {/* Recent Live Community Warnings & Active Campaigns */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-7 rounded-2xl border border-slate-800 bg-[#0B1120] p-6 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-white">Recent Community Warnings</h2>
              <p className="text-xs text-slate-400">
                Moderator-approved warnings stored in Cloud Firestore
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('reports')}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-400 hover:text-blue-300 min-h-[40px] px-2 whitespace-nowrap shrink-0"
            >
              <span>View all</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {approvedPublic.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-800 bg-[#060913] p-8 text-center space-y-3">
              <ShieldCheck className="w-8 h-8 text-slate-500 mx-auto" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-slate-200">
                  No approved community warnings yet
                </p>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  Analyze a suspicious message or screenshot in the AI Scam Scanner and submit a
                  redacted warning for human moderator approval.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('scanner')}
                className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors"
              >
                <ScanSearch className="w-4 h-4" />
                <span>Start First Scan</span>
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-800/80">
              {approvedPublic.slice(0, 4).map((report) => (
                <div key={report.id} className="py-4 first:pt-0 last:pb-0 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-white">{report.title}</h3>
                    <RiskIndicator level={report.riskLevel} />
                  </div>
                  <p className="text-xs text-slate-300 line-clamp-2">{report.description}</p>
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                      <span>{report.category}</span>
                      <span aria-hidden="true">·</span>
                      <span>{report.scamChannel}</span>
                      <span aria-hidden="true">·</span>
                      <VerificationIndicator status={report.verificationStatus} />
                    </div>
                    <button
                      type="button"
                      onClick={() => onSelectReportForShare(report)}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-400 hover:text-blue-300 min-h-[36px] px-2"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                      <span>Share</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="lg:col-span-5 rounded-2xl border border-slate-800 bg-[#0B1120] p-6 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-white">Active Threat Campaigns</h2>
              <p className="text-xs text-slate-400">
                Verified advisories published by moderators
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('intelligence')}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-400 hover:text-blue-300 min-h-[40px] px-2 whitespace-nowrap shrink-0"
            >
              <span>Intelligence</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {campaigns.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-800 bg-[#060913] p-8 text-center space-y-3">
              <ShieldAlert className="w-7 h-7 text-slate-500 mx-auto" />
              <p className="text-sm font-medium text-slate-200">No active campaigns yet</p>
              <p className="text-xs text-slate-400">
                Advisories published by Moderators and Administrators will appear here in real
                time.
              </p>
              <button
                type="button"
                onClick={() => onNavigate('intelligence')}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-400 hover:text-blue-300 min-h-[36px]"
              >
                <span>Open Scam Intelligence</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {campaigns.slice(0, 3).map((camp) => (
                <div
                  key={camp.id}
                  className="rounded-xl border border-slate-800 bg-[#060913] p-4 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-mono text-red-400">{camp.severity} Severity</span>
                    <span className="text-xs text-slate-400 capitalize">{camp.status}</span>
                  </div>
                  <h3 className="text-sm font-semibold text-white">{camp.title}</h3>
                  <p className="text-xs text-slate-400 line-clamp-2">{camp.summary}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
