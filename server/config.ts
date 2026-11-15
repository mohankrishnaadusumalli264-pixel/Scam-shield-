import fs from 'node:fs';
import path from 'node:path';

export interface FirebasePublicConfig {
  projectId: string;
  appId: string;
  apiKey: string;
  authDomain: string;
  firestoreDatabaseId: string;
  storageBucket?: string;
  messagingSenderId?: string;
}

let cachedFirebaseConfig: FirebasePublicConfig | null | undefined;

export function getFirebaseConfig(): FirebasePublicConfig | null {
  if (cachedFirebaseConfig !== undefined) {
    return cachedFirebaseConfig;
  }

  try {
    const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    if (!fs.existsSync(configPath)) {
      cachedFirebaseConfig = null;
      return null;
    }
    const raw = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw) as FirebasePublicConfig;
    if (!parsed.projectId || parsed.projectId === 'remixed-project-id') {
      cachedFirebaseConfig = null;
      return null;
    }
    cachedFirebaseConfig = parsed;
    return parsed;
  } catch {
    cachedFirebaseConfig = null;
    return null;
  }
}

export function isGeminiConfigured(): boolean {
  const key = process.env.GEMINI_API_KEY?.trim();
  return Boolean(key && key !== 'MY_GEMINI_API_KEY' && key.length > 10);
}

export function getServerPort(): number {
  const rawPort = process.env.PORT;
  const parsed = rawPort ? Number.parseInt(rawPort, 10) : 3000;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 3000;
}
