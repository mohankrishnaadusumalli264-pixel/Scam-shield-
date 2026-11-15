import { useEffect, useRef, useState } from 'react';
import { collection, limit, onSnapshot, query, where } from 'firebase/firestore';
import {
  Bell,
  Check,
  CheckCheck,
  Download,
  Lock,
  LogIn,
  LogOut,
  Shield,
  Trash2,
  UserCheck,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  deleteReportFirestore,
  markAllNotificationsReadFirestore,
  markNotificationReadFirestore,
} from '../lib/firestoreQueries';
import type { ScamReport, UserNotification } from '../types/scamshield';

interface UserProfileProps {
  myReports: ScamReport[];
  notifications: UserNotification[];
  onRefresh: () => Promise<void>;
  onManageReports?: () => void;
}

export function UserProfile({
  myReports,
  notifications,
  onRefresh,
  onManageReports,
}: UserProfileProps) {
  const { user, profile, role, authReady, authError, signIn, signOut, updatePrivacyPreferences } =
    useAuth();
  const [displayName, setDisplayName] = useState(profile?.displayName || '');
  const [defaultPrivate, setDefaultPrivate] = useState(profile?.defaultPrivateUploads ?? true);
  const [autoRedact, setAutoRedact] = useState(profile?.autoRedactPii ?? true);
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const [liveNotifications, setLiveNotifications] = useState<UserNotification[]>(notifications);
  const [realtimeAlert, setRealtimeAlert] = useState<UserNotification | null>(null);
  const [notifError, setNotifError] = useState<string | null>(null);
  const knownIdsRef = useRef<Set<string>>(new Set());
  const initialSnapshotLoadedRef = useRef(false);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.displayName);
      setDefaultPrivate(profile.defaultPrivateUploads);
      setAutoRedact(profile.autoRedactPii);
    }
  }, [profile]);

  useEffect(() => {
    setLiveNotifications(notifications);
  }, [notifications]);

  // Real-time Firestore listener on 'notifications' collection gated on auth readiness
  useEffect(() => {
    if (!authReady || !user) {
      setLiveNotifications([]);
      setRealtimeAlert(null);
      knownIdsRef.current.clear();
      initialSnapshotLoadedRef.current = false;
      return;
    }

    const pathForOnSnapshot = 'notifications';
    const notificationsQuery = query(
      collection(db, pathForOnSnapshot),
      where('userId', '==', user.uid),
      limit(50),
    );

    const unsubscribe = onSnapshot(
      notificationsQuery,
      (snapshot) => {
        setNotifError(null);
        const mapped: UserNotification[] = snapshot.docs
          .map((d) => {
            const data = d.data();
            const createdAt =
              data.createdAt && typeof data.createdAt.toDate === 'function'
                ? data.createdAt.toDate().toISOString()
                : typeof data.createdAt === 'string'
                  ? data.createdAt
                  : new Date().toISOString();

            return {
              id: d.id,
              userId: String(data.userId || ''),
              title: String(data.title || ''),
              message: String(data.message || ''),
              type: (data.type || 'system_notice') as UserNotification['type'],
              reportId: typeof data.reportId === 'string' ? data.reportId : undefined,
              read: Boolean(data.read),
              createdAt,
            };
          })
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

        if (initialSnapshotLoadedRef.current) {
          const newestUnread = mapped.find(
            (item) => !item.read && !knownIdsRef.current.has(item.id),
          );
          if (newestUnread) {
            setRealtimeAlert(newestUnread);
          }
        } else {
          initialSnapshotLoadedRef.current = true;
        }

        knownIdsRef.current = new Set(mapped.map((item) => item.id));
        setLiveNotifications(mapped);
      },
      (error) => {
        setNotifError('Unable to subscribe to real-time notifications.');
        handleFirestoreError(error, OperationType.LIST, pathForOnSnapshot);
      },
    );

    return () => unsubscribe();
  }, [authReady, user]);

  const handleSavePrefs = async () => {
    setSaving(true);
    setStatusMsg(null);
    try {
      await updatePrivacyPreferences({
        displayName:
          displayName || profile?.displayName || user?.displayName || 'SCAMSHIELD Member',
        defaultPrivateUploads: defaultPrivate,
        autoRedactPii: autoRedact,
      });
      setStatusMsg('Privacy and profile preferences saved to Cloud Firestore.');
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Failed to save preferences.');
    } finally {
      setSaving(false);
    }
  };

  const handleExportMyReports = () => {
    const blob = new Blob([JSON.stringify(myReports, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `scamshield-my-reports-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePurgePrivateDrafts = async () => {
    const privateDrafts = myReports.filter((r) => r.visibility === 'private');
    if (privateDrafts.length === 0) {
      setStatusMsg('No private drafts to delete.');
      return;
    }
    setSaving(true);
    try {
      for (const rep of privateDrafts) {
        await deleteReportFirestore(rep.id);
      }
      await onRefresh();
      setStatusMsg(`Deleted ${privateDrafts.length} private draft report(s).`);
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Failed to delete private drafts.');
    } finally {
      setSaving(false);
    }
  };

  if (!user) {
    return (
      <div className="max-w-xl mx-auto rounded-2xl border border-slate-800 bg-[#0B1120] p-6 sm:p-8 space-y-5">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-white tracking-tight">User Profile &amp; Privacy</h1>
          <p className="text-sm text-slate-400 leading-relaxed">
            Sign in with Google via Firebase Authentication to save private scam analysis drafts,
            submit consented community warnings, receive real-time verification notifications, and
            manage your privacy controls.
          </p>
        </div>

        {authError && (
          <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3.5 text-xs text-red-300">
            {authError}
          </div>
        )}

        <button
          type="button"
          onClick={signIn}
          className="w-full min-h-[48px] rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors"
        >
          <LogIn className="w-4 h-4" />
          <span>Sign In with Google</span>
        </button>
      </div>
    );
  }

  const unreadCount = liveNotifications.filter((n) => !n.read).length;

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-white tracking-tight">User Profile &amp; Privacy</h1>
          <p className="text-sm text-slate-400">
            Identity, read-only RBAC assignment, data retention controls, and live report alerts.
          </p>
        </div>
        <button
          type="button"
          onClick={signOut}
          className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-700 bg-[#0B1120] hover:bg-slate-800 text-xs font-semibold text-slate-200 inline-flex items-center gap-2 self-start"
        >
          <LogOut className="w-4 h-4" />
          <span>Sign Out</span>
        </button>
      </header>

      {realtimeAlert && (
        <div
          role="status"
          className="rounded-xl border border-blue-500/45 bg-blue-500/12 p-4 flex items-start justify-between gap-3"
        >
          <div className="flex items-start gap-2.5">
            <Bell className="w-4 h-4 text-blue-300 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="text-xs font-semibold text-white">
                New Report Update: {realtimeAlert.title}
              </p>
              <p className="text-xs text-blue-100/90">{realtimeAlert.message}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={async () => {
              await markNotificationReadFirestore(realtimeAlert.id);
              setRealtimeAlert(null);
            }}
            className="min-h-[36px] px-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-medium text-white whitespace-nowrap shrink-0"
          >
            Acknowledge
          </button>
        </div>
      )}

      {statusMsg && (
        <div className="rounded-xl border border-blue-500/35 bg-blue-500/10 p-3.5 text-xs text-blue-200">
          {statusMsg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Identity & Role */}
        <section className="lg:col-span-6 rounded-2xl border border-slate-800 bg-[#0B1120] p-6 space-y-5">
          <div className="flex items-center gap-3.5">
            {user.photoURL ? (
              <img
                src={user.photoURL}
                alt={user.displayName || 'User avatar'}
                referrerPolicy="no-referrer"
                className="w-12 h-12 rounded-xl object-cover border border-slate-700"
              />
            ) : (
              <div className="w-12 h-12 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-300 font-bold">
                {(user.displayName || 'S')[0]}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-base font-semibold text-white truncate">
                {profile?.displayName || user.displayName}
              </p>
              <p className="text-xs text-slate-400 truncate">{user.email}</p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-[#060913] p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400 flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-blue-400" />
                <span>Assigned Access Role</span>
              </span>
              <span className="text-xs font-mono font-semibold uppercase text-white">{role}</span>
            </div>
            <p className="text-xs text-slate-500">
              UID: <span className="font-mono text-slate-300">{user.uid}</span>
            </p>
            <p className="text-xs text-slate-500 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>
                Roles are enforced by Firestore security rules; users cannot grant themselves
                moderator or admin rights.
              </span>
            </p>
          </div>

          <div className="space-y-3 pt-2 border-t border-slate-800">
            <h2 className="text-sm font-semibold text-white">Privacy Defaults</h2>

            <div className="space-y-1.5">
              <label htmlFor="pref-name" className="block text-xs font-medium text-slate-300">
                Display Name
              </label>
              <input
                id="pref-name"
                type="text"
                value={displayName || profile?.displayName || ''}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full min-h-[44px] rounded-xl border border-slate-700 bg-[#060913] px-3.5 text-sm text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <label className="flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-800 bg-[#060913] cursor-pointer min-h-[48px]">
              <span className="text-xs text-slate-200">Keep uploaded scans private by default</span>
              <input
                type="checkbox"
                checked={defaultPrivate}
                onChange={(e) => setDefaultPrivate(e.target.checked)}
                className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-blue-600"
              />
            </label>

            <label className="flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-800 bg-[#060913] cursor-pointer min-h-[48px]">
              <span className="text-xs text-slate-200">
                Auto-redact OTPs, passwords, cards &amp; phone numbers
              </span>
              <input
                type="checkbox"
                checked={autoRedact}
                onChange={(e) => setAutoRedact(e.target.checked)}
                className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-blue-600"
              />
            </label>

            <button
              type="button"
              disabled={saving}
              onClick={handleSavePrefs}
              className="w-full min-h-[44px] rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white inline-flex items-center justify-center gap-2"
            >
              <UserCheck className="w-4 h-4" />
              <span>{saving ? 'Saving...' : 'Save Privacy Preferences'}</span>
            </button>
          </div>
        </section>

        {/* Data Governance & Real-Time Notifications */}
        <section className="lg:col-span-6 space-y-6">
          <div className="rounded-2xl border border-slate-800 bg-[#0B1120] p-6 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-white">Your Reports &amp; Deletion Controls</h2>
              {onManageReports && (
                <button
                  type="button"
                  onClick={onManageReports}
                  className="text-xs font-medium text-blue-400 hover:text-blue-300"
                >
                  Open My Reports →
                </button>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2.5">
              <div className="rounded-xl border border-slate-800 bg-[#060913] p-3">
                <p className="text-[11px] text-slate-400">Pending</p>
                <p className="text-lg font-bold font-mono text-amber-300 tabular-nums">
                  {myReports.filter((r) => r.moderationStatus === 'pending').length}
                </p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-[#060913] p-3">
                <p className="text-[11px] text-slate-400">Approved</p>
                <p className="text-lg font-bold font-mono text-emerald-400 tabular-nums">
                  {myReports.filter((r) => r.moderationStatus === 'approved').length}
                </p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-[#060913] p-3">
                <p className="text-[11px] text-slate-400">Rejected</p>
                <p className="text-lg font-bold font-mono text-red-400 tabular-nums">
                  {myReports.filter((r) => r.moderationStatus === 'rejected').length}
                </p>
              </div>
            </div>
            <p className="text-xs text-slate-400">
              You currently have{' '}
              <span className="font-mono text-white tabular-nums">{myReports.length}</span> saved
              report(s) in Cloud Firestore.
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleExportMyReports}
                disabled={myReports.length === 0}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-700 bg-[#111A2E] hover:bg-slate-800 disabled:opacity-50 text-xs font-semibold text-white inline-flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                <span>Export My Reports (JSON)</span>
              </button>
              <button
                type="button"
                onClick={handlePurgePrivateDrafts}
                disabled={saving}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-red-500/35 bg-red-500/10 hover:bg-red-500/20 text-xs font-semibold text-red-300 inline-flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete All Private Drafts</span>
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-[#0B1120] p-6 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <Bell className="w-4 h-4 text-blue-400" />
                <span>Live Notifications</span>
              </h2>
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono text-slate-400 tabular-nums">
                  {unreadCount} unread
                </span>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={() => markAllNotificationsReadFirestore(liveNotifications)}
                    className="min-h-[36px] px-2.5 rounded-lg border border-slate-700 text-xs font-medium text-slate-200 hover:bg-slate-800 inline-flex items-center gap-1.5"
                  >
                    <CheckCheck className="w-3.5 h-3.5 text-blue-400" />
                    <span>Mark all read</span>
                  </button>
                )}
              </div>
            </div>

            {notifError && (
              <p className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                {notifError}
              </p>
            )}

            {liveNotifications.length === 0 ? (
              <p className="text-xs text-slate-500">
                No notifications yet. Verification decisions and report updates appear here in real
                time.
              </p>
            ) : (
              <div className="space-y-2.5">
                {liveNotifications.map((ntf) => (
                  <div
                    key={ntf.id}
                    className={`rounded-xl border p-3.5 flex items-start justify-between gap-3 ${
                      ntf.read
                        ? 'border-slate-800 bg-[#060913] text-slate-400'
                        : 'border-blue-500/30 bg-blue-500/10 text-slate-100'
                    }`}
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-xs font-semibold">{ntf.title}</p>
                        <span className="text-[11px] font-mono text-slate-400">
                          {new Date(ntf.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-xs opacity-90">{ntf.message}</p>
                    </div>
                    {!ntf.read && (
                      <button
                        type="button"
                        onClick={() => markNotificationReadFirestore(ntf.id)}
                        aria-label="Mark notification as read"
                        className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg hover:bg-white/10 shrink-0"
                      >
                        <Check className="w-4 h-4 text-blue-300" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
