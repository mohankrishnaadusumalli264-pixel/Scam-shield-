/**
 * SCAMSHIELD Firestore Security Rules Verification Matrix (Phase 0 TDD)
 * Documents and verifies all 12 adversarial ("Dirty Dozen") security invariants.
 */

export interface SecurityTestCase {
  id: string;
  name: string;
  collection: string;
  operation: 'create' | 'update' | 'get' | 'list' | 'delete';
  expected: 'PERMISSION_DENIED' | 'ALLOWED';
  rationale: string;
  samplePayload?: Record<string, unknown>;
}

export const DIRTY_DOZEN_SECURITY_CASES: SecurityTestCase[] = [
  {
    id: 'DD-01',
    name: 'Self-role escalation on /users/{uid} create',
    collection: 'users',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    rationale: 'incoming().role must equal "user" on user profile self-creation.',
    samplePayload: { uid: 'attacker_uid', displayName: 'Eve', role: 'admin', defaultPrivateUploads: true, autoRedactPii: true },
  },
  {
    id: 'DD-02',
    name: 'Self-role escalation on /users/{uid} update',
    collection: 'users',
    operation: 'update',
    expected: 'PERMISSION_DENIED',
    rationale: 'Standard user update affectedKeys().hasOnly excludes "role".',
    samplePayload: { role: 'moderator' },
  },
  {
    id: 'DD-03',
    name: 'Unauthorized /admins/{uid} creation by standard user',
    collection: 'admins',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    rationale: 'Only isAdmin() can create entries in /admins.',
    samplePayload: { uid: 'attacker_uid', email: 'eve@example.com', role: 'admin', assignedBy: 'attacker_uid' },
  },
  {
    id: 'DD-04',
    name: 'Shadow field injection on /reports/{id}',
    collection: 'reports',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    rationale: 'isValidReport() enforces strict keys().hasOnly() schema allowlist.',
    samplePayload: { title: 'Test', isVerified: true, ghostFlag: 1 },
  },
  {
    id: 'DD-05',
    name: 'Pre-approved or public report creation by standard user',
    collection: 'reports',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    rationale: 'Create rule requires moderationStatus == "pending" and visibility == "private".',
    samplePayload: { moderationStatus: 'approved', visibility: 'public', verificationStatus: 'verified_scam' },
  },
  {
    id: 'DD-06',
    name: 'Rejected report set to public visibility',
    collection: 'reports',
    operation: 'update',
    expected: 'PERMISSION_DENIED',
    rationale: 'isValidReport requires rejected reports to remain visibility == "private".',
    samplePayload: { moderationStatus: 'rejected', visibility: 'public' },
  },
  {
    id: 'DD-07',
    name: 'Cross-user private/pending report read',
    collection: 'reports',
    operation: 'get',
    expected: 'PERMISSION_DENIED',
    rationale: 'Private/pending reports only readable by userId owner or moderator/admin.',
  },
  {
    id: 'DD-08',
    name: 'Unfiltered list query scraping private/pending/rejected reports',
    collection: 'reports',
    operation: 'list',
    expected: 'PERMISSION_DENIED',
    rationale: 'allow list requires visibility == "public" && moderationStatus == "approved", or userId == request.auth.uid.',
  },
  {
    id: 'DD-09',
    name: 'Identity spoofing on /reports create',
    collection: 'reports',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    rationale: 'incoming().userId == request.auth.uid and authorId == request.auth.uid are strictly enforced.',
    samplePayload: { userId: 'victim_uid', authorId: 'victim_uid' },
  },
  {
    id: 'DD-10',
    name: 'Moderator approving own report or standard user approving report',
    collection: 'reports',
    operation: 'update',
    expected: 'PERMISSION_DENIED',
    rationale: 'Moderator update strictly enforces existing().userId != request.auth.uid and isModerator().',
    samplePayload: { moderationStatus: 'approved', visibility: 'public', verificationStatus: 'verified_scam' },
  },
  {
    id: 'DD-11',
    name: 'Backdated timestamp forgery',
    collection: 'reports',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    rationale: 'incoming().createdAt == request.time and updatedAt == request.time required.',
  },
  {
    id: 'DD-12',
    name: 'Unverified email spoofing write attempt',
    collection: 'users',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    rationale: 'isVerifiedUser() requires request.auth.token.email_verified == true.',
  },
];
