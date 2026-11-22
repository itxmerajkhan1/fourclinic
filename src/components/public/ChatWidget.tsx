import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CalendarCheck,
  CalendarPlus,
  CheckCircle2,
  Download,
  MessageCircle,
  RotateCcw,
  Send,
  X,
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
  todayIso,
} from '../../lib/validation';
import type {
  AppointmentSource,
  BusySlot,
  ClinicSettings,
  Doctor,
  Inquiry,
  InquiryPriority,
  ScheduleOverride,
  ServiceItem,
} from '../../types/clinic';

interface BookingDraft {
  readyToConfirm: boolean;
  serviceId: string;
  doctorId: string;
  date: string;
  time: string;
  patientName: string;
  patientPhone: string;
  notes: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  urgent?: boolean;
  suggestedServiceId?: string;
  suggestedDoctorId?: string;
  suggestedDate?: string;
  suggestedTime?: string;
  bookingDraft?: BookingDraft | null;
  confirmedAppointment?: BookedAppointmentResult;
}

const CHAT_STORAGE_KEY = 'fc_chat_history_v1';

const WELCOME_MESSAGE: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  text: 'Welcome to FourClinic. Ask about sample treatments, fee estimates, clinic hours, or open appointment slots in English, اردو, or Roman Urdu. (Automated demo assistant — please do not share sensitive medical history.)',
};

function sanitizeMessagesForSessionStorage(msgs: ChatMessage[]): ChatMessage[] {
  return msgs
    .slice(-16)
    .filter((m) => !m.urgent)
    .map((m) => ({
      id: m.id,
      role: m.role,
      text: m.text.replace(/\+?\d[\d\s()-]{6,}\d/g, '[redacted]'),
      suggestedServiceId: m.suggestedServiceId,
      suggestedDoctorId: m.suggestedDoctorId,
      suggestedDate: m.suggestedDate,
      suggestedTime: m.suggestedTime,
    }));
}

function loadStoredChatMessages(): ChatMessage[] {
  if (typeof window === 'undefined') return [WELCOME_MESSAGE];
  try {
    const raw = window.sessionStorage.getItem(CHAT_STORAGE_KEY);
    if (!raw) return [WELCOME_MESSAGE];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return [WELCOME_MESSAGE];
    const valid = parsed.filter(
      (m): m is ChatMessage =>
        Boolean(m) &&
        typeof m === 'object' &&
        (m.role === 'user' || m.role === 'assistant') &&
        typeof m.text === 'string' &&
        typeof m.id === 'string'
    );
    return valid.length > 0 ? valid.slice(-16) : [WELCOME_MESSAGE];
  } catch {
    return [WELCOME_MESSAGE];
  }
}

interface ChatWidgetProps {
  open: boolean;
  onToggle: (open: boolean) => void;
  doctors: Doctor[];
  services: ServiceItem[];
  schedules: ScheduleOverride[];
  slotLocks: BusySlot[];
  settings: ClinicSettings;
  catalogSeeded: boolean;
  availabilityVerified?: boolean;
  availabilityError?: string | null;
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
  }) => Promise<BookedAppointmentResult>;
  onPrefillBooking: (serviceId: string, doctorId: string, date: string) => void;
  onEscalateInquiry: (input: {
    name: string;
    contact: string;
    topic: string;
    message: string;
    channel: 'chatbot';
    priority?: InquiryPriority;
  }) => Promise<Inquiry>;
  onToast: (msg: string) => void;
}

