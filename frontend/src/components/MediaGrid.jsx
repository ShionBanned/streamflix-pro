import React, { useEffect, useRef, useState } from 'react';
import api from '../services/api.js';
import {
  Star,
  Play,
  Info,
  X,
  Bookmark,
  Check,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
} from 'lucide-react';
import { LANGUAGE_OPTIONS } from '../hooks/useUserMedia.js';

export default function MediaGrid({
  title,
  subtitle = null,
  items = [],
  isLoading = false,
  onSelectDetails,
  onPlay,
  isRow = false,
  isTop10 = false,
  isContinueWatching = false,
  onRemoveContinueWatching = null,
  onToggleWatchlist = null,
  isSavedInWatchlist = null,
  getSavedEntry = null,
  onRetry = null,
  onLoadMore = null,
  isLoadingMore = false,
  preferredLanguage = 'latino',
}) {
  const scrollRef = useRef(null);
  const sectionRef = useRef(null);
  const [isScrollingAnim, setIsScrollingAnim] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const element = sectionRef.current;
    if (!element) return;
    if (!('IntersectionObserver' in window)) { setIsVisible(true); return; }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setIsVisible(true); observer.disconnect(); }
    }, { rootMargin: '0px 0px 80px 0px', threshold: 0.05 });
    observer.observe(element);
    return () => observer.disconnect();
  }, [isLoading, items?.length]);

  const currentLang =
    LANGUAGE_OPTIONS.find((l) => l.id === preferredLanguage) || LANGUAGE_OPTIONS[0];

  const scroll = (direction) => {
    if (scrollRef.current) {
      setIsScrollingAnim(true);
      const scrollAmount = Math.round(scrollRef.current.clientWidth * 0.85) * (direction === 'left' ? -1 : 1);
      scrollRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
      setTimeout(() => setIsScrollingAnim(false), 420);
    }
  };

  if (isLoading) {
    return (
      <div className="py-4 px-4 sm:px-8 lg:px-12 max-w-[1480px] mx-auto">
        {title && <div className="h-7 w-56 netflix-shimmer rounded-md mb-4" />}
        <div
          className={
            isRow || isContinueWatching || isTop10
              ? 'flex gap-4 overflow-hidden pb-4'
              : 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-5'
          }
        >
          {Array.from({ length: 6 }).map((_, idx) => (
            <div
              key={idx}
              className={`flex-shrink-0 rounded-xl overflow-hidden border border-white/[0.06] netflix-shimmer ${
                isContinueWatching
                  ? 'w-64 sm:w-72 aspect-video'
                  : isRow || isTop10
                  ? isTop10 ? 'w-40 sm:w-48 aspect-[2/3]' : 'w-64 sm:w-72 aspect-video'
                  : 'w-full aspect-[2/3]'
              }`}
            />
          ))}
        </div>
      </div>
    );
  }

  // Si es una fila horizontal secundaria vacía, ocultarla limpiamente sin mostrar cajas de error
  if (!items || items.length === 0) {
    if (isContinueWatching || isRow || isTop10) return null;
    return (
      <div className="py-6 px-4 sm:px-8 lg:px-12 max-w-[1480px] mx-auto text-center animate-fadeIn">
        {title && (
          <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight flex items-center gap-2.5 mb-4">
            <span className="w-1.5 h-6 bg-[#E50914] rounded-full inline-block" />
            {title}
          </h2>
        )}
        <div className="py-12 bg-neutral-900/40 rounded-2xl border border-neutral-800/60 max-w-xl mx-auto p-6 space-y-3">
          <AlertCircle className="w-8 h-8 text-neutral-500 mx-auto" />
          <p className="text-sm font-semibold text-neutral-300">
            No se encontraron títulos con los filtros seleccionados.
          </p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="px-4 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-xs font-bold text-white rounded-lg border border-neutral-700 transition"
            >
              Restablecer / Reintentar
            </button>
          )}
        </div>
      </div>
    );
  }

  const displayItems = isTop10 ? items.slice(0, 10) : items;

  const formatMinsSec = (secs = 0) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div ref={sectionRef} className={`relative group/row py-4 px-4 sm:px-8 lg:px-12 max-w-[1480px] mx-auto catalog-row ${isVisible ? 'is-visible' : ''}`}>
      {title && (
        <div className="flex items-end justify-between mb-3">
          <div>
            <h2 className="text-lg sm:text-2xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
              <span className="w-1.5 h-5 bg-[#E50914] rounded-full inline-block shadow-[0_0_8px_#E50914]" />
              <span>{title.replace(/^[^\p{L}\p{N}]+/u, '')}</span>
            </h2>
            {subtitle && (
              <p className="text-xs text-neutral-400 mt-0.5 ml-4">{subtitle}</p>
            )}
          </div>
          <span className="hidden sm:inline text-[11px] text-neutral-500 font-semibold">
            {displayItems.length} títulos
          </span>
        </div>
      )}

      {(isRow || isContinueWatching || isTop10) && (
        <>
          <button
            onClick={() => scroll('left')}
            aria-label={`Desplazar ${title} a la izquierda`}
            className="hidden md:flex absolute left-1 top-1/2 z-30 w-11 h-32 -translate-y-1/2 bg-black/80 hover:bg-[#E50914] text-white rounded-r-2xl items-center justify-center opacity-0 group-hover/row:opacity-100 transition-all duration-300 hover:scale-105 border-y border-r border-white/15 backdrop-blur-md shadow-2xl"
          >
            <ChevronLeft className="w-7 h-7" />
          </button>
          <button
            onClick={() => scroll('right')}
            aria-label={`Desplazar ${title} a la derecha`}
            className="hidden md:flex absolute right-1 top-1/2 z-30 w-11 h-32 -translate-y-1/2 bg-black/80 hover:bg-[#E50914] text-white rounded-l-2xl items-center justify-center opacity-0 group-hover/row:opacity-100 transition-all duration-300 hover:scale-105 border-y border-l border-white/15 backdrop-blur-md shadow-2xl"
          >
            <ChevronRight className="w-7 h-7" />
          </button>
        </>
      )}

      <div
        ref={scrollRef}
        className={`${
          isRow || isContinueWatching || isTop10
            ? 'flex gap-4 overflow-x-auto no-scrollbar pb-5 pt-2 -mx-4 px-4 sm:-mx-8 sm:px-8 scroll-smooth'
            : 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-5'
        } transition-transform duration-300 ${isScrollingAnim ? 'scale-[0.995]' : 'scale-100'}`}
      >
        {displayItems.map((item, index) => {
          const itemId = item.id || item.tmdbId;
          const itemTitle = item.title || item.name || 'Sin título';
          const releaseYear = (item.release_date || item.first_air_date || '').substring(0, 4);
          const rating = item.vote_average ? Number(item.vote_average).toFixed(1) : '8.2';
          const matchScore = Math.min(99, Math.max(85, Math.round(Number(rating) * 10 + 8)));
          const isTv =
            item.type === 'tv' ||
            item.media_type === 'tv' ||
            Boolean(item.first_air_date) ||
            Boolean(item.season);

          const savedEntry = getSavedEntry ? getSavedEntry(itemId) : null;

          // 1. Tarjeta "Continuar Viendo" (16:9)
          if (isContinueWatching) {
            const backdropImg =
              item.backdrop_url ||
              (item.backdrop_path
                ? `https://image.tmdb.org/t/p/w780${item.backdrop_path}`
                : null) ||
              item.poster_url ||
              'https://images.unsplash.com/photo-1574375927938-d5a98e8ffe85?q=80&w=600&auto=format&fit=crop';

            const episodeLabel =
              item.season && item.episode ? `T${item.season}:E${item.episode} • ` : '';

            return (
              <div
                key={`cw-${itemId}-${item.season}-${item.episode}`}
                onMouseEnter={() => api.prefetchTitle(item, currentLang.tmdbLang)}
                className="group relative flex-shrink-0 w-64 sm:w-72 rounded-xl overflow-hidden bg-[#181818] border border-white/[0.08] netflix-card-transition cursor-pointer"
                onClick={() =>
                  onPlay(
                    item,
                    item.season,
                    item.episode,
                    item.currentTime || 0,
                    item.language || preferredLanguage
                  )
                }
              >
                <div className="aspect-video w-full overflow-hidden relative bg-black">
                  <img
                    src={backdropImg}
                    alt={itemTitle}
                    loading="lazy"
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />

                  <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-neutral-800">
                    <div
                      className="h-full bg-[#E50914] transition-all shadow-[0_0_8px_#E50914]"
                      style={{ width: `${item.progressPercent || 20}%` }}
                    />
                  </div>

                  <div className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <div className="w-12 h-12 rounded-full bg-white text-black flex items-center justify-center shadow-2xl transform group-hover:scale-110 transition-transform">
                      <Play className="w-6 h-6 fill-current ml-0.5" />
                    </div>
                  </div>

                  {onRemoveContinueWatching && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveContinueWatching(itemId, item.season, item.episode);
                      }}
                      className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/75 hover:bg-[#E50914] text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:scale-110 shadow"
                      title="Quitar de Continuar Viendo"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="p-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-xs sm:text-sm font-bold text-white truncate group-hover:text-red-400 transition-colors">
                      {itemTitle}
                    </h3>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectDetails(item);
                      }}
                      className="text-neutral-400 hover:text-white p-1"
                      title="Más información y episodios"
                    >
                      <Info className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-neutral-400 mt-1">
                    <span className="text-red-400 font-semibold font-mono">
                      {episodeLabel}En {formatMinsSec(item.currentTime || 0)}
                    </span>
                    <span className="text-emerald-400 text-[10px] font-bold">
                      ▶ Reanudar ({item.progressPercent || 15}%)
                    </span>
                  </div>
                </div>
              </div>
            );
          }

          // 2. Tarjeta Top 10 Estilo Netflix
          const posterUrl =
            item.poster_url ||
            (item.poster_path
              ? `https://image.tmdb.org/t/p/w342${item.poster_path}`
              : 'https://images.unsplash.com/photo-1594909122845-11baa439b7bf?q=80&w=500&auto=format&fit=crop');
          const cardImage = isRow ? (item.backdrop_url || (item.backdrop_path ? `https://image.tmdb.org/t/p/w780${item.backdrop_path}` : null) || posterUrl) : posterUrl;

          const inWatchlist = isSavedInWatchlist ? isSavedInWatchlist(itemId) : false;

          if (isTop10) {
            const rank = index + 1;
            return (
              <div
                key={`top10-${itemId}-${index}`}
                onMouseEnter={() => api.prefetchTitle(item, currentLang.tmdbLang)}
                onClick={() => onSelectDetails(item)}
                className="group relative flex-shrink-0 flex items-center w-52 sm:w-60 cursor-pointer select-none pt-1"
              >
                <div className="w-24 sm:w-28 h-44 sm:h-52 flex items-end justify-center -mr-6 z-0 pointer-events-none">
                  <svg viewBox="0 0 110 160" className="w-full h-full overflow-visible">
                    <text
                      x="50%"
                      y="142"
                      textAnchor="middle"
                      fill="#0f0f0f"
                      stroke="#595959"
                      strokeWidth="4"
                      fontFamily="Inter, system-ui, sans-serif"
                      fontWeight="900"
                      fontSize={rank === 10 ? '115' : '148'}
                      letterSpacing="-8"
                      className="group-hover:stroke-[#E50914] transition-colors duration-300"
                    >
                      {rank}
                    </text>
                  </svg>
                </div>

                <div className="relative z-10 w-32 sm:w-36 aspect-[2/3] rounded-lg overflow-hidden bg-[#181818] border border-white/10 shadow-2xl netflix-card-transition">
                  <img
                    src={posterUrl}
                    alt={itemTitle}
                    loading="lazy"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute top-1.5 left-1.5">
                    <span className="w-5 h-5 rounded bg-[#E50914] text-white font-black text-[10px] flex items-center justify-center shadow">
                      N
                    </span>
                  </div>
                  {savedEntry && (
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-neutral-800">
                      <div
                        className="h-full bg-[#E50914]"
                        style={{ width: `${savedEntry.progressPercent || 20}%` }}
                      />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-2.5">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onPlay(
                          item,
                          savedEntry?.season || (isTv ? 1 : null),
                          savedEntry?.episode || (isTv ? 1 : null),
                          savedEntry?.currentTime || 0,
                          preferredLanguage
                        );
                      }}
                      className="w-8 h-8 rounded-full bg-white text-black flex items-center justify-center mb-1.5 shadow-lg hover:scale-110 transition-transform"
                    >
                      <Play className="w-4 h-4 fill-current ml-0.5" />
                    </button>
                    <p className="text-[11px] font-bold text-white line-clamp-1">{itemTitle}</p>
                    <span className="text-[10px] text-emerald-400 font-bold">
                      {savedEntry ? `Reanudar ${formatMinsSec(savedEntry.currentTime)}` : `${matchScore}% para ti`}
                    </span>
                  </div>
                </div>
              </div>
            );
          }

          // 3. Tarjeta Estándar de Catálogo con Pre-Carga en Hover
          return (
            <div
              key={`${itemId}-${index}`}
              onMouseEnter={() => api.prefetchTitle(item, currentLang.tmdbLang)}
              className={`group relative flex-shrink-0 cursor-pointer rounded-md overflow-hidden bg-[#161616] border border-white/[0.06] netflix-card-transition focus-within:ring-2 focus-within:ring-white/80 ${
                isRow ? 'w-64 sm:w-72' : 'w-full'
              }`}
              onClick={() => onSelectDetails(item)}
            >
              <div className={`${isRow ? 'aspect-video' : 'aspect-[2/3]'} w-full overflow-hidden relative bg-neutral-900`}>
                <img
                  src={cardImage}
                  alt={itemTitle}
                  loading="lazy"
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                />

                {rating && (
                  <div className="absolute top-2 right-2 flex items-center gap-1 bg-black/75 backdrop-blur-md px-1.5 py-0.5 rounded-md text-[11px] font-bold text-amber-400 border border-white/10">
                    <Star className="w-3 h-3 fill-current" />
                    <span>{rating}</span>
                  </div>
                )}

                <div className="absolute top-2 left-2 flex items-center gap-1">
                  <span
                    className={`px-1.5 py-0.5 rounded text-[9px] font-black tracking-wider uppercase text-white shadow ${
                      isTv ? 'bg-blue-600/90' : 'bg-[#E50914]'
                    }`}
                  >
                    {isTv ? 'Serie' : 'Película'}
                  </span>
                </div>

                {savedEntry && (
                  <div className="absolute bottom-0 left-0 right-0 h-1 bg-neutral-800 z-20">
                    <div
                      className="h-full bg-[#E50914]"
                      style={{ width: `${savedEntry.progressPercent || 20}%` }}
                    />
                  </div>
                )}

                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-3">
                  <div className="flex items-center gap-2 mb-2.5">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onPlay(
                          item,
                          savedEntry?.season || (isTv ? 1 : null),
                          savedEntry?.episode || (isTv ? 1 : null),
                          savedEntry?.currentTime || 0,
                          preferredLanguage
                        );
                      }}
                      className="w-9 h-9 rounded-full bg-white text-black hover:bg-neutral-200 flex items-center justify-center shadow-lg transition-transform hover:scale-110 active:scale-90"
                      title={
                        savedEntry
                          ? `Reanudar en ${formatMinsSec(savedEntry.currentTime)}`
                          : `Reproducir · ${currentLang.label}`
                      }
                    >
                      <Play className="w-4 h-4 fill-current ml-0.5" />
                    </button>

                    {onToggleWatchlist && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleWatchlist(item);
                        }}
                        className={`w-9 h-9 rounded-full border flex items-center justify-center transition-transform hover:scale-110 ${
                          inWatchlist
                            ? 'bg-amber-500/30 text-amber-300 border-amber-400'
                            : 'bg-neutral-900/85 text-white hover:bg-neutral-700 border-white/25'
                        }`}
                      >
                        {inWatchlist ? (
                          <Check className="w-4 h-4 text-amber-400" />
                        ) : (
                          <Bookmark className="w-4 h-4" />
                        )}
                      </button>
                    )}

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectDetails(item);
                      }}
                      className="w-9 h-9 rounded-full bg-neutral-900/85 text-white hover:bg-neutral-700 border border-white/25 flex items-center justify-center transition-transform hover:scale-110 ml-auto"
                    >
                      <Info className="w-4 h-4" />
                    </button>
                  </div>

                  <p className="text-xs font-extrabold text-white line-clamp-1">{itemTitle}</p>
                  <div className="flex items-center gap-1.5 text-[10px] mt-0.5">
                    <span className="text-emerald-400 font-extrabold">
                      {savedEntry ? `En ${formatMinsSec(savedEntry.currentTime)}` : `${matchScore}% para ti`}
                    </span>
                    <span className="text-neutral-500">•</span>
                    <span className="text-neutral-300">{releaseYear || 'Destacado'}</span>
                  </div>
                </div>
              </div>

              <div className="p-2.5 bg-[#161616]">
                <h3 className="text-xs sm:text-[13px] font-bold text-neutral-100 truncate group-hover:text-red-400 transition-colors">
                  {itemTitle}
                </h3>
                <div className="flex items-center justify-between text-[11px] text-neutral-400 mt-1">
                  <span>{releaseYear || 'Destacado'}</span>
                  <span className="text-[10px] text-neutral-400 font-medium">{isTv ? 'Serie' : 'Película'}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {onLoadMore && !isRow && !isTop10 && !isContinueWatching && <div className="flex justify-center pt-5 pb-2"><button type="button" onClick={onLoadMore} disabled={isLoadingMore} className="rounded-md border border-white/25 bg-[#262626] px-6 py-2.5 text-sm font-bold text-white hover:bg-[#393939] disabled:opacity-50">{isLoadingMore ? 'Cargando más títulos…' : 'Ver más títulos'}</button></div>}
    </div>
  );
}
