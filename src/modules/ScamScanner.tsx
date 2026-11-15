import { useMemo, useState, type ChangeEvent } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  EyeOff,
  FileImage,
  Lock,
  Plus,
  ScanSearch,
  Send,
  Share2,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  analyzeThreat,
  ApiRequestError,
  createReportViaApi,
  submitReportWithConsentViaApi,
} from '../lib/apiClient';
import { redactPiiPreview } from '../lib/piiRedactor';
import { RiskIndicator, VerificationIndicator } from '../components/RiskBadge';
import type { AnalysisResult, ScamReport } from '../types/scamshield';

interface ScamScannerProps {
  isAuthenticated: boolean;
  onSignInPrompt: () => void;
  onReportCreated: (report: ScamReport) => void;
  onShareResult: (report: ScamReport) => void;
}

const CHANNEL_OPTIONS = [
  'SMS',
  'WhatsApp',
  'Email / Gmail',
  'Telegram',
  'Instagram DM',
  'Phone Call / Voicemail',
  'Website / URL',
  'Payment / UPI App',
];

const SCAM_CATEGORY_OPTIONS = [
  'Phishing / Smishing',
  'Payment / UPI Fraud',
  'OTP / Account Takeover',
  'Impersonation / Tech Support',
  'Investment / Crypto Scam',
  'Job / Task Fraud',
  'Delivery / Customs Fee Scam',
  'Romance / Social Engineering',
  'Other Scam',
];

