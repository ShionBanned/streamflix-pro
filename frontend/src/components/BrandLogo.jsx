import React from 'react';

/**
 * Logotipo Tipográfico Estilo Netflix para STREAMFLIX con micro-interacción cinemática
 */
export default function BrandLogo({ size = 'md', showSubtitle = true }) {
  const isSmall = size === 'sm';
  const isLarge = size === 'lg';
  const width = isSmall ? 108 : isLarge ? 168 : 132;
  const height = isSmall ? 30 : isLarge ? 46 : 36;

  return (
    <div className="inline-flex flex-col justify-center select-none group">
      <svg
        width={width}
        height={height}
        viewBox="0 0 220 56"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="STREAMFLIX"
        className="overflow-visible transition-all duration-300 ease-nf-spring group-hover:scale-[1.035] group-active:scale-[0.97] group-hover:drop-shadow-[0_0_16px_rgba(229,9,20,0.55)]"
      >
        <defs>
          <clipPath id="netflixArcClip">
            <path d="M 0 0 H 220 V 53 Q 110 43 0 53 Z" />
          </clipPath>
        </defs>
        <text
          x="110"
          y="46"
          textAnchor="middle"
          fill="#E50914"
          clipPath="url(#netflixArcClip)"
          style={{
            fontFamily: "'Bebas Neue', 'Netflix Sans', Impact, sans-serif",
            fontSize: '49px',
            fontWeight: 700,
            letterSpacing: '2.5px',
          }}
        >
          STREAMFLIX
        </text>
      </svg>

      {showSubtitle && (
        <span className="text-[9px] text-neutral-400 uppercase tracking-[0.22em] font-semibold flex items-center gap-1.5 -mt-0.5 transition-colors duration-300 group-hover:text-neutral-200">
          <span className="w-1.5 h-1.5 rounded-full bg-[#E50914] inline-block animate-pulse" />
          <span>CINEMA • CLÁSICOS • 4K</span>
        </span>
      )}
    </div>
  );
}
