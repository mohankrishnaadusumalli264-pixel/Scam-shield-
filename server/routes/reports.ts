import crypto from 'node:crypto';
import { Router } from 'express';
import { optionalAuth, requireAuth, type AuthenticatedRequest } from '../middleware/auth.ts';
import { createRateLimiter } from '../middleware/rateLimit.ts';
import { containsEmbeddedImageData, redactPii } from '../services/piiRedactor.ts';
import {
  checkDuplicateReportHash,
  firestoreCommitCreate,
  firestoreCommitPatch,
  firestoreIncrementReportShare,
  generateDocId,
  getFirestoreDoc,
  queryReportsFromFirestore,
} from '../services/firestoreRest.ts';

export const reportsRouter = Router();

const reportWriteLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 12,
  keyPrefix: 'reports_write',
});

const ALLOWED_ID_RE = /^[a-zA-Z0-9_-]{1,128}$/;
const ALLOWED_RISK = new Set(['Safe', 'Low', 'Medium', 'High', 'Critical']);
const ALLOWED_PLATFORMS = new Set([
  'whatsapp',
  'instagram',
  'facebook',
  'telegram',
  'x',
  'snapchat',
  'reddit',
  'linkedin',
  'gmail',
  'android_native',
  'clipboard',
]);
const ALLOWED_CHANNELS = new Set(['web_share', 'intent_url', 'clipboard_fallback']);

