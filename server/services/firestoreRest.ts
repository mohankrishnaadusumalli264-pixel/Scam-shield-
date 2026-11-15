import crypto from 'node:crypto';
import { getFirebaseConfig } from '../config.ts';

type FirestoreValue =
  | { stringValue: string }
  | { integerValue: string }
  | { doubleValue: number }
  | { booleanValue: boolean }
  | { timestampValue: string }
  | { arrayValue: { values?: FirestoreValue[] } }
  | { mapValue: { fields: Record<string, FirestoreValue> } }
  | { nullValue: null };

interface FirestoreDocument {
  name: string;
  fields?: Record<string, FirestoreValue>;
  createTime?: string;
  updateTime?: string;
}

function getBaseUrls() {
  const cfg = getFirebaseConfig();
  if (!cfg) {
    throw new Error('Firebase is not configured (firebase-applet-config.json missing).');
  }
  const dbPath = `projects/${cfg.projectId}/databases/${cfg.firestoreDatabaseId}/documents`;
  return {
    cfg,
    dbPath,
    baseUrl: `https://firestore.googleapis.com/v1/${dbPath}`,
    commitUrl: `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/${cfg.firestoreDatabaseId}/documents:commit`,
    queryUrl: `https://firestore.googleapis.com/v1/${dbPath}:runQuery`,
  };
}

export function generateDocId(prefix: string): string {
  const rand = crypto.randomBytes(8).toString('hex');
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}

export function toFirestoreValue(val: unknown): FirestoreValue {
  if (val === null || val === undefined) {
    return { nullValue: null };
  }
  if (typeof val === 'string') {
    return { stringValue: val };
  }
  if (typeof val === 'boolean') {
    return { booleanValue: val };
  }
  if (typeof val === 'number') {
    if (Number.isInteger(val)) {
      return { integerValue: String(val) };
    }
    return { doubleValue: val };
  }
  if (Array.isArray(val)) {
    return {
      arrayValue: {
        values: val.map((item) => toFirestoreValue(item)),
      },
    };
  }
  if (typeof val === 'object') {
    const fields: Record<string, FirestoreValue> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      if (v !== undefined) {
        fields[k] = toFirestoreValue(v);
      }
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

export function toFirestoreFields(obj: Record<string, unknown>): Record<string, FirestoreValue> {
  const fields: Record<string, FirestoreValue> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) {
      fields[k] = toFirestoreValue(v);
    }
  }
  return fields;
}

function fromFirestoreValue(val: FirestoreValue): unknown {
  if ('stringValue' in val) return val.stringValue;
  if ('booleanValue' in val) return val.booleanValue;
  if ('integerValue' in val) return Number.parseInt(val.integerValue, 10);
  if ('doubleValue' in val) return val.doubleValue;
  if ('timestampValue' in val) return val.timestampValue;
  if ('nullValue' in val) return null;
  if ('arrayValue' in val) {
    return (val.arrayValue.values || []).map((v) => fromFirestoreValue(v));
  }
  if ('mapValue' in val) {
    return fromFirestoreFields(val.mapValue.fields || {});
  }
  return null;
}

export function fromFirestoreFields(
  fields: Record<string, FirestoreValue> | undefined,
): Record<string, unknown> {
  if (!fields) return {};
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    result[k] = fromFirestoreValue(v);
  }
  return result;
}

export function extractDocId(name: string): string {
  const parts = name.split('/');
  return parts[parts.length - 1] || '';
}

export async function firestoreCommitCreate(
  collection: string,
  docId: string,
  data: Record<string, unknown>,
  serverTimestampFields: string[],
  idToken: string,
): Promise<Record<string, unknown>> {
  const { dbPath, commitUrl } = getBaseUrls();
  const documentPath = `${dbPath}/${collection}/${docId}`;

  const body = {
    writes: [
      {
        update: {
          name: documentPath,
          fields: toFirestoreFields(data),
        },
        currentDocument: {
          exists: false,
        },
        updateTransforms: serverTimestampFields.map((fieldPath) => ({
          fieldPath,
          setToServerValue: 'REQUEST_TIME',
        })),
      },
    ],
  };

  const resp = await fetch(commitUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Firestore write failed (${resp.status}): ${errText}`);
  }

  return getFirestoreDoc(collection, docId, idToken);
}

export async function firestoreCommitPatch(
  collection: string,
  docId: string,
  patchFields: Record<string, unknown>,
  serverTimestampFields: string[],
  idToken: string,
): Promise<Record<string, unknown>> {
  const { dbPath, commitUrl } = getBaseUrls();
  const documentPath = `${dbPath}/${collection}/${docId}`;
  const fieldPaths = [...Object.keys(patchFields), ...serverTimestampFields];

  const body = {
    writes: [
      {
        update: {
          name: documentPath,
          fields: toFirestoreFields(patchFields),
        },
        updateMask: {
          fieldPaths,
        },
        currentDocument: {
          exists: true,
        },
        updateTransforms: serverTimestampFields.map((fieldPath) => ({
          fieldPath,
          setToServerValue: 'REQUEST_TIME',
        })),
      },
    ],
  };

  const resp = await fetch(commitUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Firestore update failed (${resp.status}): ${errText}`);
  }

  return getFirestoreDoc(collection, docId, idToken);
}

