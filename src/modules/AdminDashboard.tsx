import { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Lock,
  PlusCircle,
  RefreshCw,
  ShieldAlert,
  UserCog,
} from 'lucide-react';
import {
  assignRoleAdminFirestore,
  createCampaignFirestore,
  listPublicReportsFirestore,
  revokeAdminRoleFirestore,
} from '../lib/firestoreQueries';
import {
  firebaseConfig,
  testFirestoreConnection,
  type FirestoreConnectionState,
} from '../lib/firebase';
import type { AppHealthStatus, UserRole } from '../types/scamshield';

interface AdminDashboardProps {
  role: UserRole;
  currentUid: string | null;
  health: AppHealthStatus | null;
  firestoreState: FirestoreConnectionState;
  firestoreDetail: string;
  onRefresh: () => Promise<void>;
}

export function AdminDashboard({
  role,
  currentUid,
  health,
  firestoreState,
  firestoreDetail,
  onRefresh,
}: AdminDashboardProps) {
  const isAdmin = role === 'admin';
  const isModOrAdmin = role === 'moderator' || role === 'admin';

  const [diagRunning, setDiagRunning] = useState(false);
  const [diagOutput, setDiagOutput] = useState<string | null>(null);

  // RBAC assignment form
  const [targetUid, setTargetUid] = useState('');
  const [targetEmail, setTargetEmail] = useState('');
  const [targetRole, setTargetRole] = useState<'moderator' | 'admin'>('moderator');
  const [rbacMsg, setRbacMsg] = useState<string | null>(null);
  const [rbacErr, setRbacErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Campaign creation form
  const [campTitle, setCampTitle] = useState('');
  const [campCategory, setCampCategory] = useState('Phishing / Smishing');
  const [campSeverity, setCampSeverity] = useState<'Medium' | 'High' | 'Critical'>('High');
  const [campSummary, setCampSummary] = useState('');
  const [campIndicators, setCampIndicators] = useState('');
  const [campRegions, setCampRegions] = useState('Global');
  const [campMsg, setCampMsg] = useState<string | null>(null);
  const [campErr, setCampErr] = useState<string | null>(null);

  const handleRunDiagnostics = async () => {
    setDiagRunning(true);
    setDiagOutput(null);
    try {
      const conn = await testFirestoreConnection();
      const pub = await listPublicReportsFirestore();
      setDiagOutput(
        `Project: ${firebaseConfig.projectId} · DB: ${firebaseConfig.firestoreDatabaseId} · Connectivity: ${conn.state} (${conn.detail}) · Public Reports Query: ${pub.length} doc(s)`,
      );
    } catch (err) {
      setDiagOutput(
        `Diagnostic error: ${err instanceof Error ? err.message : 'Unknown error'}`,
      );
    } finally {
      setDiagRunning(false);
    }
  };

  const handleAssignRole = async () => {
    if (!isAdmin || !currentUid) return;
    setBusy(true);
    setRbacMsg(null);
    setRbacErr(null);
    try {
      if (!targetUid.trim() || !targetEmail.trim()) {
        throw new Error('Target UID and verified email address are required.');
      }
      await assignRoleAdminFirestore({
        targetUid,
        targetEmail,
        role: targetRole,
        assignedBy: currentUid,
      });
      setRbacMsg(`Granted ${targetRole} role to ${targetUid.trim()} in /admins.`);
      setTargetUid('');
      setTargetEmail('');
    } catch (err) {
      setRbacErr(err instanceof Error ? err.message : 'Failed to assign role.');
    } finally {
      setBusy(false);
    }
  };

  const handleRevokeRole = async () => {
    if (!isAdmin || !targetUid.trim()) return;
    setBusy(true);
    setRbacMsg(null);
    setRbacErr(null);
    try {
      await revokeAdminRoleFirestore(targetUid);
      setRbacMsg(`Revoked elevated role for ${targetUid.trim()} (reverts to User).`);
      setTargetUid('');
    } catch (err) {
      setRbacErr(err instanceof Error ? err.message : 'Failed to revoke role.');
    } finally {
      setBusy(false);
    }
  };

  const handlePublishCampaign = async () => {
    if (!isModOrAdmin || !currentUid) return;
    setBusy(true);
    setCampMsg(null);
    setCampErr(null);
    try {
      if (campTitle.trim().length < 3 || campSummary.trim().length < 10) {
        throw new Error('Campaign title (3+ chars) and summary (10+ chars) are required.');
      }
      const indicators = campIndicators
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      const regions = campRegions
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      await createCampaignFirestore({
        title: campTitle,
        category: campCategory,
        severity: campSeverity,
        summary: campSummary,
        indicators: indicators.length > 0 ? indicators : ['Observed malicious pattern'],
        activeRegions: regions.length > 0 ? regions : ['Global'],
        status: 'active',
        createdBy: currentUid,
      });

      await onRefresh();
      setCampMsg('Published threat intelligence campaign to Cloud Firestore.');
      setCampTitle('');
      setCampSummary('');
      setCampIndicators('');
    } catch (err) {
      setCampErr(err instanceof Error ? err.message : 'Failed to publish campaign.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <h1 className="text-2xl font-bold text-white tracking-tight">Admin Dashboard</h1>
        <p className="text-sm text-slate-400 max-w-3xl">
          Role-Based Access Control (User / Moderator / Administrator), threat intelligence
          publishing, and real-time service configuration diagnostics.
        </p>
      </header>

      {/* Real Environment & Service Diagnostics */}
      <section className="rounded-2xl border border-slate-800 bg-[#0B1120] p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-white">Live Integration Readiness</h2>
          <button
            type="button"
            disabled={diagRunning}
            onClick={handleRunDiagnostics}
            className="min-h-[40px] px-3.5 py-1.5 rounded-xl border border-slate-700 bg-[#060913] hover:bg-slate-800 text-xs font-medium text-slate-200 inline-flex items-center gap-2"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${diagRunning ? 'animate-spin' : ''}`} />
            <span>{diagRunning ? 'Testing Firebase...' : 'Test Live Connectivity'}</span>
          </button>
        </div>

        {diagOutput && (
          <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-3 text-xs font-mono text-blue-200 break-words">
            {diagOutput}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-xl border border-slate-800 bg-[#060913] p-4 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">Gemini Server Key</span>
              {health?.geminiConfigured ? (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Active</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-300">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Not Set</span>
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500">
              {health?.geminiConfigured
                ? 'Server-only GEMINI_API_KEY validated.'
                : 'Set GEMINI_API_KEY in server environment secrets.'}
            </p>
          </div>

          <div className="rounded-xl border border-slate-800 bg-[#060913] p-4 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">Firestore Connection</span>
              <span
                className={`inline-flex items-center gap-1 text-xs font-medium ${
                  firestoreState === 'connected' ? 'text-emerald-400' : 'text-amber-300'
                }`}
              >
                <Database className="w-3.5 h-3.5" />
                <span className="capitalize">{firestoreState}</span>
              </span>
            </div>
            <p className="text-xs text-slate-500 truncate">{firestoreDetail}</p>
          </div>

          <div className="rounded-xl border border-slate-800 bg-[#060913] p-4 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">Active Session Role</span>
              <span className="text-xs font-mono uppercase text-white">{role}</span>
            </div>
            <p className="text-xs text-slate-500 font-mono truncate">
              {currentUid ? `UID: ${currentUid}` : 'Not authenticated'}
            </p>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* RBAC Role Management (Admin Only) */}
        <section className="lg:col-span-6 rounded-2xl border border-slate-800 bg-[#0B1120] p-6 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <UserCog className="w-4 h-4 text-blue-400" />
              <span>Role-Based Access Control</span>
            </h2>
            <span className="text-xs font-mono text-slate-400">Admin Only</span>
          </div>

          <div className="rounded-xl border border-slate-800 bg-[#060913] p-3.5 text-xs text-slate-400 space-y-1">
            <p className="text-slate-200 font-medium">Privilege Escalation Protection</p>
            <p>
              Standard users cannot write to <span className="font-mono">/admins</span> or modify
              their <span className="font-mono">role</span> field in{' '}
              <span className="font-mono">/users</span>. Only verified Administrators can assign
              or revoke Moderator/Admin permissions.
            </p>
          </div>

          {!isAdmin ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 flex items-start gap-2.5 text-xs text-amber-200">
              <Lock className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                Administrator access required to modify role assignments. Current role:{' '}
                <strong className="uppercase">{role}</strong>.
              </span>
            </div>
          ) : (
            <div className="space-y-3">
              {rbacMsg && (
                <p className="text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3">
                  {rbacMsg}
                </p>
              )}
              {rbacErr && (
                <p className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                  {rbacErr}
                </p>
              )}

              <div className="space-y-1.5">
                <label htmlFor="rbac-uid" className="block text-xs font-medium text-slate-300">
                  Target Firebase User UID
                </label>
                <input
                  id="rbac-uid"
                  type="text"
                  value={targetUid}
                  onChange={(e) => setTargetUid(e.target.value)}
                  placeholder="e.g. abc123XYZ..."
                  className="w-full min-h-[44px] rounded-xl border border-slate-700 bg-[#060913] px-3.5 text-xs font-mono text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="rbac-email" className="block text-xs font-medium text-slate-300">
                  Target Verified Email
                </label>
                <input
                  id="rbac-email"
                  type="email"
                  value={targetEmail}
                  onChange={(e) => setTargetEmail(e.target.value)}
                  placeholder="moderator@example.com"
                  className="w-full min-h-[44px] rounded-xl border border-slate-700 bg-[#060913] px-3.5 text-sm text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="rbac-role" className="block text-xs font-medium text-slate-300">
                  Role to Grant
                </label>
                <select
                  id="rbac-role"
                  value={targetRole}
                  onChange={(e) => setTargetRole(e.target.value as 'moderator' | 'admin')}
                  className="w-full min-h-[44px] rounded-xl border border-slate-700 bg-[#060913] px-3.5 text-sm text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="moderator">Moderator (Verification &amp; Campaigns)</option>
                  <option value="admin">Administrator (Full RBAC &amp; Moderation)</option>
                </select>
              </div>

              <div className="flex flex-wrap gap-2.5 pt-1">
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleAssignRole}
                  className="flex-1 min-h-[44px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white"
                >
                  Assign Role
                </button>
                <button
                  type="button"
                  disabled={busy || !targetUid.trim()}
                  onClick={handleRevokeRole}
                  className="min-h-[44px] px-4 py-2 rounded-xl border border-red-500/35 text-xs font-semibold text-red-300 hover:bg-red-500/10"
                >
                  Revoke to User
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Threat Campaign Publisher (Moderator or Admin) */}
        <section className="lg:col-span-6 rounded-2xl border border-slate-800 bg-[#0B1120] p-6 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-red-400" />
              <span>Publish Threat Campaign</span>
            </h2>
            <span className="text-xs font-mono text-slate-400">Moderator / Admin</span>
          </div>

          {!isModOrAdmin ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 flex items-start gap-2.5 text-xs text-amber-200">
              <Lock className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                Moderator or Administrator privileges required to publish advisories to{' '}
                <span className="font-mono">/campaigns</span>.
              </span>
            </div>
          ) : (
            <div className="space-y-3">
              {campMsg && (
                <p className="text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3">
                  {campMsg}
                </p>
              )}
              {campErr && (
                <p className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                  {campErr}
                </p>
              )}

              <input
                type="text"
                value={campTitle}
                onChange={(e) => setCampTitle(e.target.value)}
                placeholder="Campaign headline"
                aria-label="Campaign headline"
                className="w-full min-h-[44px] rounded-xl border border-slate-700 bg-[#060913] px-3.5 text-sm text-white focus:outline-none focus:border-blue-500"
              />

              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  value={campCategory}
                  onChange={(e) => setCampCategory(e.target.value)}
                  placeholder="Category"
                  aria-label="Campaign category"
                  className="w-full min-h-[44px] rounded-xl border border-slate-700 bg-[#060913] px-3.5 text-sm text-white focus:outline-none focus:border-blue-500"
                />
                <select
                  value={campSeverity}
                  onChange={(e) =>
                    setCampSeverity(e.target.value as 'Medium' | 'High' | 'Critical')
                  }
                  aria-label="Campaign severity"
                  className="w-full min-h-[44px] rounded-xl border border-slate-700 bg-[#060913] px-3.5 text-sm text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="Medium">Medium Severity</option>
                  <option value="High">High Severity</option>
                  <option value="Critical">Critical Severity</option>
                </select>
              </div>

              <textarea
                rows={3}
                value={campSummary}
                onChange={(e) => setCampSummary(e.target.value)}
                placeholder="Executive summary of attack mechanism and victim lure..."
                aria-label="Campaign summary"
                className="w-full rounded-xl border border-slate-700 bg-[#060913] p-3 text-xs text-white focus:outline-none focus:border-blue-500"
              />

              <textarea
                rows={2}
                value={campIndicators}
                onChange={(e) => setCampIndicators(e.target.value)}
                placeholder="Key indicators (one per line)..."
                aria-label="Campaign indicators"
                className="w-full rounded-xl border border-slate-700 bg-[#060913] p-3 text-xs text-white focus:outline-none focus:border-blue-500"
              />

              <input
                type="text"
                value={campRegions}
                onChange={(e) => setCampRegions(e.target.value)}
                placeholder="Affected regions (comma-separated)"
                aria-label="Affected regions"
                className="w-full min-h-[44px] rounded-xl border border-slate-700 bg-[#060913] px-3.5 text-xs text-white focus:outline-none focus:border-blue-500"
              />

              <button
                type="button"
                disabled={busy}
                onClick={handlePublishCampaign}
                className="w-full min-h-[44px] rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white inline-flex items-center justify-center gap-2"
              >
                <PlusCircle className="w-4 h-4" />
                <span>Publish Campaign Advisory</span>
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
