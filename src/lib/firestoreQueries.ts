import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import type {
  ModerationRecord,
  ModerationStatus,
  ScamReport,
  ThreatCampaign,
  UserNotification,
  UserRole,
} from '../types/scamshield';

function toIso(val: unknown): string {
  if (val && typeof (val as { toDate?: () => Date }).toDate === 'function') {
    return (val as { toDate: () => Date }).toDate().toISOString();
  }
  if (typeof val === 'string') return val;
  return new Date().toISOString();
}

function mapReport(id: string, d: DocumentData): ScamReport {
  const ownerUid = String(d.userId || d.authorId || '');
  const desc = String(d.description || d.redactedExcerpt || '');
  const modStatus: ModerationStatus =
    d.moderationStatus === 'approved' || d.moderationStatus === 'rejected'
      ? d.moderationStatus
      : 'pending';

  return {
    id,
    reportId: String(d.reportId || id),
    userId: ownerUid,
    authorId: ownerUid,
    title: String(d.title || 'Untitled Report'),
    category: String(d.category || 'Unclassified'),
    description: desc,
    redactedExcerpt: desc,
    optionalEvidence: typeof d.optionalEvidence === 'string' ? d.optionalEvidence : undefined,
    scamChannel: String(d.scamChannel || 'Unspecified'),
    riskLevel: d.riskLevel || 'Medium',
    confidence: Number(d.confidence ?? 50),
    suspiciousIndicators: Array.isArray(d.suspiciousIndicators)
      ? d.suspiciousIndicators.map(String)
      : [],
    explanation: String(d.explanation || ''),
    safetyRecommendations: Array.isArray(d.safetyRecommendations)
      ? d.safetyRecommendations.map(String)
      : [],
    moderationStatus: modStatus,
    verificationStatus: d.verificationStatus || 'ai_suspected',
    visibility: d.visibility === 'public' ? 'public' : 'private',
    consentGiven: Boolean(d.consentGiven),
    redactedPiiCount: Number(d.redactedPiiCount ?? 0),
    sourceType: d.sourceType || 'text',
    shareCount: Number(d.shareCount ?? 0),
    submissionHash: typeof d.submissionHash === 'string' ? d.submissionHash : undefined,
    deletionRequested: Boolean(d.deletionRequested),
    deletionRequestedAt: d.deletionRequestedAt ? toIso(d.deletionRequestedAt) : undefined,
    moderatorNotes: typeof d.moderatorNotes === 'string' ? d.moderatorNotes : undefined,
    createdAt: toIso(d.createdAt),
    updatedAt: toIso(d.updatedAt),
  };
}

export async function listPublicReportsFirestore(): Promise<ScamReport[]> {
  try {
    const q = query(
      collection(db, 'reports'),
      where('visibility', '==', 'public'),
      where('moderationStatus', '==', 'approved'),
      limit(50),
    );
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => mapReport(d.id, d.data()))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'reports');
  }
}

export async function listUserReportsFirestore(uid: string): Promise<ScamReport[]> {
  try {
    const q = query(
      collection(db, 'reports'),
      where('userId', '==', uid),
      limit(50),
    );
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => mapReport(d.id, d.data()))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'reports');
  }
}

export async function listPendingReportsFirestore(): Promise<ScamReport[]> {
  try {
    const q = query(
      collection(db, 'reports'),
      where('moderationStatus', '==', 'pending'),
      limit(50),
    );
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => mapReport(d.id, d.data()))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'reports');
  }
}

export async function withdrawReportToPrivate(reportId: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'reports', reportId), {
      visibility: 'private',
      consentGiven: false,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `reports/${reportId}`);
  }
}

export async function requestReportDeletionFirestore(reportId: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'reports', reportId), {
      visibility: 'private',
      consentGiven: false,
      deletionRequested: true,
      deletionRequestedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `reports/${reportId}`);
  }
}

export async function deleteReportFirestore(reportId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'reports', reportId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `reports/${reportId}`);
  }
}

export async function submitModeratorDecision(params: {
  report: ScamReport;
  moderatorId: string;
  decision: 'approved' | 'rejected';
  rejectReason?: 'dismissed' | 'false_positive';
  notes: string;
}): Promise<void> {
  const { report, moderatorId, decision, rejectReason, notes } = params;
  if (report.userId === moderatorId) {
    throw new Error('Self-approval blocked: moderators cannot approve or reject their own reports.');
  }

  const cleanNotes = notes.trim().slice(0, 1400);
  if (cleanNotes.length < 3) {
    throw new Error('Moderator notes must be at least 3 characters.');
  }

  const nextVisibility = decision === 'approved' ? 'public' : 'private';
  const nextVerificationStatus =
    decision === 'approved'
      ? 'verified_scam'
      : rejectReason === 'false_positive'
        ? 'false_positive'
        : 'dismissed';

  try {
    const batch = writeBatch(db);
    const reportRef = doc(db, 'reports', report.id);
    const modId = `mod_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const modRef = doc(db, 'moderation', modId);

    batch.update(reportRef, {
      moderationStatus: decision,
      visibility: nextVisibility,
      verificationStatus: nextVerificationStatus,
      moderatorNotes: cleanNotes,
      updatedAt: serverTimestamp(),
    });

    batch.set(modRef, {
      reportId: report.id,
      moderatorId,
      decision,
      previousStatus: report.moderationStatus || 'pending',
      notes: cleanNotes,
      createdAt: serverTimestamp(),
    });

    if (report.userId) {
      const notifId = `ntf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      const notifRef = doc(db, 'notifications', notifId);
      batch.set(notifRef, {
        userId: report.userId,
        title: decision === 'approved' ? 'Report Approved & Published' : 'Report Rejected',
        message:
          decision === 'approved'
            ? `Your report "${report.title.slice(0, 80)}" was approved and published to Community Warnings.`
            : `Your report "${report.title.slice(0, 80)}" was rejected and remains private. Note: ${cleanNotes.slice(0, 180)}`,
        type: 'verification_update',
        reportId: report.id,
        read: false,
        createdAt: serverTimestamp(),
      });
    }

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `reports/${report.id}`);
  }
}

