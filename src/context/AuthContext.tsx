import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import {
  auth,
  BOOTSTRAPPED_ADMIN_EMAIL,
  db,
  handleFirestoreError,
  OperationType,
  signInWithGoogle,
  signOutUser,
} from '../lib/firebase';
import type { UserProfile, UserRole } from '../types/scamshield';

interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  role: UserRole;
  authReady: boolean;
  authError: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshRoleAndProfile: () => Promise<void>;
  updatePrivacyPreferences: (prefs: {
    defaultPrivateUploads: boolean;
    autoRedactPii: boolean;
    displayName: string;
  }) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [role, setRole] = useState<UserRole>('user');
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const syncUserAndRole = useCallback(async (firebaseUser: User) => {
    const userDocRef = doc(db, 'users', firebaseUser.uid);
    const privateDocRef = doc(db, 'users', firebaseUser.uid, 'private', 'profile');
    const adminDocRef = doc(db, 'admins', firebaseUser.uid);

    // 1. Ensure user public-safe profile exists (strictly role: 'user' on creation)
    let resolvedProfile: UserProfile | null = null;
    try {
      const snap = await getDoc(userDocRef);
      if (!snap.exists()) {
        const displayName = (firebaseUser.displayName || 'SCAMSHIELD Member').slice(0, 80);
        await setDoc(userDocRef, {
          uid: firebaseUser.uid,
          displayName,
          role: 'user',
          defaultPrivateUploads: true,
          autoRedactPii: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        resolvedProfile = {
          uid: firebaseUser.uid,
          displayName,
          role: 'user',
          defaultPrivateUploads: true,
          autoRedactPii: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      } else {
        const d = snap.data();
        resolvedProfile = {
          uid: String(d.uid || firebaseUser.uid),
          displayName: String(d.displayName || firebaseUser.displayName || 'SCAMSHIELD Member'),
          role: (d.role === 'admin' || d.role === 'moderator' ? d.role : 'user') as UserRole,
          defaultPrivateUploads: d.defaultPrivateUploads !== false,
          autoRedactPii: d.autoRedactPii !== false,
          createdAt: d.createdAt?.toDate ? d.createdAt.toDate().toISOString() : new Date().toISOString(),
          updatedAt: d.updatedAt?.toDate ? d.updatedAt.toDate().toISOString() : new Date().toISOString(),
        };
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${firebaseUser.uid}`);
    }

    // 2. Ensure isolated PII doc exists in /users/{uid}/private/profile
    try {
      const privateSnap = await getDoc(privateDocRef);
      if (!privateSnap.exists() && firebaseUser.email) {
        await setDoc(privateDocRef, {
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          photoUrl: firebaseUser.photoURL || '',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      console.warn('Private PII sync skipped:', error);
    }

    // 3. Resolve trusted RBAC role from /admins/{uid} or verified bootstrap email
    let trustedRole: UserRole = 'user';
    if (firebaseUser.emailVerified && firebaseUser.email === BOOTSTRAPPED_ADMIN_EMAIL) {
      trustedRole = 'admin';
    } else {
      try {
        const adminSnap = await getDoc(adminDocRef);
        if (adminSnap.exists()) {
          const adminRole = adminSnap.data().role;
          if (adminRole === 'admin' || adminRole === 'moderator') {
            trustedRole = adminRole;
          }
        }
      } catch {
        // Non-admin users without /admins/{uid} doc remain 'user'
        trustedRole = 'user';
      }
    }

    setRole(trustedRole);
    if (resolvedProfile) {
      setProfile({ ...resolvedProfile, role: trustedRole });
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      setAuthError(null);
      if (!nextUser) {
        setProfile(null);
        setRole('user');
        setAuthReady(true);
        return;
      }

      try {
        await syncUserAndRole(nextUser);
      } catch (err) {
        setAuthError(err instanceof Error ? err.message : 'Failed to synchronize user profile.');
      } finally {
        setAuthReady(true);
      }
    });

    return () => unsubscribe();
  }, [syncUserAndRole]);

  const signIn = useCallback(async () => {
    setAuthError(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Google Sign-In cancelled or failed.';
      setAuthError(msg);
    }
  }, []);

  const signOut = useCallback(async () => {
    setAuthError(null);
    await signOutUser();
  }, []);

  const refreshRoleAndProfile = useCallback(async () => {
    if (auth.currentUser) {
      await syncUserAndRole(auth.currentUser);
    }
  }, [syncUserAndRole]);

  const updatePrivacyPreferences = useCallback(
    async (prefs: {
      defaultPrivateUploads: boolean;
      autoRedactPii: boolean;
      displayName: string;
    }) => {
      if (!auth.currentUser) {
        throw new Error('Authentication required.');
      }
      const cleanName = prefs.displayName.trim().slice(0, 80) || 'SCAMSHIELD Member';
      const userDocRef = doc(db, 'users', auth.currentUser.uid);
      try {
        await updateDoc(userDocRef, {
          displayName: cleanName,
          defaultPrivateUploads: prefs.defaultPrivateUploads,
          autoRedactPii: prefs.autoRedactPii,
          updatedAt: serverTimestamp(),
        });
        setProfile((prev) =>
          prev
            ? {
                ...prev,
                displayName: cleanName,
                defaultPrivateUploads: prefs.defaultPrivateUploads,
                autoRedactPii: prefs.autoRedactPii,
                updatedAt: new Date().toISOString(),
              }
            : null,
        );
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `users/${auth.currentUser.uid}`);
      }
    },
    [],
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        role,
        authReady,
        authError,
        signIn,
        signOut,
        refreshRoleAndProfile,
        updatePrivacyPreferences,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}