function computeSubmissionHash(uid: string, category: string, description: string): string {
  const normalized = `${uid}:${category.trim().toLowerCase()}:${description.trim().toLowerCase().replace(/\s+/g, ' ')}`;
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

reportsRouter.post(
  '/reports',
  requireAuth,
  reportWriteLimiter,
  async (req: AuthenticatedRequest, res) => {
    try {
      const user = req.authUser!;
      if (!user.emailVerified) {
        res.status(403).json({
          errorCode: 'EMAIL_NOT_VERIFIED',
          message: 'Verified Firebase account email is required to submit reports.',
        });
        return;
      }

      const body = req.body as Record<string, unknown>;

      // Reject any attempt to store or publish original screenshot binaries
      if (
        body.imageBase64 !== undefined ||
        body.screenshot !== undefined ||
        body.imageData !== undefined ||
        containsEmbeddedImageData(String(body.description || '')) ||
        containsEmbeddedImageData(String(body.excerpt || '')) ||
        containsEmbeddedImageData(String(body.optionalEvidence || ''))
      ) {
        res.status(400).json({
          errorCode: 'IMAGE_STORAGE_FORBIDDEN',
          message: 'Original screenshots or embedded image data cannot be stored or published.',
        });
        return;
      }

      const submitCommunityWarning = body.submitCommunityWarning === true;
      const consentGiven = body.consentGiven === true;

      if (submitCommunityWarning && !consentGiven) {
        res.status(400).json({
          errorCode: 'CONSENT_REQUIRED',
          message: 'Explicit user consent is required to submit a community warning for moderation.',
        });
        return;
      }

      const category = typeof body.category === 'string' ? body.category.trim().slice(0, 64) : '';
      const rawDescription =
        typeof body.description === 'string'
          ? body.description.trim()
          : typeof body.excerpt === 'string'
            ? body.excerpt.trim()
            : '';

      const scamChannel =
        typeof body.scamChannel === 'string' && body.scamChannel.trim().length >= 2
          ? body.scamChannel.trim().slice(0, 48)
          : 'Unspecified';

      const riskLevel =
        typeof body.riskLevel === 'string' && ALLOWED_RISK.has(body.riskLevel)
          ? body.riskLevel
          : 'Medium';
      const confidence = Math.max(0, Math.min(100, Math.round(Number(body.confidence ?? 50))));
      const sourceType =
        body.sourceType === 'screenshot' || body.sourceType === 'both' ? body.sourceType : 'text';

      if (category.length < 2 || category.length > 64) {
        res.status(400).json({
          errorCode: 'INVALID_CATEGORY',
          message: 'Scam category must be between 2 and 64 characters.',
        });
        return;
      }
      if (rawDescription.length < 10 || rawDescription.length > 4000) {
        res.status(400).json({
          errorCode: 'INVALID_DESCRIPTION',
          message: 'Scam description must be between 10 and 4,000 characters.',
        });
        return;
      }

      const descRedaction = redactPii(rawDescription);
      const rawTitle =
        typeof body.title === 'string' && body.title.trim().length >= 3
          ? body.title.trim()
          : `${category} Warning (${scamChannel})`;
      const titleRedaction = redactPii(rawTitle);
      const title = titleRedaction.redactedText.slice(0, 160);

      if (title.length < 3) {
        res.status(400).json({ errorCode: 'INVALID_TITLE', message: 'Title must be 3-160 characters.' });
        return;
      }

      const rawEvidence = typeof body.optionalEvidence === 'string' ? body.optionalEvidence.trim() : '';
      const evidenceRedaction = redactPii(rawEvidence);
      const optionalEvidence = evidenceRedaction.redactedText.slice(0, 1000);

      let extraRedactions = titleRedaction.redactionCount + descRedaction.redactionCount + evidenceRedaction.redactionCount;

      const suspiciousIndicators = Array.isArray(body.suspiciousIndicators)
        ? body.suspiciousIndicators
            .slice(0, 12)
            .map((s) => {
              const r = redactPii(String(s).trim());
              extraRedactions += r.redactionCount;
              return r.redactedText.slice(0, 290);
            })
            .filter(Boolean)
        : [];

      const expRedaction = redactPii(
        String(body.explanation || 'User-submitted threat report queued for moderator verification.'),
      );
      extraRedactions += expRedaction.redactionCount;
      const explanation = expRedaction.redactedText.slice(0, 2900);

      const safetyRecommendations = Array.isArray(body.safetyRecommendations)
        ? body.safetyRecommendations
            .slice(0, 10)
            .map((s) => {
              const r = redactPii(String(s).trim());
              extraRedactions += r.redactionCount;
              return r.redactedText.slice(0, 290);
            })
            .filter(Boolean)
        : ['Verify independently through official channels before acting.'];

      const safeDescription = descRedaction.redactedText.slice(0, 3900);
      const submissionHash = computeSubmissionHash(user.uid, category, safeDescription);

      // Duplicate submission protection
      const isDuplicate = await checkDuplicateReportHash(user.uid, submissionHash, user.rawToken);
      if (isDuplicate) {
        res.status(409).json({
          errorCode: 'DUPLICATE_SUBMISSION',
          message: 'A report with identical content has already been submitted from your account.',
        });
        return;
      }

      const reportId = generateDocId('rep');
      const payload: Record<string, unknown> = {
        reportId,
        userId: user.uid,
        authorId: user.uid,
        title,
        category,
        description: safeDescription,
        redactedExcerpt: safeDescription,
        scamChannel,
        riskLevel,
        confidence,
        suspiciousIndicators,
        explanation,
        safetyRecommendations,
        // Server-authoritative moderation & privacy state: ALWAYS starts pending & private
        moderationStatus: 'pending',
        visibility: 'private',
        verificationStatus: submitCommunityWarning
          ? 'pending_review'
          : body.aiAnalyzed === true
            ? 'ai_suspected'
            : 'unreviewed',
        consentGiven: submitCommunityWarning ? true : false,
        redactedPiiCount: Math.max(0, Math.min(1000, Number(body.redactedPiiCount ?? 0) + extraRedactions)),
        sourceType,
        shareCount: 0,
        submissionHash,
      };

      if (optionalEvidence.length > 0) {
        payload.optionalEvidence = optionalEvidence;
      }

      const created = await firestoreCommitCreate(
        'reports',
        reportId,
        payload,
        ['createdAt', 'updatedAt'],
        user.rawToken,
      );

      res.status(201).json(created);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create report.';
      res.status(400).json({ errorCode: 'CREATE_REPORT_ERROR', message });
    }
  },
);

reportsRouter.get('/reports', optionalAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const scope =
      req.query.scope === 'mine'
        ? 'mine'
        : req.query.scope === 'pending'
          ? 'pending'
          : 'public';

    if ((scope === 'mine' || scope === 'pending') && !req.authUser) {
      res.status(401).json({
        errorCode: 'UNAUTHORIZED',
        message: 'Sign in to access private or moderation report queues.',
      });
      return;
    }

    const limitParam = typeof req.query.limit === 'string' ? Number.parseInt(req.query.limit, 10) : 50;
    const reports = await queryReportsFromFirestore({
      scope,
      uid: req.authUser?.uid,
      idToken: req.authUser?.rawToken,
      limit: Number.isFinite(limitParam) ? limitParam : 50,
    });

    res.json({ reports });
  } catch (error) {
    const status = (error as Error & { statusCode?: number }).statusCode || 500;
    const message = error instanceof Error ? error.message : 'Failed to load reports.';
    res.status(status === 403 ? 403 : 500).json({
      errorCode: status === 403 ? 'FORBIDDEN' : 'LIST_REPORTS_ERROR',
      message,
    });
  }
});

