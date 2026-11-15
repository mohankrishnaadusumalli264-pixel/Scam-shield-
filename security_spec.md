# SCAMSHIELD Firestore Security Specification (Phase 0 TDD)

## 1. Data Invariants

1. **Identity & RBAC Isolation**:
   - No user may self-assign `role: 'moderator'` or `role: 'admin'` on `/users/{userId}` or create an entry in `/admins/{adminId}` unless they are already an admin or the verified bootstrapped admin email (`mohankrishnaadusumalli264@gmail.com` with `email_verified == true`).
   - `/users/{userId}/private/profile` contains PII (`email`) and is strictly readable/writable only by `request.auth.uid == userId` or `isAdmin()`.
2. **Moderation-Gated Privacy & Explicit Consent**:
   - Every newly created report MUST have `moderationStatus == 'pending'` and `visibility == 'private'`.
   - Standard users can NEVER transition `moderationStatus` to `'approved'` or `'rejected'`, and can NEVER set `visibility` to `'public'`.
   - Only approved reports (`moderationStatus == 'approved' && consentGiven == true`) may have `visibility == 'public'`.
   - Rejected reports (`moderationStatus == 'rejected'`) MUST remain `visibility == 'private'`.
   - Private reports (`visibility == 'private'`) are NEVER readable or listable by other standard users.
3. **Anti-Self-Approval & AI-vs-Human Verification Separation**:
   - Moderators and Administrators are strictly forbidden from approving or rejecting their own reports (`existing().userId != request.auth.uid`).
   - A standard user CANNOT create or update a report with `verificationStatus == 'verified_scam'`, `'false_positive'`, or `'dismissed'`.
   - Only an authorized Moderator or Administrator (verified via `/admins/{uid}` or bootstrapped admin email) can transition a report into a terminal moderation outcome alongside an immutable `/moderation` audit record.
4. **Temporal, Relational & Duplicate Integrity**:
   - Every `create` MUST use `createdAt == request.time` and `updatedAt == request.time` (if applicable).
   - Every `update` MUST preserve immutable `createdAt`, `userId`, `authorId`, `reportId`, and `submissionHash`.
   - Every document ID path parameter MUST match `^[a-zA-Z0-9_\-]+$` and length `<= 128`.
5. **PII & Image Storage Prohibition**:
   - No `analysis` or `reports` document accepts arbitrary unvalidated shadow fields (`hasOnly` enforced).
   - Original screenshots are never persisted or published; `submissionHash` must be a valid 64-char SHA-256 hex digest.

## 2. The "Dirty Dozen" Adversarial Payloads (Must Return `PERMISSION_DENIED`)

1. **Self-Role Escalation on `/users/{uid}` Create**: `{ uid: "attacker", displayName: "Eve", role: "admin", ... }` -> DENIED (`role` must be `'user'`).
2. **Self-Role Escalation on `/users/{uid}` Update**: `{ role: "moderator", updatedAt: serverTimestamp() }` -> DENIED (`affectedKeys().hasOnly(['displayName', 'defaultPrivateUploads', 'autoRedactPii', 'updatedAt'])`).
3. **Unauthorized Admin Record Creation (`/admins/attacker`)**: Regular user attempts `setDoc(/admins/attacker, { role: "admin", ... })` -> DENIED (`isAdmin()` required).
4. **Shadow Field Injection on `/reports/{id}`**: `{ ..., isVerified: true, ghostFlag: 1 }` -> DENIED (`hasOnly` rejects unknown fields).
5. **Self-Approval / Pre-Approved Report Spoofing on `/reports/{id}` Create**: User creates report with `moderationStatus: "approved"` or `visibility: "public"` -> DENIED (`moderationStatus == 'pending' && visibility == 'private'` enforced).
6. **Rejected Report Made Public**: Moderator or user sets `moderationStatus: "rejected", visibility: "public"` -> DENIED (rejected reports MUST remain `visibility == 'private'`).
7. **Cross-User Private/Pending Report Read**: User B calls `getDoc(/reports/pendingReportOfUserA)` -> DENIED.
8. **Unfiltered List Scraping on `/reports`**: Attacker queries `collection('reports')` without `where('visibility', '==', 'public')` + `where('moderationStatus', '==', 'approved')` or `where('userId', '==', uid)` -> DENIED by `allow list`.
9. **Identity Spoofing on `/reports` Create**: User A attempts to create a report with `userId: "userB"` -> DENIED (`userId == request.auth.uid`).
10. **Moderator Self-Approval**: Moderator attempts to approve their own report (`existing().userId == request.auth.uid`) -> DENIED (`existing().userId != request.auth.uid`).
11. **Timestamp Forgery**: User submits `createdAt: Timestamp(2020-01-01)` -> DENIED (`createdAt == request.time`).
12. **Email Spoofing Without Verification**: User with `email_verified: false` attempts write or admin check -> DENIED (`email_verified == true` required).
