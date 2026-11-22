import React, { useState } from 'react';
import {
  ArrowRight,
  HeartPulse,
  ShieldCheck,
  Smile,
  Sparkles,
  Stethoscope,
  Wrench,
} from 'lucide-react';
import type { ServiceItem } from '../../types/clinic';

interface ServicesAndPricingProps {
  services: ServiceItem[];
  onBookService: (serviceId: string) => void;
}

function renderServiceIcon(iconKey: string) {
  switch (iconKey) {
    case 'cleaning':
      return <Sparkles className="w-5 h-5" />;
    case 'whitening':
      return <Smile className="w-5 h-5" />;
    case 'braces':
      return <Wrench className="w-5 h-5" />;
    case 'implant':
      return <ShieldCheck className="w-5 h-5" />;
    case 'rootcanal':
      return <HeartPulse className="w-5 h-5" />;
    default:
      return <Stethoscope className="w-5 h-5" />;
  }
}

const TOOTH_X = [10, 74, 138, 202, 266, 330, 394, 458, 518];

export function ServicesAndPricing({ services, onBookService }: ServicesAndPricingProps) {
  const [sliderPos, setSliderPos] = useState(84);
  const activeServices = services.filter((s) => s.active);

  return (
    <>
      {/* Services */}
      <section
        id="services"
        className="scroll-mt-24 max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 py-16 lg:py-20"
      >
        <div className="flex flex-wrap justify-between items-end gap-6 pb-8 border-b border-[#D8DFD9]">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#426F77]">
              01 · Clinical Disciplines
            </p>
            <h2 className="mt-2 font-editorial text-4xl sm:text-[50px] text-[#102E34] leading-[1.04]">
              Treatments, clearly <em className="italic text-[#426F77] font-normal">outlined</em>
            </h2>
          </div>
          <p className="text-sm sm:text-base text-[#3B5257] max-w-md leading-relaxed">
            Sample treatment plans displaying duration and fee estimates upfront. Select any option to
            pre-fill matching dentist slots.
          </p>
        </div>

        <div className="mt-8 grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {activeServices.map((svc, idx) => {
            const highlighted = idx === 0;
            return (
              <article
                key={svc.id}
                className={`rounded-lg border p-6 sm:p-7 flex flex-col justify-between transition-colors ${
                  highlighted
                    ? 'bg-[#DCE8E3]/70 border-[#426F77]/35'
                    : 'bg-white border-[#D8DFD9] hover:border-[#426F77]'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-semibold text-[#426F77] fc-tabular">
                      {String(idx + 1).padStart(2, '0')}
                    </span>
                    <span className="w-10 h-10 rounded-md border border-[#D8DFD9] bg-[#F7F5F0] text-[#102E34] flex items-center justify-center">
                      {renderServiceIcon(svc.iconKey)}
                    </span>
                  </div>

                  <h3 className="mt-6 font-editorial text-[28px] leading-[1.12] text-[#102E34]">
                    {svc.name}
                  </h3>
                  <p className="mt-2.5 text-sm text-[#3B5257] leading-relaxed">{svc.description}</p>
                </div>

                <div className="mt-6 pt-4 border-t border-[#D8DFD9]/80 flex items-center justify-between gap-3">
                  <div className="text-xs text-[#3B5257] fc-tabular">
                    <b className="text-sm font-bold text-[#102E34]">{svc.priceLabel}</b>
                    <span className="mx-1.5 text-[#5B7074]">·</span>
                    <span>{svc.durationMins} mins</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onBookService(svc.id)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[#102E34] hover:text-[#426F77] transition cursor-pointer"
                  >
                    <span>Book</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* Transparent Pricing Ledger */}
      <section
        id="pricing"
        className="scroll-mt-24 max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 pb-16 lg:pb-20"
      >
        <div className="flex flex-wrap justify-between items-end gap-6 mb-8">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#426F77]">
              02 · Sample Fee Schedule
            </p>
            <h2 className="mt-2 font-editorial text-4xl sm:text-[48px] text-[#102E34] leading-[1.05]">
              Illustrative visit estimates
            </h2>
          </div>
          <p className="text-sm text-[#3B5257] max-w-md leading-relaxed">
            Portfolio demonstration pricing. In clinical practice, final treatment plans are
            confirmed after an in-person diagnostic exam.
          </p>
        </div>

        <div className="bg-white border border-[#D8DFD9] rounded-lg overflow-hidden">
          <div className="hidden md:grid grid-cols-[1.4fr_1.4fr_90px_120px_100px] gap-4 px-6 py-3 bg-[#EFECE4] border-b border-[#D8DFD9] text-[11px] font-semibold uppercase tracking-[0.12em] text-[#5B7074]">
            <span>Treatment</span>
            <span>Included Scope</span>
            <span className="text-right">Duration</span>
            <span className="text-right">Estimate</span>
            <span className="text-right">Schedule</span>
          </div>

          <div className="divide-y divide-[#E6EAE4]">
            {activeServices.map((svc) => (
              <div
                key={svc.id}
                className="px-4 py-4 sm:px-6 grid grid-cols-1 md:grid-cols-[1.4fr_1.4fr_90px_120px_100px] gap-2 md:gap-4 items-start md:items-center hover:bg-[#F7F5F0]/60 transition-colors"
              >
                <b className="text-sm sm:text-[15px] font-bold text-[#102E34]">{svc.name}</b>
                <p className="text-xs text-[#5B7074]">{svc.includes}</p>
                <span className="text-xs font-medium text-[#3B5257] md:text-right fc-tabular">
                  {svc.durationMins} mins
                </span>
                <span className="text-sm font-bold text-[#102E34] md:text-right fc-tabular">
                  {svc.priceLabel}
                </span>
                <div className="md:text-right pt-1 md:pt-0">
                  <button
                    type="button"
                    onClick={() => onBookService(svc.id)}
                    className="px-3.5 py-1.5 rounded-md border border-[#D8DFD9] bg-[#F7F5F0] text-[#102E34] text-xs font-semibold hover:bg-[#102E34] hover:text-[#F7F5F0] hover:border-[#102E34] transition cursor-pointer"
                  >
                    Select
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-5 mt-6">
          <div className="p-5 rounded-lg bg-[#F7F5F0] border border-[#D8DFD9]">
            <b className="block text-sm font-bold text-[#102E34]">Sample insurance listing</b>
            <p className="mt-1.5 text-xs sm:text-sm text-[#3B5257] leading-relaxed">
              Insurance carrier names displayed here are fictional placeholders. No live carrier
              eligibility checks are performed.
            </p>
          </div>
          <div className="p-5 rounded-lg bg-[#F7F5F0] border border-[#D8DFD9]">
            <b className="block text-sm font-bold text-[#102E34]">No financial commitments</b>
            <p className="mt-1.5 text-xs sm:text-sm text-[#3B5257] leading-relaxed">
              Bookings created here are demo requests only — no payments, billing, or credit
              agreements are processed online.
            </p>
          </div>
          <div className="p-5 rounded-lg bg-[#F7F5F0] border border-[#D8DFD9]">
            <b className="block text-sm font-bold text-[#102E34]">Upfront estimate ranges</b>
            <p className="mt-1.5 text-xs sm:text-sm text-[#3B5257] leading-relaxed">
              Every service shows estimated visit duration and sample cost range before selecting a
              time slot.
            </p>
          </div>
        </div>
      </section>

      {/* Interactive Whitening Before / After SVG Slider */}
      <section
        id="results"
        className="scroll-mt-24 max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 pb-16 lg:pb-20"
      >
        <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#426F77]">
              03 · Visual Comparison
            </p>
            <h2 className="mt-1.5 font-editorial text-3xl sm:text-[42px] text-[#102E34]">
              Brighter in a single session
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-[#3B5257]">
            Drag handle to compare whitening shades.{' '}
            <em className="text-[#5B7074]">Illustration only — individual results vary.</em>
          </p>
        </div>

        <div
          className="relative rounded-lg border border-[#D8DFD9] overflow-hidden bg-[#C7775F] h-[210px] sm:h-[250px] select-none focus-within:ring-2 focus-within:ring-[#102E34] focus-within:ring-offset-2"
          style={{ '--pos': `${sliderPos}%` } as React.CSSProperties}
        >
          <svg
            className="absolute inset-0 w-full h-full"
            viewBox="0 0 560 120"
            preserveAspectRatio="xMidYMid slice"
            aria-hidden="true"
          >
            {TOOTH_X.map((x) => (
              <g key={`b-${x}`}>
                <path
                  d={`M${x} 22 C${x} 8 ${x + 52} 8 ${x + 52} 22 C${x + 52} 40 ${x + 46} 58 ${x + 42} 88 C${x + 40} 106 ${x + 30} 106 ${x + 27} 88 C${x + 25} 76 ${x + 25} 76 ${x + 22} 88 C${x + 19} 106 ${x + 9} 106 ${x + 7} 88 C${x + 3} 58 ${x} 40 ${x} 22 Z`}
                  fill="#E8D189"
                  stroke="#C9A94F"
                  strokeWidth="2.5"
                />
                <path
                  d={`M${x + 9} 24 C${x + 16} 17 ${x + 30} 15 ${x + 38} 18`}
                  fill="none"
                  stroke="#fff"
                  strokeWidth="4"
                  strokeLinecap="round"
                  opacity=".65"
                />
              </g>
            ))}
          </svg>

          <svg
            className="fc-ba-after absolute inset-0 w-full h-full"
            viewBox="0 0 560 120"
            preserveAspectRatio="xMidYMid slice"
            aria-hidden="true"
          >
            {TOOTH_X.map((x) => (
              <g key={`a-${x}`}>
                <path
                  d={`M${x} 22 C${x} 8 ${x + 52} 8 ${x + 52} 22 C${x + 52} 40 ${x + 46} 58 ${x + 42} 88 C${x + 40} 106 ${x + 30} 106 ${x + 27} 88 C${x + 25} 76 ${x + 25} 76 ${x + 22} 88 C${x + 19} 106 ${x + 9} 106 ${x + 7} 88 C${x + 3} 58 ${x} 40 ${x} 22 Z`}
                  fill="#ffffff"
                  stroke="#BFD2D5"
                  strokeWidth="2.5"
                />
                <path
                  d={`M${x + 9} 24 C${x + 16} 17 ${x + 30} 15 ${x + 38} 18`}
                  fill="none"
                  stroke="#fff"
                  strokeWidth="4"
                  strokeLinecap="round"
                  opacity=".65"
                />
              </g>
            ))}
          </svg>

          <span className="absolute top-3.5 left-3.5 bg-[#102E34]/80 text-[#F7F5F0] text-[11px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-sm z-10">
            Before
          </span>
          <span className="absolute top-3.5 right-3.5 bg-[#102E34]/80 text-[#F7F5F0] text-[11px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-sm z-10">
            After
          </span>

          <div
            aria-hidden="true"
            className="fc-ba-handle absolute inset-y-0 w-[2px] bg-[#102E34] z-10 -translate-x-1/2"
          >
            <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white border border-[#102E34] flex items-center justify-center text-sm font-bold text-[#102E34] shadow-md">
              ⇆
            </span>
          </div>

          <input
            type="range"
            min={0}
            max={100}
            value={sliderPos}
            aria-label="Before and after whitening comparison slider"
            onChange={(e) => setSliderPos(Number(e.target.value))}
            className="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize z-20 m-0"
          />
        </div>
      </section>
    </>
  );
}
