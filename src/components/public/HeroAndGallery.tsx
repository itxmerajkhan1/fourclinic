import React, { useEffect, useState } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { GALLERY_PHOTOS, INSURANCE_PLANS } from '../../data/sampleSeed';
import { addDaysIso, todayIso } from '../../lib/validation';
import type { ClinicSettings, Doctor, ServiceItem } from '../../types/clinic';

const PHRASES = [
  'treatment prices',
  'clinic hours',
  'open Saturday slots',
  'specialist availability',
  'your visit plan',
];

interface HeroAndGalleryProps {
  services: ServiceItem[];
  doctors: Doctor[];
  settings: ClinicSettings;
  onQuickSearch: (serviceId: string, date: string) => void;
  onOpenChat: () => void;
}

export function HeroAndGallery({
  services,
  doctors,
  settings,
  onQuickSearch,
  onOpenChat,
}: HeroAndGalleryProps) {
  const [typedText, setTypedText] = useState(PHRASES[0]);
  const [qService, setQService] = useState(services[0]?.id || 'checkup');
  const [qDate, setQDate] = useState('');
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  const activeServices = services.filter((s) => s.active);
  const activeDoctorsCount = doctors.filter((d) => d.active).length;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setTypedText(PHRASES[0]);
      return;
    }
    let phraseIdx = 0;
    let charIdx = 0;
    let deleting = false;
    let timer: number;

    const tick = () => {
      const word = PHRASES[phraseIdx];
      setTypedText(word.slice(0, charIdx));
      let delay = deleting ? 32 : 68;
      if (!deleting && charIdx === word.length) {
        delay = 1600;
        deleting = true;
      } else if (deleting && charIdx === 0) {
        deleting = false;
        phraseIdx = (phraseIdx + 1) % PHRASES.length;
        delay = 360;
      }
      charIdx += deleting ? -1 : 1;
      timer = window.setTimeout(tick, delay);
    };

    timer = window.setTimeout(tick, 320);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (lightboxIdx === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxIdx(null);
      if (e.key === 'ArrowLeft')
        setLightboxIdx((i) =>
          i === null ? null : (i - 1 + GALLERY_PHOTOS.length) % GALLERY_PHOTOS.length
        );
      if (e.key === 'ArrowRight')
        setLightboxIdx((i) => (i === null ? null : (i + 1) % GALLERY_PHOTOS.length));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightboxIdx]);

  const minDate = todayIso();
  const maxDate = addDaysIso(minDate, settings.maxBookingDaysAhead || 60);

  function handleQuickSubmit(e: React.FormEvent) {
    e.preventDefault();
    onQuickSearch(qService, qDate);
  }

  return (
    <>
      <section
        id="top"
        className="scroll-mt-24 max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 pt-10 pb-12 lg:pt-14 lg:pb-16"
      >
        <div className="grid lg:grid-cols-[1.08fr_0.92fr] gap-10 lg:gap-14 items-center">
          <div>
            <p className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#426F77]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#C7775F]" />
              Dental Practice · Portfolio Demo Clinic
            </p>

            <h1 className="mt-4 font-editorial text-[44px] sm:text-[62px] lg:text-[78px] text-[#102E34] leading-[0.98] tracking-[-0.025em]">
              Considered dental care,{' '}
              <em className="italic text-[#426F77] font-normal">quietly</em> delivered.
            </h1>

            <p className="mt-5 text-base sm:text-[17px] text-[#3B5257] leading-relaxed max-w-xl">
              A calm, specialist-led dental practice with upfront sample pricing and overlap-safe slot
              reservations. Ask our multilingual receptionist about{' '}
              <span className="font-semibold text-[#102E34]">{typedText}</span>
              <span className="fc-caret" aria-hidden="true" />
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <a
                href="#book"
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-md bg-[#102E34] text-[#F7F5F0] text-sm font-semibold hover:bg-[#194149] transition"
              >
                <span>Book a consultation</span>
                <ArrowRight className="w-4 h-4" />
              </a>
              <button
                type="button"
                onClick={onOpenChat}
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-md border border-[#D8DFD9] bg-white text-[#102E34] text-sm font-semibold hover:border-[#426F77] transition cursor-pointer"
              >
                <span>Ask AI Receptionist (EN / اردو)</span>
              </button>
            </div>

            {/* Quick Availability Finder */}
            <form
              onSubmit={handleQuickSubmit}
              className="mt-8 bg-white border border-[#D8DFD9] rounded-lg p-4 grid sm:grid-cols-[1fr_1fr_auto] gap-3 items-end"
            >
              <label className="block">
                <span className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-[#5B7074] mb-1.5">
                  Treatment
                </span>
                <select
                  value={qService}
                  onChange={(e) => setQService(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 rounded-md border border-[#D8DFD9] bg-[#F7F5F0] text-sm font-medium text-[#102E34]"
                >
                  {activeServices.map((svc) => (
                    <option key={svc.id} value={svc.id}>
                      {svc.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-[#5B7074] mb-1.5">
                  Preferred date
                </span>
                <input
                  type="date"
                  min={minDate}
                  max={maxDate}
                  value={qDate}
                  onChange={(e) => setQDate(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 rounded-md border border-[#D8DFD9] bg-[#F7F5F0] text-sm font-medium text-[#102E34]"
                />
              </label>

              <button
                type="submit"
                className="min-h-[42px] px-5 py-2 rounded-md bg-[#426F77] text-white text-sm font-semibold hover:bg-[#102E34] transition cursor-pointer whitespace-nowrap"
              >
                Find open slots
              </button>
            </form>
          </div>

          {/* Editorial Arch Photo Frame */}
          <div className="relative">
            <div className="bg-[#DCE8E3] p-3 sm:p-4 rounded-t-[170px] sm:rounded-t-[220px] rounded-b-lg border border-[#D8DFD9]">
              <div className="overflow-hidden rounded-t-[160px] sm:rounded-t-[208px] rounded-b-md bg-[#EFECE4]">
                <img
                  src="/images/hero-clinic.jpg"
                  alt="Patient smiling at her teeth in a hand mirror after a dental check-up"
                  className="w-full h-[360px] sm:h-[440px] lg:h-[470px] object-cover object-center"
                />
              </div>

              <div className="mt-3 px-2 py-2 flex flex-wrap items-center justify-between gap-3 border-t border-[#102E34]/10 text-xs text-[#102E34]">
                <div>
                  <span className="block font-semibold text-[#102E34]">
                    Overlap-safe atomic scheduling
                  </span>
                  <span className="text-[11px] text-[#3B5257]">
                    Orthodontics · Endodontics · Implants · General Care
                  </span>
                </div>
                <span className="font-mono text-[11px] uppercase tracking-wider text-[#426F77] font-semibold">
                  Mon–Sat · Open Demo
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Hairline 4-Column Clinic Overview Strip */}
        <div className="mt-12 pt-8 border-t border-[#D8DFD9] grid grid-cols-2 md:grid-cols-4 gap-6 lg:gap-8">
          <div className="space-y-1">
            <b className="block font-editorial text-4xl sm:text-[44px] leading-none text-[#102E34] fc-tabular">
              {activeDoctorsCount}
            </b>
            <span className="block text-xs font-medium text-[#3B5257]">
              Sample dental specialists across 4 disciplines
            </span>
          </div>
          <div className="space-y-1 md:border-l md:border-[#D8DFD9] md:pl-6">
            <b className="block font-editorial text-4xl sm:text-[44px] leading-none text-[#102E34] fc-tabular">
              {activeServices.length}
            </b>
            <span className="block text-xs font-medium text-[#3B5257]">
              Sample treatments with upfront fee ranges
            </span>
          </div>
          <div className="space-y-1 md:border-l md:border-[#D8DFD9] md:pl-6">
            <b className="block font-editorial text-4xl sm:text-[44px] leading-none text-[#102E34] fc-tabular">
              {settings.slotDurationMins}
              <span className="text-2xl text-[#426F77] ml-0.5">m</span>
            </b>
            <span className="block text-xs font-medium text-[#3B5257]">
              Atomic slot grid preventing double-bookings
            </span>
          </div>
          <div className="space-y-1 md:border-l md:border-[#D8DFD9] md:pl-6">
            <b className="block font-editorial text-4xl sm:text-[44px] leading-none text-[#102E34] fc-tabular">
              3 <span className="text-2xl text-[#426F77]">langs</span>
            </b>
            <span className="block text-xs font-medium text-[#3B5257]">
              AI receptionist in English, اردو &amp; Roman Urdu
            </span>
          </div>
        </div>
      </section>

      {/* Quiet Sample Insurance Strip */}
      <div
        className="border-y border-[#D8DFD9] bg-[#EFECE4]/70 py-3.5 overflow-hidden"
        aria-label="Sample fictional PPO insurance plans"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#5B7074] shrink-0">
            Fictional sample PPO plans (demo only)
          </p>
          <div className="overflow-hidden flex-1">
            <div className="fc-marquee-track">
              {[...INSURANCE_PLANS, ...INSURANCE_PLANS].map((plan, idx) => (
                <span
                  key={`${plan}-${idx}`}
                  className="text-xs font-semibold text-[#3B5257] whitespace-nowrap tracking-wide"
                >
                  {plan}
                  <span className="ml-10 text-[#C7775F]/70" aria-hidden="true">
                    ·
                  </span>
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Clinic Photography Gallery */}
      <section
        className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 pt-10 pb-6"
        aria-label="Our clinic"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1.55fr_1fr_1fr_1fr] gap-4">
          {GALLERY_PHOTOS.map((photo, idx) => (
            <button
              key={photo.src}
              type="button"
              onClick={() => setLightboxIdx(idx)}
              className="group relative rounded-lg overflow-hidden h-[230px] sm:h-[260px] text-left border border-[#D8DFD9] bg-[#EFECE4] cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#102E34]"
            >
              <img
                src={photo.src}
                alt={photo.alt}
                loading="lazy"
                className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500"
              />
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#102E34]/85 via-[#102E34]/35 to-transparent px-4 py-3 text-xs font-medium text-[#F7F5F0]">
                {photo.caption}
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* Accessible Lightbox Modal */}
      {lightboxIdx !== null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Clinic gallery lightbox"
          onClick={(e) => {
            if (e.target === e.currentTarget) setLightboxIdx(null);
          }}
          className="fixed inset-0 z-50 bg-[#102E34]/90 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="relative max-w-4xl w-full bg-[#102E34] border border-white/15 rounded-lg overflow-hidden shadow-2xl">
            <button
              type="button"
              aria-label="Close photo preview"
              onClick={() => setLightboxIdx(null)}
              className="absolute top-3 right-3 z-10 w-9 h-9 rounded-md bg-[#F7F5F0] text-[#102E34] flex items-center justify-center hover:bg-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
            <img
              src={GALLERY_PHOTOS[lightboxIdx].src}
              alt={GALLERY_PHOTOS[lightboxIdx].alt}
              className="w-full max-h-[75vh] object-contain bg-[#091b1f]"
            />
            <div className="flex items-center justify-between px-5 py-3.5 text-[#F7F5F0] text-xs sm:text-sm border-t border-white/10">
              <span>{GALLERY_PHOTOS[lightboxIdx].alt}</span>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  aria-label="Previous photo"
                  onClick={() =>
                    setLightboxIdx(
                      (lightboxIdx - 1 + GALLERY_PHOTOS.length) % GALLERY_PHOTOS.length
                    )
                  }
                  className="p-2 rounded-md bg-white/10 hover:bg-white/20 cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  aria-label="Next photo"
                  onClick={() => setLightboxIdx((lightboxIdx + 1) % GALLERY_PHOTOS.length)}
                  className="p-2 rounded-md bg-white/10 hover:bg-white/20 cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