export function ScamScanner({
  isAuthenticated,
  onSignInPrompt,
  onReportCreated,
  onShareResult,
}: ScamScannerProps) {
  const [textInput, setTextInput] = useState('');
  const [channelHint, setChannelHint] = useState('SMS');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageMimeType, setImageMimeType] = useState<string>('image/png');
  const [imageName, setImageName] = useState<string>('');

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [errorBanner, setErrorBanner] = useState<{ code: string; message: string } | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);

  // Community Report Submission Form State
  const [reportTitle, setReportTitle] = useState('');
  const [formCategory, setFormCategory] = useState('Phishing / Smishing');
  const [formDescription, setFormDescription] = useState('');
  const [formIndicators, setFormIndicators] = useState<string[]>([]);
  const [newIndicatorText, setNewIndicatorText] = useState('');
  const [formRecommendations, setFormRecommendations] = useState<string[]>([]);
  const [newRecommendationText, setNewRecommendationText] = useState('');
  const [formEvidence, setFormEvidence] = useState('');
  const [showReportModal, setShowReportModal] = useState(false);
  const [consentChecked, setConsentChecked] = useState(false);
  const [redactionChecked, setRedactionChecked] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [savedReport, setSavedReport] = useState<ScamReport | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);

  const liveSanitizedPreview = useMemo(() => {
    const descPreview = redactPiiPreview(formDescription);
    const evPreview = redactPiiPreview(formEvidence);
    const titlePreview = redactPiiPreview(reportTitle);
    const totalMasked =
      descPreview.redactionCount +
      evPreview.redactionCount +
      titlePreview.redactionCount +
      (result?.redactionCount ?? 0);
    const maskedTypes = Array.from(
      new Set([
        ...(result?.redactionTypes ?? []),
        ...descPreview.redactionTypes,
        ...evPreview.redactionTypes,
        ...titlePreview.redactionTypes,
      ]),
    );
    return {
      title: titlePreview.redactedText,
      description: descPreview.redactedText,
      optionalEvidence: evPreview.redactedText,
      totalMasked,
      maskedTypes,
    };
  }, [formDescription, formEvidence, reportTitle, result]);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setErrorBanner({
        code: 'INVALID_FILE_TYPE',
        message: 'Unsupported image format. Upload a PNG, JPEG, or WEBP screenshot.',
      });
      return;
    }
    if (file.size > 4.5 * 1024 * 1024) {
      setErrorBanner({
        code: 'FILE_TOO_LARGE',
        message: 'Screenshot exceeds 4.5MB size limit.',
      });
      return;
    }

    setErrorBanner(null);
    setImageMimeType(file.type);
    setImageName(file.name);

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      setImagePreview(dataUrl);
      const base64Part = dataUrl.split(',')[1] || '';
      setImageBase64(base64Part);
    };
    reader.readAsDataURL(file);
  };

  const clearImage = () => {
    setImagePreview(null);
    setImageBase64(null);
    setImageName('');
  };

  const seedReportFormFromAnalysis = (analysis: AnalysisResult) => {
    setReportTitle(`${analysis.category} via ${channelHint}`.slice(0, 120));
    setFormCategory(
      SCAM_CATEGORY_OPTIONS.includes(analysis.category)
        ? analysis.category
        : analysis.category || 'Other Scam',
    );
    const initialDesc =
      analysis.redactedText.trim() ||
      `[Screenshot analyzed in memory; image never stored] ${analysis.explanation}`;
    setFormDescription(initialDesc.slice(0, 3800));
    setFormIndicators(analysis.suspiciousIndicators.slice(0, 12));
    setFormRecommendations(analysis.safetyRecommendations.slice(0, 10));
    setFormEvidence('');
    setFormError(null);
    setConsentChecked(false);
    setRedactionChecked(false);
  };

  const handleAnalyze = async () => {
    if (!textInput.trim() && !imageBase64) {
      setErrorBanner({
        code: 'EMPTY_SUBMISSION',
        message: 'Enter suspicious message text, a URL, or upload a screenshot before scanning.',
      });
      return;
    }

    setIsAnalyzing(true);
    setErrorBanner(null);
    setResult(null);
    setSavedReport(null);
    setSaveFeedback(null);

    try {
      const analysis = await analyzeThreat({
        text: textInput.trim() || undefined,
        imageBase64: imageBase64 || undefined,
        imageMimeType: imageBase64 ? imageMimeType : undefined,
        channelHint,
      });
      setResult(analysis);
      seedReportFormFromAnalysis(analysis);
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setErrorBanner({ code: err.errorCode, message: err.message });
      } else {
        setErrorBanner({
          code: 'NETWORK_ERROR',
          message: err instanceof Error ? err.message : 'Unable to reach analysis service.',
        });
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  const openCommunityReportForm = () => {
    if (!result) return;
    if (!isAuthenticated) {
      onSignInPrompt();
      return;
    }
    setFormError(null);
    setShowReportModal(true);
  };

  const handleSavePrivateDraft = async (): Promise<ScamReport | null> => {
    if (!result) return null;
    if (!isAuthenticated) {
      onSignInPrompt();
      return null;
    }
    setIsSaving(true);
    setSaveFeedback(null);
    setErrorBanner(null);

    try {
      const description =
        result.redactedText.trim() ||
        `[In-memory screenshot scan only — original screenshot not stored] ${result.explanation}`;
      const created = await createReportViaApi({
        title: reportTitle.trim() || `${result.category} Alert`,
        category: result.category,
        description,
        excerpt: description,
        scamChannel: channelHint,
        riskLevel: result.riskLevel,
        confidence: result.confidence,
        suspiciousIndicators: result.suspiciousIndicators,
        explanation: result.explanation,
        safetyRecommendations: result.safetyRecommendations,
        redactedPiiCount: result.redactionCount,
        sourceType:
          textInput.trim() && result.hadImageInput
            ? 'both'
            : result.hadImageInput
              ? 'screenshot'
              : 'text',
        aiAnalyzed: true,
        submitCommunityWarning: false,
        consentGiven: false,
      });
      setSavedReport(created);
      onReportCreated(created);
      setSaveFeedback(
        'Saved privately to your account (Moderation: Pending, Visibility: Private).',
      );
      return created;
    } catch (err) {
      setErrorBanner({
        code: err instanceof ApiRequestError ? err.errorCode : 'SAVE_FAILED',
        message: err instanceof Error ? err.message : 'Failed to save private draft.',
      });
      return null;
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmCommunitySubmit = async () => {
    if (!result) return;
    if (!isAuthenticated) {
      onSignInPrompt();
      return;
    }
    setFormError(null);

    if (liveSanitizedPreview.title.trim().length < 3) {
      setFormError('Report title must be at least 3 characters.');
      return;
    }
    if (formCategory.trim().length < 2) {
      setFormError('Scam category is required.');
      return;
    }
    if (liveSanitizedPreview.description.trim().length < 10) {
      setFormError('Scam description must be at least 10 characters after redaction.');
      return;
    }
    if (!consentChecked || !redactionChecked) {
      setFormError('Please review the redacted report preview and check both consent boxes.');
      return;
    }

    setIsSaving(true);
    setErrorBanner(null);
    try {
      let submitted: ScamReport;
      if (savedReport && savedReport.moderationStatus === 'pending' && !savedReport.consentGiven) {
        submitted = await submitReportWithConsentViaApi(savedReport.id);
      } else {
        submitted = await createReportViaApi({
          title: liveSanitizedPreview.title.trim(),
          category: formCategory.trim(),
          description: liveSanitizedPreview.description.trim(),
          excerpt: liveSanitizedPreview.description.trim(),
          optionalEvidence: liveSanitizedPreview.optionalEvidence.trim() || undefined,
          scamChannel: channelHint,
          riskLevel: result.riskLevel,
          confidence: result.confidence,
          suspiciousIndicators: formIndicators.filter((i) => i.trim().length > 0),
          explanation: result.explanation,
          safetyRecommendations: formRecommendations.filter((r) => r.trim().length > 0),
          redactedPiiCount: liveSanitizedPreview.totalMasked,
          sourceType:
            textInput.trim() && result.hadImageInput
              ? 'both'
              : result.hadImageInput
                ? 'screenshot'
                : 'text',
          aiAnalyzed: true,
          submitCommunityWarning: true,
          consentGiven: true,
        });
      }

      setSavedReport(submitted);
      onReportCreated(submitted);
      setShowReportModal(false);
      setConsentChecked(false);
      setRedactionChecked(false);
      setSaveFeedback(
        'Community warning submitted! Status is Pending Moderator Review and remains private until an authorized moderator approves it.',
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to submit community warning.';
      setFormError(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const addIndicator = () => {
    const val = redactPiiPreview(newIndicatorText.trim()).redactedText;
    if (!val || formIndicators.length >= 12) return;
    setFormIndicators((prev) => [...prev, val.slice(0, 290)]);
    setNewIndicatorText('');
  };

  const addRecommendation = () => {
    const val = redactPiiPreview(newRecommendationText.trim()).redactedText;
    if (!val || formRecommendations.length >= 10) return;
    setFormRecommendations((prev) => [...prev, val.slice(0, 290)]);
    setNewRecommendationText('');
  };

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold text-white tracking-tight">AI Scam Scanner</h1>
        <p className="text-sm text-slate-400 max-w-3xl">
          Analyze suspicious messages, links, or screenshots using server-side Gemini threat
          triage. Sensitive OTPs, passwords, banking numbers, and personal contacts are
          automatically redacted. Screenshots are processed in memory and never stored permanently.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Input Form */}
        <section className="lg:col-span-6 rounded-2xl border border-slate-800 bg-[#0B1120] p-5 sm:p-6 space-y-5">
          <div className="space-y-2">
            <label htmlFor="channel-select" className="block text-xs font-medium text-slate-300">
              Source Channel
            </label>
            <select
              id="channel-select"
              value={channelHint}
              onChange={(e) => setChannelHint(e.target.value)}
              className="w-full min-h-[44px] rounded-xl border border-slate-700 bg-[#060913] px-3.5 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
            >
              {CHANNEL_OPTIONS.map((ch) => (
                <option key={ch} value={ch}>
                  {ch}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="scam-text" className="block text-xs font-medium text-slate-300">
                Suspicious Message Text, Link, or Claims
              </label>
              <span className="text-xs font-mono text-slate-500 tabular-nums">
                {textInput.length}/8000
              </span>
            </div>
            <textarea
              id="scam-text"
              rows={6}
              maxLength={8000}
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="Paste the suspicious SMS, WhatsApp message, email body, payment request, or URL here..."
              className="w-full rounded-xl border border-slate-700 bg-[#060913] p-3.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="space-y-2">
            <span className="block text-xs font-medium text-slate-300">
              Screenshot Evidence (Optional · In-Memory Only)
            </span>
            {!imagePreview ? (
              <label className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-700 bg-[#060913] p-5 cursor-pointer hover:border-blue-500/60 transition-colors min-h-[120px]">
                <Upload className="w-6 h-6 text-blue-400" />
                <span className="text-xs font-medium text-slate-200">
                  Tap to select PNG, JPEG, or WEBP screenshot
                </span>
                <span className="text-xs text-slate-500">
                  Max 4.5MB · Analyzed in RAM, never saved or published
                </span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleFileChange}
                  className="sr-only"
                />
              </label>
            ) : (
              <div className="rounded-xl border border-slate-700 bg-[#060913] p-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <img
                    src={imagePreview}
                    alt="Screenshot preview queued for in-memory scan"
                    className="w-14 h-14 rounded-lg object-cover border border-slate-800 shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-white truncate">{imageName}</p>
                    <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                      <FileImage className="w-3.5 h-3.5 text-blue-400" />
                      <span>Transient memory buffer</span>
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={clearImage}
                  aria-label="Remove screenshot"
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-800 bg-[#060913] p-3.5 flex items-start gap-2.5">
            <Lock className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <p className="text-xs text-slate-400 leading-relaxed">
              Privacy Guarantee: Sensitive credentials (OTPs, PINs, passwords, bank/card numbers,
              personal emails, and phone numbers) are masked prior to storage. AI results are
              labeled <strong className="text-slate-200">AI Suspected</strong> and never
              auto-verified.
            </p>
          </div>

          <button
            type="button"
            disabled={isAnalyzing}
            onClick={handleAnalyze}
            className="w-full min-h-[48px] rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
          >
            <ScanSearch className="w-4 h-4" />
            <span>{isAnalyzing ? 'Analyzing with Gemini AI...' : 'Analyze Threat'}</span>
          </button>
        </section>

        {/* Right: Structured AI Verdict */}
        <section className="lg:col-span-6 rounded-2xl border border-slate-800 bg-[#0B1120] p-5 sm:p-6 space-y-5">
          <div className="flex items-center justify-between gap-3 border-b border-slate-800 pb-4">
            <h2 className="text-base font-semibold text-white">Threat Analysis Output</h2>
            {result && <VerificationIndicator status={savedReport?.verificationStatus || result.verificationStatus} />}
          </div>

          {errorBanner && (
            <div
              role="alert"
              className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 space-y-1.5"
            >
              <div className="flex items-center gap-2 text-red-300 text-sm font-semibold">
                <AlertOctagon className="w-4 h-4 shrink-0" />
                <span>
                  {errorBanner.code === 'GEMINI_NOT_CONFIGURED'
                    ? 'Gemini API Configuration Required'
                    : 'Scan Could Not Complete'}
                </span>
              </div>
              <p className="text-xs text-red-200/90 leading-relaxed">{errorBanner.message}</p>
            </div>
          )}

          {isAnalyzing && (
            <div className="space-y-4 py-6">
              <div className="h-6 w-40 rounded bg-slate-800 animate-pulse" />
              <div className="h-20 w-full rounded-xl bg-slate-800/70 animate-pulse" />
              <div className="h-24 w-full rounded-xl bg-slate-800/50 animate-pulse" />
            </div>
          )}

          {!isAnalyzing && !result && !errorBanner && (
            <div className="py-12 text-center space-y-3">
              <ShieldCheck className="w-10 h-10 text-slate-600 mx-auto" />
              <p className="text-sm font-medium text-slate-300">Ready for threat inspection</p>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Submit suspicious text or a screenshot on the left to inspect risk indicators,
                PII redaction counts, and actionable safety steps.
              </p>
            </div>
          )}

          {result && (
            <div className="space-y-5">
              {/* Verdict Header */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-[#060913] p-4">
                <div className="space-y-1">
                  <span className="text-xs text-slate-400">Assessment</span>
                  <div className="flex items-center gap-2.5">
                    <RiskIndicator level={result.riskLevel} />
                    <span className="text-sm font-medium text-slate-200">{result.category}</span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-xs text-slate-400 block">Model Confidence</span>
                  <span className="text-xl font-bold font-mono text-white tabular-nums">
                    {result.confidence}%
                  </span>
                </div>
              </div>

              {/* Privacy & PII Redaction Audit */}
              <div className="rounded-xl border border-slate-800 bg-[#060913] p-3.5 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-300 flex items-center gap-1.5">
                    <EyeOff className="w-3.5 h-3.5 text-emerald-400" />
                    <span>PII Redaction Summary</span>
                  </span>
                  <span className="font-mono text-emerald-400 tabular-nums">
                    {result.redactionCount} item(s) masked
                  </span>
                </div>
                <p className="text-xs text-slate-400">{result.privacyNotice}</p>
                {result.redactionTypes.length > 0 && (
                  <p className="text-xs text-slate-500">
                    Masked types: {result.redactionTypes.join(' · ')}
                  </p>
                )}
              </div>

              {/* Explanation */}
              <div className="space-y-1.5">
                <h3 className="text-xs font-semibold text-slate-300">Analyst Explanation</h3>
                <p className="text-sm text-slate-200 leading-relaxed">{result.explanation}</p>
              </div>

              {/* Suspicious Indicators */}
              {result.suspiciousIndicators.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-slate-300">Suspicious Indicators</h3>
                  <ul className="space-y-1.5">
                    {result.suspiciousIndicators.map((ind, idx) => (
                      <li
                        key={idx}
                        className="flex items-start gap-2 text-xs text-slate-300 bg-[#060913] border border-slate-800/80 rounded-lg p-2.5"
                      >
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                        <span>{ind}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Safety Recommendations */}
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-slate-300">Safety Recommendations</h3>
                <ul className="space-y-1.5">
                  {result.safetyRecommendations.map((rec, idx) => (
                    <li
                      key={idx}
                      className="flex items-start gap-2 text-xs text-slate-300 bg-[#060913] border border-slate-800/80 rounded-lg p-2.5"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                      <span>{rec}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Save / Submit Community Warning / Share Actions */}
              <div className="border-t border-slate-800 pt-4 space-y-3">
                {saveFeedback && (
                  <p className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3">
                    {saveFeedback}
                  </p>
                )}

                <div className="flex flex-wrap gap-2.5">
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={openCommunityReportForm}
                    className="flex-1 min-h-[46px] px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Submit Community Warning</span>
                  </button>
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={handleSavePrivateDraft}
                    className="min-h-[46px] px-4 py-2.5 rounded-xl border border-slate-700 bg-[#111A2E] hover:bg-slate-800 text-xs font-semibold text-white transition-colors whitespace-nowrap"
                  >
                    {isAuthenticated ? 'Save Private Draft' : 'Sign In to Save'}
                  </button>
                  {savedReport && (
                    <button
                      type="button"
                      onClick={() => onShareResult(savedReport)}
                      className="min-h-[46px] px-4 py-2.5 rounded-xl border border-blue-500/40 bg-blue-500/10 hover:bg-blue-500/20 text-xs font-semibold text-blue-300 inline-flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                      <span>Share</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Full Community Warning Submission & Privacy Review Modal */}
      {showReportModal && result && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="community-report-modal-title"
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          <div className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl border border-slate-700 bg-[#0B1120] p-5 sm:p-6 space-y-5">
            <div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-4">
              <div className="space-y-1">
                <h3 id="community-report-modal-title" className="text-lg font-bold text-white">
                  Submit Community Warning
                </h3>
                <p className="text-xs text-slate-400">
                  Reports start in <strong className="text-amber-300">Pending Moderation</strong>{' '}
                  and remain private until approved by an authorized moderator.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowReportModal(false)}
                aria-label="Close submission form"
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {formError && (
              <div
                role="alert"
                className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-300"
              >
                {formError}
              </div>
            )}

            {/* AI Risk Assessment Banner */}
            <div className="rounded-xl border border-slate-800 bg-[#060913] p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <span className="text-[11px] font-mono uppercase text-slate-400">
                  AI Risk Assessment
                </span>
                <div className="flex items-center gap-2">
                  <RiskIndicator level={result.riskLevel} />
                  <VerificationIndicator status="ai_suspected" />
                </div>
              </div>
              <div className="text-right">
                <span className="text-[11px] text-slate-400 block">Confidence</span>
                <span className="text-base font-bold font-mono text-white">
                  {result.confidence}%
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label htmlFor="cw-category" className="block text-xs font-medium text-slate-300">
                  Scam Category
                </label>
                <select
                  id="cw-category"
                  value={
                    SCAM_CATEGORY_OPTIONS.includes(formCategory) ? formCategory : 'Other Scam'
                  }
                  onChange={(e) => setFormCategory(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl border border-slate-700 bg-[#060913] px-3 text-sm text-white focus:outline-none focus:border-blue-500"
                >
                  {SCAM_CATEGORY_OPTIONS.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="cw-title" className="block text-xs font-medium text-slate-300">
                  Warning Title
                </label>
                <input
                  id="cw-title"
                  type="text"
                  maxLength={160}
                  value={reportTitle}
                  onChange={(e) => setReportTitle(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl border border-slate-700 bg-[#060913] px-3.5 text-sm text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* Scam Description */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="cw-desc" className="block text-xs font-medium text-slate-300">
                  Scam Description (Auto-Redacts Phone, Email, OTP, Password &amp; Bank Info)
                </label>
                <span className="text-xs font-mono text-slate-500">
                  {formDescription.length}/3900
                </span>
              </div>
              <textarea
                id="cw-desc"
                rows={4}
                maxLength={3900}
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-[#060913] p-3 text-xs text-slate-100 leading-relaxed focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* Suspicious Indicators */}
            <div className="space-y-2">
              <span className="block text-xs font-medium text-slate-300">
                Suspicious Indicators ({formIndicators.length}/12)
              </span>
              <div className="space-y-1.5">
                {formIndicators.map((ind, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={ind}
                      maxLength={290}
                      onChange={(e) =>
                        setFormIndicators((prev) =>
                          prev.map((item, i) => (i === idx ? e.target.value : item)),
                        )
                      }
                      className="flex-1 min-h-[38px] rounded-lg border border-slate-700 bg-[#060913] px-3 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setFormIndicators((prev) => prev.filter((_, i) => i !== idx))
                      }
                      aria-label="Remove indicator"
                      className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg border border-slate-800 text-slate-400 hover:text-red-400"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
              {formIndicators.length < 12 && (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newIndicatorText}
                    onChange={(e) => setNewIndicatorText(e.target.value)}
                    placeholder="Add suspicious indicator..."
                    className="flex-1 min-h-[38px] rounded-lg border border-slate-700 bg-[#060913] px-3 text-xs text-white placeholder:text-slate-500"
                  />
                  <button
                    type="button"
                    onClick={addIndicator}
                    className="min-h-[38px] px-3 rounded-lg border border-slate-700 bg-[#111A2E] text-xs font-medium text-slate-200 inline-flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add</span>
                  </button>
                </div>
              )}
            </div>

            {/* Safety Recommendations */}
            <div className="space-y-2">
              <span className="block text-xs font-medium text-slate-300">
                Safety Recommendations ({formRecommendations.length}/10)
              </span>
              <div className="space-y-1.5">
                {formRecommendations.map((rec, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={rec}
                      maxLength={290}
                      onChange={(e) =>
                        setFormRecommendations((prev) =>
                          prev.map((item, i) => (i === idx ? e.target.value : item)),
                        )
                      }
                      className="flex-1 min-h-[38px] rounded-lg border border-slate-700 bg-[#060913] px-3 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setFormRecommendations((prev) => prev.filter((_, i) => i !== idx))
                      }
                      aria-label="Remove recommendation"
                      className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg border border-slate-800 text-slate-400 hover:text-red-400"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
              {formRecommendations.length < 10 && (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newRecommendationText}
                    onChange={(e) => setNewRecommendationText(e.target.value)}
                    placeholder="Add safety recommendation..."
                    className="flex-1 min-h-[38px] rounded-lg border border-slate-700 bg-[#060913] px-3 text-xs text-white placeholder:text-slate-500"
                  />
                  <button
                    type="button"
                    onClick={addRecommendation}
                    className="min-h-[38px] px-3 rounded-lg border border-slate-700 bg-[#111A2E] text-xs font-medium text-slate-200 inline-flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add</span>
                  </button>
                </div>
              )}
            </div>

            {/* Optional Text Evidence (Never Original Screenshot) */}
            <div className="space-y-1.5">
              <label htmlFor="cw-evidence" className="block text-xs font-medium text-slate-300">
                Optional Redacted Evidence Notes (Suspicious Domain / Context · Screenshots Never Published)
              </label>
              <textarea
                id="cw-evidence"
                rows={2}
                maxLength={1000}
                value={formEvidence}
                onChange={(e) => setFormEvidence(e.target.value)}
                placeholder="Optional: suspicious phishing URL, spoofed sender brand, or context notes (personal info will be masked)..."
                className="w-full rounded-xl border border-slate-700 bg-[#060913] p-3 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* Final Redacted Report Review */}
            <div className="rounded-xl border border-emerald-500/30 bg-[#060913] p-4 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-emerald-300 flex items-center gap-1.5">
                  <EyeOff className="w-3.5 h-3.5" />
                  <span>Final Redacted Report Review</span>
                </span>
                <span className="text-[11px] font-mono text-emerald-400">
                  {liveSanitizedPreview.totalMasked} sensitive item(s) masked
                </span>
              </div>
              <p className="text-xs font-semibold text-white">{liveSanitizedPreview.title}</p>
              <p className="text-xs font-mono text-slate-300 max-h-28 overflow-y-auto whitespace-pre-wrap">
                {liveSanitizedPreview.description}
              </p>
              {liveSanitizedPreview.optionalEvidence && (
                <p className="text-xs font-mono text-slate-400 border-t border-slate-800 pt-2">
                  Evidence note: {liveSanitizedPreview.optionalEvidence}
                </p>
              )}
              {result.hadImageInput && (
                <p className="text-[11px] text-amber-300">
                  Original screenshot stays in transient scan memory only and is never attached or published.
                </p>
              )}
            </div>

            {/* Consent Checkboxes */}
            <div className="space-y-2">
              <label className="flex items-start gap-3 text-xs text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={redactionChecked}
                  onChange={(e) => setRedactionChecked(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-600 bg-slate-900 text-blue-600"
                />
                <span>
                  I reviewed the final redacted report above and confirmed it contains no personal
                  phone numbers, emails, OTPs, passwords, bank accounts, or original screenshots.
                </span>
              </label>

              <label className="flex items-start gap-3 text-xs text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={consentChecked}
                  onChange={(e) => setConsentChecked(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-600 bg-slate-900 text-blue-600"
                />
                <span>
                  I consent to submit this anonymized warning for human moderator review and public
                  community warning if approved.
                </span>
              </label>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowReportModal(false)}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-700 text-xs font-medium text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!consentChecked || !redactionChecked || isSaving}
                onClick={handleConfirmCommunitySubmit}
                className="min-h-[44px] px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-semibold text-white inline-flex items-center gap-2"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{isSaving ? 'Submitting...' : 'Submit for Moderation'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
