import { Globe, ShieldAlert } from 'lucide-react';
import type { ScamReport, ThreatCampaign } from '../types/scamshield';

interface ScamIntelligenceProps {
  campaigns: ThreatCampaign[];
  publicReports: ScamReport[];
  loading: boolean;
}

const DEFENSE_PLAYBOOKS = [
  {
    vector: 'OTP & Account Takeover',
    guidance:
      'No bank, courier, or customer support agent ever requires a one-time passcode to cancel a charge, unlock KYC, or issue a refund.',
  },
  {
    vector: 'UPI / Instant Payment Collect Traps',
    guidance:
      'Entering a payment PIN always authorizes money leaving your account—never receiving a refund or prize.',
  },
  {
    vector: 'Prepaid Task & Recruitment Scams',
    guidance:
      'Legitimate employers never ask candidates to deposit funds, buy gift cards, or top up crypto wallets to unlock commission tiers.',
  },
  {
    vector: 'Lookalike Delivery & Tax Smishing',
    guidance:
      'Inspect domain roots carefully. Navigate directly to official carrier or government portals via bookmarks instead of SMS links.',
  },
];

export function ScamIntelligence({
  campaigns,
  publicReports,
  loading,
}: ScamIntelligenceProps) {
  const categoryBreakdown = publicReports.reduce<Record<string, number>>((acc, rep) => {
    acc[rep.category] = (acc[rep.category] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <header className="relative overflow-hidden rounded-2xl border border-slate-800 bg-[#0B1120] p-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          <div className="lg:col-span-8 space-y-2">
            <p className="text-xs font-mono text-blue-400">THREAT INTELLIGENCE</p>
            <h1 className="text-2xl font-bold text-white tracking-tight">
              Scam Intelligence &amp; Campaign Advisories
            </h1>
            <p className="text-sm text-slate-300 max-w-2xl">
              Track verified threat campaigns, live community threat categories, and defensive
              countermeasures curated by authorized moderators.
            </p>
          </div>
          <div className="lg:col-span-4 h-32 rounded-xl overflow-hidden border border-slate-800 bg-[#060913]">
            <img
              src="/src/assets/images/intel_threat_banner_1794674217824.jpg"
              alt="Cybersecurity operations architectural overview"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          </div>
        </div>
      </header>

      {/* Live Category Telemetry */}
      <section className="rounded-2xl border border-slate-800 bg-[#0B1120] p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-white">
            Live Community Threat Distribution
          </h2>
          <span className="text-xs font-mono text-slate-400 tabular-nums">
            {publicReports.length} public report(s) indexed
          </span>
        </div>

        {Object.keys(categoryBreakdown).length === 0 ? (
          <p className="text-xs text-slate-400">
            No public reports indexed yet. Threat category counts update automatically as
            consented warnings are published.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {Object.entries(categoryBreakdown).map(([cat, count]) => (
              <div
                key={cat}
                className="rounded-xl border border-slate-800 bg-[#060913] p-3.5 flex items-center justify-between gap-2"
              >
                <span className="text-xs font-medium text-slate-200 truncate">{cat}</span>
                <span className="text-sm font-bold font-mono text-blue-400 tabular-nums">
                  {count}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Live Campaign Advisories */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-white">Published Campaign Advisories</h2>

        {loading ? (
          <div className="h-40 rounded-2xl border border-slate-800 bg-[#0B1120] animate-pulse" />
        ) : campaigns.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-800 bg-[#0B1120] p-8 text-center space-y-2">
            <ShieldAlert className="w-8 h-8 text-slate-500 mx-auto" />
            <p className="text-sm font-semibold text-white">No active campaigns published yet</p>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Authorized Moderators and Administrators can publish verified threat campaigns from
              the Admin Dashboard.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {campaigns.map((camp) => (
              <article
                key={camp.id}
                className="rounded-2xl border border-slate-800 bg-[#0B1120] p-5 space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <h3 className="text-base font-semibold text-white">{camp.title}</h3>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                      <span>{camp.category}</span>
                      <span aria-hidden="true">·</span>
                      <span className="capitalize">Status: {camp.status}</span>
                    </div>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md border text-xs font-medium whitespace-nowrap ${
                      camp.severity === 'Critical'
                        ? 'bg-red-500/15 text-red-300 border-red-500/35'
                        : 'bg-amber-500/15 text-amber-300 border-amber-500/35'
                    }`}
                  >
                    <ShieldAlert className="w-3.5 h-3.5" />
                    <span>{camp.severity}</span>
                  </span>
                </div>

                <p className="text-sm text-slate-300 leading-relaxed">{camp.summary}</p>

                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-slate-300">Key Indicators</p>
                  <ul className="list-disc pl-5 space-y-1 text-xs text-slate-400">
                    {camp.indicators.map((ind, idx) => (
                      <li key={idx}>{ind}</li>
                    ))}
                  </ul>
                </div>

                <div className="pt-2 border-t border-slate-800/80 flex items-center gap-2 text-xs text-slate-400">
                  <Globe className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  <span>Regions: {camp.activeRegions.join(', ')}</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* Defensive Playbooks */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">Defensive Countermeasures</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {DEFENSE_PLAYBOOKS.map((item) => (
            <div
              key={item.vector}
              className="rounded-xl border border-slate-800 bg-[#0B1120] p-4 space-y-1.5"
            >
              <h3 className="text-sm font-semibold text-white">{item.vector}</h3>
              <p className="text-xs text-slate-400 leading-relaxed">{item.guidance}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
