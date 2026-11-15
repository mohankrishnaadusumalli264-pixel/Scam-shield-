import { useEffect, useState } from 'react';
import {
  Check,
  Copy,
  ExternalLink,
  Info,
  Share2,
  Smartphone,
} from 'lucide-react';
import { recordShareIntentViaApi } from '../lib/apiClient';
import type { ScamReport, ShareChannelType, SharePlatform } from '../types/scamshield';

interface UniversalShareProps {
  selectedReport: ScamReport | null;
  availableReports: ScamReport[];
  isAuthenticated: boolean;
  onSelectReport: (report: ScamReport) => void;
}

interface PlatformTarget {
  id: SharePlatform;
  label: string;
  mechanism: string;
  supportsDirectUrl: boolean;
}

const SHARE_TARGETS: PlatformTarget[] = [
  { id: 'android_native', label: 'Android Native Share', mechanism: 'Web Share API / Clipboard Fallback', supportsDirectUrl: false },
  { id: 'whatsapp', label: 'WhatsApp', mechanism: 'wa.me deep-link composer', supportsDirectUrl: true },
  { id: 'telegram', label: 'Telegram', mechanism: 't.me/share composer', supportsDirectUrl: true },
  { id: 'x', label: 'X (Twitter)', mechanism: 'intent/tweet composer', supportsDirectUrl: true },
  { id: 'facebook', label: 'Facebook', mechanism: 'sharer.php composer', supportsDirectUrl: true },
  { id: 'reddit', label: 'Reddit', mechanism: 'reddit.com/submit composer', supportsDirectUrl: true },
  { id: 'linkedin', label: 'LinkedIn', mechanism: 'share-offsite composer', supportsDirectUrl: true },
  { id: 'gmail', label: 'Gmail', mechanism: 'Gmail web compose draft', supportsDirectUrl: true },
  { id: 'instagram', label: 'Instagram', mechanism: 'Native Share / Copy Story Text', supportsDirectUrl: false },
  { id: 'snapchat', label: 'Snapchat', mechanism: 'Creative Share / Copy Alert', supportsDirectUrl: false },
];

