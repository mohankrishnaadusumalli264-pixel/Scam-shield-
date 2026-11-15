export type RiskLevel = 'Safe' | 'Low' | 'Medium' | 'High' | 'Critical';

export type ModerationStatus = 'pending' | 'approved' | 'rejected';

export type VerificationStatus =
  | 'unreviewed'
  | 'ai_suspected'
  | 'pending_review'
  | 'verified_scam'
  | 'false_positive'
  | 'dismissed';

export type UserRole = 'user' | 'moderator' | 'admin';

export type SharePlatform =
  | 'whatsapp'
  | 'instagram'
  | 'facebook'
  | 'telegram'
  | 'x'
  | 'snapchat'
  | 'reddit'
  | 'linkedin'
  | 'gmail'
  | 'android_native'
  | 'clipboard';

export type ShareChannelType = 'web_share' | 'intent_url' | 'clipboard_fallback';

export interface AnalysisResult {
  riskLevel: RiskLevel;
  confidence: number;
  category: string;
  suspiciousIndicators: string[];
  explanation: string;
  safetyRecommendations: string[];
  verificationStatus: 'ai_suspected';
  redactedText: string;
  redactionCount: number;
  redactionTypes: string[];
  hadImageInput: boolean;
  privacyNotice: string;
  analyzedAt: string;
}

export interface ScamReport {
  id: string;
  reportId: string;
  userId: string;
  authorId: string;
  title: string;
  category: string;
  description: string;
  redactedExcerpt: string;
  optionalEvidence?: string;
  scamChannel: string;
  riskLevel: RiskLevel;
  confidence: number;
  suspiciousIndicators: string[];
  explanation: string;
  safetyRecommendations: string[];
  moderationStatus: ModerationStatus;
  verificationStatus: VerificationStatus;
  visibility: 'private' | 'public';
  consentGiven: boolean;
  redactedPiiCount: number;
  sourceType: 'text' | 'screenshot' | 'both';
  shareCount: number;
  submissionHash?: string;
  deletionRequested?: boolean;
  deletionRequestedAt?: string;
  moderatorNotes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ThreatCampaign {
  id: string;
  title: string;
  category: string;
  severity: 'Medium' | 'High' | 'Critical';
  summary: string;
  indicators: string[];
  activeRegions: string[];
  status: 'active' | 'monitoring' | 'resolved';
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ModerationRecord {
  id: string;
  reportId: string;
  moderatorId: string;
  decision: 'approved' | 'rejected' | 'verified_scam' | 'false_positive' | 'dismissed' | 'pending_review';
  previousStatus: string;
  notes: string;
  createdAt: string;
}

export interface UserNotification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'verification_update' | 'security_alert' | 'system_notice';
  reportId?: string;
  read: boolean;
  createdAt: string;
}

export interface UserProfile {
  uid: string;
  displayName: string;
  role: UserRole;
  defaultPrivateUploads: boolean;
  autoRedactPii: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AppHealthStatus {
  status: 'ok';
  geminiConfigured: boolean;
  firebaseConfigured: boolean;
  firebaseProjectId: string | null;
  firestoreDatabaseId: string | null;
  timestamp: string;
}
