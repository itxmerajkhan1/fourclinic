import React, { useState } from 'react';
import {
  ArrowUp,
  CheckCircle2,
  Mail,
  MapPin,
  ParkingCircle,
  Phone,
  ShieldCheck,
} from 'lucide-react';
import { formatTimeLabel, formatUserFriendlyError } from '../../lib/validation';
import type { ClinicSettings, Inquiry } from '../../types/clinic';

interface ContactAndFooterProps {
  settings: ClinicSettings;
  onSubmitInquiry: (input: {
    name: string;
    contact: string;
    topic: string;
    message: string;
    channel: 'website' | 'chatbot';
    honeypot?: string;
  }) => Promise<Inquiry>;
  onOpenChat: () => void;
  onNavigateSection: (sectionId: string) => void;
  onOpenMyVisits: () => void;
  onOpenStaffDashboard: () => void;
  onToast: (msg: string) => void;
}

export function ContactAndFooter({
  settings,
  onSubmitInquiry,
  onOpenChat,
  onNavigateSection,
  onOpenMyVisits,
  onOpenStaffDashboard,
  onToast,
}: ContactAndFooterProps) {
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [topic, setTopic] = useState('general');
  const [message, setMessage] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [busy, setBusy] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [sentInquiry, setSentInquiry] = useState<Inquiry | null>(null);

  async function handleEnquiry(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setErrMsg(null);
    setSentInquiry(null);

    if (name.trim().length < 2 || /\d/.test(name)) {
      setErrMsg('Please enter your name (2+ characters, no digits).');
      return;
    }
    if (contact.trim().length < 5) {
      setErrMsg('Please add a phone number or email so our staff can reply.');
      return;
    }
    if (message.trim().length < 5) {
      setErrMsg('Please write a message of at least 5 characters.');
      return;
    }

    setBusy(true);
    try {
      const q = await onSubmitInquiry({
        name,
        contact,
        topic,
        message,
        channel: 'website',
        honeypot,
      });
      setSentInquiry(q);
      setName('');
      setContact('');
      setMessage('');
      onToast(`Inquiry ${q.referenceCode || ''} received by the front desk.`);
    } catch (err) {
      setErrMsg(formatUserFriendlyError(err, 'Unable to send inquiry.'));
    } finally {
      setBusy(false);
    }
  }

  const monHours = settings.workingHours.mon;
  const satHours = settings.workingHours.sat;

  return (
    <>
      {/* Emergency Callout */}
      <section className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 pt-16 pb-4">
        <div className="rounded-lg bg-[#102E34] text-[#F7F5F0] border-l-4 border-l-[#C7775F] p-6 sm:p-9 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="max-w-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#C7775F]">
              Urgent Care Notice
            </p>
            <h2 className="mt-1.5 font-editorial text-3xl sm:text-[38px] text-white leading-tight">
              Experiencing acute dental pain or swelling?
            </h2>
            <p className="mt-2.5 text-sm text-[#DCE8E3]/85 leading-relaxed">
              This is a fictional portfolio demo clinic. For real dental emergencies, severe
              swelling, difficulty breathing, or uncontrolled bleeding, contact local emergency
              services or a licensed clinic immediately.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 shrink-0">
            <a
              href={`tel:${settings.phone.replace(/\s+/g, '')}`}
              className="px-5 py-3 rounded-md bg-[#C7775F] text-white text-xs sm:text-sm font-semibold hover:opacity-95 transition fc-tabular"
            >
              Demo Phone: {settings.phone}
            </a>
            <button
              type="button"
              onClick={onOpenChat}
              className="px-5 py-3 rounded-md bg-[#F7F5F0] text-[#102E34] text-xs sm:text-sm font-semibold hover:bg-white transition cursor-pointer"
            >
              Message AI Assistant
            </button>
          </div>
        </div>
      </section>

      {/* Visit & Contact Form */}
      <section
        id="contact"
        className="scroll-mt-24 max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 py-16 lg:py-20"
      >
        <div className="flex flex-wrap items-end justify-between gap-6 pb-8 border-b border-[#D8DFD9]">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#426F77]">
              09 · Contact &amp; Hours
            </p>
            <h2 className="mt-2 font-editorial text-4xl sm:text-[48px] text-[#102E34] leading-[1.05]">
              Visit us, or send a message
            </h2>
          </div>
          <p className="text-sm text-[#3B5257] max-w-md leading-relaxed">
            Questions go directly to the staff CRM queue without signing in. Human follow-up takes
            place during configured clinic hours.
          </p>
        </div>

        <div className="mt-10 grid lg:grid-cols-2 gap-10 items-start">
          <div className="space-y-5">
            <div className="bg-white border border-[#D8DFD9] rounded-lg divide-y divide-[#E6EAE4] text-sm">
              <div className="p-4 sm:px-5 flex items-start gap-3.5">
                <MapPin className="w-4 h-4 text-[#426F77] shrink-0 mt-1" />
                <div>
                  <b className="block text-xs font-semibold uppercase tracking-wider text-[#5B7074]">
                    Fictional Demo Address
                  </b>
                  <span className="mt-0.5 block text-[#102E34]">{settings.address}</span>
                </div>
              </div>
              <a
                href={`tel:${settings.phone.replace(/\s+/g, '')}`}
                className="p-4 sm:px-5 flex items-start gap-3.5 hover:bg-[#F7F5F0]/60 transition"
              >
                <Phone className="w-4 h-4 text-[#426F77] shrink-0 mt-1" />
                <div>
                  <b className="block text-xs font-semibold uppercase tracking-wider text-[#5B7074]">
                    Sample Phone / WhatsApp
                  </b>
                  <span className="mt-0.5 block text-[#102E34] fc-tabular">{settings.phone}</span>
                </div>
              </a>
              <a
                href={`mailto:${settings.email}`}
                className="p-4 sm:px-5 flex items-start gap-3.5 hover:bg-[#F7F5F0]/60 transition"
              >
                <Mail className="w-4 h-4 text-[#426F77] shrink-0 mt-1" />
                <div>
                  <b className="block text-xs font-semibold uppercase tracking-wider text-[#5B7074]">
                    Sample Email
                  </b>
                  <span className="mt-0.5 block text-[#102E34]">{settings.email}</span>
                </div>
              </a>
              <div className="p-4 sm:px-5 flex items-start gap-3.5">
                <ParkingCircle className="w-4 h-4 text-[#426F77] shrink-0 mt-1" />
                <div>
                  <b className="block text-xs font-semibold uppercase tracking-wider text-[#5B7074]">
                    Accessibility &amp; Demo Scope
                  </b>
                  <span className="mt-0.5 block text-[#3B5257]">
                    Portfolio environment — all addresses, phones, and clinic records are demo
                    placeholders.
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-white border border-[#D8DFD9] rounded-lg divide-y divide-[#E6EAE4] text-sm">
              <div className="px-5 py-3 flex justify-between fc-tabular">
                <b className="text-[#102E34] font-semibold">Monday – Friday</b>
                <span className="text-[#3B5257]">
                  {monHours.enabled
                    ? `${formatTimeLabel(monHours.start)} – ${formatTimeLabel(monHours.end)}`
                    : 'Closed'}
                </span>
              </div>
              <div className="px-5 py-3 flex justify-between fc-tabular">
                <b className="text-[#102E34] font-semibold">Saturday</b>
                <span className="text-[#3B5257]">
                  {satHours.enabled
                    ? `${formatTimeLabel(satHours.start)} – ${formatTimeLabel(satHours.end)}`
                    : 'Closed'}
                </span>
              </div>
              <div className="px-5 py-3 flex justify-between bg-[#FBECEC]/45 fc-tabular">
                <b className="text-[#102E34] font-semibold">Sunday</b>
                <span className="text-[#A12A2A] font-semibold">
                  {settings.workingHours.sun.enabled
                    ? `${formatTimeLabel(settings.workingHours.sun.start)} – ${formatTimeLabel(
                        settings.workingHours.sun.end
                      )}`
                    : 'Closed'}
                </span>
              </div>
              <div className="px-5 py-3 flex justify-between">
                <b className="text-[#102E34] font-semibold">Automated AI Chat</b>
                <span className="text-[#1E6B4B] font-semibold">English · اردو · Roman Urdu</span>
              </div>
            </div>
          </div>

          <form
            onSubmit={handleEnquiry}
            noValidate
            className="bg-white rounded-lg p-6 sm:p-8 border border-[#D8DFD9] space-y-4"
          >
            {/* Anti-spam honeypot */}
            <div className="sr-only" aria-hidden="true">
              <label>
                Website
                <input
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  value={honeypot}
                  onChange={(e) => setHoneypot(e.target.value)}
                />
              </label>
            </div>

            <div className="p-3 rounded-md bg-[#DCE8E3]/50 border border-[#D8DFD9] flex items-center gap-2 text-xs text-[#3B5257]">
              <ShieldCheck className="w-4 h-4 text-[#426F77] shrink-0" />
              <span>
                Guest inquiries go directly to the clinic front-desk queue — no login required.
              </span>
            </div>

            {sentInquiry && (
              <div className="p-4 rounded-md bg-[#E6F2EC] border border-[#B8DEC9] text-sm text-[#102E34] space-y-2">
                <div className="flex items-center gap-2 font-bold text-[#1E6B4B]">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Inquiry {sentInquiry.referenceCode || ''} received</span>
                </div>
                <p className="text-xs text-[#3B5257]">
                  Thanks, {sentInquiry.name.split(' ')[0]} — your message is queued for our
                  front-desk team during clinic hours.
                </p>
                <button
                  type="button"
                  onClick={onOpenMyVisits}
                  className="text-xs font-semibold text-[#1E6B4B] underline underline-offset-4 cursor-pointer"
                >
                  Track inquiry status in My Visits →
                </button>
              </div>
            )}

            <label className="block">
              <span className="block text-xs font-semibold text-[#3B5257] mb-1.5">
                Full name *
              </span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                placeholder="e.g. Jordan Rivera"
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-md border border-[#D8DFD9] bg-[#F7F5F0]/60 text-sm text-[#102E34] focus:bg-white focus:border-[#102E34]"
              />
            </label>

            <label className="block">
              <span className="block text-xs font-semibold text-[#3B5257] mb-1.5">
                Phone or email *
              </span>
              <input
                type="text"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                maxLength={120}
                placeholder="+1 555 010 2030 or name@example.com"
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-md border border-[#D8DFD9] bg-[#F7F5F0]/60 text-sm text-[#102E34] focus:bg-white focus:border-[#102E34]"
              />
            </label>

            <label className="block">
              <span className="block text-xs font-semibold text-[#3B5257] mb-1.5">Topic</span>
              <select
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-md border border-[#D8DFD9] bg-[#F7F5F0]/60 text-sm text-[#102E34] focus:bg-white focus:border-[#102E34]"
              >
                <option value="general">General question</option>
                <option value="insurance">Sample pricing &amp; plans</option>
                <option value="accessibility">Accessibility &amp; nervous patients</option>
                <option value="records">Records &amp; referrals</option>
              </select>
            </label>

            <label className="block">
              <span className="block text-xs font-semibold text-[#3B5257] mb-1.5">Message *</span>
              <textarea
                rows={3}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={500}
                placeholder="How can our front desk help you?"
                className="w-full px-3.5 py-2.5 rounded-md border border-[#D8DFD9] bg-[#F7F5F0]/60 text-sm text-[#102E34] focus:bg-white focus:border-[#102E34]"
              />
            </label>

            {errMsg && (
              <p
                role="alert"
                className="text-xs font-semibold text-[#A12A2A] bg-[#FBECEC] border border-[#E8BABA] rounded-md p-3"
              >
                {errMsg}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full py-3.5 rounded-md bg-[#102E34] text-[#F7F5F0] font-semibold text-sm hover:bg-[#194149] transition cursor-pointer disabled:opacity-60"
            >
              {busy ? 'Sending message…' : 'Send inquiry'}
            </button>
          </form>
        </div>
      </section>

      {/* Architectural Editorial Footer */}
      <footer className="bg-[#102E34] text-[#F7F5F0] pt-14 pb-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 space-y-10">
          <div className="grid grid-cols-1 md:grid-cols-[1.5fr_1fr_1fr] gap-8 pb-8 border-b border-white/10">
            <div>
              <b className="font-editorial text-3xl font-normal text-white">
                {settings.clinicName}
              </b>
              <p className="text-xs sm:text-sm text-[#DCE8E3]/75 mt-3 max-w-md leading-relaxed">
                Portfolio dental clinic web platform and operations console. All practitioners,
                patient reviews, fee schedules, and contact channels shown are fictional sample
                data.
              </p>
            </div>

            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#DCE8E3]/60 mb-3">
                Practice
              </p>
              <nav aria-label="Footer navigation" className="grid grid-cols-2 gap-y-2.5 gap-x-4 text-xs font-medium text-[#DCE8E3]/90">
                <a
                  href="/#top"
                  onClick={(e) => {
                    e.preventDefault();
                    onNavigateSection('top');
                  }}
                  className="hover:text-white transition"
                >
                  Home
                </a>
                <a
                  href="/#services"
                  onClick={(e) => {
                    e.preventDefault();
                    onNavigateSection('services');
                  }}
                  className="hover:text-white transition"
                >
                  Treatments
                </a>
                <a
                  href="/#pricing"
                  onClick={(e) => {
                    e.preventDefault();
                    onNavigateSection('pricing');
                  }}
                  className="hover:text-white transition"
                >
                  Fee Schedule
                </a>
                <a
                  href="/#doctors"
                  onClick={(e) => {
                    e.preventDefault();
                    onNavigateSection('doctors');
                  }}
                  className="hover:text-white transition"
                >
                  Doctors
                </a>
                <a
                  href="/#book"
                  onClick={(e) => {
                    e.preventDefault();
                    onNavigateSection('book');
                  }}
                  className="hover:text-white transition"
                >
                  Book Visit
                </a>
                <a
                  href="/#contact"
                  onClick={(e) => {
                    e.preventDefault();
                    onNavigateSection('contact');
                  }}
                  className="hover:text-white transition"
                >
                  Contact
                </a>
              </nav>
            </div>

            <div className="flex flex-col justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#DCE8E3]/60 mb-3">
                  Portals
                </p>
                <div className="flex flex-col gap-2.5 text-xs font-medium text-[#DCE8E3]/90 items-start">
                  <a
                    href="/my-visits"
                    onClick={(e) => {
                      e.preventDefault();
                      onOpenMyVisits();
                    }}
                    className="hover:text-white transition"
                  >
                    Patient My Visits Portal
                  </a>
                  <a
                    href="/staff"
                    onClick={(e) => {
                      e.preventDefault();
                      onOpenStaffDashboard();
                    }}
                    className="hover:text-white underline underline-offset-4 transition"
                  >
                    Clinic Staff Workspace
                  </a>
                </div>
              </div>

              <a
                href="/#top"
                onClick={(e) => {
                  e.preventDefault();
                  onNavigateSection('top');
                }}
                aria-label="Back to top"
                className="inline-flex items-center gap-1.5 self-start px-3.5 py-2 rounded-md border border-white/20 text-xs font-semibold text-[#F7F5F0] hover:bg-white/10 transition"
              >
                <ArrowUp className="w-3.5 h-3.5" />
                <span>Back to top</span>
              </a>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-[11px] text-[#DCE8E3]/60">
            <span>© {new Date().getFullYear()} FourClinic. Fictional portfolio clinic demonstration.</span>
            <span>AI Receptionist is non-diagnostic and reads sample clinic catalog records.</span>
          </div>
        </div>
      </footer>
    </>
  );
}