export function UniversalShare({
  selectedReport,
  availableReports,
  isAuthenticated,
  onSelectReport,
}: UniversalShareProps) {
  const [customTitle, setCustomTitle] = useState(
    selectedReport?.title || 'SCAMSHIELD Community Fraud Warning',
  );
  const [customSummary, setCustomSummary] = useState(
    selectedReport
      ? `${selectedReport.explanation}\n\nSafety Tip: ${selectedReport.safetyRecommendations[0] || 'Verify independently via official apps.'}`
      : 'Stay alert: Verify urgent payment, OTP, or KYC requests through official channels before clicking links or sharing codes.',
  );
  const [shareStatus, setShareStatus] = useState<string | null>(null);
  const [copiedRecently, setCopiedRecently] = useState(false);

  useEffect(() => {
    if (selectedReport) {
      setCustomTitle(selectedReport.title);
      setCustomSummary(
        `${selectedReport.explanation}\n\nSafety Recommendation: ${selectedReport.safetyRecommendations[0] || 'Do not share OTPs or credentials.'}`,
      );
    }
  }, [selectedReport]);

  const appUrl = typeof window !== 'undefined' ? window.location.origin : 'https://scamshield.app';
  const shareText = `SCAMSHIELD WARNING (${selectedReport?.riskLevel || 'Alert'}): ${customTitle}\n\n${customSummary}\n\nProtect others: ${appUrl}`;

  const logShareEvent = async (platform: SharePlatform, channelType: ShareChannelType) => {
    if (!isAuthenticated || !selectedReport) return;
    try {
      await recordShareIntentViaApi(selectedReport.id, platform, channelType);
    } catch {
      // Non-blocking audit log
    }
  };

  const copyToClipboard = async (): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(shareText);
      setCopiedRecently(true);
      setTimeout(() => setCopiedRecently(false), 2500);
      return true;
    } catch {
      return false;
    }
  };

  const handlePlatformShare = async (target: PlatformTarget) => {
    setShareStatus(null);
    const encodedText = encodeURIComponent(shareText);
    const encodedTitle = encodeURIComponent(`SCAMSHIELD Alert: ${customTitle}`);
    const encodedUrl = encodeURIComponent(appUrl);

    if (target.id === 'android_native') {
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        try {
          await navigator.share({
            title: `SCAMSHIELD: ${customTitle}`,
            text: shareText,
            url: appUrl,
          });
          await logShareEvent('android_native', 'web_share');
          setShareStatus('Android / system share sheet opened. Delivery occurs only if you confirm inside your chosen app.');
          return;
        } catch (err) {
          if (err instanceof Error && err.name === 'AbortError') {
            setShareStatus('Share sheet dismissed before sending.');
            return;
          }
        }
      }
      const copied = await copyToClipboard();
      await logShareEvent('android_native', 'clipboard_fallback');
      setShareStatus(
        copied
          ? 'Web Share API unavailable in this browser; formatted warning copied to clipboard so you can paste into any Android app.'
          : 'Could not access native share sheet or clipboard.',
      );
      return;
    }

    if (target.id === 'instagram' || target.id === 'snapchat') {
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        try {
          await navigator.share({
            title: customTitle,
            text: shareText,
          });
          await logShareEvent(target.id, 'web_share');
          setShareStatus(`System share sheet opened for ${target.label}. Confirm delivery inside ${target.label}.`);
          return;
        } catch {
          // Fall through to clipboard + link helper
        }
      }
      await copyToClipboard();
      await logShareEvent(target.id, 'clipboard_fallback');
      if (target.id === 'snapchat') {
        window.open(`https://www.snapchat.com/scan?attachmentUrl=${encodedUrl}`, '_blank', 'noopener,noreferrer');
      } else {
        window.open('https://www.instagram.com/', '_blank', 'noopener,noreferrer');
      }
      setShareStatus(
        `${target.label} does not support prefilled web message delivery. Warning text has been copied to your clipboard—paste it in ${target.label} to share.`,
      );
      return;
    }

    const urlMap: Record<string, string> = {
      whatsapp: `https://wa.me/?text=${encodedText}`,
      telegram: `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`,
      x: `https://twitter.com/intent/tweet?text=${encodedText}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}&quote=${encodedText}`,
      reddit: `https://www.reddit.com/submit?title=${encodedTitle}&text=${encodedText}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
      gmail: `https://mail.google.com/mail/?view=cm&fs=1&su=${encodedTitle}&body=${encodedText}`,
    };

    const launchUrl = urlMap[target.id];
    if (launchUrl) {
      await copyToClipboard();
      window.open(launchUrl, '_blank', 'noopener,noreferrer');
      await logShareEvent(target.id, 'intent_url');
      setShareStatus(
        `Opened ${target.label} share composer in a new tab (and copied text as backup). No message is sent automatically until you confirm in ${target.label}.`,
      );
    }
  };

  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <h1 className="text-2xl font-bold text-white tracking-tight">Universal Share</h1>
        <p className="text-sm text-slate-400 max-w-3xl">
          Prepare redacted scam warnings for Android Native Share and major messaging/social
          platforms. SCAMSHIELD never claims messages were automatically delivered.
        </p>
      </header>

      <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-4 flex items-start gap-3">
        <Info className="w-4 h-4 text-blue-300 shrink-0 mt-0.5" />
        <p className="text-xs text-blue-100 leading-relaxed">
          Honest Delivery Notice: Selecting any platform opens that service&apos;s official share
          composer, Android Web Share sheet, or copies the redacted warning to your clipboard. You
          always review and confirm before anything is sent.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Message Composer */}
        <section className="lg:col-span-5 rounded-2xl border border-slate-800 bg-[#0B1120] p-5 space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="share-report-select" className="block text-xs font-medium text-slate-300">
              Source Warning (Optional)
            </label>
            <select
              id="share-report-select"
              value={selectedReport?.id || ''}
              onChange={(e) => {
                const found = availableReports.find((r) => r.id === e.target.value);
                if (found) onSelectReport(found);
              }}
              className="w-full min-h-[44px] rounded-xl border border-slate-700 bg-[#060913] px-3 text-sm text-white focus:outline-none focus:border-blue-500"
            >
              <option value="">Custom Redacted Warning</option>
              {availableReports.map((rep) => (
                <option key={rep.id} value={rep.id}>
                  {rep.title}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="share-title" className="block text-xs font-medium text-slate-300">
              Warning Headline
            </label>
            <input
              id="share-title"
              type="text"
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              className="w-full min-h-[44px] rounded-xl border border-slate-700 bg-[#060913] px-3.5 text-sm text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="share-body" className="block text-xs font-medium text-slate-300">
              Redacted Warning Preview
            </label>
            <textarea
              id="share-body"
              rows={5}
              value={customSummary}
              onChange={(e) => setCustomSummary(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-[#060913] p-3.5 text-xs text-slate-200 leading-relaxed focus:outline-none focus:border-blue-500"
            />
          </div>

          <button
            type="button"
            onClick={async () => {
              await copyToClipboard();
              await logShareEvent('clipboard', 'clipboard_fallback');
              setShareStatus('Formatted warning copied to clipboard.');
            }}
            className="w-full min-h-[44px] rounded-xl border border-slate-700 bg-[#111A2E] hover:bg-slate-800 text-xs font-semibold text-white inline-flex items-center justify-center gap-2"
          >
            {copiedRecently ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            <span>{copiedRecently ? 'Copied to Clipboard' : 'Copy Formatted Warning'}</span>
          </button>
        </section>

        {/* Right: 10 Platform Launchers */}
        <section className="lg:col-span-7 rounded-2xl border border-slate-800 bg-[#0B1120] p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-white">Supported Channels</h2>
            <span className="text-xs font-mono text-slate-400">10 Platforms Ready</span>
          </div>

          {shareStatus && (
            <div
              role="status"
              className="rounded-xl border border-emerald-500/35 bg-emerald-500/10 p-3.5 text-xs text-emerald-200 leading-relaxed"
            >
              {shareStatus}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {SHARE_TARGETS.map((target) => (
              <button
                key={target.id}
                type="button"
                onClick={() => handlePlatformShare(target)}
                className="min-h-[56px] rounded-xl border border-slate-800 bg-[#060913] hover:border-blue-500/50 hover:bg-[#0D1528] p-3.5 text-left flex items-center justify-between gap-3 transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white flex items-center gap-2">
                    {target.id === 'android_native' ? (
                      <Smartphone className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : (
                      <Share2 className="w-4 h-4 text-blue-400 shrink-0" />
                    )}
                    <span className="truncate">{target.label}</span>
                  </p>
                  <p className="text-xs text-slate-400 truncate mt-0.5">{target.mechanism}</p>
                </div>
                <ExternalLink className="w-4 h-4 text-slate-500 shrink-0" />
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
