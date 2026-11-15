import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FileWarning,
  Home,
  LayoutGrid,
  Radar,
  ScanSearch,
  Settings,
  Share2,
  Shield,
  ShieldCheck,
  User,
  X,
} from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { fetchHealthStatus } from './lib/apiClient';
import {
  testFirestoreConnection,
  type FirestoreConnectionState,
} from './lib/firebase';
import {
  listCampaignsFirestore,
  listPendingReportsFirestore,
  listPublicReportsFirestore,
  listUserNotificationsFirestore,
  listUserReportsFirestore,
} from './lib/firestoreQueries';
import { HomeDashboard, type ModuleId } from './modules/HomeDashboard';
import { ScamScanner } from './modules/ScamScanner';
import { CommunityReports } from './modules/CommunityReports';
import { ScamIntelligence } from './modules/ScamIntelligence';
import { UniversalShare } from './modules/UniversalShare';
import { VerificationCentre } from './modules/VerificationCentre';
import { UserProfile } from './modules/UserProfile';
import { AdminDashboard } from './modules/AdminDashboard';
import type {
  AppHealthStatus,
  ScamReport,
  ThreatCampaign,
  UserNotification,
} from './types/scamshield';

interface NavItem {
  id: ModuleId;
  label: string;
  icon: typeof Home;
}

const ALL_MODULES: NavItem[] = [
  { id: 'home', label: 'Dashboard', icon: Home },
  { id: 'scanner', label: 'AI Scanner', icon: ScanSearch },
  { id: 'reports', label: 'Reports', icon: FileWarning },
  { id: 'intelligence', label: 'Intelligence', icon: Radar },
  { id: 'share', label: 'Share', icon: Share2 },
  { id: 'verification', label: 'Verification', icon: ShieldCheck },
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'admin', label: 'Admin', icon: Settings },
];

const MOBILE_PRIMARY_TABS: NavItem[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'scanner', label: 'Scan', icon: ScanSearch },
  { id: 'reports', label: 'Reports', icon: FileWarning },
  { id: 'intelligence', label: 'Intel', icon: Radar },
];

