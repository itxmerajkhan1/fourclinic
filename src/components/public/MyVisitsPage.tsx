import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  CalendarCheck,
  Clock,
  Copy,
  Download,
  KeyRound,
  LogIn,
  MessageSquare,
  RefreshCw,
  ShieldAlert,
  UserPlus,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { downloadAppointmentIcs } from '../../lib/ics';
import {
  addDaysIso,
  formatDateLabel,
  formatTimeLabel,
  formatUserFriendlyError,
  generateAvailableSlotsForDoctor,
  getLocalGuestSecretForAppointment,
  getLocalGuestVisitSecrets,
  STATUS_LABELS,
  todayIso,
} from '../../lib/validation';
import type {
  Appointment,
  BusySlot,
  ClinicSettings,
  Doctor,
  Inquiry,
  ScheduleOverride,
  VisitLookup,
} from '../../types/clinic';

interface MyVisitsPageProps {
  doctors: Doctor[];
  schedules: ScheduleOverride[];
  slotLocks: BusySlot[];
  settings: ClinicSettings;
  availabilityVerified?: boolean;
  availabilityError?: string | null;
  onRetryAvailability?: () => void;
  myAppointments: Appointment[];
  myInquiries: Inquiry[];
  appointmentsLoading: boolean;
  onCancelAppointment: (appt: Appointment) => Promise<void>;
  onRescheduleAppointment: (
    appt: Appointment,
    newDate: string,
    newTime: string,
    doctor: Doctor
  ) => Promise<void>;
  onLookupVisitBySecret: (secret: string) => Promise<VisitLookup | null>;
  onOpenAuthModal: (mode?: 'signin' | 'signup') => void;
  onBackToBooking: () => void;
  onOpenChat: () => void;
  onToast: (msg: string) => void;
}

