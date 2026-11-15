import React from 'react';

/**
 * Logotipo Vectorial y Tipográfico Personalizado para STREAMFLIX PRO
 * Combina un emblema 3D de cinta plegada carmesí con la fuente display 'Bebas Neue'
 */
export default function BrandLogo({ size = 'md', showSubtitle = true }) {
  const isSmall = size === 'sm';
  const isLarge = size === 'lg';

  return (
    <div className="inline-flex items-center gap-2.5 select-none group">
      {/* Emblema 3D Ribbon SVG */}
      <div
        className={`relative flex items-center justify-center rounded-xl bg-gradient-to-b from-[#1a1a1a] to-[#0a0a0a] border border-white/15 shadow-[0_8px_24px_rgba(229,9,20,0.32)] group-hover:shadow-[0_8px_28px_rgba(229,9,20,0.55)] group-hover:scale-105 transition-all duration-300 ${
          isSmall ? 'w-8 h-8' : isLarge ? 'w-12 h-12' : 'w-10 h-10'
        }`}
      >
        <svg
          viewBox="0 0 64 64"
          className={isSmall ? 'w-5 h-5' : isLarge ? 'w-8 h-8' : 'w-6 h-6'}
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="sfPillarLeft" x1="12" y1="8" x2="24" y2="56" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#B80710" />
              <stop offset="100%" stopColor="#6E0207" />
            </linearGradient>
            <linearGradient id="sfPillarRight" x1="40" y1="8" x2="52" y2="56" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#C10812" />
              <stop offset="100%" stopColor="#750309" />
            </linearGradient>
            <linearGradient id="sfRibbonCenter" x1="14" y1="8" x2="50" y2="56" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#FF2A36" />
              <stop offset="50%" stopColor="#E50914" />
              <stop offset="100%" stopColor="#B0050E" />
            </linearGradient>
            <filter id="sfDropShadow" x="-10%" y="-10%" width="130%" height="130%">
              <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#000000" floodOpacity="0.65" />
            </filter>
          </defs>

          {/* Pilar Izquierdo */}
          <rect x="11" y="8" width="12" height="48" rx="2.5" fill="url(#sfPillarLeft)" />
          {/* Pilar Derecho */}
          <rect x="41" y="8" width="12" height="48" rx="2.5" fill="url(#sfPillarRight)" />
          {/* Cinta Diagonal Central con Sombra 3D */}
          <path
            d="M11 8H24.5L53 56H39.5L11 8Z"
            fill="url(#sfRibbonCenter)"
            filter="url(#sfDropShadow)"
          />
          {/* Triángulo Play Sutil en el Centro */}
          <path
            d="M29 25.5L39 32L29 38.5V25.5Z"
            fill="#FFFFFF"
            fillOpacity="0.92"
          />
        </svg>
      </div>

      {/* Wordmark Tipográfico en Bebas Neue */}
      <div className="flex flex-col justify-center">
        <div className="flex items-baseline gap-1 leading-none">
          <span
            style={{ fontFamily: "'Bebas Neue', 'Outfit', sans-serif" }}
            className={`tracking-[0.08em] font-normal bg-gradient-to-b from-[#FF2E38] via-[#E50914] to-[#B80710] bg-clip-text text-transparent drop-shadow-[0_2px_10px_rgba(229,9,20,0.35)] ${
              isSmall ? 'text-2xl' : isLarge ? 'text-4xl' : 'text-[28px]'
            }`}
          >
            STREAM
          </span>
          <span
            style={{ fontFamily: "'Bebas Neue', 'Outfit', sans-serif" }}
            className={`tracking-[0.08em] font-normal text-white ${
              isSmall ? 'text-2xl' : isLarge ? 'text-4xl' : 'text-[28px]'
            }`}
          >
            FLIX
          </span>
          <span className="ml-0.5 px-1.5 py-0.2 rounded bg-gradient-to-r from-[#E50914] to-[#99050d] text-[9px] font-black tracking-widest text-white uppercase shadow-sm self-center">
            PRO
          </span>
        </div>

        {showSubtitle && (
          <span className="text-[9px] text-neutral-400 uppercase tracking-[0.22em] font-bold flex items-center gap-1.5 -mt-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block animate-pulse" />
            <span>CINEMA • CLÁSICOS • 4K</span>
          </span>
        )}
      </div>
    </div>
  );
}
