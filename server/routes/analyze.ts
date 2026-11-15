import { Router } from 'express';
import { optionalAuth, type AuthenticatedRequest } from '../middleware/auth.ts';
import { createRateLimiter } from '../middleware/rateLimit.ts';
import { analyzeScamSubmission, GeminiConfigError } from '../services/geminiAnalyzer.ts';
import { firestoreCommitCreate, generateDocId } from '../services/firestoreRest.ts';

export const analyzeRouter = Router();

const analyzeRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 15,
  keyPrefix: 'analyze',
});

analyzeRouter.post(
  '/analyze',
  optionalAuth,
  analyzeRateLimiter,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { text, imageBase64, imageMimeType, channelHint } = req.body as {
        text?: unknown;
        imageBase64?: unknown;
        imageMimeType?: unknown;
        channelHint?: unknown;
      };

      if (text !== undefined && typeof text !== 'string') {
        res.status(400).json({ errorCode: 'INVALID_INPUT', message: 'text must be a string.' });
        return;
      }
      if (imageBase64 !== undefined && typeof imageBase64 !== 'string') {
        res.status(400).json({ errorCode: 'INVALID_INPUT', message: 'imageBase64 must be a string.' });
        return;
      }
      if (typeof text === 'string' && text.length > 8000) {
        res.status(400).json({
          errorCode: 'PAYLOAD_TOO_LARGE',
          message: 'Submitted text exceeds 8,000 characters.',
        });
        return;
      }

      const result = await analyzeScamSubmission({
        text: typeof text === 'string' ? text : undefined,
        imageBase64: typeof imageBase64 === 'string' ? imageBase64 : undefined,
        imageMimeType: typeof imageMimeType === 'string' ? imageMimeType : undefined,
        channelHint: typeof channelHint === 'string' ? channelHint.slice(0, 48) : undefined,
      });

      // Record private analysis metadata if caller is authenticated & email verified (without storing screenshots)
      if (req.authUser && req.authUser.emailVerified) {
        try {
          const analysisId = generateDocId('anl');
          await firestoreCommitCreate(
            'analysis',
            analysisId,
            {
              userId: req.authUser.uid,
              riskLevel: result.riskLevel,
              confidence: result.confidence,
              category: result.category,
              suspiciousIndicators: result.suspiciousIndicators.slice(0, 12),
              explanation: result.explanation.slice(0, 3000),
              safetyRecommendations: result.safetyRecommendations.slice(0, 10),
              verificationStatus: 'ai_suspected',
              hadImageInput: result.hadImageInput,
              piiRedactedCount: result.redactionCount,
            },
            ['createdAt'],
            req.authUser.rawToken,
          );
        } catch (persistErr) {
          // Do not block returning the AI analysis if optional audit write fails
          console.warn('Optional analysis log persist skipped:', persistErr);
        }
      }

      res.json(result);
    } catch (error) {
      if (error instanceof GeminiConfigError) {
        res.status(error.statusCode).json({
          errorCode: error.errorCode,
          message: error.message,
        });
        return;
      }
      const message = error instanceof Error ? error.message : 'Analysis request failed.';
      res.status(400).json({
        errorCode: 'ANALYSIS_ERROR',
        message,
      });
    }
  },
);