export function ChatWidget({
  open,
  onToggle,
  doctors,
  services,
  schedules,
  slotLocks,
  settings,
  catalogSeeded,
  availabilityVerified = true,
  availabilityError = null,
  onBookAppointment,
  onPrefillBooking,
  onEscalateInquiry,
  onToast,
}: ChatWidgetProps) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadStoredChatMessages());
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [confirmingMsgId, setConfirmingMsgId] = useState<string | null>(null);
  const [escalateName, setEscalateName] = useState('');
  const [escalateContact, setEscalateContact] = useState('');
  const [showEscalateBox, setShowEscalateBox] = useState(false);
  const [escalateUrgent, setEscalateUrgent] = useState(false);
  const [escalatingBusy, setEscalatingBusy] = useState(false);
  const [lastUserMsg, setLastUserMsg] = useState('');
  const [lastSuggestedServiceId, setLastSuggestedServiceId] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const safe = sanitizeMessagesForSessionStorage(messages);
      window.sessionStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(safe));
    } catch {
      // Ignore storage quota errors
    }
  }, [messages]);

  function handleClearChat() {
    setMessages([WELCOME_MESSAGE]);
    setShowEscalateBox(false);
    setEscalateUrgent(false);
    setLastUserMsg('');
    setLastSuggestedServiceId('');
    if (typeof window !== 'undefined') {
      try {
        window.sessionStorage.removeItem(CHAT_STORAGE_KEY);
      } catch {
        // Ignore storage errors
      }
    }
    onToast('Chat history cleared.');
  }

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 80);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onToggle(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onToggle]);

  const hoursSummary = useMemo(() => {
    const dayLabels: Array<[keyof ClinicSettings['workingHours'], string]> = [
      ['mon', 'Mon'],
      ['tue', 'Tue'],
      ['wed', 'Wed'],
      ['thu', 'Thu'],
      ['fri', 'Fri'],
      ['sat', 'Sat'],
      ['sun', 'Sun'],
    ];
    const parts = dayLabels.map(([k, lbl]) => {
      const h = settings.workingHours[k];
      if (!h?.enabled) return `${lbl}: Closed`;
      return `${lbl}: ${h.start}-${h.end}${h.lunchStart ? ` (lunch ${h.lunchStart}-${h.lunchEnd})` : ''}`;
    });
    const holidayNote =
      settings.holidays.length > 0
        ? `; Holidays: ${settings.holidays.map((h) => `${h.date} (${h.label})`).join(', ')}`
        : '';
    return `${parts.join(', ')}${holidayNote}`;
  }, [settings]);

  const upcomingSlotsSummary = useMemo(() => {
    if (!availabilityVerified || availabilityError) return [];
    const activeDocs = doctors.filter((d) => d.active);
    const activeSvc = services.find((s) => s.id === lastSuggestedServiceId && s.active);
    const durationMins = activeSvc?.durationMins || settings.slotDurationMins;
    const out: Array<{ date: string; doctorId: string; doctorName: string; times: string[] }> = [];
    const base = todayIso();
    for (let offset = 0; offset < 7; offset++) {
      const dateStr = addDaysIso(base, offset);
      activeDocs.forEach((docObj) => {
        const times = generateAvailableSlotsForDoctor({
          dateStr,
          doctor: docObj,
          schedules,
          slotLocks,
          settings,
          serviceDurationMins: durationMins,
        }).slice(0, 6);
        if (times.length > 0) {
          out.push({
            date: dateStr,
            doctorId: docObj.id,
            doctorName: docObj.name,
            times,
          });
        }
      });
    }
    return out.slice(0, 14);
  }, [availabilityVerified, availabilityError, doctors, services, lastSuggestedServiceId, schedules, slotLocks, settings]);

  function scrollBottom() {
    setTimeout(() => {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
    }, 60);
  }

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    const userMsg: ChatMessage = {
      id: `u_${Date.now()}`,
      role: 'user',
      text: trimmed,
    };
    setMessages((prev) => [...prev, userMsg]);
    setLastUserMsg(trimmed);
    setInput('');
    setSending(true);
    scrollBottom();

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (user) {
        const token = await user.getIdToken();
        headers.Authorization = `Bearer ${token}`;
      }

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          message: trimmed,
          history: messages.slice(-8).map((m) => ({ role: m.role, text: m.text })),
          clinicContext: {
            clinicName: settings.clinicName,
            address: settings.address,
            phone: settings.phone,
            email: settings.email,
            hoursSummary,
            allowChatbotBooking: settings.allowChatbotBooking,
            availabilityVerified,
            services: services
              .filter((s) => s.active)
              .map((s) => ({
                id: s.id,
                name: s.name,
                priceLabel: s.priceLabel,
                durationMins: s.durationMins,
              })),
            doctors: doctors
              .filter((d) => d.active)
              .map((d) => ({
                id: d.id,
                name: d.name,
                role: d.role,
                specialty: d.specialty,
                languages: d.languages,
              })),
            upcomingSlots: upcomingSlotsSummary,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Assistant unavailable right now.');
      }

      if (data.suggestedServiceId) {
        setLastSuggestedServiceId(data.suggestedServiceId);
      }

      const botMsg: ChatMessage = {
        id: `b_${Date.now()}`,
        role: 'assistant',
        text: data.reply,
        urgent: Boolean(data.urgent),
        suggestedServiceId: data.suggestedServiceId || undefined,
        suggestedDoctorId: data.suggestedDoctorId || undefined,
        suggestedDate: data.suggestedDate || undefined,
        suggestedTime: data.suggestedTime || undefined,
        bookingDraft: data.bookingDraft || null,
      };
      setMessages((prev) => [...prev, botMsg]);

      if (data.urgent || data.intent === 'escalate') {
        setEscalateUrgent(Boolean(data.urgent));
        setShowEscalateBox(true);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to reach assistant.';
      setMessages((prev) => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          role: 'assistant',
          text: `${msg} You can still book directly using the appointment form or call ${settings.phone}.`,
        },
      ]);
    } finally {
      setSending(false);
      scrollBottom();
    }
  }

  async function handleConfirmDraftBooking(msgId: string, draft: BookingDraft) {
    if (availabilityError || !availabilityVerified) {
      onToast(
        availabilityError ||
          'Live slot availability could not be verified. Booking via chat is paused.'
      );
      return;
    }
    if (!catalogSeeded) {
      onToast(
        'Clinic catalog is still in preview mode. Please use the booking form after Admin setup.'
      );
      return;
    }
    setConfirmingMsgId(msgId);
    try {
      const created = await onBookAppointment({
        patientName: draft.patientName,
        patientPhone: draft.patientPhone,
        patientEmail: user && !user.isAnonymous ? user.email || undefined : undefined,
        serviceId: draft.serviceId,
        doctorId: draft.doctorId,
        date: draft.date,
        time: draft.time,
        notes: draft.notes || 'Requested via AI receptionist chat',
        source: 'chatbot',
      });
      setMessages((prev) =>
        prev.map((m) => (m.id === msgId ? { ...m, confirmedAppointment: created } : m))
      );
      onToast(`Request ${created.referenceCode} submitted via AI assistant!`);
    } catch (err) {
      const msg = formatUserFriendlyError(err, 'Could not complete reservation.');
      setMessages((prev) => [
        ...prev,
        {
          id: `b_err_${Date.now()}`,
          role: 'assistant',
          text: `${msg} Please pick another open time or adjust details in the booking form.`,
          suggestedServiceId: draft.serviceId,
          suggestedDoctorId: draft.doctorId,
          suggestedDate: draft.date,
        },
      ]);
      onToast(msg);
    } finally {
      setConfirmingMsgId(null);
      scrollBottom();
    }
  }

  async function handleEscalateSubmit(e: React.FormEvent) {
    e.preventDefault();
    const resolvedName = (
      escalateName.trim() ||
      (user && !user.isAnonymous ? user.displayName : '') ||
      'Chat Visitor'
    ).slice(0, 80);
    if (resolvedName.length < 2 || /\d/.test(resolvedName)) {
      onToast('Please enter a valid name (2+ letters, no digits).');
      return;
    }
    if (escalateContact.trim().length < 5) {
      onToast('Please provide a phone or email for front-desk follow-up.');
      return;
    }
    setEscalatingBusy(true);
    try {
      const created = await onEscalateInquiry({
        name: resolvedName,
        contact: escalateContact.trim(),
        topic: escalateUrgent ? 'urgent' : 'chatbot',
        message: lastUserMsg || 'Requested front-desk callback from AI chat.',
        channel: 'chatbot',
        priority: escalateUrgent ? 'urgent' : 'normal',
      });
      setShowEscalateBox(false);
      setEscalateName('');
      setEscalateContact('');
      setMessages((prev) => [
        ...prev,
        {
          id: `esc_ok_${Date.now()}`,
          role: 'assistant',
          text: `Your message (${created.referenceCode || created.id}) has been queued for our front desk. No human has replied yet; a team member reviews messages during clinic hours.`,
        },
      ]);
      onToast(`Sent inquiry ${created.referenceCode || ''} to our front desk queue.`);
    } catch (err) {
      onToast(formatUserFriendlyError(err, 'Failed to send to front desk.'));
    } finally {
      setEscalatingBusy(false);
      scrollBottom();
    }
  }

  return (
    <div className={open ? 'fixed inset-0 sm:inset-auto sm:bottom-5 sm:right-5 z-50' : 'fixed bottom-4 right-4 sm:bottom-5 sm:right-5 z-50'}>
      {!open ? (
        <button
          type="button"
          onClick={() => onToggle(true)}
          aria-label="Open FourClinic AI Assistant"
          className="inline-flex items-center gap-2.5 px-4 sm:px-5 py-3 rounded-lg bg-[#102E34] text-[#F7F5F0] border border-[#426F77] font-semibold text-xs sm:text-sm shadow-xl hover:bg-[#194149] transition cursor-pointer"
        >
          <span className="w-2 h-2 rounded-full bg-[#C7775F]" />
          <MessageCircle className="w-4 h-4" />
          <span>Ask AI Receptionist</span>
        </button>
      ) : (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="FourClinic AI Assistant"
          className="w-full h-full sm:w-[420px] sm:h-[600px] sm:max-h-[calc(100dvh-40px)] bg-white sm:rounded-lg shadow-2xl border border-[#D8DFD9] flex flex-col overflow-hidden"
        >
          <div className="px-4 py-3.5 bg-[#102E34] text-[#F7F5F0] flex items-center justify-between shrink-0">
            <div className="min-w-0">
              <b className="block font-editorial text-[22px] font-normal leading-none truncate">
                FourClinic Receptionist
              </b>
              <small className="block mt-1 text-[11px] text-[#DCE8E3]/80 truncate">
                English · اردو · Roman Urdu (Non-diagnostic)
              </small>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setEscalateUrgent(false);
                  setShowEscalateBox((v) => !v);
                }}
                className="px-2.5 py-1 rounded-sm bg-white/10 hover:bg-white/20 text-[11px] font-semibold cursor-pointer"
              >
                Human Desk
              </button>
              <button
                type="button"
                aria-label="Clear chat"
                title="Clear chat"
                onClick={handleClearChat}
                className="p-1.5 rounded-sm hover:bg-white/15 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
              <button
                type="button"
                aria-label="Close chat"
                onClick={() => onToggle(false)}
                className="p-1.5 rounded-sm hover:bg-white/15 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="px-4 py-1.5 bg-[#DCE8E3]/55 border-b border-[#D8DFD9] text-[11px] text-[#3B5257] shrink-0">
            Automated demo assistant — do not share sensitive medical history.
          </div>

          {availabilityError && (
            <div
              role="alert"
              className="px-4 py-2 bg-[#FBECEC] border-b border-[#E8BABA] text-[11px] font-semibold text-[#A12A2A] shrink-0"
            >
              {availabilityError}
            </div>
          )}

          <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-4 space-y-3 bg-[#F7F5F0]">
            {messages.map((m) => {
              const draft = m.bookingDraft;
              const draftSvc = draft ? services.find((s) => s.id === draft.serviceId) : undefined;
              const draftDoc = draft ? doctors.find((d) => d.id === draft.doctorId) : undefined;

              return (
                <div key={m.id} className="space-y-2">
                  <div
                    className={`fc-pop max-w-[88%] px-3.5 py-2.5 rounded-lg text-sm leading-relaxed ${
                      m.role === 'user'
                        ? 'ml-auto bg-[#102E34] text-[#F7F5F0]'
                        : 'mr-auto bg-white border border-[#D8DFD9] text-[#102E34]'
                    }`}
                  >
                    {m.urgent && (
                      <div className="flex items-center gap-1.5 text-[#A12A2A] font-bold text-xs mb-1">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>Urgent symptom flagged</span>
                      </div>
                    )}
                    <p className="whitespace-pre-wrap">{m.text}</p>
                  </div>

                  {/* Interactive Chat Confirmation Card */}
                  {m.role === 'assistant' && draft && !m.confirmedAppointment && (
                    <div className="mr-auto max-w-[94%] p-3.5 rounded-lg bg-white border border-[#426F77] text-xs space-y-2">
                      <div className="flex items-center gap-1.5 font-bold text-[#102E34]">
                        <CalendarCheck className="w-4 h-4 text-[#426F77]" />
                        <span>Ready to Submit Appointment Request</span>
                      </div>
                      <div className="space-y-0.5 text-[#3B5257] fc-tabular">
                        <p>
                          <b className="text-[#102E34]">{draftSvc?.name || draft.serviceId}</b> (
                          {draftSvc?.priceLabel || ''} ·{' '}
                          {draftSvc?.durationMins || settings.slotDurationMins}m)
                        </p>
                        <p>
                          {draftDoc?.name || draft.doctorId} · {formatDateLabel(draft.date)} at{' '}
                          {formatTimeLabel(draft.time)}
                        </p>
                        <p>
                          Patient: {draft.patientName} ({draft.patientPhone})
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2 pt-1">
                        <button
                          type="button"
                          disabled={
                            confirmingMsgId === m.id ||
                            !availabilityVerified ||
                            Boolean(availabilityError)
                          }
                          onClick={() => void handleConfirmDraftBooking(m.id, draft)}
                          className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md bg-[#102E34] text-[#F7F5F0] font-semibold hover:bg-[#194149] disabled:opacity-60 cursor-pointer"
                        >
                          <span>
                            {confirmingMsgId === m.id
                              ? 'Reserving…'
                              : availabilityError || !availabilityVerified
                                ? 'Availability Unverified'
                                : 'Confirm & Submit Request'}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            onPrefillBooking(draft.serviceId, draft.doctorId, draft.date);
                            onToggle(false);
                          }}
                          className="px-3 py-2 rounded-md border border-[#D8DFD9] bg-[#F7F5F0] font-semibold text-[#102E34] cursor-pointer"
                        >
                          Edit
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Real Firestore-Confirmed Reference Card */}
                  {m.confirmedAppointment && (
                    <div className="mr-auto max-w-[94%] p-3.5 rounded-lg bg-[#E6F2EC] border border-[#B8DEC9] text-xs space-y-2 text-[#102E34]">
                      <div className="flex items-center gap-1.5 font-bold text-[#1E6B4B]">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Request {m.confirmedAppointment.referenceCode} Recorded</span>
                      </div>
                      <p className="text-[#3B5257] fc-tabular">
                        {m.confirmedAppointment.serviceName} ·{' '}
                        {formatDateLabel(m.confirmedAppointment.date)} at{' '}
                        {formatTimeLabel(m.confirmedAppointment.time)} with{' '}
                        {m.confirmedAppointment.doctorName}. Status: <b>Pending clinic confirmation</b>.
                      </p>
                      {m.confirmedAppointment.guestSecret && (
                        <p className="text-[11px] bg-white border border-[#B8DEC9] rounded-sm px-2.5 py-1.5 font-mono break-all select-all">
                          Tracking code: {m.confirmedAppointment.guestSecret}
                        </p>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          downloadAppointmentIcs(m.confirmedAppointment!, settings.address)
                        }
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white border border-[#B8DEC9] font-semibold text-[#1E6B4B] cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Add to calendar (.ics)</span>
                      </button>
                    </div>
                  )}

                  {m.role === 'assistant' && m.suggestedServiceId && !draft && !m.confirmedAppointment && (
                    <button
                      type="button"
                      onClick={() => {
                        onPrefillBooking(
                          m.suggestedServiceId!,
                          m.suggestedDoctorId || '',
                          m.suggestedDate || ''
                        );
                        onToggle(false);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#DCE8E3] border border-[#D8DFD9] text-[#102E34] text-xs font-semibold hover:bg-[#cde0d8] cursor-pointer fc-tabular"
                    >
                      <CalendarPlus className="w-3.5 h-3.5 text-[#426F77]" />
                      <span>
                        Open in Booking Form
                        {m.suggestedDate ? ` (${formatDateLabel(m.suggestedDate)}` : ''}
                        {m.suggestedTime
                          ? ` · ${formatTimeLabel(m.suggestedTime)})`
                          : m.suggestedDate
                            ? ')'
                            : ''}
                      </span>
                    </button>
                  )}
                </div>
              );
            })}

            {sending && (
              <div className="inline-flex gap-1.5 px-4 py-3 rounded-lg bg-white border border-[#D8DFD9]">
                <span className="fc-typing-dot w-2 h-2 rounded-full bg-[#426F77]" />
                <span className="fc-typing-dot w-2 h-2 rounded-full bg-[#426F77]" />
                <span className="fc-typing-dot w-2 h-2 rounded-full bg-[#426F77]" />
              </div>
            )}

            {showEscalateBox && (
              <form
                onSubmit={handleEscalateSubmit}
                className="p-3.5 rounded-lg bg-[#FCF4E6] border border-[#E8CFA1] space-y-2 text-xs"
              >
                <b className="block text-[#102E34]">
                  {escalateUrgent
                    ? 'Send urgent callback request to front desk'
                    : 'Forward inquiry to our front desk queue'}
                </b>
                <p className="text-[11px] text-[#3B5257]">
                  Stored for staff review during clinic hours (not 24/7 live staffing).
                </p>
                <input
                  type="text"
                  value={escalateName}
                  onChange={(e) => setEscalateName(e.target.value)}
                  maxLength={80}
                  placeholder="Your name (optional)"
                  className="w-full px-3 py-2 rounded-md border border-[#E8CFA1] bg-white text-xs text-[#102E34] focus:outline-none focus:border-[#102E34]"
                />
                <input
                  type="text"
                  value={escalateContact}
                  onChange={(e) => setEscalateContact(e.target.value)}
                  placeholder="Phone / WhatsApp or email *"
                  className="w-full px-3 py-2 rounded-md border border-[#E8CFA1] bg-white text-xs text-[#102E34] focus:outline-none focus:border-[#102E34]"
                />
                <div className="flex gap-2 pt-1">
                  <button
                    type="submit"
                    disabled={escalatingBusy}
                    className="flex-1 py-2 rounded-md bg-[#102E34] text-[#F7F5F0] font-semibold cursor-pointer disabled:opacity-60"
                  >
                    {escalatingBusy ? 'Sending…' : 'Send to front desk'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowEscalateBox(false)}
                    className="px-3 py-2 rounded-md border border-[#E8CFA1] bg-white text-[#3B5257] font-semibold cursor-pointer"
                  >
                    Dismiss
                  </button>
                </div>
              </form>
            )}
          </div>

          <div className="px-3 py-2 border-t border-[#D8DFD9] bg-white flex gap-1.5 overflow-x-auto shrink-0">
            {['Whitening price?', 'Aaj slots khali hain?', 'آج کون سے اوقات دستیاب ہیں؟'].map(
              (chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => void sendMessage(chip)}
                  className="px-2.5 py-1 rounded-sm bg-[#F7F5F0] border border-[#D8DFD9] text-[#102E34] text-[11px] font-medium whitespace-nowrap hover:border-[#426F77] cursor-pointer"
                >
                  {chip}
                </button>
              )
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void sendMessage(input);
            }}
            className="p-3 border-t border-[#D8DFD9] bg-white flex items-center gap-2 shrink-0"
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              maxLength={600}
              placeholder="Ask or book in English, Urdu, or Roman Urdu…"
              className="flex-1 min-h-[40px] px-3.5 py-2 rounded-md border border-[#D8DFD9] bg-[#F7F5F0]/60 text-sm text-[#102E34] focus:bg-white focus:border-[#102E34]"
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              aria-label="Send message"
              className="w-10 h-10 rounded-md bg-[#102E34] text-[#F7F5F0] flex items-center justify-center hover:bg-[#194149] disabled:opacity-45 cursor-pointer shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
