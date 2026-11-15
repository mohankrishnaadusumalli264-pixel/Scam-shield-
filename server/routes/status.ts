import { Router } from 'express';
import { getFirebaseConfig, isGeminiConfigured } from '../config.ts';
import type { AppHealthStatus } from '../../src/types/scamshield.ts';

export const statusRouter = Router();

statusRouter.get('/health', (_req, res) => {
  const fb = getFirebaseConfig();
  const payload: AppHealthStatus = {
    status: 'ok',
    geminiConfigured: isGeminiConfigured(),
    firebaseConfigured: Boolean(fb),
    firebaseProjectId: fb?.projectId ?? null,
    firestoreDatabaseId: fb?.firestoreDatabaseId ?? null,
    timestamp: new Date().toISOString(),
  };
  res.json(payload);
});