reportsRouter.get('/reports/:id', optionalAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const id = req.params.id;
    if (!ALLOWED_ID_RE.test(id)) {
      res.status(400).json({ errorCode: 'INVALID_ID', message: 'Invalid report ID format.' });
      return;
    }

    const report = await getFirestoreDoc('reports', id, req.authUser?.rawToken);
    res.json(report);
  } catch (error) {
    const status = (error as Error & { statusCode?: number }).statusCode || 404;
    res.status(status).json({
      errorCode: status === 403 ? 'FORBIDDEN' : 'NOT_FOUND',
      message: status === 403 ? 'You do not have permission to view this private report.' : 'Report not found.',
    });
  }
});

reportsRouter.post(
  '/reports/:id/submit',
  requireAuth,
  reportWriteLimiter,
  async (req: AuthenticatedRequest, res) => {
    try {
      const id = req.params.id;
      if (!ALLOWED_ID_RE.test(id)) {
        res.status(400).json({ errorCode: 'INVALID_ID', message: 'Invalid report ID format.' });
        return;
      }

      const { consentConfirmed, redactionAcknowledged } = req.body as {
        consentConfirmed?: boolean;
        redactionAcknowledged?: boolean;
      };

      if (consentConfirmed !== true || redactionAcknowledged !== true) {
        res.status(400).json({
          errorCode: 'CONSENT_REQUIRED',
          message:
            'Explicit user consent and PII redaction acknowledgment are required before submitting a report to moderation.',
        });
        return;
      }

      // Remains private & pending until an authorized moderator approves
      const updated = await firestoreCommitPatch(
        'reports',
        id,
        {
          visibility: 'private',
          moderationStatus: 'pending',
          consentGiven: true,
          verificationStatus: 'pending_review',
        },
        ['updatedAt'],
        req.authUser!.rawToken,
      );

      res.json(updated);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to submit report for review.';
      res.status(400).json({ errorCode: 'SUBMIT_REPORT_ERROR', message });
    }
  },
);

reportsRouter.post(
  '/reports/:id/request-deletion',
  requireAuth,
  reportWriteLimiter,
  async (req: AuthenticatedRequest, res) => {
    try {
      const id = req.params.id;
      if (!ALLOWED_ID_RE.test(id)) {
        res.status(400).json({ errorCode: 'INVALID_ID', message: 'Invalid report ID format.' });
        return;
      }

      const existing = await getFirestoreDoc('reports', id, req.authUser!.rawToken);
      if (existing.userId !== req.authUser!.uid) {
        res.status(403).json({
          errorCode: 'FORBIDDEN',
          message: 'Only the report author can request deletion.',
        });
        return;
      }

      const updated = await firestoreCommitPatch(
        'reports',
        id,
        {
          visibility: 'private',
          consentGiven: false,
          deletionRequested: true,
        },
        ['deletionRequestedAt', 'updatedAt'],
        req.authUser!.rawToken,
      );

      res.json(updated);
    } catch (error) {
      const status = (error as Error & { statusCode?: number }).statusCode || 400;
      const message = error instanceof Error ? error.message : 'Failed to request report deletion.';
      res.status(status).json({ errorCode: 'REQUEST_DELETION_ERROR', message });
    }
  },
);

