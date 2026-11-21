import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { GALLERY_PHOTOS, INSURANCE_PLANS } from '../../data/sampleSeed';
import { addDaysIso, todayIso } from '../../lib/validation';
import type { ClinicSettings, Doctor, ServiceItem } from '../../types/clinic';

const PHRASES = [
  'treatment prices',
  'opening hours',
  'insurance cover',
  'booking a visit',
  'our dentists',
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
        delay = 1500;
        deleting = true;
      } else if (deleting && charIdx === 0) {
        deleting = false;
        phraseIdx = (phraseIdx + 1) % PHRASES.length;
        delay = 350;
      }
      charIdx += deleting ? -1 : 1;
      timer = window.setTimeout(tick, delay);
    };

    timer = window.setTimeout(tick, 300);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (lightboxIdx === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxIdx(null);
      if (e.key === 'ArrowLeft')
        setLightboxIdx((i) => (i === null ? null : (i - 1 + GALLERY_PHOTOS.length) % GALLERY_PHOTOS.length));
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
      <section id="top" className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 pt-8 pb-12 lg:pt-12 lg:pb-14 grid lg:grid-cols-2 gap-10 lg:gap-12 items-center">
        <div>
          <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#e7eff1] text-[#3d7280] text-xs font-bold tracking-wide">
            <span className="w-2 h-2 rounded-full bg-[#3ecf6e]" />
            Accepting new patients · Transparent pricing
          </span>
          <h1 className="mt-5 text-4xl sm:text-5xl font-extrabold text-[#12262e] leading-[1.08] tracking-tight">
            Calm, modern dental care with{' '}
            <span className="text-[#4d8a96]">honest answers</span>
          </h1>
          <p className="mt-4 text-lg text-[#42565c] leading-relaxed">
            Ask our multilingual AI assistant about{' '}
            <span className="font-bold text-[#12262e]">{typedText}</span>
            <span className="fc-caret" aria-hidden="true" />
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href="#book"
              className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full bg-[#4d8a96] text-white font-bold text-sm hover:bg-[#3d7280] transition shadow-sm"
            >
              <span>Book Appointment</span>
              <span aria-hidden="true">→</span>
            </a>
            <a
              href="#services"
              className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full border border-[#cfdee1] bg-white text-[#12262e] font-bold text-sm hover:bg-[#f2f7f8] transition"
            >
              <span>View Our Services</span>
              <span aria-hidden="true">→</span>
            </a>
          </div>

          <form
            onSubmit={handleQuickSubmit}
            className="mt-8 bg-[#f4f8f8] border border-[#e3ebec] rounded-2xl p-4 grid sm:grid-cols-[1fr_1fr_auto] gap-3 items-end"
          >
            <label className="block">
              <span className="block text-xs font-bold text-[#5d737a] mb-1">Treatment</span>
              <select
                value={qService}
                onChange={(e) => setQService(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-[#cfdee1] bg-white text-sm font-semibold text-[#12262e]"
              >
                {activeServices.map((svc) => (
                  <option key={svc.id} value={svc.id}>
                    {svc.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="block text-xs font-bold text-[#5d737a] mb-1">Preferred date</span>
              <input
                type="date"
                min={minDate}
                max={maxDate}
                value={qDate}
                onChange={(e) => setQDate(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-[#cfdee1] bg-white text-sm font-semibold text-[#12262e]"
              />
            </label>
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-[#4d8a96] text-white text-sm font-bold hover:bg-[#3d7280] transition cursor-pointer h-[42px]"
            >
              Find a time
            </button>
          </form>
        </div>

        <div className="relative">
          <div className="relative rounded-[28px] overflow-hidden shadow-xl bg-[#e7eff1]">
            <img
              src="/images/hero-clinic.jpg"
              alt="Patient smiling at her teeth in a hand mirror after a dental check-up"
              className="w-full h-[380px] sm:h-[460px] object-cover"
            />
            <button
              type="button"
              onClick={onOpenChat}
              className="absolute top-4 right-4 inline-flex items-center gap-2 px-3.5 py-2 rounded-full bg-white/95 backdrop-blur shadow-md text-xs font-bold text-[#12262e] hover:bg-white cursor-pointer"
            >
              <span className="w-2.5 h-2.5 rounded-full bg-[#3ecf6e]" />
              <span>Assistant online (EN / اردو)</span>
            </button>
            <div className="absolute bottom-14 left-4 bg-white/95 backdrop-blur rounded-2xl p-3.5 shadow-lg flex items-center gap-3">
              <div className="flex -space-x-2">
                {doctors.slice(0, 4).map((d) => (
                  <span
                    key={d.id}
                    style={{ backgroundColor: d.color }}
                    className="w-8 h-8 rounded-full border-2 border-white text-white text-[11px] font-extrabold flex items-center justify-center"
                  >
                    {d.initials}
                  </span>
                ))}
              </div>
              <div>
                <b className="block text-sm font-extrabold text-[#12262e]">Live slot locking</b>
                <small className="text-xs text-[#5d737a]">Your Smile, Our Mission</small>
              </div>
            </div>
            <div className="absolute bottom-3 inset-x-4 flex flex-wrap gap-1.5">
              {['Orthodontics', 'Endodontics', 'Prosthodontics', 'Periodontics'].map((tag) => (
                <span
                  key={tag}
                  className="px-2.5 py-1 rounded-full bg-[#12262e]/75 backdrop-blur text-white text-[11px] font-semibold"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Insurance Marquee */}
      <div
        className="border-y border-[#e3ebec] bg-[#f8fbfb] py-3.5 overflow-hidden"
        aria-label="Sample PPO insurance plans"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 flex flex-col sm:flex-row sm:items-center gap-3">
          <p className="text-xs font-bold uppercase tracking-wider text-[#5d737a] shrink-0">
            Works with most PPO plans (sample list)
          </p>
          <div className="overflow-hidden flex-1">
            <div className="fc-marquee-track">
              {[...INSURANCE_PLANS, ...INSURANCE_PLANS].map((plan, idx) => (
                <span
                  key={`${plan}-${idx}`}
                  className="px-4 py-1.5 rounded-full bg-white border border-[#e3ebec] text-xs font-bold text-[#42565c] whitespace-nowrap"
                >
                  {plan}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Clinic Overview Numbers (clearly labeled demo/live catalog metrics) */}
      <section className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 py-8 grid grid-cols-2 md:grid-cols-4 gap-4 border-b border-[#e3ebec]">
        <div className="text-center p-3">
          <b className="block text-3xl font-extrabold text-[#4d8a96]">{activeDoctorsCount}</b>
          <span className="text-sm text-[#5d737a]">Active dental specialists</span>
        </div>
        <div className="text-center p-3">
          <b className="block text-3xl font-extrabold text-[#4d8a96]">{activeServices.length}</b>
          <span className="text-sm text-[#5d737a]">Transparent treatment plans</span>
        </div>
        <div className="text-center p-3">
          <b className="block text-3xl font-extrabold text-[#4d8a96]">{settings.slotDurationMins}m</b>
          <span className="text-sm text-[#5d737a]">Standard booking slots</span>
        </div>
        <div className="text-center p-3">
          <b className="block text-3xl font-extrabold text-[#4d8a96]">24/7</b>
          <span className="text-sm text-[#5d737a]">Multilingual AI assistant</span>
        </div>
      </section>

      {/* Clinic Photo Gallery */}
      <section className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 pt-8 pb-4" aria-label="Our clinic">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1fr] gap-3.5">
          {GALLERY_PHOTOS.map((photo, idx) => (
            <button
              key={photo.src}
              type="button"
              onClick={() => setLightboxIdx(idx)}
              className="group relative rounded-[18px] overflow-hidden h-[240px] sm:h-[280px] text-left cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#4d8a96]"
            >
              <img
                src={photo.src}
                alt={photo.alt}
                loading="lazy"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              />
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#12262e]/80 to-transparent px-4 py-3 text-xs font-semibold text-white">
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
          className="fixed inset-0 z-50 bg-[#12262e]/90 flex items-center justify-center p-4"
        >
          <div className="relative max-w-4xl w-full bg-[#12262e] rounded-2xl overflow-hidden shadow-2xl">
            <button
              type="button"
              aria-label="Close photo preview"
              onClick={() => setLightboxIdx(null)}
              className="absolute top-3 right-3 z-10 w-10 h-10 rounded-full bg-white/90 text-[#12262e] flex items-center justify-center hover:bg-white cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
            <img
              src={GALLERY_PHOTOS[lightboxIdx].src}
              alt={GALLERY_PHOTOS[lightboxIdx].alt}
              className="w-full max-h-[75vh] object-contain bg-black"
            />
            <div className="flex items-center justify-between px-5 py-3 text-white text-sm">
              <span>{GALLERY_PHOTOS[lightboxIdx].alt}</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label="Previous photo"
                  onClick={() =>
                    setLightboxIdx((lightboxIdx - 1 + GALLERY_PHOTOS.length) % GALLERY_PHOTOS.length)
                  }
                  className="p-2 rounded-full bg-white/15 hover:bg-white/25 cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  aria-label="Next photo"
                  onClick={() => setLightboxIdx((lightboxIdx + 1) % GALLERY_PHOTOS.length)}
                  className="p-2 rounded-full bg-white/15 hover:bg-white/25 cursor-pointer"
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
