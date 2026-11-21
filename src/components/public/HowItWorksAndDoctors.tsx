import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { CLINIC_FAQS, SAMPLE_REVIEWS } from '../../data/sampleSeed';
import type { Doctor, ServiceItem } from '../../types/clinic';

const DEMO_CONVERSATION: Array<{ from: 'user' | 'bot'; text: string }> = [
  { from: 'user', text: 'Hi! How much is teeth whitening?' },
  {
    from: 'bot',
    text: 'Teeth whitening is $180–320 depending on the method. Want me to check open Saturday slots?',
  },
  { from: 'user', text: 'Yes please — Saturday morning?' },
  {
    from: 'bot',
    text: 'We are open Saturdays 9 AM – 1 PM. Dr. Okafor has 10:00 AM open. You can reserve it right in the booking section!',
  },
];

interface HowItWorksAndDoctorsProps {
  doctors: Doctor[];
  services: ServiceItem[];
  onBookDoctor: (doctorId: string, defaultServiceId: string) => void;
  onOpenChat: () => void;
}

export function HowItWorksAndDoctors({
  doctors,
  services,
  onBookDoctor,
  onOpenChat,
}: HowItWorksAndDoctorsProps) {
  const [demoCount, setDemoCount] = useState(2);
  const [reviewIdx, setReviewIdx] = useState(0);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const activeDoctors = doctors.filter((d) => d.active);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDemoCount(DEMO_CONVERSATION.length);
      return;
    }
    const id = window.setInterval(() => {
      setDemoCount((c) => (c >= DEMO_CONVERSATION.length ? 1 : c + 1));
    }, 2200);
    return () => window.clearInterval(id);
  }, []);

  return (
    <>
      {/* How It Works & Assistant Preview */}
      <section id="how" className="bg-[#f2f7f8] py-14">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 grid lg:grid-cols-2 gap-12 items-start">
          <div>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-[#4d8a96]">
              Questions at 11 PM? Our assistant answers.
            </h2>
            <p className="mt-3.5 text-base text-[#42565c] leading-relaxed max-w-lg">
              Our Gemini-powered assistant handles clinic hours, pricing, insurance, and live slot availability in English, Urdu, and Roman Urdu — and flags urgent tooth pain to our front desk team without making medical diagnoses.
            </p>
            <ol className="mt-6 space-y-3">
              {[
                { title: 'Ask', desc: 'Hours, pricing, services, PPO insurance — in English, Urdu, or Roman Urdu.' },
                { title: 'Check Real Availability', desc: 'Reads live non-PII doctor schedules & locked slots before suggesting times.' },
                { title: 'Confirm Atomically', desc: 'Locks your slot with Firestore transactions and updates status in real time.' },
              ].map((step, idx) => (
                <li
                  key={step.title}
                  className="bg-white rounded-2xl p-4 pl-16 relative border border-[#e3ebec]"
                >
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-[#4d8a96] text-white font-extrabold text-sm flex items-center justify-center">
                    {idx + 1}
                  </span>
                  <b className="block text-base text-[#12262e]">{step.title}</b>
                  <span className="text-sm text-[#5d737a]">{step.desc}</span>
                </li>
              ))}
            </ol>
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={onOpenChat}
                className="px-6 py-3 rounded-full bg-[#12262e] text-white text-sm font-bold hover:bg-[#1e3a45] transition cursor-pointer"
              >
                Try the assistant
              </button>
              <a
                href="#book"
                className="px-6 py-3 rounded-full border border-[#cfdee1] bg-white text-[#12262e] text-sm font-bold hover:bg-[#e7eff1] transition"
              >
                Jump to booking form
              </a>
            </div>
          </div>

          <div className="bg-white rounded-[22px] shadow-xl overflow-hidden border border-[#e3ebec]" aria-hidden="true">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-[#eef3f4]">
              <span className="w-10 h-10 rounded-full bg-[#4d8a96] text-white font-extrabold flex items-center justify-center">
                F
              </span>
              <div>
                <b className="block text-sm text-[#12262e]">FourClinic Assistant</b>
                <small className="flex items-center gap-1.5 text-xs text-[#5d737a]">
                  <span className="w-2 h-2 rounded-full bg-[#3ecf6e]" />
                  Online · EN / اردو / Roman Urdu
                </small>
              </div>
            </div>
            <div className="p-5 min-h-[290px] flex flex-col gap-2.5">
              {DEMO_CONVERSATION.slice(0, demoCount).map((msg, i) => (
                <div
                  key={`${i}-${msg.text.slice(0, 10)}`}
                  className={`fc-pop max-w-[85%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                    msg.from === 'user'
                      ? 'self-end bg-[#4d8a96] text-white rounded-br-sm'
                      : 'self-start bg-[#f0f5f5] text-[#12262e] rounded-bl-sm'
                  }`}
                >
                  {msg.text}
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between border-t border-[#eef3f4] px-5 py-3.5 text-sm text-[#9db8be]">
              <span>Ask in English, Urdu, or Roman Urdu…</span>
              <span className="w-9 h-9 rounded-full bg-[#4d8a96] text-white flex items-center justify-center">
                ➤
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Meet Your Dental Team */}
      <section id="doctors" className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 py-14">
        <div className="mb-8">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-[#4d8a96]">
            Meet your dental team
          </h2>
          <p className="mt-2 text-base text-[#42565c]">
            Specialists who explain every step before they start.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {activeDoctors.map((doc) => {
            const matchedSvc =
              services.find((s) => s.active && s.defaultDoctorId === doc.id)?.id ||
              services[0]?.id ||
              'checkup';
            return (
              <article
                key={doc.id}
                className="border border-[#e3ebec] rounded-[20px] p-6 text-center bg-white flex flex-col items-center hover:shadow-md transition-shadow"
              >
                <img
                  src={doc.photoUrl}
                  alt={doc.name}
                  style={{ borderColor: doc.color }}
                  className="w-28 h-28 rounded-full object-cover border-4 mb-4"
                />
                <h3 className="text-lg font-extrabold text-[#12262e]">{doc.name}</h3>
                <p className="text-sm font-semibold text-[#5d737a]">{doc.role}</p>
                <span className="mt-2.5 px-3.5 py-1 rounded-full bg-[#f0f5f5] text-xs font-bold text-[#41565c]">
                  {doc.specialty}
                </span>
                <p className="mt-3 text-xs text-[#42565c] leading-relaxed">{doc.bio}</p>
                <p className="mt-2 text-[11px] font-semibold text-[#5d737a]">
                  {doc.experience} · {doc.languages}
                </p>
                <button
                  type="button"
                  onClick={() => onBookDoctor(doc.id, matchedSvc)}
                  className="mt-auto pt-4 text-xs font-extrabold text-[#4d8a96] hover:text-[#3d7280] underline underline-offset-4 cursor-pointer"
                >
                  Book with {doc.name.split(' ').slice(-1)[0]} →
                </button>
              </article>
            );
          })}
        </div>
      </section>

      {/* Patient Reviews Carousel (clearly marked fictional sample reviews) */}
      <section id="reviews" className="max-w-4xl mx-auto px-4 sm:px-8 pt-2 pb-14 text-center">
        <h2 className="text-3xl sm:text-4xl font-extrabold text-[#4d8a96]">
          Patients say it feels different
        </h2>
        <p className="mt-2 text-sm text-[#5d737a]">
          Sample patient quotes (fictional placeholder reviews for demo).
        </p>

        <div className="mt-8 bg-[#f8fbfb] border border-[#e3ebec] rounded-3xl p-8">
          <div className="text-[#f2b33d] text-lg tracking-widest" aria-label="5 out of 5 stars">
            ★★★★★
          </div>
          <blockquote className="mt-4 text-xl sm:text-2xl font-bold text-[#3d7280] leading-relaxed">
            {SAMPLE_REVIEWS[reviewIdx].quote}
          </blockquote>
          <figcaption className="mt-5 flex items-center justify-center gap-3 text-sm font-bold text-[#41565c]">
            <span
              style={{ backgroundColor: SAMPLE_REVIEWS[reviewIdx].color }}
              className="w-10 h-10 rounded-full text-white text-xs font-extrabold flex items-center justify-center"
            >
              {SAMPLE_REVIEWS[reviewIdx].initials}
            </span>
            <span>{SAMPLE_REVIEWS[reviewIdx].author}</span>
          </figcaption>

          <div className="mt-6 flex items-center justify-center gap-3">
            <button
              type="button"
              aria-label="Previous review"
              onClick={() =>
                setReviewIdx((reviewIdx - 1 + SAMPLE_REVIEWS.length) % SAMPLE_REVIEWS.length)
              }
              className="w-9 h-9 rounded-full border border-[#cfdee1] bg-white flex items-center justify-center text-[#12262e] hover:bg-[#e7eff1] cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex gap-1.5">
              {SAMPLE_REVIEWS.map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  aria-label={`Select review ${idx + 1}`}
                  onClick={() => setReviewIdx(idx)}
                  className={`h-2.5 rounded-full transition-all cursor-pointer ${
                    reviewIdx === idx ? 'w-7 bg-[#4d8a96]' : 'w-2.5 bg-[#cfdee1]'
                  }`}
                />
              ))}
            </div>
            <button
              type="button"
              aria-label="Next review"
              onClick={() => setReviewIdx((reviewIdx + 1) % SAMPLE_REVIEWS.length)}
              className="w-9 h-9 rounded-full border border-[#cfdee1] bg-white flex items-center justify-center text-[#12262e] hover:bg-[#e7eff1] cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>

      {/* FAQ Accordion */}
      <section id="faq" className="max-w-4xl mx-auto px-4 sm:px-8 pt-2 pb-14">
        <div className="mb-7">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-[#4d8a96]">Good to know</h2>
          <p className="mt-2 text-base text-[#42565c]">
            Still unsure?{' '}
            <button
              type="button"
              onClick={onOpenChat}
              className="text-[#4d8a96] font-bold underline underline-offset-4 cursor-pointer"
            >
              Ask the AI assistant
            </button>
          </p>
        </div>

        <div className="space-y-3">
          {CLINIC_FAQS.map((item, idx) => {
            const open = openFaq === idx;
            const panelId = `fc-faq-panel-${idx}`;
            return (
              <div key={item.q} className="border border-[#e3ebec] rounded-2xl overflow-hidden bg-white">
                <button
                  type="button"
                  aria-expanded={open}
                  aria-controls={panelId}
                  onClick={() => setOpenFaq(open ? null : idx)}
                  className="w-full px-5 py-4 flex items-center justify-between gap-4 text-left font-bold text-[#12262e] hover:bg-[#f9fcfc] cursor-pointer"
                >
                  <span>{item.q}</span>
                  <span
                    className={`w-8 h-8 rounded-full bg-[#f2f7f8] text-[#3d7280] flex items-center justify-center shrink-0 transition-transform ${
                      open ? 'rotate-45' : ''
                    }`}
                  >
                    <Plus className="w-4 h-4" />
                  </span>
                </button>
                {open && (
                  <div id={panelId} className="px-5 pb-5 text-sm text-[#42565c] leading-relaxed">{item.a}</div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}