export function MyVisitsPage({
  doctors,
  schedules,
  slotLocks,
  settings,
  availabilityVerified = true,
  availabilityError = null,
  onRetryAvailability,
  myAppointments,
  myInquiries,
  appointmentsLoading,
  onCancelAppointment,
  onRescheduleAppointment,
  onLookupVisitBySecret,
  onOpenAuthModal,
  onBackToBooking,
  onOpenChat,
  onToast,
}: MyVisitsPageProps) {
  const { user, isAnonymousGuest, emailVerified } = useAuth();
  const activeDoctors = useMemo(() => doctors.filter((d) => d.active), [doctors]);

  const [rescheduleTarget, setRescheduleTarget] = useState<Appointment | null>(null);
  const [reschedDate, setReschedDate] = useState('');
  const [reschedTime, setReschedTime] = useState('');
  const [reschedBusy, setReschedBusy] = useState(false);
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const [trackingToken, setTrackingToken] = useState('');
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupResult, setLookupResult] = useState<VisitLookup | null>(null);

  const localGuestSecrets = useMemo(() => {
    const ownedIds = new Set(myAppointments.map((a) => a.id));
    return getLocalGuestVisitSecrets().filter((s) => !ownedIds.has(s.appointmentId));
  }, [myAppointments]);

  const minDate = todayIso();
  const maxDate = addDaysIso(minDate, settings.maxBookingDaysAhead || 60);

  const reschedDoc = rescheduleTarget
    ? activeDoctors.find((d) => d.id === rescheduleTarget.doctorId) || activeDoctors[0]
    : undefined;

  const reschedSlots = useMemo(() => {
    if (!availabilityVerified || availabilityError || !rescheduleTarget || !reschedDoc || !reschedDate) {
      return [];
    }
    return generateAvailableSlotsForDoctor({
      dateStr: reschedDate,
      doctor: reschedDoc,
      schedules,
      slotLocks,
      settings,
      serviceDurationMins: rescheduleTarget.durationMins,
      ignoreAppointmentId: rescheduleTarget.id,
      ignoreLockIds: rescheduleTarget.slotLockIds,
    });
  }, [availabilityVerified, availabilityError, rescheduleTarget, reschedDoc, reschedDate, schedules, slotLocks, settings]);

  useEffect(() => {
    if (reschedSlots.length > 0 && !reschedSlots.includes(reschedTime)) {
      setReschedTime(reschedSlots[0]);
    } else if (reschedSlots.length === 0 && reschedTime !== '') {
      setReschedTime('');
    }
  }, [reschedSlots, reschedTime]);

  async function submitReschedule(e: React.FormEvent) {
    e.preventDefault();
    if (availabilityError || !availabilityVerified) {
      onToast(
        availabilityError ||
          'Live slot availability could not be verified. Rescheduling is blocked.'
      );
      return;
    }
    if (!rescheduleTarget || !reschedDoc || !reschedDate || !reschedTime) return;
    setReschedBusy(true);
    try {
      await onRescheduleAppointment(rescheduleTarget, reschedDate, reschedTime, reschedDoc);
      onToast(
        `Rescheduled ${rescheduleTarget.referenceCode} to ${formatDateLabel(reschedDate)} at ${formatTimeLabel(reschedTime)}.`
      );
      setRescheduleTarget(null);
    } catch (err) {
      onToast(formatUserFriendlyError(err, 'Unable to reschedule appointment.'));
    } finally {
      setReschedBusy(false);
    }
  }

  async function runTrackingLookup(secretValue: string) {
    setLookupError(null);
    setLookupResult(null);
    setLookupBusy(true);
    try {
      const found = await onLookupVisitBySecret(secretValue);
      if (!found) {
        setLookupError(
          'No booking matched that private tracking code. Please verify every character of your FCV-... token.'
        );
      } else {
        setLookupResult(found);
      }
    } catch (err) {
      setLookupError(formatUserFriendlyError(err, 'Unable to look up tracking code.'));
    } finally {
      setLookupBusy(false);
    }
  }

  function handleGuestTrackSubmit(e: React.FormEvent) {
    e.preventDefault();
    void runTrackingLookup(trackingToken);
  }

  const badgeStyleFor = (status: Appointment['status']) =>
    status === 'confirmed'
      ? 'bg-[#E6F2EC] text-[#1E6B4B] border-[#B8DEC9]'
      : status === 'pending'
        ? 'bg-[#FCF4E6] text-[#9A5B13] border-[#E8CFA1]'
        : status === 'completed'
          ? 'bg-[#DCE8E3] text-[#102E34] border-[#B9CEC5]'
          : 'bg-[#FBECEC] text-[#A12A2A] border-[#E8BABA]';

  return (
    <section className="max-w-5xl mx-auto px-4 sm:px-8 lg:px-12 py-10 sm:py-14 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-6 border-b border-[#D8DFD9]">
        <div>
          <button
            type="button"
            onClick={onBackToBooking}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#426F77] hover:text-[#102E34] mb-3 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to clinic home</span>
          </button>
          <h1 className="font-editorial text-4xl sm:text-[52px] text-[#102E34] leading-none">
            My Visits
          </h1>
          <p className="mt-2.5 text-sm text-[#3B5257] max-w-xl leading-relaxed">
            Review booking references, assigned dentists, and live clinic status, or reschedule and
            cancel active requests.
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onBackToBooking}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-md bg-[#102E34] text-[#F7F5F0] text-xs font-semibold hover:bg-[#194149] transition cursor-pointer"
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Book New Visit</span>
          </button>
          <button
            type="button"
            onClick={onOpenChat}
            className="px-4 py-2.5 rounded-md border border-[#D8DFD9] bg-white text-xs font-semibold text-[#102E34] hover:border-[#426F77] transition cursor-pointer"
          >
            Ask AI Receptionist
          </button>
        </div>
      </div>

      {availabilityError && (
        <div
          role="alert"
          className="p-4 rounded-lg bg-[#FBECEC] border border-[#E8BABA] flex flex-wrap items-center justify-between gap-3 text-xs text-[#A12A2A]"
        >
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <b className="block">Live availability unavailable — rescheduling paused</b>
              <span>{availabilityError}</span>
            </div>
          </div>
          {onRetryAvailability && (
            <button
              type="button"
              onClick={onRetryAvailability}
              className="px-3.5 py-1.5 rounded-md bg-white border border-[#E8BABA] text-[#A12A2A] font-semibold hover:bg-[#F7F5F0] cursor-pointer shrink-0"
            >
              Retry check
            </button>
          )}
        </div>
      )}

      {/* Email Verification Reminder */}
      {user && !isAnonymousGuest && !emailVerified && (
        <div className="p-4 rounded-lg bg-[#FCF4E6] border border-[#E8CFA1] flex flex-wrap items-center justify-between gap-3 text-xs text-[#8F5310]">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              <b>Verify your email ({user.email})</b> to secure your account and unlock verified
              status.
            </span>
          </div>
          <button
            type="button"
            onClick={() => onOpenAuthModal('signin')}
            className="px-4 py-1.5 rounded-md bg-[#8F5310] text-white font-semibold cursor-pointer"
          >
            Verify Email
          </button>
        </div>
      )}

      {/* Anonymous Guest Browser Session Notice */}
      {user && isAnonymousGuest && (
        <div className="p-5 rounded-lg bg-[#DCE8E3]/60 border border-[#D8DFD9] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm font-bold text-[#102E34]">
              <ShieldAlert className="w-4 h-4 text-[#426F77]" />
              <span>Active Guest Session</span>
            </div>
            <p className="text-xs text-[#3B5257] leading-relaxed max-w-2xl">
              Guest bookings are tied to this browser session. Save your{' '}
              <b>Private Tracking Code</b> or link an email/Google account to retain cross-device
              access.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onOpenAuthModal('signup')}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-[#102E34] text-[#F7F5F0] text-xs font-semibold hover:bg-[#194149] cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Save Guest Visits to Account</span>
            </button>
            <button
              type="button"
              onClick={() => onOpenAuthModal('signin')}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-white border border-[#D8DFD9] text-xs font-semibold text-[#102E34] hover:border-[#426F77] cursor-pointer"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Sign in</span>
            </button>
          </div>
        </div>
      )}

      {/* Owned Session / Account Appointments */}
      {user ? (
        <div className="bg-white border border-[#D8DFD9] rounded-lg p-6 sm:p-8 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E6EAE4] pb-4">
            <div className="flex items-center gap-2.5">
              <CalendarCheck className="w-5 h-5 text-[#426F77]" />
              <h2 className="text-lg font-bold text-[#102E34] fc-tabular">
                {isAnonymousGuest ? 'Guest Session Appointments' : 'Your Account Appointments'} (
                {myAppointments.length})
              </h2>
            </div>
            <span className="text-xs font-medium text-[#5B7074]">
              {isAnonymousGuest ? 'Anonymous Guest Session' : user.email}
            </span>
          </div>

          {appointmentsLoading ? (
            <div className="py-8 text-center text-sm text-[#5B7074]">
              Loading your live appointment records…
            </div>
          ) : myAppointments.length === 0 ? (
            <div className="py-8 text-center space-y-3">
              <p className="text-sm text-[#3B5257]">
                No appointments found under this {isAnonymousGuest ? 'guest session' : 'account'}{' '}
                yet.
              </p>
              <button
                type="button"
                onClick={onBackToBooking}
                className="px-5 py-2.5 rounded-md bg-[#102E34] text-[#F7F5F0] text-xs font-semibold hover:bg-[#194149] cursor-pointer"
              >
                Request an Appointment
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {myAppointments.map((appt) => {
                const canModify = appt.status === 'pending' || appt.status === 'confirmed';
                const localSecret = getLocalGuestSecretForAppointment(appt.id);

                return (
                  <div
                    key={appt.id}
                    className="p-4 sm:p-5 rounded-md border border-[#D8DFD9] bg-[#F7F5F0]/55 space-y-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <b className="text-base font-bold text-[#102E34] fc-tabular">
                          {appt.referenceCode} · {appt.serviceName}
                        </b>
                        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#3B5257] fc-tabular">
                          <span>{formatDateLabel(appt.date)}</span>
                          <span className="inline-flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-[#426F77]" />
                            {formatTimeLabel(appt.time)} ({appt.durationMins} mins)
                          </span>
                          <span>{appt.doctorName}</span>
                        </div>
                      </div>
                      <span
                        className={`px-2.5 py-1 rounded-sm border text-[11px] font-bold uppercase tracking-wide ${badgeStyleFor(
                          appt.status
                        )}`}
                      >
                        {STATUS_LABELS[appt.status]}
                      </span>
                    </div>

                    {appt.notes && <p className="text-xs text-[#5B7074]">Notes: {appt.notes}</p>}
                    {appt.staffNotes && (
                      <p className="text-xs font-medium text-[#102E34] bg-[#DCE8E3]/60 border border-[#D8DFD9] px-3 py-2 rounded-sm">
                        Clinic update: {appt.staffNotes}
                      </p>
                    )}

                    {localSecret && (
                      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-sm bg-white border border-[#D8DFD9] text-xs">
                        <span className="text-[#5B7074]">
                          Tracking code:{' '}
                          <code className="font-mono font-bold text-[#102E34] select-all">
                            {localSecret}
                          </code>
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            void navigator.clipboard?.writeText(localSecret);
                            onToast('Tracking code copied.');
                          }}
                          className="inline-flex items-center gap-1 text-[#426F77] font-semibold hover:text-[#102E34] cursor-pointer"
                        >
                          <Copy className="w-3 h-3" />
                          <span>Copy</span>
                        </button>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => downloadAppointmentIcs(appt, settings.address)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white border border-[#D8DFD9] text-xs font-semibold text-[#102E34] hover:border-[#426F77] cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Add to calendar (.ics)</span>
                      </button>

                      {canModify && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setRescheduleTarget(appt);
                              setReschedDate(appt.date);
                              setReschedTime('');
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white border border-[#D8DFD9] text-xs font-semibold text-[#426F77] hover:border-[#102E34] cursor-pointer"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            <span>Reschedule</span>
                          </button>

                          {confirmCancelId === appt.id ? (
                            <div className="inline-flex items-center gap-1.5 bg-[#FBECEC] border border-[#E8BABA] rounded-md px-3 py-1">
                              <span className="text-xs font-bold text-[#A12A2A]">
                                Cancel visit?
                              </span>
                              <button
                                type="button"
                                disabled={cancellingId === appt.id}
                                onClick={async () => {
                                  setCancellingId(appt.id);
                                  try {
                                    await onCancelAppointment(appt);
                                    setConfirmCancelId(null);
                                    onToast(
                                      `Appointment ${appt.referenceCode} cancelled and slot released.`
                                    );
                                  } catch (err) {
                                    onToast(formatUserFriendlyError(err, 'Cancel failed.'));
                                  } finally {
                                    setCancellingId(null);
                                  }
                                }}
                                className="px-2.5 py-0.5 rounded-sm bg-[#A12A2A] text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                              >
                                {cancellingId === appt.id ? '…' : 'Confirm'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmCancelId(null)}
                                className="px-2.5 py-0.5 rounded-sm bg-white border border-[#D8DFD9] text-xs font-semibold text-[#3B5257] cursor-pointer"
                              >
                                Keep
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmCancelId(appt.id)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white border border-[#E8BABA] text-xs font-semibold text-[#A12A2A] hover:bg-[#FBECEC] cursor-pointer"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              <span>Cancel</span>
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {rescheduleTarget && (
            <form
              onSubmit={submitReschedule}
              className="p-5 rounded-md bg-[#F7F5F0] border border-[#D8DFD9] space-y-3"
            >
              <div className="flex items-center justify-between">
                <b className="text-sm font-bold text-[#102E34]">
                  Reschedule {rescheduleTarget.referenceCode} ({rescheduleTarget.doctorName})
                </b>
                <button
                  type="button"
                  onClick={() => setRescheduleTarget(null)}
                  className="text-xs font-semibold text-[#5B7074] hover:text-[#102E34] cursor-pointer"
                >
                  Close
                </button>
              </div>
              {availabilityError && (
                <p
                  role="alert"
                  className="text-xs font-semibold text-[#A12A2A] bg-[#FBECEC] border border-[#E8BABA] rounded-md p-3"
                >
                  {availabilityError}
                </p>
              )}
              <div className="grid sm:grid-cols-2 gap-3">
                <input
                  type="date"
                  min={minDate}
                  max={maxDate}
                  value={reschedDate}
                  onChange={(e) => {
                    setReschedDate(e.target.value);
                    setReschedTime('');
                  }}
                  className="min-h-[44px] px-3.5 py-2.5 rounded-md border border-[#D8DFD9] bg-white text-sm font-medium focus:border-[#102E34]"
                />
                <select
                  value={reschedTime}
                  disabled={!availabilityVerified || Boolean(availabilityError)}
                  onChange={(e) => setReschedTime(e.target.value)}
                  className="min-h-[44px] px-3.5 py-2.5 rounded-md border border-[#D8DFD9] bg-white text-sm font-medium focus:border-[#102E34] fc-tabular disabled:opacity-60"
                >
                  {reschedSlots.length === 0 ? (
                    <option value="">
                      {availabilityError
                        ? 'Availability unavailable'
                        : !availabilityVerified
                          ? 'Checking live availability…'
                          : 'No free slots on this date'}
                    </option>
                  ) : (
                    reschedSlots.map((t) => (
                      <option key={t} value={t}>
                        {formatTimeLabel(t)}
                      </option>
                    ))
                  )}
                </select>
              </div>
              <button
                type="submit"
                disabled={
                  reschedBusy ||
                  !reschedTime ||
                  !availabilityVerified ||
                  Boolean(availabilityError)
                }
                className="w-full py-3 rounded-md bg-[#102E34] text-[#F7F5F0] text-sm font-semibold hover:bg-[#194149] disabled:opacity-50 cursor-pointer"
              >
                {reschedBusy
                  ? 'Updating slot…'
                  : availabilityError
                    ? 'Rescheduling Blocked — Availability Unverified'
                    : 'Confirm New Time'}
              </button>
            </form>
          )}
        </div>
      ) : (
        <div className="bg-white border border-[#D8DFD9] rounded-lg p-6 sm:p-7 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-[#102E34]">
              <LogIn className="w-5 h-5 text-[#426F77]" />
              <h2 className="text-lg font-bold">Signed-In Patient Portal</h2>
            </div>
            <p className="text-sm text-[#3B5257] max-w-xl">
              Sign in with Google or Email &amp; Password to view, reschedule, or cancel
              appointments saved to your account.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onOpenAuthModal('signin')}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-md bg-[#102E34] text-[#F7F5F0] text-xs sm:text-sm font-semibold hover:bg-[#194149] cursor-pointer"
            >
              <LogIn className="w-4 h-4" />
              <span>Sign in</span>
            </button>
            <button
              type="button"
              onClick={() => onOpenAuthModal('signup')}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-md border border-[#D8DFD9] bg-[#F7F5F0] text-[#102E34] text-xs sm:text-sm font-semibold hover:border-[#426F77] cursor-pointer"
            >
              <UserPlus className="w-4 h-4 text-[#426F77]" />
              <span>Create Account</span>
            </button>
          </div>
        </div>
      )}

      {/* Cross-Device Private Tracking Code Lookup */}
      <form
        onSubmit={handleGuestTrackSubmit}
        className="bg-white border border-[#D8DFD9] rounded-lg p-6 sm:p-7 space-y-4"
      >
        <div className="flex items-center gap-2 text-[#102E34]">
          <KeyRound className="w-5 h-5 text-[#426F77]" />
          <h2 className="text-lg font-bold">Track a Guest Visit by Private Code</h2>
        </div>
        <p className="text-xs text-[#3B5257] leading-relaxed flex items-start gap-2">
          <ShieldAlert className="w-4 h-4 text-[#426F77] shrink-0 mt-0.5" />
          <span>
            Look up live booking status across devices using your non-guessable{' '}
            <b>Private Tracking Code</b> (e.g. <code>FCV-...</code>). Sequential references like{' '}
            <code>FC-1001</code> alone cannot expose patient records.
          </span>
        </p>

        {localGuestSecrets.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-semibold text-[#5B7074]">Recent codes on this browser:</span>
            {localGuestSecrets.slice(0, 4).map((item) => (
              <button
                key={item.appointmentId}
                type="button"
                onClick={() => {
                  setTrackingToken(item.secret);
                  void runTrackingLookup(item.secret);
                }}
                className="px-3 py-1 rounded-sm bg-[#F7F5F0] border border-[#D8DFD9] text-[#102E34] font-semibold hover:border-[#426F77] cursor-pointer fc-tabular"
              >
                {item.referenceCode} ({item.date})
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-2.5">
          <input
            type="text"
            value={trackingToken}
            onChange={(e) => setTrackingToken(e.target.value)}
            placeholder="Paste Private Tracking Code (FCV-XXXXXX-XXXXXX-XXXXXX-XXXXXX)"
            className="flex-1 min-h-[44px] px-3.5 py-2.5 rounded-md border border-[#D8DFD9] bg-[#F7F5F0]/60 text-sm font-mono text-[#102E34] focus:bg-white focus:border-[#102E34]"
          />
          <button
            type="submit"
            disabled={lookupBusy || !trackingToken.trim()}
            className="px-6 py-3 rounded-md bg-[#102E34] text-[#F7F5F0] text-sm font-semibold hover:bg-[#194149] disabled:opacity-50 transition cursor-pointer shrink-0"
          >
            {lookupBusy ? 'Checking…' : 'Check Live Status'}
          </button>
        </div>

        {lookupError && (
          <p
            role="alert"
            className="text-xs font-semibold text-[#8F5310] bg-[#FCF4E6] border border-[#E8CFA1] rounded-md p-3"
          >
            {lookupError}
          </p>
        )}

        {lookupResult && (
          <div className="p-4 sm:p-5 rounded-md border border-[#B8DEC9] bg-[#E6F2EC] space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <b className="text-base font-bold text-[#102E34] fc-tabular">
                {lookupResult.referenceCode} · {lookupResult.serviceName}
              </b>
              <span
                className={`px-2.5 py-0.5 rounded-sm border text-[11px] font-bold uppercase ${badgeStyleFor(
                  lookupResult.status
                )}`}
              >
                {STATUS_LABELS[lookupResult.status]}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#3B5257] fc-tabular">
              <span>{formatDateLabel(lookupResult.date)}</span>
              <span className="inline-flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-[#426F77]" />
                {formatTimeLabel(lookupResult.time)} ({lookupResult.durationMins} mins)
              </span>
              <span>{lookupResult.doctorName}</span>
            </div>
            <p className="text-[11px] text-[#5B7074]">
              Non-PII status view: personal contact details remain hidden for privacy.
            </p>
          </div>
        )}
      </form>

      {/* Submitted Inquiries & Genuine Staff Replies */}
      {user && myInquiries.length > 0 && (
        <div className="bg-white border border-[#D8DFD9] rounded-lg p-6 sm:p-8 space-y-4">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-[#426F77]" />
            <h2 className="text-lg font-bold text-[#102E34] fc-tabular">
              Your Front-Desk Inquiries ({myInquiries.length})
            </h2>
          </div>
          <div className="space-y-3">
            {myInquiries.map((inq) => {
              const staffReplies = inq.messages.filter((m) => m.from === 'staff');
              return (
                <div
                  key={inq.id}
                  className="p-4 rounded-md border border-[#D8DFD9] bg-[#F7F5F0]/55 space-y-2 text-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <b className="text-sm text-[#102E34] fc-tabular">
                      {inq.referenceCode || inq.id} · Topic: {inq.topic}
                    </b>
                    <span className="px-2.5 py-0.5 rounded-sm bg-[#DCE8E3] border border-[#B9CEC5] text-[#102E34] font-bold uppercase text-[10px]">
                      {inq.status.replace('_', ' ')}
                    </span>
                  </div>
                  <p className="text-[#3B5257]">{inq.messages[0]?.text}</p>
                  {staffReplies.length > 0 ? (
                    <div className="space-y-1.5 pt-1">
                      {staffReplies.map((r, i) => (
                        <div
                          key={i}
                          className="p-2.5 rounded-sm bg-[#E6F2EC] border border-[#B8DEC9] text-[#102E34]"
                        >
                          <b className="text-[10px] text-[#1E6B4B] uppercase tracking-wider">
                            Clinic Staff Reply
                          </b>
                          <p className="mt-0.5">{r.text}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-[#5B7074] italic">
                      Queued for clinic front-desk review — no human reply logged yet.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
