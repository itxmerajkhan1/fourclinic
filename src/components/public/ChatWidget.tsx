import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CalendarCheck,
  CalendarPlus,
  CheckCircle2,
  Download,
  LogIn,
  MessageCircle,
  Send,
  X,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
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
  Appointment,
  AppointmentSource,
  ClinicSettings,
  Doctor,
  Inquiry,
  InquiryPriority,
  ScheduleOverride,
  ServiceItem,
  SlotLock,
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
  confirmedAppointment?: Appointment;
}

interface ChatWidgetProps {
  open: boolean;
  onToggle: (open: boolean) => void;
  doctors: Doctor[];
  services: ServiceItem[];
  schedules: ScheduleOverride[];
  slotLocks: SlotLock[];
  settings: ClinicSettings;
  catalogSeeded: boolean;
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
  onBookAppointment,
  onPrefillBooking,
  onEscalateInquiry,
  onToast,
}: ChatWidgetProps) {
  const { user, signingIn, signInWithGoogle } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: 'Hi! Ask me about dental treatments, pricing, hours, or open slots — or tell me what visit you want to book in English, Urdu (اردو), or Roman Urdu.',
    },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [confirmingMsgId, setConfirmingMsgId] = useState<string | null>(null);
  const [escalateContact, setEscalateContact] = useState('');
  const [showEscalateBox, setShowEscalateBox] = useState(false);
  const [escalateUrgent, setEscalateUrgent] = useState(false);
  const [escalatingBusy, setEscalatingBusy] = useState(false);
  const [lastUserMsg, setLastUserMsg] = useState('');
  const [lastSuggestedServiceId, setLastSuggestedServiceId] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
  }, [doctors, services, lastSuggestedServiceId, schedules, slotLocks, settings]);

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
    if (!user) {
      await signInWithGoogle();
      return;
    }
    if (!catalogSeeded) {
      onToast('Clinic catalog is still in preview mode. Please use the booking form after Admin setup.');
      return;
    }
    setConfirmingMsgId(msgId);
    try {
      const created = await onBookAppointment({
        patientName: draft.patientName,
        patientPhone: draft.patientPhone,
        patientEmail: user.email || undefined,
        serviceId: draft.serviceId,
        doctorId: draft.doctorId,
        date: draft.date,
        time: draft.time,
        notes: draft.notes || 'Requested via AI receptionist chat',
        source: 'chatbot',
      });
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId
            ? { ...m, confirmedAppointment: created }
            : m
        )
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
    if (!user) {
      await signInWithGoogle();
      return;
    }
    if (escalateContact.trim().length < 5) {
      onToast('Please provide a phone or email for front-desk follow-up.');
      return;
    }
    setEscalatingBusy(true);
    try {
      await onEscalateInquiry({
        name: user.displayName || 'Chat Visitor',
        contact: escalateContact.trim(),
        topic: escalateUrgent ? 'urgent' : 'chatbot',
        message: lastUserMsg || 'Requested front-desk callback from AI chat.',
        channel: 'chatbot',
        priority: escalateUrgent ? 'urgent' : 'normal',
      });
      setShowEscalateBox(false);
      setEscalateContact('');
      setMessages((prev) => [
        ...prev,
        {
          id: `esc_ok_${Date.now()}`,
          role: 'assistant',
          text: 'Your message has been sent to our front-desk queue. A team member will follow up with you shortly.',
        },
      ]);
      onToast('Sent to our front desk Inquiries queue!');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to send to front desk.');
    } finally {
      setEscalatingBusy(false);
      scrollBottom();
    }
  }

  return (
    <div className="fixed bottom-3 right-3 sm:bottom-5 sm:right-5 z-50">
      {!open ? (
        <button
          type="button"
          onClick={() => onToggle(true)}
          aria-label="Open FourClinic AI Assistant"
          className="inline-flex items-center gap-2.5 px-4 sm:px-5 py-3 sm:py-3.5 rounded-full bg-[#4d8a96] text-white font-extrabold text-sm shadow-2xl hover:bg-[#3d7280] transition cursor-pointer"
        >
          <MessageCircle className="w-5 h-5" />
          <span>Ask FourClinic AI</span>
        </button>
      ) : (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="FourClinic AI Assistant"
          className="w-[min(410px,calc(100vw-24px))] h-[min(560px,82vh)] bg-white rounded-3xl shadow-2xl border border-[#cfdee1] flex flex-col overflow-hidden"
        >
          <div className="px-4 py-3.5 bg-[#4d8a96] text-white flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center font-extrabold">
                F
              </span>
              <div>
                <b className="block text-sm font-extrabold">FourClinic AI Receptionist</b>
                <small className="text-[11px] text-white/85">
                  English · اردو · Roman Urdu (Non-diagnostic)
                </small>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  setEscalateUrgent(false);
                  setShowEscalateBox((v) => !v);
                }}
                className="px-2.5 py-1 rounded-full bg-white/15 hover:bg-white/25 text-[11px] font-bold cursor-pointer"
              >
                Human Desk
              </button>
              <button
                type="button"
                aria-label="Close chat"
                onClick={() => onToggle(false)}
                className="p-1.5 rounded-full hover:bg-white/20 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div ref={listRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#f9fcfc]">
            {messages.map((m) => {
              const draft = m.bookingDraft;
              const draftSvc = draft ? services.find((s) => s.id === draft.serviceId) : undefined;
              const draftDoc = draft ? doctors.find((d) => d.id === draft.doctorId) : undefined;

              return (
                <div key={m.id} className="space-y-2">
                  <div
                    className={`fc-pop max-w-[88%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                      m.role === 'user'
                        ? 'ml-auto bg-[#4d8a96] text-white rounded-br-sm'
                        : 'mr-auto bg-white border border-[#e3ebec] text-[#12262e] rounded-bl-sm'
                    }`}
                  >
                    {m.urgent && (
                      <div className="flex items-center gap-1.5 text-rose-600 font-extrabold text-xs mb-1">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>Urgent symptom flagged</span>
                      </div>
                    )}
                    <p className="whitespace-pre-wrap">{m.text}</p>
                  </div>

                  {/* Interactive Chat Confirmation Card */}
                  {m.role === 'assistant' && draft && !m.confirmedAppointment && (
                    <div className="mr-auto max-w-[92%] p-3.5 rounded-2xl bg-[#f2f7f8] border border-[#cfdee1] text-xs space-y-2">
                      <div className="flex items-center gap-1.5 font-extrabold text-[#12262e]">
                        <CalendarCheck className="w-4 h-4 text-[#4d8a96]" />
                        <span>Ready to Submit Appointment Request</span>
                      </div>
                      <div className="space-y-0.5 text-[#42565c]">
                        <p>
                          <b>{draftSvc?.name || draft.serviceId}</b> ({draftSvc?.priceLabel || ''} ·{' '}
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
                          disabled={confirmingMsgId === m.id || signingIn}
                          onClick={() => void handleConfirmDraftBooking(m.id, draft)}
                          className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-full bg-[#4d8a96] text-white font-bold hover:bg-[#3d7280] disabled:opacity-60 cursor-pointer"
                        >
                          {!user && <LogIn className="w-3.5 h-3.5" />}
                          <span>
                            {confirmingMsgId === m.id
                              ? 'Reserving…'
                              : user
                                ? 'Confirm & Submit Request'
                                : 'Sign in & Confirm'}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            onPrefillBooking(draft.serviceId, draft.doctorId, draft.date);
                            onToggle(false);
                          }}
                          className="px-3 py-2 rounded-full border border-[#cfdee1] bg-white font-bold text-[#12262e] cursor-pointer"
                        >
                          Edit
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Real Firestore-Confirmed Reference Card */}
                  {m.confirmedAppointment && (
                    <div className="mr-auto max-w-[92%] p-3.5 rounded-2xl bg-[#eef7f1] border border-[#b9dfc9] text-xs space-y-2 text-[#12262e]">
                      <div className="flex items-center gap-1.5 font-extrabold text-[#2e8a5c]">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Request {m.confirmedAppointment.referenceCode} Recorded!</span>
                      </div>
                      <p className="text-[#42565c]">
                        {m.confirmedAppointment.serviceName} ·{' '}
                        {formatDateLabel(m.confirmedAppointment.date)} at{' '}
                        {formatTimeLabel(m.confirmedAppointment.time)} with{' '}
                        {m.confirmedAppointment.doctorName}. Status: <b>Pending clinic confirmation</b>.
                      </p>
                      <button
                        type="button"
                        onClick={() =>
                          downloadAppointmentIcs(m.confirmedAppointment!, settings.address)
                        }
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-[#b9dfc9] font-bold text-[#2e8a5c] cursor-pointer"
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
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#e7eff1] text-[#3d7280] text-xs font-bold hover:bg-[#d6e6ea] cursor-pointer"
                    >
                      <CalendarPlus className="w-3.5 h-3.5" />
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
              <div className="inline-flex gap-1.5 px-4 py-3 rounded-2xl bg-white border border-[#e3ebec]">
                <span className="fc-typing-dot w-2 h-2 rounded-full bg-[#9db8be]" />
                <span className="fc-typing-dot w-2 h-2 rounded-full bg-[#9db8be]" />
                <span className="fc-typing-dot w-2 h-2 rounded-full bg-[#9db8be]" />
              </div>
            )}

            {showEscalateBox && (
              <form
                onSubmit={handleEscalateSubmit}
                className="p-3 rounded-2xl bg-amber-50 border border-amber-200 space-y-2 text-xs"
              >
                <b className="block text-[#12262e]">
                  {escalateUrgent
                    ? 'Send urgent callback request to front desk'
                    : 'Forward this inquiry to our human front desk'}
                </b>
                <input
                  type="text"
                  value={escalateContact}
                  onChange={(e) => setEscalateContact(e.target.value)}
                  placeholder="Phone / WhatsApp or email"
                  className="w-full px-3 py-1.5 rounded-lg border border-amber-300 bg-white text-xs"
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={escalatingBusy}
                    className="flex-1 py-1.5 rounded-full bg-[#12262e] text-white font-bold cursor-pointer disabled:opacity-60"
                  >
                    {escalatingBusy ? 'Sending…' : user ? 'Send to front desk' : 'Sign in & send'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowEscalateBox(false)}
                    className="px-3 py-1.5 rounded-full border border-amber-300 text-[#42565c] font-semibold cursor-pointer"
                  >
                    Dismiss
                  </button>
                </div>
              </form>
            )}
          </div>

          <div className="px-3 py-2 border-t border-[#e3ebec] bg-white flex gap-1.5 overflow-x-auto">
            {['Whitening price?', 'Aaj slots khali hain?', 'آج کون سے اوقات دستیاب ہیں؟'].map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => void sendMessage(chip)}
                className="px-2.5 py-1 rounded-full bg-[#f2f7f8] text-[#3d7280] text-[11px] font-semibold whitespace-nowrap hover:bg-[#e7eff1] cursor-pointer"
              >
                {chip}
              </button>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void sendMessage(input);
            }}
            className="p-3 border-t border-[#e3ebec] bg-white flex items-center gap-2"
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              maxLength={600}
              placeholder="Ask or book in English, Urdu, or Roman Urdu…"
              className="flex-1 px-3.5 py-2 rounded-full border border-[#cfdee1] text-sm focus:outline-none focus:border-[#4d8a96]"
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              aria-label="Send message"
              className="w-10 h-10 rounded-full bg-[#4d8a96] text-white flex items-center justify-center hover:bg-[#3d7280] disabled:opacity-50 cursor-pointer shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
