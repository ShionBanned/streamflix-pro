import React, { useRef, useState } from 'react';
import { Star, Play, ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Devuelve un degradado atmosférico de cine según la categoría del canal
 * para que cada tarjeta 16:9 luzca como una miniatura panorámica de Netflix.
 */
function getChannelCardTheme(category = '', country = '') {
  const c = (category || '').toLowerCase();
  if (c.includes('deporte')) {
    return 'from-emerald-950/90 via-[#141f18] to-[#0e0e0e] border-emerald-500/20';
  }
  if (c.includes('película') || c.includes('pluto')) {
    return 'from-[#36090c] via-[#1a1012] to-[#0e0e0e] border-red-500/20';
  }
  if (c.includes('anime') || c.includes('infantil')) {
    return 'from-orange-950/90 via-[#1e130d] to-[#0e0e0e] border-orange-500/20';
  }
  if (c.includes('noticia')) {
    return 'from-sky-950/90 via-[#0f1922] to-[#0e0e0e] border-sky-500/20';
  }
  if (country === 'co' || c.includes('colombia')) {
    return 'from-amber-950/85 via-[#1c160d] to-[#0e0e0e] border-amber-500/20';
  }
  return 'from-neutral-900 via-[#161616] to-[#0e0e0e] border-white/10';
}

/**
 * Tarjeta Panorámica 16:9 Estilo Netflix Live
 */
export const NetflixChannelCard = React.memo(function NetflixChannelCard({
  channel,
  isActive,
  isFav,
  onSelect,
  onToggleFavorite,
  isFixedWidth = true,
}) {
  const themeClass = getChannelCardTheme(channel.category, channel.country);

  return (
    <div
      onClick={() => onSelect(channel)}
      className={`group relative ${
        isFixedWidth ? 'w-64 sm:w-72 shrink-0' : 'w-full'
      } tv-channel-card rounded-md overflow-hidden bg-gradient-to-br ${themeClass} border cursor-pointer select-none netflix-card-transition ${
        isActive
          ? 'ring-2 ring-[#E50914] border-[#E50914] shadow-[0_14px_38px_rgba(229,9,20,0.35)]'
          : 'hover:border-white/30'
      }`}
    >
      {/* Lienzo 16:9 Estilo Netflix */}
      <div className="aspect-video w-full relative p-4 flex flex-col justify-between overflow-hidden">
        {/* Resplandor ambiental decorativo */}
        <div className="absolute -right-10 -top-10 w-32 h-32 rounded-full bg-white/5 blur-2xl pointer-events-none" />

        {/* Fila Superior: Insignia DIRECTO + Botón Favorito */}
        <div className="relative z-10 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span className="w-4 h-4 rounded bg-[#E50914] text-white font-black text-[9px] flex items-center justify-center shadow">
              N
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/65 backdrop-blur-md border border-white/15 text-[9px] font-black uppercase tracking-wider text-white">
              <span className="w-1.5 h-1.5 rounded-full bg-[#E50914] animate-pulse" />
              {isActive ? 'REPRODUCIENDO' : 'EN VIVO'}
            </span>
          </div>

          <button
            type="button"
            onClick={(e) => onToggleFavorite(channel, e)}
            className={`w-7 h-7 rounded-full flex items-center justify-center backdrop-blur-md border transition-transform hover:scale-110 ${
              isFav
                ? 'bg-amber-500/25 border-amber-400/50 text-amber-300'
                : 'bg-black/50 border-white/15 text-neutral-400 hover:text-white'
            }`}
            title={isFav ? 'Quitar de Mi Lista de Canales' : 'Guardar en Mi Lista de Canales'}
          >
            <Star className={`w-3.5 h-3.5 ${isFav ? 'fill-current text-amber-400' : ''}`} />
          </button>
        </div>

        {/* Centro: Logo del Canal en Alta Definición */}
        <div className="relative z-10 my-auto flex items-center justify-center py-1">
          <div className="w-20 h-14 sm:w-24 sm:h-16 rounded-md bg-black/55 backdrop-blur-md border border-white/10 p-2 flex items-center justify-center shadow-xl group-hover:scale-105 transition-transform duration-300">
            <img
              src={channel.logo}
              alt={channel.name}
              loading="lazy"
              className="w-full h-full object-contain"
              onError={(e) => {
                e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(
                  channel.name
                )}&background=E50914&color=fff&size=128&bold=true`;
              }}
            />
          </div>
        </div>

        {/* Fila Inferior: Nombre del Canal + Metadatos */}
        <div className="relative z-10">
          <h4
            className={`text-xs sm:text-sm font-black truncate drop-shadow ${
              isActive ? 'text-red-400' : 'text-white group-hover:text-red-300'
            }`}
          >
            {channel.name}
          </h4>
          <div className="flex items-center justify-between text-[10px] text-neutral-300/90 mt-0.5">
            <span className="truncate">
              {channel.category} • {channel.countryName || 'Global'}
            </span>
            <span className="font-bold text-neutral-400 shrink-0 ml-2">TV</span>
          </div>
        </div>

        {/* Overlay de Reproducción Instantánea en Hover */}
        <div className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center z-20">
          <div className="w-11 h-11 rounded-full bg-white text-black flex items-center justify-center shadow-[0_0_25px_rgba(255,255,255,0.5)] transform scale-90 group-hover:scale-105 transition-transform">
            <Play className="w-5 h-5 fill-current ml-0.5" />
          </div>
        </div>

        {/* Barra de Progreso de Emisión En Vivo Estilo Netflix */}
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/10 z-20">
          <div
            className={`h-full bg-[#E50914] ${
              isActive ? 'w-full shadow-[0_0_8px_#E50914]' : 'w-2/3'
            }`}
          />
        </div>
      </div>
    </div>
  );
});

/**
 * Carrusel Horizontal de Canales 16:9 Estilo Netflix
 */
export function ChannelRowCarousel({
  title,
  subtitle = null,
  channels = [],
  currentChannel,
  onSelectChannel,
  onToggleFavorite,
  isFavorite,
  maxItems = 40,
  onViewAll = null,
}) {
  const rowRef = useRef(null);
  const [scrolling, setScrolling] = useState(false);

  if (!channels || channels.length === 0) return null;

  const scrollRow = (dir) => {
    if (!rowRef.current) return;
    setScrolling(true);
    rowRef.current.scrollBy({
      left: Math.round(rowRef.current.clientWidth * 0.85) * (dir === 'left' ? -1 : 1),
      behavior: 'smooth',
    });
    setTimeout(() => setScrolling(false), 400);
  };

  return (
    <div className="relative group/chrow py-3.5 px-4 sm:px-8 lg:px-12 max-w-[1480px] mx-auto animate-rowReveal">
      <div className="flex items-end justify-between mb-3">
        <div>
          <h3 className="text-lg sm:text-2xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
            <span className="w-1.5 h-5 bg-[#E50914] rounded-full inline-block shadow-[0_0_8px_#E50914]" />
            <span>{title.replace(/^[^\p{L}\p{N}]+/u, '')}</span>
          </h3>
          {subtitle && <p className="text-xs text-neutral-400 mt-0.5 ml-4">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-3"><span className="text-[11px] text-neutral-500 font-semibold">{channels.length} canales</span>{onViewAll && channels.length > maxItems && <button type="button" onClick={onViewAll} className="text-xs font-bold text-white hover:text-red-400">Ver todos</button>}</div>
      </div>

      <button
        type="button"
        onClick={() => scrollRow('left')}
        className="hidden md:flex absolute left-1 top-1/2 z-30 w-11 h-28 -translate-y-1/2 bg-black/80 hover:bg-[#E50914] text-white rounded-r-2xl items-center justify-center opacity-0 group-hover/chrow:opacity-100 transition-all duration-300 hover:scale-105 border-y border-r border-white/15 backdrop-blur-md shadow-2xl"
      >
        <ChevronLeft className="w-7 h-7" />
      </button>
      <button
        type="button"
        onClick={() => scrollRow('right')}
        className="hidden md:flex absolute right-1 top-1/2 z-30 w-11 h-28 -translate-y-1/2 bg-black/80 hover:bg-[#E50914] text-white rounded-l-2xl items-center justify-center opacity-0 group-hover/chrow:opacity-100 transition-all duration-300 hover:scale-105 border-y border-l border-white/15 backdrop-blur-md shadow-2xl"
      >
        <ChevronRight className="w-7 h-7" />
      </button>

      <div
        ref={rowRef}
        className={`flex items-stretch gap-4 overflow-x-auto no-scrollbar pb-4 pt-1 -mx-4 px-4 sm:-mx-8 sm:px-8 scroll-smooth transition-transform duration-300 ${
          scrolling ? 'scale-[0.995]' : 'scale-100'
        }`}
      >
        {channels.slice(0, maxItems).map((ch) => (
          <NetflixChannelCard
            key={`row-${title}-${ch.url}`}
            channel={ch}
            isActive={currentChannel?.url === ch.url}
            isFav={isFavorite(ch)}
            onSelect={onSelectChannel}
            onToggleFavorite={onToggleFavorite}
            isFixedWidth={true}
          />
        ))}
      </div>
    </div>
  );
}

