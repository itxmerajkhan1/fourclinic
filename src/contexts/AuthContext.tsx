import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut as fbSignOut,
  type User,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
} from '../lib/firebase';
import type { UserProfile, UserRole } from '../types/clinic';

interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  role: UserRole | 'public';
  authReady: boolean;
  signingIn: boolean;
  authError: string | null;
  isStaff: boolean;
  signInWithGoogle: () => Promise<User | null>;
  signOut: () => Promise<void>;
  clearAuthError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function resolveInitialRoleFromServer(fbUser: User): Promise<'admin' | 'patient'> {
  try {
    const token = await fbUser.getIdToken();
    const res = await fetch('/api/auth/bootstrap-role', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (!res.ok) return 'patient';
    const data = (await res.json()) as { initialRole?: string };
    return data.initialRole === 'admin' ? 'admin' : 'patient';
  } catch {
    return 'patient';
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    let unsubProfile: (() => void) | null = null;
    let cancelled = false;

    const unsubAuth = onAuthStateChanged(auth, async (fbUser) => {
      if (unsubProfile) {
        unsubProfile();
        unsubProfile = null;
      }

      setUser(fbUser);

      if (!fbUser) {
        setProfile(null);
        setAuthReady(true);
        return;
      }

      setAuthReady(false);
      const userPath = `users/${fbUser.uid}`;
      const userRef = doc(db, 'users', fbUser.uid);

      try {
        const snap = await getDoc(userRef);
        if (!snap.exists()) {
          // Server checks verified email against configured bootstrap admin; Firestore rules enforce independently
          const initialRole = await resolveInitialRoleFromServer(fbUser);
          const payload: Record<string, unknown> = {
            uid: fbUser.uid,
            email: (fbUser.email || '').slice(0, 160),
            displayName: (fbUser.displayName || fbUser.email || 'Patient').slice(0, 80),
            role: initialRole,
            active: true,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };
          if (fbUser.photoURL) {
            payload.photoUrl = fbUser.photoURL.slice(0, 500);
          }
          await setDoc(userRef, payload);
        }
      } catch (err) {
        if (!cancelled) {
          setAuthError(err instanceof Error ? err.message : 'Unable to sync user profile.');
        }
      }

      if (cancelled) return;

      unsubProfile = onSnapshot(
        userRef,
        (docSnap) => {
          if (docSnap.exists()) {
            setProfile(docSnap.data() as UserProfile);
          } else {
            setProfile(null);
          }
          setAuthReady(true);
        },
        (error) => {
          setAuthReady(true);
          handleFirestoreError(error, OperationType.GET, userPath);
        }
      );
    });

    return () => {
      cancelled = true;
      unsubAuth();
      if (unsubProfile) unsubProfile();
    };
  }, []);

  async function signInWithGoogle(): Promise<User | null> {
    setSigningIn(true);
    setAuthError(null);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      return cred.user;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Google Sign-In failed.';
      setAuthError(msg);
      return null;
    } finally {
      setSigningIn(false);
    }
  }

  async function signOut(): Promise<void> {
    setAuthError(null);
    await fbSignOut(auth);
  }

  // Strictly derived from Firestore profile document (defaulting to patient)
  const effectiveRole: UserRole | 'public' = !user
    ? 'public'
    : profile?.role || 'patient';

  const isStaff =
    Boolean(user) &&
    Boolean(profile) &&
    profile?.active !== false &&
    (effectiveRole === 'admin' ||
      effectiveRole === 'receptionist' ||
      effectiveRole === 'doctor');

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        role: effectiveRole,
        authReady,
        signingIn,
        authError,
        isStaff,
        signInWithGoogle,
        signOut,
        clearAuthError: () => setAuthError(null),
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
