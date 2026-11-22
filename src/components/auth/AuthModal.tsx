import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  LogIn,
  MailCheck,
  RefreshCw,
  ShieldCheck,
  UserPlus,
  X,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { formatUserFriendlyError } from '../../lib/validation';

export type AuthModalMode = 'signin' | 'signup' | 'reset';

interface AuthModalProps {
  open: boolean;
  initialMode?: AuthModalMode;
  heading?: string;
  description?: string;
  onClose: () => void;
  onToast: (msg: string) => void;
}

export function AuthModal({
  open,
  initialMode = 'signin',
  heading,
  description,
  onClose,
  onToast,
}: AuthModalProps) {
  const {
    user,
    isAnonymousGuest,
    emailVerified,
    signingIn,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    sendPasswordReset,
    resendVerificationEmail,
    refreshUser,
  } = useAuth();

  const [mode, setMode] = useState<AuthModalMode>(initialMode);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMode(initialMode);
    setErrorMsg(null);
    setInfoMsg(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, initialMode, onClose]);

  if (!open) return null;

  const isPermanentUnverified = Boolean(user && !isAnonymousGuest && !emailVerified);

  async function handleGoogle() {
    setErrorMsg(null);
    setInfoMsg(null);
    setBusy(true);
    try {
      const signed = await signInWithGoogle();
      if (signed) {
        onToast(`Signed in as ${signed.email || signed.displayName || 'patient'}.`);
        onClose();
      }
    } catch (err) {
      setErrorMsg(formatUserFriendlyError(err, 'Google sign-in failed.'));
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setInfoMsg(null);

    const cleanEmail = email.trim();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }

    if (mode === 'reset') {
      setBusy(true);
      try {
        await sendPasswordReset(cleanEmail);
        setInfoMsg('Password reset instructions were sent if an account exists for that email.');
        onToast('Password reset email dispatched.');
      } catch (err) {
        setErrorMsg(formatUserFriendlyError(err, 'Unable to send reset email.'));
      } finally {
        setBusy(false);
      }
      return;
    }

    if (password.length < 6) {
      setErrorMsg('Password must be at least 6 characters.');
      return;
    }

    if (mode === 'signup') {
      const cleanName = fullName.trim();
      if (cleanName.length < 2 || /\d/.test(cleanName)) {
        setErrorMsg('Please enter your full name (2+ characters, no digits).');
        return;
      }
      setBusy(true);
      try {
        const result = await signUpWithEmail(cleanName, cleanEmail, password);
        if (result.user) {
          onToast(
            result.upgradedFromGuest
              ? 'Guest visits linked to your new account!'
              : 'Account created!'
          );
          if (result.verificationSent) {
            setInfoMsg(
              `Verification link sent to ${cleanEmail}. Please verify your email address before accessing verified-only actions.`
            );
          } else {
            onClose();
          }
        }
      } catch (err) {
        setErrorMsg(formatUserFriendlyError(err, 'Sign-up failed.'));
      } finally {
        setBusy(false);
      }
      return;
    }

    setBusy(true);
    try {
      const signed = await signInWithEmail(cleanEmail, password);
      if (signed) {
        onToast(`Welcome back, ${signed.displayName || signed.email}!`);
        if (signed.emailVerified) {
          onClose();
        } else {
          setInfoMsg('Signed in. Your email is not verified yet — check your inbox or resend below.');
        }
      }
    } catch (err) {
      setErrorMsg(formatUserFriendlyError(err, 'Invalid email or password.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="FourClinic Account Authentication"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 bg-[#102E34]/65 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
    >
      <div className="bg-white border border-[#D8DFD9] rounded-lg max-w-md w-full p-6 sm:p-7 shadow-2xl space-y-5 my-auto">
        <div className="flex items-start justify-between gap-3 pb-4 border-b border-[#E6EAE4]">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#426F77]">
              FourClinic Account
            </p>
            <h2 className="mt-1 font-editorial text-3xl text-[#102E34] leading-tight">
              {heading ||
                (isPermanentUnverified
                  ? 'Verify your email'
                  : mode === 'signup'
                    ? 'Create patient account'
                    : mode === 'reset'
                      ? 'Reset your password'
                      : 'Sign in to FourClinic')}
            </h2>
            <p className="mt-1.5 text-xs text-[#3B5257] leading-relaxed">
              {description ||
                (isAnonymousGuest
                  ? 'You currently have an active guest session. Creating an account or linking Google saves bookings across devices.'
                  : 'Access personal visit records, reschedule appointments, or open authorized staff workspaces.')}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close authentication modal"
            onClick={onClose}
            className="p-2 rounded-md border border-[#D8DFD9] bg-[#F7F5F0] text-[#3B5257] hover:text-[#102E34] cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {isPermanentUnverified ? (
          <div className="space-y-4">
            <div className="p-4 rounded-md bg-[#FCF4E6] border border-[#E8CFA1] text-xs text-[#8F5310] space-y-1.5">
              <div className="flex items-center gap-2 font-bold">
                <MailCheck className="w-4 h-4" />
                <span>Verification pending for {user?.email}</span>
              </div>
              <p>Click the verification link sent to your inbox, then refresh your status below.</p>
            </div>

            {errorMsg && (
              <p role="alert" className="text-xs font-semibold text-[#A12A2A]">
                {errorMsg}
              </p>
            )}
            {infoMsg && (
              <p className="text-xs font-semibold text-[#1E6B4B] bg-[#E6F2EC] border border-[#B8DEC9] rounded-md p-3">
                {infoMsg}
              </p>
            )}

            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setErrorMsg(null);
                  try {
                    const verified = await refreshUser();
                    if (verified) {
                      onToast('Email verified! Full access unlocked.');
                      onClose();
                    } else {
                      setInfoMsg(
                        'Not verified yet. Please click the link inside your verification email.'
                      );
                    }
                  } catch (err) {
                    setErrorMsg(formatUserFriendlyError(err));
                  } finally {
                    setBusy(false);
                  }
                }}
                className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-md bg-[#102E34] text-[#F7F5F0] text-sm font-semibold hover:bg-[#194149] disabled:opacity-60 cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                <span>I&apos;ve verified — Refresh Status</span>
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setErrorMsg(null);
                  try {
                    await resendVerificationEmail();
                    setInfoMsg(`New verification email sent to ${user?.email}.`);
                  } catch (err) {
                    setErrorMsg(formatUserFriendlyError(err));
                  } finally {
                    setBusy(false);
                  }
                }}
                className="w-full py-2.5 rounded-md border border-[#D8DFD9] bg-[#F7F5F0] text-xs font-semibold text-[#102E34] hover:border-[#426F77] disabled:opacity-60 cursor-pointer"
              >
                Resend Verification Email
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-1 bg-[#F7F5F0] p-1 rounded-md border border-[#D8DFD9] text-xs font-semibold">
              <button
                type="button"
                onClick={() => {
                  setMode('signin');
                  setErrorMsg(null);
                  setInfoMsg(null);
                }}
                className={`py-2 rounded-sm transition cursor-pointer ${
                  mode === 'signin'
                    ? 'bg-white text-[#102E34] border border-[#D8DFD9]'
                    : 'text-[#5B7074] hover:text-[#102E34]'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('signup');
                  setErrorMsg(null);
                  setInfoMsg(null);
                }}
                className={`py-2 rounded-sm transition cursor-pointer ${
                  mode === 'signup'
                    ? 'bg-white text-[#102E34] border border-[#D8DFD9]'
                    : 'text-[#5B7074] hover:text-[#102E34]'
                }`}
              >
                Sign Up
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('reset');
                  setErrorMsg(null);
                  setInfoMsg(null);
                }}
                className={`py-2 rounded-sm transition cursor-pointer ${
                  mode === 'reset'
                    ? 'bg-white text-[#102E34] border border-[#D8DFD9]'
                    : 'text-[#5B7074] hover:text-[#102E34]'
                }`}
              >
                Reset
              </button>
            </div>

            {mode !== 'reset' && (
              <>
                <button
                  type="button"
                  disabled={busy || signingIn}
                  onClick={() => void handleGoogle()}
                  className="w-full inline-flex items-center justify-center gap-2.5 py-3 rounded-md border border-[#D8DFD9] bg-[#F7F5F0] text-sm font-semibold text-[#102E34] hover:border-[#102E34] transition disabled:opacity-60 cursor-pointer"
                >
                  <ShieldCheck className="w-4 h-4 text-[#426F77]" />
                  <span>
                    {isAnonymousGuest ? 'Continue & Link with Google' : 'Continue with Google'}
                  </span>
                </button>

                <div className="flex items-center gap-3 text-[11px] font-semibold text-[#5B7074] uppercase tracking-wider">
                  <span className="flex-1 h-px bg-[#E6EAE4]" />
                  <span>or email &amp; password</span>
                  <span className="flex-1 h-px bg-[#E6EAE4]" />
                </div>
              </>
            )}

            <form onSubmit={handleSubmit} noValidate className="space-y-3.5">
              {mode === 'signup' && (
                <label className="block">
                  <span className="block text-xs font-semibold text-[#3B5257] mb-1.5">
                    Full name
                  </span>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    maxLength={80}
                    placeholder="e.g. Jordan Rivera"
                    autoComplete="name"
                    className="w-full min-h-[44px] px-3.5 py-2.5 rounded-md border border-[#D8DFD9] bg-[#F7F5F0]/60 text-sm text-[#102E34] focus:bg-white focus:border-[#102E34]"
                  />
                </label>
              )}

              <label className="block">
                <span className="block text-xs font-semibold text-[#3B5257] mb-1.5">
                  Email address
                </span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  maxLength={160}
                  placeholder="you@example.com"
                  autoComplete="email"
                  className="w-full min-h-[44px] px-3.5 py-2.5 rounded-md border border-[#D8DFD9] bg-[#F7F5F0]/60 text-sm text-[#102E34] focus:bg-white focus:border-[#102E34]"
                />
              </label>

              {mode !== 'reset' && (
                <label className="block">
                  <span className="block text-xs font-semibold text-[#3B5257] mb-1.5">
                    Password
                  </span>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      maxLength={128}
                      placeholder="At least 6 characters"
                      autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                      className="w-full min-h-[44px] pl-3.5 pr-10 py-2.5 rounded-md border border-[#D8DFD9] bg-[#F7F5F0]/60 text-sm text-[#102E34] focus:bg-white focus:border-[#102E34]"
                    />
                    <button
                      type="button"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-[#5B7074] hover:text-[#102E34] cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </label>
              )}

              {errorMsg && (
                <p
                  role="alert"
                  className="text-xs font-semibold text-[#A12A2A] bg-[#FBECEC] border border-[#E8BABA] rounded-md p-3"
                >
                  {errorMsg}
                </p>
              )}

              {infoMsg && (
                <div className="flex items-start gap-2 text-xs font-semibold text-[#1E6B4B] bg-[#E6F2EC] border border-[#B8DEC9] rounded-md p-3">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{infoMsg}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={busy || signingIn}
                className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-md bg-[#102E34] text-[#F7F5F0] text-sm font-semibold hover:bg-[#194149] disabled:opacity-60 cursor-pointer"
              >
                {mode === 'signup' ? (
                  <UserPlus className="w-4 h-4" />
                ) : mode === 'reset' ? (
                  <KeyRound className="w-4 h-4" />
                ) : (
                  <LogIn className="w-4 h-4" />
                )}
                <span>
                  {busy
                    ? 'Please wait…'
                    : mode === 'signup'
                      ? isAnonymousGuest
                        ? 'Create Account & Link Visits'
                        : 'Create Patient Account'
                      : mode === 'reset'
                        ? 'Send Reset Link'
                        : 'Sign In with Email'}
                </span>
              </button>

              {mode === 'signup' && (
                <p className="text-[11px] text-[#5B7074] text-center leading-relaxed">
                  New accounts start as standard <b>Patient</b> accounts. Clinic staff permissions
                  are assigned separately by an Administrator.
                </p>
              )}
            </form>
          </>
        )}
      </div>
    </div>
  );
}
