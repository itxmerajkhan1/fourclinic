import { useEffect, useState } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight, Plus, Send } from 'lucide-react';
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
    text: 'We are open Saturdays 9 AM – 1 PM. Dr. Okafor has 10:00 AM open. You can reserve it directly below.',
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
    if (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
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
      {/* AI Receptionist Workflow Preview */}
      <section
        id="how"
        className="scroll-mt-24 bg-[#DCE8E3]/55 border-y border-[#D8DFD9] py-16 lg:py-20"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 grid lg:grid-cols-2 gap-12 items-start">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#426F77]">
              04 · Multilingual AI Receptionist
            </p>
            <h2 className="mt-2 font-editorial text-4xl sm:text-[48px] text-[#102E34] leading-[1.05]">
              After-hours clarity, without waiting rooms
            </h2>
            <p className="mt-4 text-sm sm:text-base text-[#3B5257] leading-relaxed max-w-lg">
              Our Gemini-powered receptionist answers questions on hours, sample pricing, and live
              dentist availability in English, اردو, and Roman Urdu — never issuing medical
              diagnoses.
            </p>

            <ol className="mt-7 divide-y divide-[#102E34]/15 border-y border-[#102E34]/15">
              {[
                {
                  title: 'Ask in your preferred language',
                  desc: 'Sample pricing, clinic timings, and treatment scope in English, Urdu, or Roman Urdu.',
                },
                {
                  title: 'Verify live dentist availability',
                  desc: 'Reads non-PII doctor schedules and atomic slot locks before suggesting times.',
                },
                {
                  title: 'Reserve cleanly as Pending',
                  desc: 'Issues a private tracking code and calendar invite while staff confirm.',
                },
              ].map((step, idx) => (
                <li key={step.title} className="py-4 flex items-start gap-4">
                  <span className="font-mono text-xs font-semibold text-[#426F77] pt-0.5 fc-tabular">
                    0{idx + 1}
                  </span>
                  <div>
                    <b className="block text-sm font-bold text-[#102E34]">{step.title}</b>
                    <span className="text-xs sm:text-sm text-[#3B5257]">{step.desc}</span>
                  </div>
                </li>
              ))}
            </ol>

            <div className="mt-7 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={onOpenChat}
                className="px-5 py-3 rounded-md bg-[#102E34] text-[#F7F5F0] text-sm font-semibold hover:bg-[#194149] transition cursor-pointer"
              >
                Open AI Receptionist
              </button>
              <a
                href="#book"
                className="px-5 py-3 rounded-md border border-[#D8DFD9] bg-white text-[#102E34] text-sm font-semibold hover:border-[#426F77] transition"
              >
                Use booking form
              </a>
            </div>
          </div>

          {/* Editorial Conversation Preview */}
          <div
            className="bg-white rounded-lg border border-[#D8DFD9] overflow-hidden"
            aria-hidden="true"
          >
            <div className="flex items-center justify-between px-5 py-4 bg-[#102E34] text-[#F7F5F0]">
              <div>
                <b className="block font-editorial text-xl leading-none font-normal">
                  FourClinic Receptionist
                </b>
                <small className="block mt-1 text-[11px] text-[#DCE8E3]/80">
                  Automated AI · English · اردو · Roman Urdu
                </small>
              </div>
              <span className="w-2 h-2 rounded-full bg-[#C7775F]" />
            </div>

            <div className="p-5 min-h-[290px] bg-[#F7F5F0] flex flex-col gap-3">
              {DEMO_CONVERSATION.slice(0, demoCount).map((msg, i) => (
                <div
                  key={`${i}-${msg.text.slice(0, 10)}`}
                  className={`fc-pop max-w-[85%] px-4 py-2.5 rounded-lg text-sm leading-relaxed ${
                    msg.from === 'user'
                      ? 'self-end bg-[#102E34] text-[#F7F5F0]'
                      : 'self-start bg-white border border-[#D8DFD9] text-[#102E34]'
                  }`}
                >
                  {msg.text}
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between border-t border-[#D8DFD9] bg-white px-5 py-3 text-xs text-[#5B7074]">
              <span>Ask about fees, hours, or open slots…</span>
              <span className="w-8 h-8 rounded-md bg-[#102E34] text-[#F7F5F0] flex items-center justify-center">
                <Send className="w-3.5 h-3.5" />
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Meet Your Dental Team */}
      <section
        id="doctors"
        className="scroll-mt-24 max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 py-16 lg:py-20"
      >
        <div className="flex flex-wrap items-end justify-between gap-6 pb-8 border-b border-[#D8DFD9]">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#426F77]">
              05 · Clinical Specialists
            </p>
            <h2 className="mt-2 font-editorial text-4xl sm:text-[48px] text-[#102E34] leading-[1.05]">
              Meet our dental team
            </h2>
          </div>
          <p className="text-sm text-[#3B5257] max-w-md">
            Fictional specialist profiles configured for this portfolio dental practice
            demonstration.
          </p>
        </div>

        <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {activeDoctors.map((doc) => {
            const matchedSvc =
              services.find((s) => s.active && s.defaultDoctorId === doc.id)?.id ||
              services[0]?.id ||
              'checkup';
            return (
              <article
                key={doc.id}
                className="bg-white border border-[#D8DFD9] rounded-lg overflow-hidden flex flex-col hover:border-[#426F77] transition-colors"
              >
                <div className="aspect-[4/4.2] bg-[#EFECE4] overflow-hidden border-b border-[#E6EAE4]">
                  <img
                    src={doc.photoUrl}
                    alt={doc.name}
                    className="w-full h-full object-cover object-top"
                  />
                </div>
                <div className="p-5 flex-1 flex flex-col">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#426F77]">
                    {doc.role} · {doc.specialty}
                  </p>
                  <h3 className="mt-1.5 font-editorial text-2xl text-[#102E34]">{doc.name}</h3>
                  <p className="mt-2.5 text-xs sm:text-[13px] text-[#3B5257] leading-relaxed flex-1">
                    {doc.bio}
                  </p>
                  <div className="mt-4 pt-3 border-t border-[#E6EAE4] flex items-center justify-between gap-2">
                    <span className="text-[11px] font-medium text-[#5B7074]">
                      {doc.experience} · {doc.languages}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onBookDoctor(doc.id, matchedSvc)}
                    className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#102E34] hover:text-[#426F77] transition cursor-pointer self-start"
                  >
                    <span>Book with {doc.name.split(' ').slice(-1)[0]}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* Patient Reviews Editorial Band */}
      <section
        id="reviews"
        className="scroll-mt-24 max-w-5xl mx-auto px-4 sm:px-8 pb-16 lg:pb-20 text-center"
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#426F77]">
          06 · Sample Patient Notes
        </p>
        <h2 className="mt-2 font-editorial text-3xl sm:text-[42px] text-[#102E34]">
          Sample clinic feedback
        </h2>
        <p className="mt-1.5 text-xs text-[#5B7074]">
          Fictional sample quotes illustrating patient communication in this demo.
        </p>

        <div
          className="mt-7 bg-white border border-[#D8DFD9] rounded-lg px-6 py-9 sm:px-12"
          aria-live="polite"
        >
          <div className="text-[#C7775F] text-sm tracking-[0.2em]" aria-label="5 out of 5 stars">
            ★★★★★
          </div>
          <blockquote className="mt-4 font-editorial italic text-2xl sm:text-[32px] text-[#102E34] leading-[1.3]">
            {SAMPLE_REVIEWS[reviewIdx].quote}
          </blockquote>
          <figcaption className="mt-5 text-xs font-semibold uppercase tracking-[0.1em] text-[#426F77]">
            {SAMPLE_REVIEWS[reviewIdx].author}
          </figcaption>

          <div className="mt-7 pt-5 border-t border-[#E6EAE4] flex items-center justify-center gap-4">
            <button
              type="button"
              aria-label="Previous review"
              onClick={() =>
                setReviewIdx((reviewIdx - 1 + SAMPLE_REVIEWS.length) % SAMPLE_REVIEWS.length)
              }
              className="w-9 h-9 rounded-md border border-[#D8DFD9] bg-[#F7F5F0] flex items-center justify-center text-[#102E34] hover:border-[#426F77] cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-mono text-xs text-[#5B7074] fc-tabular">
              0{reviewIdx + 1} / 0{SAMPLE_REVIEWS.length}
            </span>
            <button
              type="button"
              aria-label="Next review"
              onClick={() => setReviewIdx((reviewIdx + 1) % SAMPLE_REVIEWS.length)}
              className="w-9 h-9 rounded-md border border-[#D8DFD9] bg-[#F7F5F0] flex items-center justify-center text-[#102E34] hover:border-[#426F77] cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>

      {/* FAQ Hairline Accordion */}
      <section id="faq" className="scroll-mt-24 max-w-4xl mx-auto px-4 sm:px-8 pb-16 lg:pb-20">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-7">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#426F77]">
              07 · Frequently Asked
            </p>
            <h2 className="mt-1.5 font-editorial text-3xl sm:text-[44px] text-[#102E34]">
              Good to know
            </h2>
          </div>
          <p className="text-sm text-[#3B5257]">
            Still unsure?{' '}
            <button
              type="button"
              onClick={onOpenChat}
              className="text-[#102E34] font-semibold underline underline-offset-4 hover:text-[#426F77] cursor-pointer"
            >
              Ask the AI assistant
            </button>
          </p>
        </div>

        <div className="bg-white border border-[#D8DFD9] rounded-lg divide-y divide-[#E6EAE4]">
          {CLINIC_FAQS.map((item, idx) => {
            const open = openFaq === idx;
            const panelId = `fc-faq-panel-${idx}`;
            return (
              <div key={item.q}>
                <button
                  type="button"
                  aria-expanded={open}
                  aria-controls={panelId}
                  onClick={() => setOpenFaq(open ? null : idx)}
                  className="w-full px-5 py-4.5 flex items-center justify-between gap-4 text-left text-sm sm:text-[15px] font-semibold text-[#102E34] hover:bg-[#F7F5F0]/50 transition cursor-pointer"
                >
                  <span>{item.q}</span>
                  <span
                    className={`w-7 h-7 rounded-md border border-[#D8DFD9] bg-[#F7F5F0] text-[#102E34] flex items-center justify-center shrink-0 transition-transform duration-200 ${
                      open ? 'rotate-45' : ''
                    }`}
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </span>
                </button>
                <div
                  id={panelId}
                  className="fc-accordion-content"
                  data-open={open ? 'true' : 'false'}
                >
                  <div className="fc-accordion-inner">
                    <p className="px-5 pb-5 text-sm text-[#3B5257] leading-relaxed">{item.a}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}