export async function firestoreIncrementReportShare(
  reportId: string,
  idToken: string,
): Promise<void> {
  const { dbPath, commitUrl } = getBaseUrls();
  const documentPath = `${dbPath}/reports/${reportId}`;

  const body = {
    writes: [
      {
        transform: {
          document: documentPath,
          fieldTransforms: [
            { fieldPath: 'shareCount', increment: { integerValue: '1' } },
            { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' },
          ],
        },
      },
    ],
  };

  const resp = await fetch(commitUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Firestore increment failed (${resp.status}): ${errText}`);
  }
}

export async function getFirestoreDoc(
  collection: string,
  docId: string,
  idToken?: string,
): Promise<Record<string, unknown>> {
  const { baseUrl } = getBaseUrls();
  const headers: Record<string, string> = {};
  if (idToken) {
    headers.Authorization = `Bearer ${idToken}`;
  }
  const resp = await fetch(`${baseUrl}/${collection}/${docId}`, { headers });
  if (!resp.ok) {
    const errText = await resp.text();
    const error = new Error(`Firestore read failed (${resp.status}): ${errText}`) as Error & {
      statusCode?: number;
    };
    error.statusCode = resp.status;
    throw error;
  }
  const doc = (await resp.json()) as FirestoreDocument;
  return {
    id: extractDocId(doc.name),
    ...fromFirestoreFields(doc.fields),
  };
}

export async function queryReportsFromFirestore(options: {
  scope: 'public' | 'mine' | 'pending';
  uid?: string;
  idToken?: string;
  limit?: number;
}): Promise<Array<Record<string, unknown>>> {
  const { queryUrl } = getBaseUrls();
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);

  let where: Record<string, unknown>;
  if (options.scope === 'mine' && options.uid) {
    where = {
      fieldFilter: {
        field: { fieldPath: 'userId' },
        op: 'EQUAL',
        value: { stringValue: options.uid },
      },
    };
  } else if (options.scope === 'pending') {
    where = {
      fieldFilter: {
        field: { fieldPath: 'moderationStatus' },
        op: 'EQUAL',
        value: { stringValue: 'pending' },
      },
    };
  } else {
    where = {
      compositeFilter: {
        op: 'AND',
        filters: [
          {
            fieldFilter: {
              field: { fieldPath: 'visibility' },
              op: 'EQUAL',
              value: { stringValue: 'public' },
            },
          },
          {
            fieldFilter: {
              field: { fieldPath: 'moderationStatus' },
              op: 'EQUAL',
              value: { stringValue: 'approved' },
            },
          },
        ],
      },
    };
  }

  const structuredQuery = {
    from: [{ collectionId: 'reports' }],
    where,
    limit,
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (options.idToken) {
    headers.Authorization = `Bearer ${options.idToken}`;
  }

  const resp = await fetch(queryUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({ structuredQuery }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    const error = new Error(`Firestore query failed (${resp.status}): ${errText}`) as Error & {
      statusCode?: number;
    };
    error.statusCode = resp.status;
    throw error;
  }

  const rows = (await resp.json()) as Array<{ document?: FirestoreDocument }>;
  return rows
    .filter((row) => Boolean(row.document))
    .map((row): Record<string, unknown> => {
      const doc = row.document!;
      return {
        id: extractDocId(doc.name),
        ...fromFirestoreFields(doc.fields),
      };
    })
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

export async function checkDuplicateReportHash(
  uid: string,
  submissionHash: string,
  idToken: string,
): Promise<boolean> {
  const { queryUrl } = getBaseUrls();
  const structuredQuery = {
    from: [{ collectionId: 'reports' }],
    where: {
      compositeFilter: {
        op: 'AND',
        filters: [
          {
            fieldFilter: {
              field: { fieldPath: 'userId' },
              op: 'EQUAL',
              value: { stringValue: uid },
            },
          },
          {
            fieldFilter: {
              field: { fieldPath: 'submissionHash' },
              op: 'EQUAL',
              value: { stringValue: submissionHash },
            },
          },
        ],
      },
    },
    limit: 1,
  };

  const resp = await fetch(queryUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ structuredQuery }),
  });

  if (!resp.ok) {
    return false;
  }

  const rows = (await resp.json()) as Array<{ document?: FirestoreDocument }>;
  return rows.some((row) => Boolean(row.document));
}

