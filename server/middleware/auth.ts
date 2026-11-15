import type { NextFunction, Request, Response } from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { getFirebaseConfig } from '../config.ts';

export interface AuthenticatedUser {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  rawToken: string;
}

export interface AuthenticatedRequest extends Request {
  authUser?: AuthenticatedUser;
}

const FIREBASE_JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'),
);

async function verifyFirebaseBearerToken(token: string): Promise<AuthenticatedUser | null> {
  const firebaseConfig = getFirebaseConfig();
  if (!firebaseConfig) {
    return null;
  }

  const projectId = firebaseConfig.projectId;
  const { payload } = await jwtVerify(token, FIREBASE_JWKS, {
    issuer: `https://securetoken.google.com/${projectId}`,
    audience: projectId,
  });

  if (!payload.sub || typeof payload.sub !== 'string') {
    return null;
  }

  return {
    uid: payload.sub,
    email: typeof payload.email === 'string' ? payload.email : null,
    emailVerified: payload.email_verified === true,
    rawToken: token,
  };
}

export async function optionalAuth(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    next();
    return;
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    next();
    return;
  }

  try {
    const verified = await verifyFirebaseBearerToken(token);
    if (verified) {
      req.authUser = verified;
    }
  } catch {
    // Ignore invalid optional tokens; protected routes use requireAuth
  }
  next();
}

export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      errorCode: 'UNAUTHORIZED',
      message: 'Authentication required. Please sign in with Firebase Authentication.',
    });
    return;
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    res.status(401).json({
      errorCode: 'UNAUTHORIZED',
      message: 'Missing bearer token.',
    });
    return;
  }

  try {
    const verified = await verifyFirebaseBearerToken(token);
    if (!verified) {
      res.status(401).json({
        errorCode: 'INVALID_TOKEN',
        message: 'Could not verify Firebase authentication token.',
      });
      return;
    }
    if (!verified.emailVerified) {
      res.status(403).json({
        errorCode: 'EMAIL_NOT_VERIFIED',
        message: 'Verified email address required for write operations.',
      });
      return;
    }
    req.authUser = verified;
    next();
  } catch {
    res.status(401).json({
      errorCode: 'INVALID_TOKEN',
      message: 'Authentication token is invalid or expired.',
    });
  }
}
