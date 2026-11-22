import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  GoogleAuthProvider,
  linkWithCredential,
  linkWithPopup,
  onIdTokenChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInAnonymously,
  signInWithCredential,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as fbSignOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
} from '../lib/firebase';
import { formatUserFriendlyError } from '../lib/validation';
import type { UserProfile, UserRole } from '../types/clinic';

interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  role: UserRole | 'public';
  authReady: boolean;
  signingIn: boolean;
  authError: string | null;
  isAnonymousGuest: boolean;
  emailVerified: boolean;
  isStaff: boolean;
  ensureGuestSession: () => Promise<User>;
  signInWithGoogle: () => Promise<User | null>;
  signInWithEmail: (email: string, password: string) => Promise<User | null>;
  signUpWithEmail: (
    displayName: string,
    email: string,
    password: string
  ) => Promise<{ user: User | null; verificationSent: boolean; upgradedFromGuest: boolean }>;
  sendPasswordReset: (email: string) => Promise<void>;
  resendVerificationEmail: () => Promise<void>;
  refreshUser: () => Promise<boolean>;
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
  const anonInFlightRef = useRef<Promise<User> | null>(null);

  useEffect(() => {
    let unsubProfile: (() => void) | null = null;
    let cancelled = false;
    let activeSyncedUid: string | null = null;
    let activeWasAnon: boolean | null = null;

    const unsubAuth = onIdTokenChanged(auth, async (fbUser) => {
      // Update user snapshot reference so emailVerified / isAnonymous / email changes reflect immediately
      setUser(fbUser ? (Object.assign(Object.create(Object.getPrototypeOf(fbUser)), fbUser) as User) : null);

      if (!fbUser) {
        if (unsubProfile) {
          unsubProfile();
          unsubProfile = null;
        }
        activeSyncedUid = null;
        activeWasAnon = null;
        setProfile(null);
        setAuthReady(true);
        return;
      }

      // Anonymous guest sessions do not get a /users/{uid} record
      if (fbUser.isAnonymous) {
        if (unsubProfile) {
          unsubProfile();
          unsubProfile = null;
        }
        activeSyncedUid = fbUser.uid;
        activeWasAnon = true;
        setProfile(null);
        setAuthReady(true);
        return;
      }

      // Skip redundant Firestore re-subscription when the same non-anonymous user just refreshed token
      if (activeSyncedUid === fbUser.uid && activeWasAnon === false && unsubProfile) {
        setAuthReady(true);
        return;
      }

      if (unsubProfile) {
        unsubProfile();
        unsubProfile = null;
      }
      activeSyncedUid = fbUser.uid;
      activeWasAnon = false;
      setAuthReady(false);

      const userPath = `users/${fbUser.uid}`;
      const userRef = doc(db, 'users', fbUser.uid);

      try {
        const snap = await getDoc(userRef);
        if (!snap.exists() && fbUser.email) {
          const initialRole = await resolveInitialRoleFromServer(fbUser);
          const payload: Record<string, unknown> = {
            uid: fbUser.uid,
            email: fbUser.email.slice(0, 160),
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
        } else if (snap.exists() && fbUser.email && fbUser.emailVerified) {
          const existingProfile = snap.data() as UserProfile | undefined;
          if (existingProfile?.role === 'patient' && existingProfile.active !== false) {
            const bootstrapRole = await resolveInitialRoleFromServer(fbUser);
            if (bootstrapRole === 'admin') {
              await updateDoc(userRef, {
                role: 'admin',
                updatedAt: serverTimestamp(),
              });
            }
          }
        }
      } catch (err) {
        if (!cancelled) {
          setAuthError(formatUserFriendlyError(err, 'Unable to sync user profile.'));
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

  async function ensureGuestSession(): Promise<User> {
    if (auth.currentUser) {
      return auth.currentUser;
    }
    if (!anonInFlightRef.current) {
      anonInFlightRef.current = signInAnonymously(auth)
        .then((cred) => cred.user)
        .catch((err) => {
          const friendly = formatUserFriendlyError(
            err,
            'Could not initialize guest booking session.'
          );
          throw new Error(friendly);
        })
        .finally(() => {
          anonInFlightRef.current = null;
        });
    }
    return anonInFlightRef.current;
  }

  async function signInWithGoogle(): Promise<User | null> {
    setSigningIn(true);
    setAuthError(null);
    try {
      const current = auth.currentUser;
      if (current && current.isAnonymous) {
        try {
          const linked = await linkWithPopup(current, googleProvider);
          await linked.user.getIdToken(true);
          return linked.user;
        } catch (linkErr: unknown) {
          const code =
            linkErr && typeof linkErr === 'object' && 'code' in linkErr
              ? String((linkErr as { code: unknown }).code)
              : '';
          if (code === 'auth/credential-already-in-use') {
            const cred = GoogleAuthProvider.credentialFromError(
              linkErr as Parameters<typeof GoogleAuthProvider.credentialFromError>[0]
            );
            if (cred) {
              const signed = await signInWithCredential(auth, cred);
              return signed.user;
            }
            const signed = await signInWithPopup(auth, googleProvider);
            return signed.user;
          }
          throw linkErr;
        }
      }

      const cred = await signInWithPopup(auth, googleProvider);
      return cred.user;
    } catch (err) {
      const msg = formatUserFriendlyError(err, 'Google Sign-In failed.');
      setAuthError(msg);
      throw new Error(msg);
    } finally {
      setSigningIn(false);
    }
  }

  async function signInWithEmail(email: string, password: string): Promise<User | null> {
    setSigningIn(true);
    setAuthError(null);
    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      await cred.user.getIdToken(true);
      return cred.user;
    } catch (err) {
      const msg = formatUserFriendlyError(err, 'Email sign-in failed.');
      setAuthError(msg);
      throw new Error(msg);
    } finally {
      setSigningIn(false);
    }
  }

  async function signUpWithEmail(
    displayName: string,
    email: string,
    password: string
  ): Promise<{ user: User | null; verificationSent: boolean; upgradedFromGuest: boolean }> {
    setSigningIn(true);
    setAuthError(null);
    const cleanName = displayName.trim().slice(0, 80);
    const cleanEmail = email.trim();
    try {
      const current = auth.currentUser;
      let targetUser: User;
      let upgradedFromGuest = false;

      if (current && current.isAnonymous) {
        const credential = EmailAuthProvider.credential(cleanEmail, password);
        const linked = await linkWithCredential(current, credential);
        targetUser = linked.user;
        upgradedFromGuest = true;
      } else {
        const created = await createUserWithEmailAndPassword(auth, cleanEmail, password);
        targetUser = created.user;
      }

      if (cleanName) {
        await updateProfile(targetUser, { displayName: cleanName });
      }

      let verificationSent = false;
      try {
        await sendEmailVerification(targetUser);
        verificationSent = true;
      } catch {
        verificationSent = false;
      }

      await targetUser.getIdToken(true);
      return { user: targetUser, verificationSent, upgradedFromGuest };
    } catch (err) {
      const msg = formatUserFriendlyError(err, 'Could not create account.');
      setAuthError(msg);
      throw new Error(msg);
    } finally {
      setSigningIn(false);
    }
  }

  async function sendPasswordReset(email: string): Promise<void> {
    setSigningIn(true);
    setAuthError(null);
    try {
      await sendPasswordResetEmail(auth, email.trim());
    } catch (err) {
      const msg = formatUserFriendlyError(err, 'Unable to send password reset email.');
      setAuthError(msg);
      throw new Error(msg);
    } finally {
      setSigningIn(false);
    }
  }

  async function resendVerificationEmail(): Promise<void> {
    const current = auth.currentUser;
    if (!current || current.isAnonymous) {
      throw new Error('Sign in with an email account first.');
    }
    try {
      await sendEmailVerification(current);
    } catch (err) {
      const msg = formatUserFriendlyError(err, 'Unable to send verification email right now.');
      throw new Error(msg);
    }
  }

  async function refreshUser(): Promise<boolean> {
    const current = auth.currentUser;
    if (!current) return false;
    await current.reload();
    await current.getIdToken(true);
    setUser(Object.assign(Object.create(Object.getPrototypeOf(current)), current) as User);
    return Boolean(current.emailVerified);
  }

  async function signOut(): Promise<void> {
    setAuthError(null);
    await fbSignOut(auth);
  }

  const isAnonymousGuest = Boolean(user?.isAnonymous);
  const emailVerified = Boolean(user && !user.isAnonymous && user.emailVerified);

  const effectiveRole: UserRole | 'public' =
    !user || user.isAnonymous ? 'public' : profile?.role || 'patient';

  const isStaff =
    Boolean(user) &&
    !isAnonymousGuest &&
    emailVerified &&
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
        isAnonymousGuest,
        emailVerified,
        isStaff,
        ensureGuestSession,
        signInWithGoogle,
        signInWithEmail,
        signUpWithEmail,
        sendPasswordReset,
        resendVerificationEmail,
        refreshUser,
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
