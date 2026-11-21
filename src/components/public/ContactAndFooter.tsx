import React, { useState } from 'react';
import { ArrowUp, CheckCircle2, LogIn, Mail, MapPin, Phone, ParkingCircle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
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
  }) => Promise<Inquiry>;
  onOpenChat: () => void;
  onToast: (msg: string) => void;
}

export function ContactAndFooter({
  settings,
  onSubmitInquiry,
  onOpenChat,
  onToast,
}: ContactAndFooterProps) {
  const { user, signingIn, signInWithGoogle } = useAuth();
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [topic, setTopic] = useState('general');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [sentInquiry, setSentInquiry] = useState<Inquiry | null>(null);

  async function handleEnquiry(e: React.FormEvent) {
    e.preventDefault();
    setErrMsg(null);
    setSentInquiry(null);

    if (!user) {
      setErrMsg('Please sign in with Google to submit your inquiry to our front desk.');
      return;
    }
    if (name.trim().length < 2 || /\d/.test(name)) {
      setErrMsg('Please enter your name (2+ characters, no digits).');
      return;
    }
    if (contact.trim().length < 5) {
      setErrMsg('Please add a phone number or email so we can reply.');
      return;
    }
    if (message.trim().length < 5) {
      setErrMsg('Please write a short message.');
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
      });
      setSentInquiry(q);
      setName('');
      setContact('');
      setMessage('');
      onToast('Inquiry received by the front desk!');
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
      <section className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 pt-8 pb-4">
        <div className="rounded-3xl bg-[#12262e] text-white p-6 sm:p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="max-w-2xl">
            <h2 className="text-2xl sm:text-3xl font-extrabold">
              Tooth pain or swelling right now?
            </h2>
            <p className="mt-2 text-sm text-white/80 leading-relaxed">
              Tell the AI assistant — urgent inquiries are flagged to our team automatically during opening hours. For severe swelling, trouble breathing, or uncontrolled bleeding, call your local emergency number first.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 shrink-0">
            <a
              href={`tel:${settings.phone.replace(/\s+/g, '')}`}
              className="px-5 py-3 rounded-full bg-[#d98a5f] text-white text-sm font-bold hover:opacity-90 transition"
            >
              Call {settings.phone}
            </a>
            <button
              type="button"
              onClick={onOpenChat}
              className="px-5 py-3 rounded-full bg-white text-[#12262e] text-sm font-bold hover:bg-[#e7eff1] transition cursor-pointer"
            >
              Message the assistant
            </button>
          </div>
        </div>
      </section>

      {/* Visit & Contact Form */}
      <section id="contact" className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 py-14">
        <div className="mb-8">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-[#4d8a96]">
            Visit us, or send a message
          </h2>
          <p className="mt-2 text-base text-[#42565c] max-w-2xl">
            Check opening hours or send a question about insurance, accessibility, or treatment plans. Messages persist directly to our staff Inquiries inbox.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-10 items-start">
          <div className="space-y-4">
            <div className="bg-[#f8fbfb] border border-[#e3ebec] rounded-2xl p-5 space-y-4 text-sm">
              <div className="flex items-start gap-3">
                <MapPin className="w-5 h-5 text-[#4d8a96] shrink-0 mt-0.5" />
                <div>
                  <b className="block text-[#12262e]">Address</b>
                  <span className="text-[#42565c]">{settings.address}</span>
                </div>
              </div>
              <a href={`tel:${settings.phone.replace(/\s+/g, '')}`} className="flex items-start gap-3 hover:opacity-80">
                <Phone className="w-5 h-5 text-[#4d8a96] shrink-0 mt-0.5" />
                <div>
                  <b className="block text-[#12262e]">Phone / WhatsApp</b>
                  <span className="text-[#42565c]">{settings.phone}</span>
                </div>
              </a>
              <a href={`mailto:${settings.email}`} className="flex items-start gap-3 hover:opacity-80">
                <Mail className="w-5 h-5 text-[#4d8a96] shrink-0 mt-0.5" />
                <div>
                  <b className="block text-[#12262e]">Email</b>
                  <span className="text-[#42565c]">{settings.email}</span>
                </div>
              </a>
              <div className="flex items-start gap-3">
                <ParkingCircle className="w-5 h-5 text-[#4d8a96] shrink-0 mt-0.5" />
                <div>
                  <b className="block text-[#12262e]">Getting here</b>
                  <span className="text-[#42565c]">
                    Free parking behind the building · 3 minutes from central transit · step-free entrance
                  </span>
                </div>
              </div>
            </div>

            <div className="border border-[#e3ebec] rounded-2xl overflow-hidden divide-y divide-[#e3ebec] text-sm">
              <div className="px-5 py-3 flex justify-between">
                <b className="text-[#12262e]">Monday – Friday</b>
                <span className="text-[#42565c]">
                  {monHours.enabled
                    ? `${formatTimeLabel(monHours.start)} – ${formatTimeLabel(monHours.end)}`
                    : 'Closed'}
                </span>
              </div>
              <div className="px-5 py-3 flex justify-between">
                <b className="text-[#12262e]">Saturday</b>
                <span className="text-[#42565c]">
                  {satHours.enabled
                    ? `${formatTimeLabel(satHours.start)} – ${formatTimeLabel(satHours.end)}`
                    : 'Closed'}
                </span>
              </div>
              <div className="px-5 py-3 flex justify-between bg-[#fcf7f7]">
                <b className="text-[#12262e]">Sunday</b>
                <span className="text-rose-600 font-semibold">
                  {settings.workingHours.sun.enabled
                    ? `${formatTimeLabel(settings.workingHours.sun.start)} – ${formatTimeLabel(settings.workingHours.sun.end)}`
                    : 'Closed'}
                </span>
              </div>
              <div className="px-5 py-3 flex justify-between">
                <b className="text-[#12262e]">AI Assistant</b>
                <span className="text-[#2e8a5c] font-semibold">24/7 — English / اردو / Roman Urdu</span>
              </div>
            </div>
          </div>

          <form
            onSubmit={handleEnquiry}
            noValidate
            className="bg-white rounded-[22px] p-6 sm:p-8 shadow-lg border border-[#e3ebec] space-y-4"
          >
            {!user && (
              <div className="p-3.5 rounded-xl bg-[#e7eff1] flex items-center justify-between gap-3">
                <span className="text-xs font-semibold text-[#12262e]">
                  Sign in with Google to send an inquiry
                </span>
                <button
                  type="button"
                  disabled={signingIn}
                  onClick={() => void signInWithGoogle()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#4d8a96] text-white text-xs font-bold cursor-pointer shrink-0"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>{signingIn ? 'Signing in…' : 'Sign in'}</span>
                </button>
              </div>
            )}

            {sentInquiry && (
              <div className="p-4 rounded-xl bg-[#eef7f1] border border-[#b9dfc9] text-sm text-[#12262e]">
                <div className="flex items-center gap-2 font-extrabold text-[#2e8a5c]">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Message sent!</span>
                </div>
                <p className="text-xs text-[#42565c] mt-1">
                  Thanks, {sentInquiry.name.split(' ')[0]} — our front desk team has received your inquiry.
                </p>
              </div>
            )}

            <label className="block">
              <span className="block text-xs font-bold text-[#42565c] mb-1">Full name</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#cfdee1] text-sm"
              />
            </label>

            <label className="block">
              <span className="block text-xs font-bold text-[#42565c] mb-1">Phone or email</span>
              <input
                type="text"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                maxLength={120}
                placeholder="+1 555 010 2030 or name@example.com"
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#cfdee1] text-sm"
              />
            </label>

            <label className="block">
              <span className="block text-xs font-bold text-[#42565c] mb-1">Topic</span>
              <select
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#cfdee1] bg-white text-sm"
              >
                <option value="general">General question</option>
                <option value="insurance">Insurance &amp; pricing</option>
                <option value="accessibility">Accessibility &amp; nervous patients</option>
                <option value="records">Records &amp; referrals</option>
              </select>
            </label>

            <label className="block">
              <span className="block text-xs font-bold text-[#42565c] mb-1">Message</span>
              <textarea
                rows={3}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={500}
                placeholder="How can our front desk help you?"
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#cfdee1] text-sm"
              />
            </label>

            {errMsg && (
              <p role="alert" className="text-xs font-bold text-rose-600">
                {errMsg}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full py-3.5 rounded-full bg-[#4d8a96] text-white font-extrabold text-sm hover:bg-[#3d7280] transition cursor-pointer disabled:opacity-60"
            >
              {busy ? 'Sending message…' : 'Send inquiry'}
            </button>
          </form>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#12262e] text-white py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div>
            <b className="text-lg font-extrabold">{settings.clinicName}</b>
            <p className="text-xs text-white/70 mt-1">
              Dental Clinic Website &amp; Management System · Fictional clinic sample environment
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-xs text-white/80">
            <a href="#services" className="hover:text-white">Services</a>
            <a href="#pricing" className="hover:text-white">Prices</a>
            <a href="#doctors" className="hover:text-white">Doctors</a>
            <a href="#book" className="hover:text-white">Book Visit</a>
            <a
              href="#top"
              aria-label="Back to top"
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white font-bold"
            >
              <ArrowUp className="w-3.5 h-3.5" />
              <span>Top</span>
            </a>
          </div>
        </div>
      </footer>
    </>
  );
}
