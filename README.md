# SCAMSHIELD — Production Architecture Foundation V1

**"Detect Scams. Share Warnings. Protect Everyone."**

SCAMSHIELD is an AI-powered scam detection, PII-redacted reporting, and community warning platform built with React, TypeScript, Express (Node.js), server-side Gemini AI, Firebase Authentication, and Cloud Firestore.

## Architecture Overview

- **Frontend (`src/`)**: React 19 + TypeScript + Tailwind CSS v4 with responsive Android-first thumb-zone navigation and desktop sidebar workspace across 8 modules:
  1. **Home Dashboard** (`src/modules/HomeDashboard.tsx`)
  2. **AI Scam Scanner** (`src/modules/ScamScanner.tsx`)
  3. **Community Reports** (`src/modules/CommunityReports.tsx`)
  4. **Scam Intelligence** (`src/modules/ScamIntelligence.tsx`)
  5. **Universal Share** (`src/modules/UniversalShare.tsx`)
  6. **Verification Centre** (`src/modules/VerificationCentre.tsx`)
  7. **User Profile** (`src/modules/UserProfile.tsx`)
  8. **Admin Dashboard** (`src/modules/AdminDashboard.tsx`)
- **Backend (`server.ts`, `server/`)**: Node.js + Express API server supporting:
  - `GET /api/health` — Live server configuration readiness (`GEMINI_API_KEY` and Firebase config presence).
  - `POST /api/analyze` — Rate-limited multimodal Gemini (`gemini-4-hydrogen`) threat analysis with deterministic PII redaction and in-memory screenshot inspection (screenshots are never stored permanently). Returns explicit `503 GEMINI_NOT_CONFIGURED` if `GEMINI_API_KEY` is missing.
  - `POST /api/reports` — Creates a private draft report in Cloud Firestore with PII masked.
  - `GET /api/reports` — Lists public community reports or authenticated user's private reports.
  - `GET /api/reports/:id` — Fetches a single report respecting private/public security rules.
  - `POST /api/reports/:id/submit` — Requires explicit `consentConfirmed` and `redactionAcknowledged` flags before publishing a draft to `pending_review`.
  - `POST /api/reports/:id/share` — Records anonymized share intent in `share_events` without claiming automatic message delivery.

## Firestore Data Model & Security Rules

Collections defined in `firebase-blueprint.json` and enforced by `firestore.rules`:

- `users/{userId}` & `users/{userId}/private/profile` (Split-collection PII isolation)
- `admins/{adminId}` (Trusted RBAC directory for `moderator` and `admin` roles; users cannot self-promote)
- `reports/{reportId}` (Private by default; public submission requires `consentGiven == true`; only Moderators/Admins can set `verificationStatus` to `verified_scam`, `false_positive`, or `dismissed`)
- `analysis/{analysisId}` (Private scan audit logs without stored images)
- `campaigns/{campaignId}` (Moderator/Admin published threat intelligence advisories)
- `moderation/{moderationId}` (Immutable human verification audit trail)
- `notifications/{notificationId}` (User-scoped alerts)
- `share_events/{shareEventId}` (Anonymized share intent records)

## Environment Variables

Copy `.env.example` to `.env` for local runs and set secrets in your deployment environment:

- `GEMINI_API_KEY` — Server-only Gemini API key (never exposed to browser code)
- `PORT` — Listening port (`3000` default)
- `NODE_ENV` — `development` or `production`

## Local Development & Cloud Run Deployment

```bash
# 1. Install dependencies
npm install

# 2. Run full-stack development server (Express + Vite middleware on port 3000)
npm run dev

# 3. Typecheck and lint Firestore security rules
npm run lint
npx eslint firestore.rules

# 4. Build and run production server (Cloud Run compatible)
npm run build
NODE_ENV=production npm start
```