reportsRouter.post(
  '/reports/:id/moderate',
  requireAuth,
  reportWriteLimiter,
  async (req: AuthenticatedRequest, res) => {
    try {
      const id = req.params.id;
      if (!ALLOWED_ID_RE.test(id)) {
        res.status(400).json({ errorCode: 'INVALID_ID', message: 'Invalid report ID format.' });
        return;
      }

      const { decision, notes, rejectReason } = req.body as {
        decision?: unknown;
        notes?: unknown;
        rejectReason?: unknown;
      };

      if (decision !== 'approved' && decision !== 'rejected') {
        res.status(400).json({
          errorCode: 'INVALID_DECISION',
          message: 'Moderation decision must be "approved" or "rejected".',
        });
        return;
      }

      const cleanNotes = typeof notes === 'string' ? redactPii(notes.trim()).redactedText.slice(0, 1400) : '';
      if (cleanNotes.length < 3) {
        res.status(400).json({
          errorCode: 'INVALID_NOTES',
          message: 'Moderator audit notes (at least 3 characters) are required.',
        });
        return;
      }

      const existing = await getFirestoreDoc('reports', id, req.authUser!.rawToken);
      if (existing.userId === req.authUser!.uid) {
        res.status(403).json({
          errorCode: 'SELF_APPROVAL_FORBIDDEN',
          message: 'Users and moderators cannot approve or reject their own reports.',
        });
        return;
      }

      const nextModerationStatus = decision;
      const nextVisibility = decision === 'approved' ? 'public' : 'private';
      const nextVerificationStatus =
        decision === 'approved'
          ? 'verified_scam'
          : rejectReason === 'false_positive'
            ? 'false_positive'
            : 'dismissed';

      const updated = await firestoreCommitPatch(
        'reports',
        id,
        {
          moderationStatus: nextModerationStatus,
          visibility: nextVisibility,
          verificationStatus: nextVerificationStatus,
          moderatorNotes: cleanNotes,
        },
        ['updatedAt'],
        req.authUser!.rawToken,
      );

      // Write immutable moderation audit log & user notification
      const modId = generateDocId('mod');
      await firestoreCommitCreate(
        'moderation',
        modId,
        {
          reportId: id,
          moderatorId: req.authUser!.uid,
          decision,
          previousStatus: String(existing.moderationStatus || 'pending'),
          notes: cleanNotes,
        },
        ['createdAt'],
        req.authUser!.rawToken,
      );

      if (typeof existing.userId === 'string' && existing.userId) {
        const notifId = generateDocId('ntf');
        await firestoreCommitCreate(
          'notifications',
          notifId,
          {
            userId: existing.userId,
            title: decision === 'approved' ? 'Report Approved & Published' : 'Report Rejected',
            message:
              decision === 'approved'
                ? `Your report "${String(existing.title || '').slice(0, 80)}" was approved and published to Community Warnings.`
                : `Your report "${String(existing.title || '').slice(0, 80)}" was rejected and remains private. Note: ${cleanNotes.slice(0, 180)}`,
            type: 'verification_update',
            reportId: id,
            read: false,
          },
          ['createdAt'],
          req.authUser!.rawToken,
        );
      }

      res.json(updated);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to moderate report.';
      const isForbidden = message.includes('(403)') || message.includes('PERMISSION_DENIED');
      res.status(isForbidden ? 403 : 400).json({
        errorCode: isForbidden ? 'FORBIDDEN' : 'MODERATE_REPORT_ERROR',
        message,
      });
    }
  },
);

reportsRouter.post(
  '/reports/:id/share',
  requireAuth,
  reportWriteLimiter,
  async (req: AuthenticatedRequest, res) => {
    try {
      const id = req.params.id;
      if (!ALLOWED_ID_RE.test(id)) {
        res.status(400).json({ errorCode: 'INVALID_ID', message: 'Invalid report ID format.' });
        return;
      }

      const { platform, channelType } = req.body as {
        platform?: string;
        channelType?: string;
      };

      if (!platform || !ALLOWED_PLATFORMS.has(platform)) {
        res.status(400).json({ errorCode: 'INVALID_PLATFORM', message: 'Unsupported share platform.' });
        return;
      }

      const resolvedChannel =
        channelType && ALLOWED_CHANNELS.has(channelType) ? channelType : 'intent_url';

      const eventId = generateDocId('shr');
      const shareEvent = await firestoreCommitCreate(
        'share_events',
        eventId,
        {
          reportId: id,
          userId: req.authUser!.uid,
          platform,
          channelType: resolvedChannel,
        },
        ['createdAt'],
        req.authUser!.rawToken,
      );

      // Increment public report share count if report is approved & public
      try {
        await firestoreIncrementReportShare(id, req.authUser!.rawToken);
      } catch {
        // Ignore increment if sharing a private draft before approval
      }

      res.status(201).json({
        shareEvent,
        note: 'Share intent prepared. Delivery depends on user confirmation inside the target app.',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to log share intent.';
      res.status(400).json({ errorCode: 'SHARE_EVENT_ERROR', message });
    }
  },
);
