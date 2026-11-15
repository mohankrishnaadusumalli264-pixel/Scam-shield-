import { auth } from './firebase';
import type {
  AnalysisResult,
  AppHealthStatus,
  ScamReport,
  ShareChannelType,
  SharePlatform,
} from '../types/scamshield';

async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const currentUser = auth.currentUser;
  if (currentUser) {
    const token = await currentUser.getIdToken();
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

export class ApiRequestError extends Error {
  status: number;
  errorCode: string;

  constructor(message: string, status: number, errorCode = 'API_ERROR') {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.errorCode = errorCode;
  }
}

async function parseJsonOrThrow<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => ({}))) as {
    message?: string;
    errorCode?: string;
  };
  if (!response.ok) {
    throw new ApiRequestError(
      data.message || `Request failed with status ${response.status}`,
      response.status,
      data.errorCode || 'API_ERROR',
    );
  }
  return data as T;
}

export async function fetchHealthStatus(): Promise<AppHealthStatus> {
  const response = await fetch('/api/health');
  return parseJsonOrThrow<AppHealthStatus>(response);
}

export async function analyzeThreat(payload: {
  text?: string;
  imageBase64?: string;
  imageMimeType?: string;
  channelHint?: string;
}): Promise<AnalysisResult> {
  const headers = await getAuthHeaders();
  const response = await fetch('/api/analyze', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow<AnalysisResult>(response);
}

export async function createReportViaApi(payload: {
  title: string;
  category: string;
  description: string;
  excerpt?: string;
  optionalEvidence?: string;
  scamChannel: string;
  riskLevel: string;
  confidence: number;
  suspiciousIndicators: string[];
  explanation: string;
  safetyRecommendations: string[];
  redactedPiiCount: number;
  sourceType: 'text' | 'screenshot' | 'both';
  aiAnalyzed: boolean;
  submitCommunityWarning?: boolean;
  consentGiven?: boolean;
}): Promise<ScamReport> {
  const headers = await getAuthHeaders();
  const response = await fetch('/api/reports', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow<ScamReport>(response);
}

export async function fetchReportsViaApi(
  scope: 'public' | 'mine' | 'pending' = 'public',
): Promise<ScamReport[]> {
  const headers = await getAuthHeaders();
  const response = await fetch(`/api/reports?scope=${scope}`, { headers });
  const data = await parseJsonOrThrow<{ reports: ScamReport[] }>(response);
  return data.reports;
}

export async function submitReportWithConsentViaApi(reportId: string): Promise<ScamReport> {
  const headers = await getAuthHeaders();
  const response = await fetch(`/api/reports/${encodeURIComponent(reportId)}/submit`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      consentConfirmed: true,
      redactionAcknowledged: true,
    }),
  });
  return parseJsonOrThrow<ScamReport>(response);
}

export async function requestDeletionViaApi(reportId: string): Promise<ScamReport> {
  const headers = await getAuthHeaders();
  const response = await fetch(
    `/api/reports/${encodeURIComponent(reportId)}/request-deletion`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({}),
    },
  );
  return parseJsonOrThrow<ScamReport>(response);
}

export async function moderateReportViaApi(
  reportId: string,
  payload: {
    decision: 'approved' | 'rejected';
    notes: string;
    rejectReason?: 'dismissed' | 'false_positive';
  },
): Promise<ScamReport> {
  const headers = await getAuthHeaders();
  const response = await fetch(`/api/reports/${encodeURIComponent(reportId)}/moderate`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow<ScamReport>(response);
}

export async function recordShareIntentViaApi(
  reportId: string,
  platform: SharePlatform,
  channelType: ShareChannelType,
): Promise<{ note: string }> {
  const headers = await getAuthHeaders();
  const response = await fetch(`/api/reports/${encodeURIComponent(reportId)}/share`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ platform, channelType }),
  });
  return parseJsonOrThrow<{ note: string }>(response);
}
