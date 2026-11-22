import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarCheck,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  LogIn,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import type { BookedAppointmentResult } from '../../hooks/useAppointments';
import { downloadAppointmentIcs } from '../../lib/ics';
import {
  addDaysIso,
  formatDateLabel,
  formatTimeLabel,
  formatUserFriendlyError,
  generateAvailableSlotsForDoctor,
  getSlotsNeededForDuration,
  MAX_SLOT_LOCKS,
  STATUS_LABELS,
  todayIso,
} from '../../lib/validation';
import type {
  Appointment,
  AppointmentSource,
  BusySlot,
  ClinicSettings,
  Doctor,
  ScheduleOverride,
  ServiceItem,
} from '../../types/clinic';

interface BookingAndPatientPortalProps {
  doctors: Doctor[];
  services: ServiceItem[];
  schedules: ScheduleOverride[];
  slotLocks: BusySlot[];
  settings: ClinicSettings;
  catalogSeeded: boolean;
  catalogLoading?: boolean;
  availabilityVerified?: boolean;
  availabilityError?: string | null;
  onRetryAvailability?: () => void;
  prefillServiceId: string;
  prefillDoctorId: string;
  prefillDate: string;
  myAppointments: Appointment[];
  appointmentsLoading: boolean;
  onBookAppointment: (input: {
    patientName: string;
    patientPhone: string;
    patientEmail?: string;
    serviceId: string;
    doctorId: string;
    date: string;
    time: string;
    notes: string;
    source: AppointmentSource;
    honeypot?: string;
  }) => Promise<BookedAppointmentResult>;
  onCancelAppointment: (appt: Appointment) => Promise<void>;
  onRescheduleAppointment: (
    appt: Appointment,
    newDate: string,
    newTime: string,
    doctor: Doctor
  ) => Promise<void>;
  onOpenAuthModal: (mode?: 'signin' | 'signup') => void;
  onOpenMyVisits: () => void;
  onOpenChat: () => void;
  onToast: (msg: string) => void;
}