function ScamShieldWorkspace() {
  const { user, role, authReady, signIn } = useAuth();
  const [activeModule, setActiveModule] = useState<ModuleId>('home');
  const [reportsInitialTab, setReportsInitialTab] = useState<'public' | 'mine'>('public');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [health, setHealth] = useState<AppHealthStatus | null>(null);
  const [firestoreState, setFirestoreState] = useState<FirestoreConnectionState>('checking');
  const [firestoreDetail, setFirestoreDetail] = useState('Testing Cloud Firestore connection...');

  const [publicReports, setPublicReports] = useState<ScamReport[]>([]);
  const [myReports, setMyReports] = useState<ScamReport[]>([]);
  const [pendingReports, setPendingReports] = useState<ScamReport[]>([]);
  const [campaigns, setCampaigns] = useState<ThreatCampaign[]>([]);
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [dataLoading, setDataLoading] = useState(false);

  const [shareTarget, setShareTarget] = useState<ScamReport | null>(null);

  const refreshData = useCallback(async () => {
    setDataLoading(true);
    try {
      const [pubList, campList] = await Promise.all([
        listPublicReportsFirestore().catch(() => []),
        listCampaignsFirestore().catch(() => []),
      ]);
      setPublicReports(pubList);
      setCampaigns(campList);

      if (user) {
        const [mine, notifs, pending] = await Promise.all([
          listUserReportsFirestore(user.uid).catch(() => []),
          listUserNotificationsFirestore(user.uid).catch(() => []),
          role === 'admin' || role === 'moderator'
            ? listPendingReportsFirestore().catch(() => [])
            : Promise.resolve([]),
        ]);
        setMyReports(mine);
        setNotifications(notifs);
        setPendingReports(pending);
      } else {
        setMyReports([]);
        setNotifications([]);
        setPendingReports([]);
      }
    } finally {
      setDataLoading(false);
    }
  }, [user, role]);

  useEffect(() => {
    fetchHealthStatus()
      .then(setHealth)
      .catch(() => setHealth(null));

    testFirestoreConnection().then((res) => {
      setFirestoreState(res.state);
      setFirestoreDetail(res.detail);
    });
  }, []);

  useEffect(() => {
    if (authReady) {
      refreshData();
    }
  }, [authReady, refreshData]);

  const combinedShareableReports = useMemo(() => {
    const seen = new Set<string>();
    const list: ScamReport[] = [];
    for (const r of [...myReports, ...publicReports]) {
      if (!seen.has(r.id)) {
        seen.add(r.id);
        list.push(r);
      }
    }
    return list;
  }, [myReports, publicReports]);

  const verificationReports = useMemo(() => {
    const seen = new Set<string>();
    const list: ScamReport[] = [];
    for (const r of [...pendingReports, ...publicReports, ...myReports]) {
      if (!seen.has(r.id)) {
        seen.add(r.id);
        list.push(r);
      }
    }
    return list;
  }, [pendingReports, publicReports, myReports]);

  const handleNavigate = (mod: ModuleId) => {
    if (mod === 'reports') {
      setReportsInitialTab('public');
    }
    setActiveModule(mod);
    setMobileMenuOpen(false);
  };

  const handleOpenMyReports = () => {
    setReportsInitialTab('mine');
    setActiveModule('reports');
    setMobileMenuOpen(false);
  };

  const handleSelectReportForShare = (report: ScamReport) => {
    setShareTarget(report);
    setActiveModule('share');
    setMobileMenuOpen(false);
  };

  const activeTitle = ALL_MODULES.find((m) => m.id === activeModule)?.label || 'SCAMSHIELD';

  return (
    <div className="min-h-screen bg-[#060913] text-slate-100 flex flex-col lg:flex-row">
      {/* Desktop Sidebar (256px) */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:shrink-0 lg:sticky lg:top-0 lg:h-screen border-r border-slate-800/80 bg-[#0B1120]">
        <div className="h-16 px-6 flex items-center gap-2.5 border-b border-slate-800/80">
          <Shield className="w-5 h-5 text-blue-500 shrink-0" />
          <span className="font-display text-lg font-bold tracking-tight text-white whitespace-nowrap">
            SCAMSHIELD
          </span>
        </div>

        <nav aria-label="Primary Modules" className="flex-1 p-4 space-y-1 overflow-y-auto">
          {ALL_MODULES.map((item) => {
            const Icon = item.icon;
            const isActive = activeModule === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavigate(item.id)}
                className={`w-full min-h-[44px] px-3.5 py-2.5 rounded-xl text-sm font-medium flex items-center gap-3 transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800/80 space-y-2">
          <p className="text-xs text-slate-400 truncate">
            {user ? user.email || user.displayName : 'Guest Session'}
          </p>
          <p className="text-[11px] font-mono uppercase text-slate-500">
            Role: {user ? role : 'Read-Only'}
          </p>
        </div>
      </aside>

      {/* Main Column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Compact Top Header (3 zones, <= 52px on mobile to stay well within 15% sticky cap) */}
        <header className="sticky top-0 z-30 h-13 lg:h-16 px-4 lg:px-8 border-b border-slate-800/80 bg-[#060913]/90 backdrop-blur-md flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <Shield className="w-5 h-5 text-blue-500 lg:hidden shrink-0" />
            <span className="font-display text-sm lg:text-base font-semibold text-white truncate">
              <span className="lg:hidden">SCAMSHIELD · </span>
              {activeTitle}
            </span>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {!user ? (
              <button
                type="button"
                onClick={signIn}
                className="min-h-[38px] lg:min-h-[40px] px-3.5 py-1.5 rounded-lg border border-slate-700 bg-[#0B1120] hover:bg-slate-800 text-xs font-medium text-slate-200 whitespace-nowrap"
              >
                Sign In
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleNavigate('profile')}
                className="min-h-[38px] lg:min-h-[40px] px-3 py-1.5 rounded-lg border border-slate-800 bg-[#0B1120] hover:bg-slate-800 text-xs font-medium text-slate-200 whitespace-nowrap max-w-[160px] truncate"
              >
                {user.displayName || 'Profile'}
              </button>
            )}
            <button
              type="button"
              onClick={() => handleNavigate('scanner')}
              className="hidden sm:inline-flex min-h-[40px] px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white items-center gap-1.5 whitespace-nowrap"
            >
              <ScanSearch className="w-3.5 h-3.5" />
              <span>Scan Threat</span>
            </button>
          </div>
        </header>

        {/* Scrollable Content Viewport (with safe bottom padding on mobile for tab bar) */}
        <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24 lg:pb-12">
          {activeModule === 'home' && (
            <HomeDashboard
              health={health}
              firestoreState={firestoreState}
              publicReports={publicReports}
              myReports={myReports}
              campaigns={campaigns}
              isAuthenticated={Boolean(user)}
              onNavigate={handleNavigate}
              onSelectReportForShare={handleSelectReportForShare}
            />
          )}

          {activeModule === 'scanner' && (
            <ScamScanner
              isAuthenticated={Boolean(user)}
              onSignInPrompt={signIn}
              onReportCreated={() => {
                refreshData();
              }}
              onShareResult={handleSelectReportForShare}
            />
          )}

          {activeModule === 'reports' && (
            <CommunityReports
              publicReports={publicReports}
              myReports={myReports}
              loading={dataLoading}
              isAuthenticated={Boolean(user)}
              currentUid={user?.uid ?? null}
              initialTab={reportsInitialTab}
              onRefresh={refreshData}
              onShareReport={handleSelectReportForShare}
              onGoToScanner={() => handleNavigate('scanner')}
            />
          )}

          {activeModule === 'intelligence' && (
            <ScamIntelligence
              campaigns={campaigns}
              publicReports={publicReports}
              loading={dataLoading}
            />
          )}

          {activeModule === 'share' && (
            <UniversalShare
              selectedReport={shareTarget}
              availableReports={combinedShareableReports}
              isAuthenticated={Boolean(user)}
              onSelectReport={setShareTarget}
            />
          )}

          {activeModule === 'verification' && (
            <VerificationCentre
              reports={verificationReports}
              role={role}
              currentUid={user?.uid ?? null}
              onRefresh={refreshData}
            />
          )}

          {activeModule === 'profile' && (
            <UserProfile
              myReports={myReports}
              notifications={notifications}
              onRefresh={refreshData}
              onManageReports={handleOpenMyReports}
            />
          )}

          {activeModule === 'admin' && (
            <AdminDashboard
              role={role}
              currentUid={user?.uid ?? null}
              health={health}
              firestoreState={firestoreState}
              firestoreDetail={firestoreDetail}
              onRefresh={refreshData}
            />
          )}
        </main>
      </div>

      {/* Mobile Android-First Bottom Tab Bar (56px height + safe-area) */}
      <nav
        aria-label="Mobile Navigation"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 h-14 pb-safe bg-[#0B1120]/95 backdrop-blur-md border-t border-slate-800 grid grid-cols-5 items-center"
      >
        {MOBILE_PRIMARY_TABS.map((item) => {
          const Icon = item.icon;
          const isActive = activeModule === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleNavigate(item.id)}
              className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 ${
                isActive ? 'text-blue-400' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-medium tracking-tight">{item.label}</span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 ${
            ['share', 'verification', 'profile', 'admin'].includes(activeModule)
              ? 'text-blue-400'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <LayoutGrid className="w-5 h-5" />
          <span className="text-[10px] font-medium tracking-tight">More</span>
        </button>
      </nav>

      {/* Mobile Bottom Sheet Drawer for Share, Verification, Profile & Admin */}
      {mobileMenuOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Additional SCAMSHIELD Modules"
          className="lg:hidden fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end"
        >
          <div className="w-full rounded-t-3xl border-t border-slate-700 bg-[#0B1120] p-5 pb-safe space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-white">All Modules</span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Close module menu"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {ALL_MODULES.filter((m) =>
                ['share', 'verification', 'profile', 'admin'].includes(m.id),
              ).map((item) => {
                const Icon = item.icon;
                const isActive = activeModule === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleNavigate(item.id)}
                    className={`min-h-[52px] px-4 py-3 rounded-xl border text-left flex items-center gap-3 ${
                      isActive
                        ? 'border-blue-500 bg-blue-600/20 text-white'
                        : 'border-slate-800 bg-[#060913] text-slate-200'
                    }`}
                  >
                    <Icon className="w-4 h-4 text-blue-400 shrink-0" />
                    <span className="text-xs font-semibold">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <ScamShieldWorkspace />
      </AuthProvider>
    </ErrorBoundary>
  );
}