export async function listCampaignsFirestore(): Promise<ThreatCampaign[]> {
  try {
    const q = query(
      collection(db, 'campaigns'),
      where('status', 'in', ['active', 'monitoring', 'resolved']),
      limit(30),
    );
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => {
        const data = d.data();
        return {
          id: d.id,
          title: String(data.title || ''),
          category: String(data.category || ''),
          severity: data.severity || 'High',
          summary: String(data.summary || ''),
          indicators: Array.isArray(data.indicators) ? data.indicators.map(String) : [],
          activeRegions: Array.isArray(data.activeRegions) ? data.activeRegions.map(String) : [],
          status: data.status || 'active',
          createdBy: String(data.createdBy || ''),
          createdAt: toIso(data.createdAt),
          updatedAt: toIso(data.updatedAt),
        };
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'campaigns');
  }
}

export async function createCampaignFirestore(params: {
  title: string;
  category: string;
  severity: 'Medium' | 'High' | 'Critical';
  summary: string;
  indicators: string[];
  activeRegions: string[];
  status: 'active' | 'monitoring' | 'resolved';
  createdBy: string;
}): Promise<string> {
  const id = `cmp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  try {
    await setDoc(doc(db, 'campaigns', id), {
      title: params.title.trim().slice(0, 160),
      category: params.category.trim().slice(0, 64),
      severity: params.severity,
      summary: params.summary.trim().slice(0, 2000),
      indicators: params.indicators.slice(0, 12).map((s) => s.trim().slice(0, 280)).filter(Boolean),
      activeRegions: params.activeRegions.slice(0, 12).map((s) => s.trim().slice(0, 80)).filter(Boolean),
      status: params.status,
      createdBy: params.createdBy,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `campaigns/${id}`);
  }
}

export async function listUserNotificationsFirestore(uid: string): Promise<UserNotification[]> {
  try {
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', uid),
      limit(50),
    );
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => {
        const data = d.data();
        return {
          id: d.id,
          userId: String(data.userId || ''),
          title: String(data.title || ''),
          message: String(data.message || ''),
          type: data.type || 'system_notice',
          reportId: typeof data.reportId === 'string' ? data.reportId : undefined,
          read: Boolean(data.read),
          createdAt: toIso(data.createdAt),
        };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'notifications');
  }
}

export async function markNotificationReadFirestore(notificationId: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'notifications', notificationId), { read: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `notifications/${notificationId}`);
  }
}

export async function markAllNotificationsReadFirestore(
  notifications: UserNotification[],
): Promise<void> {
  const unread = notifications.filter((n) => !n.read);
  if (unread.length === 0) return;
  try {
    const batch = writeBatch(db);
    for (const item of unread) {
      batch.update(doc(db, 'notifications', item.id), { read: true });
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, 'notifications');
  }
}

export async function listModerationRecordsFirestore(moderatorId: string): Promise<ModerationRecord[]> {
  try {
    const q = query(
      collection(db, 'moderation'),
      where('moderatorId', '==', moderatorId),
      limit(20),
    );
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => {
        const data = d.data();
        return {
          id: d.id,
          reportId: String(data.reportId || ''),
          moderatorId: String(data.moderatorId || ''),
          decision: data.decision || 'pending_review',
          previousStatus: String(data.previousStatus || ''),
          notes: String(data.notes || ''),
          createdAt: toIso(data.createdAt),
        };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'moderation');
  }
}

export async function assignRoleAdminFirestore(params: {
  targetUid: string;
  targetEmail: string;
  role: Exclude<UserRole, 'user'>;
  assignedBy: string;
}): Promise<void> {
  const uid = params.targetUid.trim();
  try {
    await setDoc(doc(db, 'admins', uid), {
      uid,
      email: params.targetEmail.trim(),
      role: params.role,
      assignedBy: params.assignedBy,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `admins/${uid}`);
  }
}

export async function revokeAdminRoleFirestore(targetUid: string): Promise<void> {
  const uid = targetUid.trim();
  try {
    await deleteDoc(doc(db, 'admins', uid));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `admins/${uid}`);
  }
}