export function BookingAndPatientPortal({
  doctors,
  services,
  schedules,
  slotLocks,
  settings,
  catalogSeeded,
  catalogLoading = false,
  availabilityVerified = true,
  availabilityError = null,
  onRetryAvailability,
  prefillServiceId,
  prefillDoctorId,
  prefillDate,
  myAppointments,
  appointmentsLoading,
  onBookAppointment,
  onCancelAppointment,
  onRescheduleAppointment,
  onOpenAuthModal,
  onOpenMyVisits,
  onOpenChat,
  onToast,
}: BookingAndPatientPortalProps) {
  const { user, isAnonymousGuest } = useAuth();
  const activeDoctors = useMemo(() => doctors.filter((d) => d.active), [doctors]);
  const activeServices = useMemo(() => services.filter((s) => s.active), [services]);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [serviceId, setServiceId] = useState(activeServices[0]?.id || 'checkup');
  const [doctorChoice, setDoctorChoice] = useState('any');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [notes, setNotes] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [confirmedAppt, setConfirmedAppt] = useState<BookedAppointmentResult | null>(null);
  const [copiedSecret, setCopiedSecret] = useState(false);

  // Patient inline reschedule & cancel confirm state
  const [rescheduleTarget, setRescheduleTarget] = useState<Appointment | null>(null);
  const [reschedDate, setReschedDate] = useState('');
  const [reschedTime, setReschedTime] = useState('');
  const [reschedBusy, setReschedBusy] = useState(false);
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const prefilledUidRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user || user.isAnonymous) {
      prefilledUidRef.current = null;
      return;
    }
    if (prefilledUidRef.current === user.uid) return;
    prefilledUidRef.current = user.uid;
    if (user.displayName && !name) setName(user.displayName);
    if (user.email && !email) setEmail(user.email);
  }, [user, name, email]);

  useEffect(() => {
    if (prefillServiceId) setServiceId(prefillServiceId);
  }, [prefillServiceId]);

  useEffect(() => {
    if (prefillDoctorId) setDoctorChoice(prefillDoctorId);
  }, [prefillDoctorId]);

  useEffect(() => {
    if (prefillDate) setDate(prefillDate);
  }, [prefillDate]);

  const selectedService = activeServices.find((s) => s.id === serviceId) || activeServices[0];
  const serviceSlotsNeeded = selectedService
    ? getSlotsNeededForDuration(selectedService.durationMins, settings.slotDurationMins)
    : 1;
  const serviceExceedsSlotLockLimit = serviceSlotsNeeded > MAX_SLOT_LOCKS;

  // Resolve candidate doctor(s) & free slots per doctor across full service duration
  const slotOptions = useMemo(() => {
    if (!date || !availabilityVerified || availabilityError) return [];
    const durationMins = selectedService?.durationMins;
    if (doctorChoice !== 'any') {
      const docObj = activeDoctors.find((d) => d.id === doctorChoice);
      if (!docObj) return [];
      return generateAvailableSlotsForDoctor({
        dateStr: date,
        doctor: docObj,
        schedules,
        slotLocks,
        settings,
        serviceDurationMins: durationMins,
      }).map((t) => ({ time: t, doctorId: docObj.id, doctorName: docObj.name }));
    }

    const preferredDocId = selectedService?.defaultDoctorId || activeDoctors[0]?.id;
    const orderedDocs = [
      ...activeDoctors.filter((d) => d.id === preferredDocId),
      ...activeDoctors.filter((d) => d.id !== preferredDocId),
    ];

    const byTime = new Map<string, { time: string; doctorId: string; doctorName: string }>();
    orderedDocs.forEach((docObj) => {
      const slots = generateAvailableSlotsForDoctor({
        dateStr: date,
        doctor: docObj,
        schedules,
        slotLocks,
        settings,
        serviceDurationMins: durationMins,
      });
      slots.forEach((t) => {
        if (!byTime.has(t)) {
          byTime.set(t, { time: t, doctorId: docObj.id, doctorName: docObj.name });
        }
      });
    });

    return Array.from(byTime.values()).sort((a, b) => a.time.localeCompare(b.time));
  }, [date, availabilityVerified, availabilityError, doctorChoice, activeDoctors, selectedService, schedules, slotLocks, settings]);

  useEffect(() => {
    if (slotOptions.length === 0) {
      setTime('');
    } else if (!slotOptions.some((s) => s.time === time)) {
      setTime(slotOptions[0].time);
    }
  }, [slotOptions, time]);

  const minDate = todayIso();
  const maxDate = addDaysIso(minDate, settings.maxBookingDaysAhead || 60);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setErrorMsg(null);
    setConfirmedAppt(null);
    setCopiedSecret(false);

    if (availabilityError || !availabilityVerified) {
      setErrorMsg(
        availabilityError ||
          'Live slot availability is still being verified from Firestore. Booking is blocked until availability is confirmed.'
      );
      return;
    }

    const chosenSlot = slotOptions.find((s) => s.time === time);
    if (!chosenSlot) {
      setErrorMsg('Please choose an available date and time slot.');
      return;
    }

    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setErrorMsg('Please enter a valid email address or leave the email field empty.');
      return;
    }

    setSubmitting(true);
    try {
      const appt = await onBookAppointment({
        patientName: name,
        patientPhone: phone,
        patientEmail: email.trim() || undefined,
        serviceId: selectedService?.id || serviceId,
        doctorId: chosenSlot.doctorId,
        date,
        time: chosenSlot.time,
        notes,
        source: 'form',
        honeypot,
      });
      setConfirmedAppt(appt);
      setNotes('');
      onToast(
        `Request ${appt.referenceCode} saved for ${formatDateLabel(appt.date)} at ${formatTimeLabel(appt.time)}.`
      );
    } catch (err) {
      setErrorMsg(formatUserFriendlyError(err, 'Could not complete appointment booking.'));
    } finally {
      setSubmitting(false);
    }
  }

  // Reschedule slot options
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
    } else if (reschedSlots.length === 0) {
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

  const showMyVisitsCard = Boolean(user && (!isAnonymousGuest || myAppointments.length > 0));
  const selectedSlotObj = slotOptions.find((s) => s.time === time);
  const step1Done = Boolean(selectedService);
  const step2Done = Boolean(date && selectedSlotObj);
  const step3Done = Boolean(name.trim().length >= 2 && phone.trim().length >= 5);

  const steps = [
    { num: '01', title: 'Treatment & Dentist', done: step1Done },
    { num: '02', title: 'Date & Open Time', done: step2Done },
    { num: '03', title: 'Patient Details', done: step3Done },
    { num: '04', title: 'Atomic Reservation', done: Boolean(confirmedAppt) },
  ];

  const badgeStyleFor = (status: Appointment['status']) =>
    status === 'confirmed'
      ? 'bg-[#E6F2EC] text-[#1E6B4B] border-[#B8DEC9]'
      : status === 'pending'
        ? 'bg-[#FCF4E6] text-[#9A5B13] border-[#E8CFA1]'
        : status === 'completed'
          ? 'bg-[#DCE8E3] text-[#102E34] border-[#B9CEC5]'
          : 'bg-[#FBECEC] text-[#A12A2A] border-[#E8BABA]';

  return (
    <section
      id="book"
      className="scroll-mt-24 bg-[#EFECE4]/70 border-y border-[#D8DFD9] py-16 lg:py-20"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 grid lg:grid-cols-[0.88fr_1.12fr] gap-10 lg:gap-12 items-start">
        {/* Left Progression Rail & Inline My Visits */}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#426F77]">
            08 · Appointment Scheduling
          </p>
          <h2 className="mt-2 font-editorial text-4xl sm:text-[50px] text-[#102E34] leading-[1.03]">
            Reserve your <em className="italic text-[#426F77] font-normal">appointment</em>
          </h2>
          <p className="mt-3.5 text-sm sm:text-base text-[#3B5257] leading-relaxed max-w-md">
            Book directly as a guest with zero mandatory registration. Atomic Firestore slot locks
            protect your chosen time window. Prefer guidance first?{' '}
            <button
              type="button"
              onClick={onOpenChat}
              className="text-[#102E34] font-semibold underline underline-offset-4 hover:text-[#426F77] cursor-pointer"
            >
              Ask AI Receptionist
            </button>
            .
          </p>

          {/* 4-Step Visual Booking Progression */}
          <ol className="mt-7 divide-y divide-[#D8DFD9] border-y border-[#D8DFD9]">
            {steps.map((st) => (
              <li key={st.num} className="py-3.5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3.5">
                  <span
                    className={`w-6 h-6 rounded-sm text-[11px] font-mono font-bold flex items-center justify-center fc-tabular border transition-colors ${
                      st.done
                        ? 'bg-[#102E34] text-[#F7F5F0] border-[#102E34]'
                        : 'bg-white text-[#5B7074] border-[#D8DFD9]'
                    }`}
                  >
                    {st.done ? <Check className="w-3.5 h-3.5" /> : st.num}
                  </span>
                  <span
                    className={`text-sm font-semibold ${
                      st.done ? 'text-[#102E34]' : 'text-[#3B5257]'
                    }`}
                  >
                    {st.title}
                  </span>
                </div>
                <span className="text-[11px] font-mono text-[#5B7074]">
                  {st.done ? 'Ready' : 'Pending'}
                </span>
              </li>
            ))}
          </ol>

          <ul className="mt-6 space-y-2 text-xs text-[#3B5257]">
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#426F77]" />
              <span>Instant guest booking — no sign-up required</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#426F77]" />
              <span>Multi-slot transactional locks prevent double-booking</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#426F77]" />
              <span>Private cross-device tracking code &amp; .ics calendar export</span>
            </li>
          </ul>

          {/* Patient / Active Guest Session Appointment Tracker */}
          {showMyVisitsCard && (
            <div
              id="my-visits"
              className="scroll-mt-24 mt-8 bg-white border border-[#D8DFD9] rounded-lg p-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#E6EAE4]">
                <h3 className="text-sm font-bold text-[#102E34] flex items-center gap-2 fc-tabular">
                  <CalendarCheck className="w-4 h-4 text-[#426F77]" />
                  <span>My Visits ({myAppointments.length})</span>
                </h3>
                <button
                  type="button"
                  onClick={onOpenMyVisits}
                  className="text-xs font-semibold text-[#426F77] hover:text-[#102E34] underline underline-offset-4 cursor-pointer"
                >
                  Open full portal →
                </button>
              </div>

              {isAnonymousGuest && (
                <div className="mt-3 p-3 rounded-md bg-[#FCF4E6] border border-[#E8CFA1] flex flex-wrap items-center justify-between gap-2 text-xs text-[#8F5310]">
                  <span>
                    <b>Guest session:</b> Save these visits permanently to an account.
                  </span>
                  <button
                    type="button"
                    onClick={() => onOpenAuthModal('signup')}
                    className="px-3 py-1 rounded-sm bg-[#102E34] text-[#F7F5F0] text-[11px] font-semibold cursor-pointer"
                  >
                    Save to account
                  </button>
                </div>
              )}

              {appointmentsLoading ? (
                <p className="mt-4 text-xs text-[#5B7074]">Loading your appointments…</p>
              ) : myAppointments.length === 0 ? (
                <p className="mt-4 text-xs text-[#5B7074]">
                  No bookings under your account yet. Submit the form to request a visit.
                </p>
              ) : (
                <div className="mt-4 space-y-3 max-h-[340px] overflow-y-auto pr-1">
                  {myAppointments.map((appt) => {
                    const canModify = appt.status === 'pending' || appt.status === 'confirmed';

                    return (
                      <div
                        key={appt.id}
                        className="p-3.5 rounded-md border border-[#D8DFD9] bg-[#F7F5F0]/55 text-xs space-y-1.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-[#102E34] fc-tabular">
                            {appt.referenceCode} · {appt.serviceName}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-sm border text-[10px] font-bold uppercase tracking-wide ${badgeStyleFor(
                              appt.status
                            )}`}
                          >
                            {STATUS_LABELS[appt.status]}
                          </span>
                        </div>
                        <p className="text-[#3B5257] fc-tabular">
                          {formatDateLabel(appt.date)} at {formatTimeLabel(appt.time)} ·{' '}
                          {appt.doctorName}
                        </p>
                        {appt.staffNotes && (
                          <p className="text-[#426F77] font-medium">
                            Clinic note: {appt.staffNotes}
                          </p>
                        )}
                        <div className="pt-1.5 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => downloadAppointmentIcs(appt, settings.address)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-sm bg-white border border-[#D8DFD9] text-[11px] font-semibold text-[#102E34] hover:border-[#426F77] cursor-pointer"
                          >
                            <Download className="w-3 h-3" />
                            <span>Calendar (.ics)</span>
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
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-sm bg-white border border-[#D8DFD9] text-[11px] font-semibold text-[#426F77] hover:border-[#102E34] cursor-pointer"
                              >
                                <RefreshCw className="w-3 h-3" />
                                <span>Reschedule</span>
                              </button>
                              {confirmCancelId === appt.id ? (
                                <div className="inline-flex items-center gap-1.5 bg-[#FBECEC] border border-[#E8BABA] rounded-sm px-2 py-0.5">
                                  <span className="text-[11px] font-semibold text-[#A12A2A]">
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
                                          `Appointment ${appt.referenceCode} cancelled & slot released.`
                                        );
                                      } catch (err) {
                                        onToast(formatUserFriendlyError(err, 'Cancel failed.'));
                                      } finally {
                                        setCancellingId(null);
                                      }
                                    }}
                                    className="px-2 py-0.5 rounded-sm bg-[#A12A2A] text-white text-[10px] font-bold cursor-pointer disabled:opacity-50"
                                  >
                                    {cancellingId === appt.id ? '…' : 'Yes'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmCancelId(null)}
                                    className="px-2 py-0.5 rounded-sm bg-white border border-[#D8DFD9] text-[10px] font-semibold text-[#3B5257] cursor-pointer"
                                  >
                                    Keep
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmCancelId(appt.id)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-sm bg-white border border-[#E8BABA] text-[11px] font-semibold text-[#A12A2A] hover:bg-[#FBECEC] cursor-pointer"
                                >
                                  <XCircle className="w-3 h-3" />
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
                  className="mt-4 p-4 rounded-md bg-[#F7F5F0] border border-[#D8DFD9] space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <b className="text-xs font-bold text-[#102E34]">
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
                      className="text-xs font-semibold text-[#A12A2A] bg-[#FBECEC] border border-[#E8BABA] rounded-md p-2.5"
                    >
                      {availabilityError}
                    </p>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="date"
                      min={minDate}
                      max={maxDate}
                      value={reschedDate}
                      onChange={(e) => setReschedDate(e.target.value)}
                      className="min-h-[40px] px-3 py-2 rounded-md border border-[#D8DFD9] bg-white text-xs font-medium"
                    />
                    <select
                      value={reschedTime}
                      disabled={!availabilityVerified || Boolean(availabilityError)}
                      onChange={(e) => setReschedTime(e.target.value)}
                      className="min-h-[40px] px-3 py-2 rounded-md border border-[#D8DFD9] bg-white text-xs font-medium disabled:opacity-60"
                    >
                      {reschedSlots.length === 0 ? (
                        <option value="">
                          {availabilityError
                            ? 'Availability unavailable'
                            : !availabilityVerified
                              ? 'Checking availability…'
                              : 'No free slots'}
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
                    className="w-full py-2 rounded-md bg-[#102E34] text-[#F7F5F0] text-xs font-semibold hover:bg-[#194149] disabled:opacity-50 cursor-pointer"
                  >
                    {reschedBusy ? 'Updating slot…' : 'Confirm New Time'}
                  </button>
                </form>
              )}
            </div>
          )}
        </div>

        {/* Structured Booking Form Surface */}
        <form
          onSubmit={handleSubmit}
          noValidate
          className="bg-white rounded-lg p-6 sm:p-8 border border-[#D8DFD9] space-y-6"
        >
          {/* Anti-spam honeypot */}
          <div className="sr-only" aria-hidden="true">
            <label>
              Leave this field empty
              <input
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={honeypot}
                onChange={(e) => setHoneypot(e.target.value)}
              />
            </label>
          </div>

          {(!user || isAnonymousGuest) && (
            <div className="p-3.5 rounded-md bg-[#F7F5F0] border border-[#D8DFD9] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-[#426F77] shrink-0 mt-0.5" />
                <div className="text-xs text-[#3B5257]">
                  <b className="text-[#102E34]">Guest booking enabled</b> — no sign-in required.
                  Returning patient?
                </div>
              </div>
              <button
                type="button"
                onClick={() => onOpenAuthModal('signin')}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md border border-[#D8DFD9] bg-white text-[#102E34] text-xs font-semibold hover:border-[#426F77] shrink-0 cursor-pointer"
              >
                <LogIn className="w-3.5 h-3.5 text-[#426F77]" />
                <span>Sign in</span>
              </button>
            </div>
          )}

          {availabilityError ? (
            <div
              role="alert"
              className="p-3.5 rounded-md bg-[#FBECEC] border border-[#E8BABA] text-xs text-[#A12A2A] flex flex-wrap items-center justify-between gap-2"
            >
              <div>
                <b className="block">Live availability unavailable — online booking paused</b>
                <span>{availabilityError}</span>
              </div>
              {onRetryAvailability && (
                <button
                  type="button"
                  onClick={onRetryAvailability}
                  className="px-3 py-1.5 rounded-sm bg-white border border-[#E8BABA] text-[#A12A2A] font-semibold hover:bg-[#F7F5F0] cursor-pointer shrink-0"
                >
                  Retry check
                </button>
              )}
            </div>
          ) : catalogLoading || !availabilityVerified ? (
            <div className="p-3 rounded-md bg-[#F7F5F0] border border-[#D8DFD9] text-xs text-[#5B7074] animate-pulse">
              Syncing live doctor availability and clinic hours…
            </div>
          ) : (
            !catalogSeeded && (
              <div className="p-3 rounded-md bg-[#FCF4E6] border border-[#E8CFA1] text-xs text-[#8F5310]">
                Clinic catalog is currently displaying preview defaults. An Admin sign-in initializes
                Firestore doctors &amp; services automatically.
              </div>
            )
          )}

          {confirmedAppt && (
            <div className="p-4 rounded-md bg-[#E6F2EC] border border-[#B8DEC9] text-sm text-[#102E34] space-y-2.5">
              <div className="flex items-center gap-2 font-bold text-[#1E6B4B]">
                <CheckCircle2 className="w-4 h-4" />
                <span>Booking request {confirmedAppt.referenceCode} recorded</span>
              </div>
              <p className="text-xs text-[#3B5257] fc-tabular">
                {confirmedAppt.serviceName} · {formatDateLabel(confirmedAppt.date)} at{' '}
                {formatTimeLabel(confirmedAppt.time)} with {confirmedAppt.doctorName}. Status:{' '}
                <b>Pending clinic confirmation</b>.
              </p>

              {confirmedAppt.guestSecret && (
                <div className="p-3 rounded-md bg-white border border-[#B8DEC9] text-xs space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <b className="text-[#102E34]">Private Visit Tracking Code</b>
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard?.writeText(confirmedAppt.guestSecret!);
                        setCopiedSecret(true);
                        onToast('Private tracking code copied.');
                      }}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm bg-[#E6F2EC] text-[#1E6B4B] font-semibold cursor-pointer"
                    >
                      <Copy className="w-3 h-3" />
                      <span>{copiedSecret ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                  <code className="block font-mono text-[11px] text-[#102E34] break-all select-all">
                    {confirmedAppt.guestSecret}
                  </code>
                  <p className="text-[11px] text-[#5B7074]">
                    Save this code to track visit status across devices on My Visits.
                  </p>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => downloadAppointmentIcs(confirmedAppt, settings.address)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white border border-[#B8DEC9] text-xs font-semibold text-[#1E6B4B] hover:bg-[#F7F5F0] cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Add to calendar (.ics)</span>
                </button>
                <button
                  type="button"
                  onClick={onOpenMyVisits}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#1E6B4B] text-white text-xs font-semibold hover:opacity-95 cursor-pointer"
                >
                  <CalendarCheck className="w-3.5 h-3.5" />
                  <span>View in My Visits</span>
                </button>
              </div>
            </div>
          )}

          {/* Fieldset 01 */}
          <div className="space-y-3.5">
            <div className="flex items-center justify-between border-b border-[#E6EAE4] pb-2">
              <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-[#426F77]">
                Step 01 · Treatment &amp; Dentist
              </span>
              {selectedService && (
                <span className="text-xs font-semibold text-[#102E34] fc-tabular">
                  {selectedService.priceLabel} · {selectedService.durationMins}m
                </span>
              )}
            </div>

            <div className="grid sm:grid-cols-2 gap-3.5">
              <label className="block">
                <span className="block text-xs font-semibold text-[#3B5257] mb-1.5">Treatment</span>
                <select
                  value={serviceId}
                  onChange={(e) => setServiceId(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 py-2.5 rounded-md border border-[#D8DFD9] bg-[#F7F5F0]/60 text-sm font-medium text-[#102E34] focus:bg-white focus:border-[#102E34]"
                >
                  {activeServices.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.priceLabel})
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="block text-xs font-semibold text-[#3B5257] mb-1.5">
                  Preferred dentist
                </span>
                <select
                  value={doctorChoice}
                  onChange={(e) => setDoctorChoice(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 py-2.5 rounded-md border border-[#D8DFD9] bg-[#F7F5F0]/60 text-sm font-medium text-[#102E34] focus:bg-white focus:border-[#102E34]"
                >
                  <option value="any">No preference — first available</option>
                  {activeDoctors.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} · {d.role}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {/* Fieldset 02 */}
          <div className="space-y-3.5">
            <div className="flex items-center justify-between border-b border-[#E6EAE4] pb-2">
              <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-[#426F77]">
                Step 02 · Date &amp; Open Slot
              </span>
              {selectedService && (
                <span className="text-[11px] text-[#5B7074] fc-tabular">
                  {selectedService.durationMins} min window
                </span>
              )}
            </div>

            <div className="grid sm:grid-cols-2 gap-3.5">
              <label className="block">
                <span className="block text-xs font-semibold text-[#3B5257] mb-1.5">Date</span>
                <input
                  type="date"
                  min={minDate}
                  max={maxDate}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 py-2.5 rounded-md border border-[#D8DFD9] bg-[#F7F5F0]/60 text-sm font-medium text-[#102E34] focus:bg-white focus:border-[#102E34]"
                />
              </label>

              <label className="block">
                <span className="block text-xs font-semibold text-[#3B5257] mb-1.5">
                  Available time <Clock className="inline w-3 h-3 ml-0.5 text-[#5B7074]" />
                </span>
                <select
                  value={time}
                  disabled={!availabilityVerified || Boolean(availabilityError)}
                  onChange={(e) => setTime(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 py-2.5 rounded-md border border-[#D8DFD9] bg-[#F7F5F0]/60 text-sm font-medium text-[#102E34] focus:bg-white focus:border-[#102E34] fc-tabular disabled:opacity-60"
                >
                  {slotOptions.length === 0 ? (
                    <option value="">
                      {availabilityError
                        ? 'Availability unavailable — booking blocked'
                        : !availabilityVerified
                          ? 'Verifying live availability…'
                          : serviceExceedsSlotLockLimit
                            ? 'Online booking unavailable for this grid size'
                            : date
                              ? 'No open slots (closed / full / holiday)'
                              : 'Pick a date first'}
                    </option>
                  ) : (
                    slotOptions.map((slot) => (
                      <option key={`${slot.time}-${slot.doctorId}`} value={slot.time}>
                        {formatTimeLabel(slot.time)}
                        {doctorChoice === 'any'
                          ? ` (${slot.doctorName.split(' ').slice(-1)[0]})`
                          : ''}
                      </option>
                    ))
                  )}
                </select>
              </label>
            </div>

            {date && slotOptions.length > 0 && (
              <div>
                <span className="block text-[11px] font-semibold text-[#5B7074] mb-2">
                  Quick-select open times ({slotOptions.length} available)
                </span>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-[144px] overflow-y-auto pr-1">
                  {slotOptions.slice(0, 16).map((slot) => {
                    const selected = time === slot.time;
                    return (
                      <button
                        key={`btn-${slot.time}-${slot.doctorId}`}
                        type="button"
                        onClick={() => setTime(slot.time)}
                        className={`px-2.5 py-2 rounded-md border text-xs font-semibold fc-tabular transition cursor-pointer ${
                          selected
                            ? 'bg-[#102E34] text-[#F7F5F0] border-[#102E34]'
                            : 'bg-[#F7F5F0] text-[#102E34] border-[#D8DFD9] hover:border-[#426F77]'
                        }`}
                      >
                        {formatTimeLabel(slot.time)}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {serviceExceedsSlotLockLimit && selectedService && (
              <p
                role="alert"
                className="text-xs font-semibold text-[#8F5310] bg-[#FCF4E6] border border-[#E8CFA1] rounded-md p-3"
              >
                {selectedService.name} ({selectedService.durationMins}m) requires{' '}
                {serviceSlotsNeeded} slots on a {settings.slotDurationMins}m grid (maximum{' '}
                {MAX_SLOT_LOCKS} atomic locks per online reservation). Please call {settings.phone}{' '}
                or adjust slot duration in Staff Settings.
              </p>
            )}
          </div>

          {/* Fieldset 03 */}
          <div className="space-y-3.5">
            <div className="border-b border-[#E6EAE4] pb-2">
              <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-[#426F77]">
                Step 03 · Patient Information
              </span>
            </div>

            <label className="block">
              <span className="block text-xs font-semibold text-[#3B5257] mb-1.5">Full name *</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                placeholder="e.g. Jordan Rivera"
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-md border border-[#D8DFD9] bg-[#F7F5F0]/60 text-sm font-medium text-[#102E34] focus:bg-white focus:border-[#102E34]"
              />
            </label>

            <div className="grid sm:grid-cols-2 gap-3.5">
              <label className="block">
                <span className="block text-xs font-semibold text-[#3B5257] mb-1.5">
                  Phone / WhatsApp *
                </span>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  maxLength={24}
                  placeholder="+1 555 010 2030"
                  className="w-full min-h-[44px] px-3.5 py-2.5 rounded-md border border-[#D8DFD9] bg-[#F7F5F0]/60 text-sm font-medium text-[#102E34] focus:bg-white focus:border-[#102E34]"
                />
              </label>

              <label className="block">
                <span className="block text-xs font-semibold text-[#3B5257] mb-1.5">
                  Email (optional)
                </span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  maxLength={160}
                  placeholder="you@example.com"
                  className="w-full min-h-[44px] px-3.5 py-2.5 rounded-md border border-[#D8DFD9] bg-[#F7F5F0]/60 text-sm font-medium text-[#102E34] focus:bg-white focus:border-[#102E34]"
                />
              </label>
            </div>

            <label className="block">
              <span className="block text-xs font-semibold text-[#3B5257] mb-1.5">
                Notes or accessibility preferences (optional)
              </span>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={400}
                placeholder="e.g. nervous patient, ground-floor room preference…"
                className="w-full px-3.5 py-2.5 rounded-md border border-[#D8DFD9] bg-[#F7F5F0]/60 text-sm font-medium text-[#102E34] focus:bg-white focus:border-[#102E34]"
              />
            </label>
          </div>

          {/* Step 04 Review Summary */}
          {selectedSlotObj && selectedService && (
            <div className="p-3.5 rounded-md bg-[#DCE8E3]/55 border border-[#D8DFD9] flex flex-wrap items-center justify-between gap-2 text-xs text-[#102E34] fc-tabular">
              <div>
                <span className="font-semibold">{selectedService.name}</span>
                <span className="mx-1.5 text-[#5B7074]">·</span>
                <span>{selectedSlotObj.doctorName}</span>
              </div>
              <span className="font-bold">
                {formatDateLabel(date)} · {formatTimeLabel(selectedSlotObj.time)}
              </span>
            </div>
          )}

          {errorMsg && (
            <p
              role="alert"
              className="text-xs font-semibold text-[#A12A2A] bg-[#FBECEC] border border-[#E8BABA] rounded-md p-3"
            >
              {errorMsg}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting || !availabilityVerified || Boolean(availabilityError)}
            className="w-full py-3.5 rounded-md bg-[#102E34] text-[#F7F5F0] font-semibold text-sm hover:bg-[#194149] transition disabled:opacity-60 cursor-pointer"
          >
            {submitting
              ? 'Reserving slot securely…'
              : availabilityError
                ? 'Booking Unavailable — Cannot Verify Slots'
                : !availabilityVerified
                  ? 'Verifying Live Availability…'
                  : 'Confirm & Request Appointment'}
          </button>

          <p className="text-[11px] text-[#5B7074] text-center">
            For demo testing, please use fictional patient contact details.
          </p>
        </form>
      </div>
    </section>
  );
}
