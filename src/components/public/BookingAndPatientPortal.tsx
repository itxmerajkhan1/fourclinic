import React, { useEffect, useMemo, useState } from 'react';
import { CalendarCheck, CheckCircle2, Clock, Download, LogIn, RefreshCw, XCircle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { downloadAppointmentIcs } from '../../lib/ics';
import {
  addDaysIso,
  formatDateLabel,
  formatTimeLabel,
  formatUserFriendlyError,
  generateAvailableSlotsForDoctor,
  STATUS_LABELS,
  todayIso,
} from '../../lib/validation';
import type {
  Appointment,
  AppointmentSource,
  ClinicSettings,
  Doctor,
  ScheduleOverride,
  ServiceItem,
  SlotLock,
} from '../../types/clinic';

interface BookingAndPatientPortalProps {
  doctors: Doctor[];
  services: ServiceItem[];
  schedules: ScheduleOverride[];
  slotLocks: SlotLock[];
  settings: ClinicSettings;
  catalogSeeded: boolean;
  catalogLoading?: boolean;
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
  }) => Promise<Appointment>;
  onCancelAppointment: (appt: Appointment) => Promise<void>;
  onRescheduleAppointment: (
    appt: Appointment,
    newDate: string,
    newTime: string,
    doctor: Doctor
  ) => Promise<void>;
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
  prefillServiceId,
  prefillDoctorId,
  prefillDate,
  myAppointments,
  appointmentsLoading,
  onBookAppointment,
  onCancelAppointment,
  onRescheduleAppointment,
  onOpenChat,
  onToast,
}: BookingAndPatientPortalProps) {
  const { user, signingIn, signInWithGoogle } = useAuth();
  const activeDoctors = useMemo(() => doctors.filter((d) => d.active), [doctors]);
  const activeServices = useMemo(() => services.filter((s) => s.active), [services]);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [serviceId, setServiceId] = useState(activeServices[0]?.id || 'checkup');
  const [doctorChoice, setDoctorChoice] = useState('any');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [confirmedAppt, setConfirmedAppt] = useState<Appointment | null>(null);

  // Patient inline reschedule & cancel confirm state
  const [rescheduleTarget, setRescheduleTarget] = useState<Appointment | null>(null);
  const [reschedDate, setReschedDate] = useState('');
  const [reschedTime, setReschedTime] = useState('');
  const [reschedBusy, setReschedBusy] = useState(false);
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  useEffect(() => {
    if (user?.displayName && !name) {
      setName(user.displayName);
    }
  }, [user?.displayName, name]);

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

  // Resolve candidate doctor(s) & free slots per doctor across full service duration
  const slotOptions = useMemo(() => {
    if (!date) return [];
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

    // "No preference — first available": prefer default specialist for service, then other active doctors
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
  }, [date, doctorChoice, activeDoctors, selectedService, schedules, slotLocks, settings]);

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
    setErrorMsg(null);
    setConfirmedAppt(null);

    if (!user) {
      setErrorMsg('Please sign in with Google below so we can reserve your slot and show live status updates.');
      return;
    }

    const chosenSlot = slotOptions.find((s) => s.time === time);
    if (!chosenSlot) {
      setErrorMsg('Please choose an available date and time slot.');
      return;
    }

    setSubmitting(true);
    try {
      const appt = await onBookAppointment({
        patientName: name,
        patientPhone: phone,
        patientEmail: user.email || undefined,
        serviceId: selectedService?.id || serviceId,
        doctorId: chosenSlot.doctorId,
        date,
        time: chosenSlot.time,
        notes,
        source: 'form',
      });
      setConfirmedAppt(appt);
      setNotes('');
      onToast(`Request ${appt.referenceCode} saved for ${formatDateLabel(appt.date)} at ${formatTimeLabel(appt.time)}.`);
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
    if (!rescheduleTarget || !reschedDoc || !reschedDate) return [];
    return generateAvailableSlotsForDoctor({
      dateStr: reschedDate,
      doctor: reschedDoc,
      schedules,
      slotLocks,
      settings,
      serviceDurationMins: rescheduleTarget.durationMins,
      ignoreAppointmentId: rescheduleTarget.id,
    });
  }, [rescheduleTarget, reschedDoc, reschedDate, schedules, slotLocks, settings]);

  useEffect(() => {
    if (reschedSlots.length > 0 && !reschedSlots.includes(reschedTime)) {
      setReschedTime(reschedSlots[0]);
    } else if (reschedSlots.length === 0) {
      setReschedTime('');
    }
  }, [reschedSlots, reschedTime]);

  async function submitReschedule(e: React.FormEvent) {
    e.preventDefault();
    if (!rescheduleTarget || !reschedDoc || !reschedDate || !reschedTime) return;
    setReschedBusy(true);
    try {
      await onRescheduleAppointment(rescheduleTarget, reschedDate, reschedTime, reschedDoc);
      onToast(`Rescheduled ${rescheduleTarget.referenceCode} to ${formatDateLabel(reschedDate)} at ${formatTimeLabel(reschedTime)}.`);
      setRescheduleTarget(null);
    } catch (err) {
      onToast(formatUserFriendlyError(err, 'Unable to reschedule appointment.'));
    } finally {
      setReschedBusy(false);
    }
  }

  return (
    <section id="book" className="bg-[#f4f8f8] py-14 border-y border-[#e3ebec]">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 grid lg:grid-cols-2 gap-12 items-start">
        <div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-[#4d8a96]">
            Request an appointment
          </h2>
          <p className="mt-3 text-base text-[#42565c] leading-relaxed max-w-md">
            Live Firestore slot reservations prevent double-bookings atomically. Prefer to ask questions first?{' '}
            <button
              type="button"
              onClick={onOpenChat}
              className="text-[#4d8a96] font-bold underline underline-offset-4 cursor-pointer"
            >
              Use the AI assistant
            </button>
            .
          </p>
          <ul className="mt-6 space-y-3 text-sm font-semibold text-[#12262e]">
            {[
              'Real-time per-doctor availability & holiday blocking',
              'Atomic slot reservation prevents overlapping bookings',
              'Track confirmation & reschedule directly from My Visits',
            ].map((item) => (
              <li key={item} className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-full bg-[#4d8a96] text-white text-xs flex items-center justify-center shrink-0">
                  ✓
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>

          {/* Patient Live Appointment Status Tracker */}
          {user && (
            <div id="my-visits" className="mt-8 bg-white border border-[#e3ebec] rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between gap-2 mb-3">
                <h3 className="text-base font-extrabold text-[#12262e] flex items-center gap-2">
                  <CalendarCheck className="w-4 h-4 text-[#4d8a96]" />
                  <span>My Visits ({myAppointments.length})</span>
                </h3>
                <span className="text-xs text-[#5d737a] truncate max-w-[180px]">{user.email}</span>
              </div>

              {appointmentsLoading ? (
                <p className="text-sm text-[#5d737a]">Loading your appointments…</p>
              ) : myAppointments.length === 0 ? (
                <p className="text-sm text-[#5d737a]">
                  No bookings under your account yet. Submit the form to request a visit.
                </p>
              ) : (
                <div className="space-y-3 max-h-[340px] overflow-y-auto pr-1">
                  {myAppointments.map((appt) => {
                    const badgeStyle =
                      appt.status === 'confirmed'
                        ? 'bg-[#eef7f1] text-[#2e8a5c]'
                        : appt.status === 'pending'
                          ? 'bg-amber-50 text-amber-700'
                          : appt.status === 'completed'
                            ? 'bg-[#e7eff1] text-[#3d7280]'
                            : 'bg-rose-50 text-rose-700';

                    const canModify = appt.status === 'pending' || appt.status === 'confirmed';

                    return (
                      <div
                        key={appt.id}
                        className="p-3.5 rounded-xl border border-[#e3ebec] bg-[#fbfdfd] text-sm"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-extrabold text-[#12262e]">
                            {appt.referenceCode} · {appt.serviceName}
                          </span>
                          <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${badgeStyle}`}>
                            {STATUS_LABELS[appt.status]}
                          </span>
                        </div>
                        <p className="text-xs text-[#42565c] mt-1">
                          {formatDateLabel(appt.date)} at {formatTimeLabel(appt.time)} · {appt.doctorName}
                        </p>
                        {appt.staffNotes && (
                          <p className="text-xs text-[#3d7280] mt-1 font-medium">
                            Clinic note: {appt.staffNotes}
                          </p>
                        )}
                        <div className="mt-2.5 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => downloadAppointmentIcs(appt, settings.address)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-[#cfdee1] text-xs font-semibold text-[#12262e] hover:bg-[#f2f7f8] cursor-pointer"
                          >
                            <Download className="w-3 h-3" />
                            <span>Add to calendar</span>
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
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-[#cfdee1] text-xs font-semibold text-[#3d7280] hover:bg-[#e7eff1] cursor-pointer"
                              >
                                <RefreshCw className="w-3 h-3" />
                                <span>Reschedule</span>
                              </button>
                              {confirmCancelId === appt.id ? (
                                <div className="inline-flex items-center gap-1.5 bg-rose-50 border border-rose-200 rounded-lg px-2 py-1">
                                  <span className="text-[11px] font-bold text-rose-800">Cancel visit?</span>
                                  <button
                                    type="button"
                                    disabled={cancellingId === appt.id}
                                    onClick={async () => {
                                      setCancellingId(appt.id);
                                      try {
                                        await onCancelAppointment(appt);
                                        setConfirmCancelId(null);
                                        onToast(`Appointment ${appt.referenceCode} cancelled & slot released.`);
                                      } catch (err) {
                                        onToast(formatUserFriendlyError(err, 'Cancel failed.'));
                                      } finally {
                                        setCancellingId(null);
                                      }
                                    }}
                                    className="px-2 py-0.5 rounded bg-rose-600 text-white text-[11px] font-bold cursor-pointer disabled:opacity-50"
                                  >
                                    {cancellingId === appt.id ? '…' : 'Yes'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmCancelId(null)}
                                    className="px-2 py-0.5 rounded bg-white border border-rose-200 text-[11px] font-semibold text-[#42565c] cursor-pointer"
                                  >
                                    Keep
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmCancelId(appt.id)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-rose-200 text-xs font-semibold text-rose-700 hover:bg-rose-50 cursor-pointer"
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
                  className="mt-4 p-4 rounded-xl bg-[#f2f7f8] border border-[#cfdee1] space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <b className="text-xs font-extrabold text-[#12262e]">
                      Reschedule {rescheduleTarget.referenceCode} ({rescheduleTarget.doctorName})
                    </b>
                    <button
                      type="button"
                      onClick={() => setRescheduleTarget(null)}
                      className="text-xs font-bold text-[#5d737a] cursor-pointer"
                    >
                      Close
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="date"
                      min={minDate}
                      max={maxDate}
                      value={reschedDate}
                      onChange={(e) => setReschedDate(e.target.value)}
                      className="px-3 py-2 rounded-lg border border-[#cfdee1] bg-white text-xs font-semibold"
                    />
                    <select
                      value={reschedTime}
                      onChange={(e) => setReschedTime(e.target.value)}
                      className="px-3 py-2 rounded-lg border border-[#cfdee1] bg-white text-xs font-semibold"
                    >
                      {reschedSlots.length === 0 ? (
                        <option value="">No free slots</option>
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
                    disabled={reschedBusy || !reschedTime}
                    className="w-full py-2 rounded-full bg-[#4d8a96] text-white text-xs font-bold hover:bg-[#3d7280] disabled:opacity-50 cursor-pointer"
                  >
                    {reschedBusy ? 'Updating slot…' : 'Confirm New Time'}
                  </button>
                </form>
              )}
            </div>
          )}
        </div>

        {/* Booking Form Card */}
        <form
          onSubmit={handleSubmit}
          noValidate
          className="bg-white rounded-[22px] p-6 sm:p-8 shadow-xl border border-[#e3ebec] space-y-4"
        >
          {!user && (
            <div className="p-4 rounded-xl bg-[#e7eff1] border border-[#cfdee1] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <b className="block text-sm text-[#12262e]">Sign in to confirm &amp; track your booking</b>
                <span className="text-xs text-[#42565c]">
                  Google Sign-In connects your request to your live visit status.
                </span>
              </div>
              <button
                type="button"
                disabled={signingIn}
                onClick={() => void signInWithGoogle()}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-full bg-[#4d8a96] text-white text-xs font-bold hover:bg-[#3d7280] shrink-0 cursor-pointer disabled:opacity-60"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>{signingIn ? 'Signing in…' : 'Sign in with Google'}</span>
              </button>
            </div>
          )}

          {catalogLoading ? (
            <div className="p-3 rounded-xl bg-[#f2f7f8] border border-[#e3ebec] text-xs text-[#5d737a] animate-pulse">
              Syncing live doctor availability and clinic hours…
            </div>
          ) : !catalogSeeded && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800">
              Clinic catalog is currently displaying preview defaults. An Admin sign-in initializes Firestore doctors &amp; services automatically.
            </div>
          )}

          {confirmedAppt && (
            <div className="p-4 rounded-xl bg-[#eef7f1] border border-[#b9dfc9] text-sm text-[#12262e]">
              <div className="flex items-center gap-2 font-extrabold text-[#2e8a5c]">
                <CheckCircle2 className="w-4 h-4" />
                <span>Request {confirmedAppt.referenceCode} sent!</span>
              </div>
              <p className="mt-1 text-xs text-[#42565c]">
                {confirmedAppt.serviceName} · {formatDateLabel(confirmedAppt.date)} at{' '}
                {formatTimeLabel(confirmedAppt.time)} with {confirmedAppt.doctorName}. Status:{' '}
                <b>Pending clinic confirmation</b>.
              </p>
              <button
                type="button"
                onClick={() => downloadAppointmentIcs(confirmedAppt, settings.address)}
                className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-[#b9dfc9] text-xs font-bold text-[#2e8a5c] hover:bg-[#f7fbf9] cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download calendar invite (.ics)</span>
              </button>
            </div>
          )}

          <label className="block">
            <span className="block text-xs font-bold text-[#42565c] mb-1">Full name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              placeholder="e.g. Jordan Rivera"
              className="w-full px-3.5 py-2.5 rounded-xl border border-[#cfdee1] text-sm font-medium focus:outline-none focus:border-[#4d8a96]"
            />
          </label>

          <label className="block">
            <span className="block text-xs font-bold text-[#42565c] mb-1">Phone / WhatsApp</span>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              maxLength={24}
              placeholder="+1 555 010 2030"
              className="w-full px-3.5 py-2.5 rounded-xl border border-[#cfdee1] text-sm font-medium focus:outline-none focus:border-[#4d8a96]"
            />
          </label>

          <div className="grid sm:grid-cols-2 gap-3.5">
            <label className="block">
              <span className="block text-xs font-bold text-[#42565c] mb-1">Treatment</span>
              <select
                value={serviceId}
                onChange={(e) => setServiceId(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#cfdee1] bg-white text-sm font-medium"
              >
                {activeServices.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.priceLabel})
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="block text-xs font-bold text-[#42565c] mb-1">Preferred dentist</span>
              <select
                value={doctorChoice}
                onChange={(e) => setDoctorChoice(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#cfdee1] bg-white text-sm font-medium"
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

          <div className="grid sm:grid-cols-2 gap-3.5">
            <label className="block">
              <span className="block text-xs font-bold text-[#42565c] mb-1">Date</span>
              <input
                type="date"
                min={minDate}
                max={maxDate}
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#cfdee1] bg-white text-sm font-medium"
              />
            </label>

            <label className="block">
              <span className="block text-xs font-bold text-[#42565c] mb-1">
                Available time <Clock className="inline w-3 h-3 ml-0.5 text-[#5d737a]" />
                {selectedService && (
                  <span className="ml-1 font-normal text-[#5d737a]">
                    ({selectedService.durationMins}m visit)
                  </span>
                )}
              </span>
              <select
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#cfdee1] bg-white text-sm font-medium"
              >
                {slotOptions.length === 0 ? (
                  <option value="">
                    {date ? 'No open slots (closed / full / holiday)' : 'Pick a date first'}
                  </option>
                ) : (
                  slotOptions.map((slot) => (
                    <option key={`${slot.time}-${slot.doctorId}`} value={slot.time}>
                      {formatTimeLabel(slot.time)}
                      {doctorChoice === 'any' ? ` (${slot.doctorName.split(' ').slice(-1)[0]})` : ''}
                    </option>
                  ))
                )}
              </select>
            </label>
          </div>

          <label className="block">
            <span className="block text-xs font-bold text-[#42565c] mb-1">
              Anything we should know? (optional)
            </span>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={400}
              placeholder="e.g. nervous patient, PPO plan name, wheelchair access…"
              className="w-full px-3.5 py-2.5 rounded-xl border border-[#cfdee1] text-sm font-medium focus:outline-none focus:border-[#4d8a96]"
            />
          </label>

          {errorMsg && (
            <p role="alert" className="text-xs font-bold text-rose-600">
              {errorMsg}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3.5 rounded-full bg-[#4d8a96] text-white font-extrabold text-sm hover:bg-[#3d7280] transition shadow-sm disabled:opacity-60 cursor-pointer"
          >
            {submitting ? 'Reserving slot securely…' : 'Request appointment'}
          </button>

          <p className="text-[11px] text-[#5d737a] text-center">
            For demo testing, please use fictional patient contact details.
          </p>
        </form>
      </div>
    </section>
  );
}
