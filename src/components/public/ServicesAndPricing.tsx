import { useState } from 'react';
import { Sparkles, Stethoscope, ShieldCheck, Smile, Wrench, HeartPulse } from 'lucide-react';
import type { ServiceItem } from '../../types/clinic';

interface ServicesAndPricingProps {
  services: ServiceItem[];
  onBookService: (serviceId: string) => void;
}

function renderServiceIcon(iconKey: string) {
  switch (iconKey) {
    case 'cleaning':
      return <Sparkles className="w-6 h-6" />;
    case 'whitening':
      return <Smile className="w-6 h-6" />;
    case 'braces':
      return <Wrench className="w-6 h-6" />;
    case 'implant':
      return <ShieldCheck className="w-6 h-6" />;
    case 'rootcanal':
      return <HeartPulse className="w-6 h-6" />;
    default:
      return <Stethoscope className="w-6 h-6" />;
  }
}

const TOOTH_X = [10, 74, 138, 202, 266, 330, 394, 458, 518];

export function ServicesAndPricing({ services, onBookService }: ServicesAndPricingProps) {
  const [sliderPos, setSliderPos] = useState(84);
  const activeServices = services.filter((s) => s.active);

  const cardBg = ['bg-[#9dbec4]', 'bg-[#a9c6cb]', 'bg-[#b3ccd1]'];

  return (
    <>
      {/* Services */}
      <section id="services" className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 py-14">
        <div className="flex flex-wrap justify-between items-end gap-6 mb-8">
          <div>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-[#4d8a96]">
              Dental services, clearly priced
            </h2>
            <p className="mt-2.5 text-base text-[#42565c] max-w-xl">
              Every service shows duration and price range upfront. Pick a treatment below to jump directly to live slot booking.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="px-4 py-2 rounded-full bg-[#f0f5f5] text-xs font-bold text-[#33474d]">
              Digital X-rays
            </span>
            <span className="px-4 py-2 rounded-full bg-[#f0f5f5] text-xs font-bold text-[#33474d]">
              Same-day urgent triage
            </span>
          </div>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {activeServices.map((svc, idx) => (
            <article
              key={svc.id}
              className={`${cardBg[idx % 3]} rounded-[20px] p-7 relative overflow-hidden min-h-[235px] flex flex-col`}
            >
              <div
                aria-hidden="true"
                className="w-[170px] h-[170px] rounded-full bg-white/15 absolute -right-14 -bottom-16"
              />
              <div className="w-14 h-14 rounded-full bg-white flex items-center justify-center text-[#4d8a96] mb-7 shadow-sm">
                {renderServiceIcon(svc.iconKey)}
              </div>
              <h3 className="text-xl font-extrabold text-white">{svc.name}</h3>
              <p className="text-white/90 mt-2 text-sm leading-relaxed">{svc.description}</p>
              <p className="text-white/80 mt-2 text-xs font-semibold">
                {svc.priceLabel} · {svc.durationMins} mins
              </p>
              <button
                type="button"
                onClick={() => onBookService(svc.id)}
                className="mt-auto pt-4 self-start text-sm font-extrabold text-white underline underline-offset-4 hover:opacity-85 cursor-pointer z-10"
              >
                Book {svc.name} →
              </button>
            </article>
          ))}
        </div>
      </section>

      {/* Transparent Pricing */}
      <section id="pricing" className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 pt-2 pb-14">
        <div className="flex flex-wrap justify-between items-end gap-6 mb-7">
          <div>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-[#4d8a96]">
              Prices, insurance &amp; payment plans
            </h2>
            <p className="mt-2 text-base text-[#42565c] max-w-xl">
              Full price list in one place — no surprises. Final quotes are always confirmed after an examination, before treatment starts.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="px-4 py-2 rounded-full bg-[#f0f5f5] text-xs font-bold text-[#33474d]">
              Itemized receipts
            </span>
            <span className="px-4 py-2 rounded-full bg-[#f0f5f5] text-xs font-bold text-[#33474d]">
              0% plans over $500
            </span>
          </div>
        </div>

        <div className="border border-[#e3ebec] rounded-2xl overflow-hidden divide-y divide-[#e3ebec] bg-white">
          {activeServices.map((svc) => (
            <div
              key={svc.id}
              className="p-4 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-[#f9fcfc] transition-colors"
            >
              <div>
                <b className="text-base font-extrabold text-[#12262e]">{svc.name}</b>
                <p className="text-xs text-[#5d737a] mt-0.5">{svc.includes}</p>
              </div>
              <div className="flex items-center gap-4 shrink-0">
                <span className="text-xs font-semibold text-[#5d737a] fc-tabular">{svc.durationMins} mins</span>
                <span className="text-base font-extrabold text-[#4d8a96] min-w-[92px] text-right fc-tabular">
                  {svc.priceLabel}
                </span>
                <button
                  type="button"
                  onClick={() => onBookService(svc.id)}
                  className="px-3.5 py-1.5 rounded-full bg-[#e7eff1] text-[#3d7280] text-xs font-bold hover:bg-[#4d8a96] hover:text-white transition cursor-pointer"
                >
                  Select
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="grid md:grid-cols-3 gap-4 mt-6">
          <div className="p-5 rounded-2xl bg-[#f4f8f8] border border-[#e3ebec]">
            <b className="text-base text-[#12262e]">Insurance, verified for you</b>
            <p className="mt-1.5 text-sm text-[#42565c] leading-relaxed">
              We work with most major PPO plans. Share your plan name in chat and our front desk verifies coverage before your visit.
            </p>
          </div>
          <div className="p-5 rounded-2xl bg-[#f4f8f8] border border-[#e3ebec]">
            <b className="text-base text-[#12262e]">0% payment plans</b>
            <p className="mt-1.5 text-sm text-[#42565c] leading-relaxed">
              Treatments over $500 can be split into monthly payments at 0% interest, agreed in writing before we start.
            </p>
          </div>
          <div className="p-5 rounded-2xl bg-[#f4f8f8] border border-[#e3ebec]">
            <b className="text-base text-[#12262e]">Clear quotes, in writing</b>
            <p className="mt-1.5 text-sm text-[#42565c] leading-relaxed">
              Every treatment plan comes with an itemized quote. Nothing proceeds without your explicit consent.
            </p>
          </div>
        </div>
      </section>

      {/* Interactive Whitening Before / After SVG Slider */}
      <section id="results" className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 pt-2 pb-14">
        <div className="mb-6">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-[#4d8a96]">
            Brighter in a single visit
          </h2>
          <p className="mt-2 text-base text-[#42565c]">
            Drag the handle to compare a typical whitening result.{' '}
            <em className="text-[#5d737a]">Illustration only — individual results vary.</em>
          </p>
        </div>

        <div
          className="relative rounded-3xl overflow-hidden bg-[#e89a90] h-[220px] sm:h-[250px] select-none focus-within:ring-2 focus-within:ring-[#4d8a96] focus-within:ring-offset-2"
          style={{ '--pos': `${sliderPos}%` } as React.CSSProperties}
        >
          <svg className="absolute inset-0 w-full h-full" viewBox="0 0 560 120" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
            {TOOTH_X.map((x) => (
              <g key={`b-${x}`}>
                <path
                  d={`M${x} 22 C${x} 8 ${x + 52} 8 ${x + 52} 22 C${x + 52} 40 ${x + 46} 58 ${x + 42} 88 C${x + 40} 106 ${x + 30} 106 ${x + 27} 88 C${x + 25} 76 ${x + 25} 76 ${x + 22} 88 C${x + 19} 106 ${x + 9} 106 ${x + 7} 88 C${x + 3} 58 ${x} 40 ${x} 22 Z`}
                  fill="#e8d189"
                  stroke="#c9a94f"
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
                  stroke="#bcd6da"
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

          <span className="absolute top-3.5 left-3.5 bg-[#5a2823]/60 text-white text-xs font-bold px-3 py-1 rounded-full z-10">
            Before
          </span>
          <span className="absolute top-3.5 right-3.5 bg-[#5a2823]/60 text-white text-xs font-bold px-3 py-1 rounded-full z-10">
            After
          </span>

          <div
            aria-hidden="true"
            className="fc-ba-handle absolute inset-y-0 w-[3px] bg-white z-10 -translate-x-1/2"
          >
            <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white flex items-center justify-center text-lg text-[#3d7280] shadow-lg">
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
