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
      const scrollAmount = Math.round(scrollRef.current.clientWidth * 0.9) * (direction === 'left' ? -1 : 1);
      scrollRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
      setTimeout(() => setIsScrollingAnim(false), 420);
    }
  };

  const isHorizontal = isRow || isContinueWatching || isTop10;

  if (isLoading) {
    return (
      <div className="py-3 px-4 sm:px-6 lg:px-[3.2%] w-full">
        {title && <div className="h-6 w-52 netflix-shimmer rounded mb-2.5" />}
        <div
          className={
            isHorizontal
              ? 'flex gap-1.5 sm:gap-2 overflow-hidden pb-3'
              : 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5 sm:gap-3'
          }
        >
          {Array.from({ length: 6 }).map((_, idx) => (
            <div
              key={idx}
              className={`flex-shrink-0 rounded-[4px] overflow-hidden netflix-shimmer ${
                isTop10
                  ? 'w-[46vw] sm:w-[30vw] md:w-[22.5vw] lg:w-[19%] aspect-[4/3]'
                  : isHorizontal
                  ? 'w-[46vw] sm:w-[30vw] md:w-[22.5vw] lg:w-[18.9%] aspect-video'
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
    if (isHorizontal) return null;
    return (
      <div className="py-6 px-4 sm:px-6 lg:px-[3.2%] w-full text-center animate-fadeIn">
        {title && (
          <h2 className="text-lg sm:text-xl font-bold text-[#e5e5e5] tracking-tight mb-4 text-left">
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
    <div ref={sectionRef} className={`relative group/row py-3 px-4 sm:px-6 lg:px-[3.2%] w-full catalog-row ${isVisible ? 'is-visible' : ''}`}>
      {title && (
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="catalog-title text-base sm:text-xl font-bold text-[#e5e5e5] tracking-tight">
            {title.replace(/^[^\p{L}\p{N}]+/u, '')}
          </h2>
          {!isHorizontal && subtitle && (
            <p className="text-xs text-neutral-400">{subtitle}</p>
          )}
        </div>
      )}

      {isHorizontal && (
        <>
          <button
            onClick={() => scroll('left')}
            aria-label={`Desplazar ${title} a la izquierda`}
            className="hidden md:flex absolute left-0 top-10 bottom-3 z-30 w-14 bg-gradient-to-r from-black/60 to-transparent items-center justify-start pl-1.5 opacity-0 group-hover/row:opacity-100 transition-opacity duration-200"
          >
            <span className="w-7 h-14 rounded-full bg-[#141414]/85 hover:bg-[#262626]/95 border border-white/10 text-white flex items-center justify-center shadow-lg transition-colors">
              <ChevronLeft className="w-6 h-6" strokeWidth={2.5} />
            </span>
          </button>
          <button
            onClick={() => scroll('right')}
            aria-label={`Desplazar ${title} a la derecha`}
            className="hidden md:flex absolute right-0 top-10 bottom-3 z-30 w-14 bg-gradient-to-l from-black/60 to-transparent items-center justify-end pr-1.5 opacity-0 group-hover/row:opacity-100 transition-opacity duration-200"
          >
            <span className="w-7 h-14 rounded-full bg-[#141414]/85 hover:bg-[#262626]/95 border border-white/10 text-white flex items-center justify-center shadow-lg transition-colors">
              <ChevronRight className="w-6 h-6" strokeWidth={2.5} />
            </span>
          </button>
        </>
      )}

      <div
        ref={scrollRef}
        className={`${
          isHorizontal
            ? 'flex gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar pb-3 pt-1 -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-[3.2%] lg:px-[3.2%] scroll-smooth'
            : 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5 sm:gap-3'
        } transition-transform duration-300 ${isScrollingAnim ? 'scale-[0.997]' : 'scale-100'}`}
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

          // 1. Tarjeta "Continuar Viendo" (16:9 Estilo Netflix)
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
                className="media-card group relative flex-shrink-0 w-[46vw] sm:w-[30vw] md:w-[22.5vw] lg:w-[18.9%] rounded-[4px] overflow-hidden bg-[#181818] netflix-card-transition cursor-pointer"
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

                  <div className="absolute bottom-0 left-0 right-0 h-1 bg-neutral-700/80">
                    <div
                      className="h-full bg-[#E50914] transition-all"
                      style={{ width: `${item.progressPercent || 20}%` }}
                    />
                  </div>

                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-2.5">
                    <div className="flex justify-end">
                      {onRemoveContinueWatching && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onRemoveContinueWatching(itemId, item.season, item.episode);
                          }}
                          className="w-6 h-6 rounded-full bg-black/75 hover:bg-[#E50914] text-white flex items-center justify-center transition"
                          title="Quitar de Continuar Viendo"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <div className="flex items-end justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-white truncate">{itemTitle}</p>
                        <p className="text-[10px] text-neutral-300 font-medium">
                          {episodeLabel}{formatMinsSec(item.currentTime || 0)}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectDetails(item);
                          }}
                          className="w-7 h-7 rounded-full bg-neutral-900/85 text-white border border-white/30 flex items-center justify-center hover:bg-neutral-700"
                          title="Más información"
                        >
                          <Info className="w-3.5 h-3.5" />
                        </button>
                        <div className="card-play-icon w-8 h-8 rounded-full bg-white text-black flex items-center justify-center shadow-lg">
                          <Play className="w-4 h-4 fill-current ml-0.5" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          }

          // 2. Tarjeta Top 10 Estilo Netflix (Números gigantes pegados al póster)
          const posterUrl =
            item.poster_url ||
            (item.poster_path
              ? `https://image.tmdb.org/t/p/w500${item.poster_path}`
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
                className="group relative flex-shrink-0 flex items-stretch w-[46vw] sm:w-[30vw] md:w-[22.5vw] lg:w-[19%] cursor-pointer select-none"
              >
                <div className="w-[46%] flex items-end justify-end -mr-3 sm:-mr-4 z-0 pointer-events-none">
                  <svg viewBox="0 0 115 160" className="w-full h-full overflow-visible">
                    <text
                      x={rank === 10 ? '50%' : '56%'}
                      y="150"
                      textAnchor="middle"
                      fill="#141414"
                      stroke="#595959"
                      strokeWidth="5"
                      strokeLinejoin="round"
                      paintOrder="stroke fill"
                      fontFamily="'Netflix Sans', 'Inter', system-ui, sans-serif"
                      fontWeight="700"
                      fontSize={rank === 10 ? '124' : '168'}
                      letterSpacing={rank === 10 ? '-8' : '0'}
                      className="group-hover:stroke-[#E50914] transition-colors duration-300"
                    >
                      {rank}
                    </text>
                  </svg>
                </div>

                <div className="relative z-10 w-[56%] aspect-[2/3] rounded-[4px] overflow-hidden bg-[#181818] shadow-xl netflix-card-transition">
                  <img
                    src={posterUrl}
                    alt={itemTitle}
                    loading="lazy"
                    className="w-full h-full object-cover"
                  />
                  {savedEntry && (
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-neutral-800">
                      <div
                        className="h-full bg-[#E50914]"
                        style={{ width: `${savedEntry.progressPercent || 20}%` }}
                      />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/35 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col justify-end p-2.5">
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
                      className="card-play-icon w-8 h-8 rounded-full bg-white text-black flex items-center justify-center mb-1.5 shadow-lg hover:scale-110 transition-transform"
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

          // 3. Tarjeta Estándar de Catálogo (Filas 16:9 limpias estilo Netflix; Grillas 2:3 con info)
          return (
            <div
              key={`${itemId}-${index}`}
              onMouseEnter={() => api.prefetchTitle(item, currentLang.tmdbLang)}
              className={`media-card group relative flex-shrink-0 cursor-pointer rounded-[4px] overflow-hidden bg-[#181818] netflix-card-transition focus-within:ring-2 focus-within:ring-white/80 ${
                isRow ? 'w-[46vw] sm:w-[30vw] md:w-[22.5vw] lg:w-[18.9%]' : 'w-full'
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

                {!isRow && rating && (
                  <div className="absolute top-2 right-2 flex items-center gap-1 bg-black/75 backdrop-blur-md px-1.5 py-0.5 rounded-md text-[11px] font-bold text-amber-400 border border-white/10">
                    <Star className="w-3 h-3 fill-current" />
                    <span>{rating}</span>
                  </div>
                )}

                {savedEntry && (
                  <div className="absolute bottom-0 left-0 right-0 h-1 bg-neutral-800 z-20">
                    <div
                      className="h-full bg-[#E50914]"
                      style={{ width: `${savedEntry.progressPercent || 20}%` }}
                    />
                  </div>
                )}

                <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/45 to-transparent opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-200 flex flex-col justify-end p-2.5 sm:p-3">
                  <div className="flex items-center gap-1.5 mb-1.5">
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
                      className="card-play-icon w-8 h-8 rounded-full bg-white text-black hover:bg-neutral-200 flex items-center justify-center shadow-lg transition-transform hover:scale-110 active:scale-90"
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
                        className={`w-8 h-8 rounded-full border flex items-center justify-center transition-transform hover:scale-110 ${
                          inWatchlist
                            ? 'bg-amber-500/30 text-amber-300 border-amber-400'
                            : 'bg-neutral-900/85 text-white hover:bg-neutral-700 border-white/30'
                        }`}
                      >
                        {inWatchlist ? (
                          <Check className="w-3.5 h-3.5 text-amber-400" />
                        ) : (
                          <Bookmark className="w-3.5 h-3.5" />
                        )}
                      </button>
                    )}

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectDetails(item);
                      }}
                      className="w-8 h-8 rounded-full bg-neutral-900/85 text-white hover:bg-neutral-700 border border-white/30 flex items-center justify-center transition-transform hover:scale-110 ml-auto"
                    >
                      <Info className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <p className="text-xs font-bold text-white line-clamp-1">{itemTitle}</p>
                  <div className="flex items-center gap-1.5 text-[10px] mt-0.5">
                    <span className="text-emerald-400 font-bold">
                      {savedEntry ? `En ${formatMinsSec(savedEntry.currentTime)}` : `${matchScore}% para ti`}
                    </span>
                    <span className="text-neutral-400">•</span>
                    <span className="text-neutral-300">{releaseYear || (isTv ? 'Serie' : 'Película')}</span>
                    <span className="text-neutral-400">•</span>
                    <span className="text-amber-400 font-semibold">★ {rating}</span>
                  </div>
                </div>
              </div>

              {!isRow && (
                <div className="p-2 bg-[#161616]">
                  <h3 className="text-xs font-bold text-neutral-100 truncate group-hover:text-red-400 transition-colors">
                    {itemTitle}
                  </h3>
                  <div className="flex items-center justify-between text-[11px] text-neutral-400 mt-0.5">
                    <span>{releaseYear || 'Destacado'}</span>
                    <span className="text-[10px] text-neutral-400 font-medium">{isTv ? 'Serie' : 'Película'}</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {onLoadMore && !isHorizontal && <div className="flex justify-center pt-5 pb-2"><button type="button" onClick={onLoadMore} disabled={isLoadingMore} className="rounded-md border border-white/25 bg-[#262626] px-6 py-2.5 text-sm font-bold text-white hover:bg-[#393939] disabled:opacity-50">{isLoadingMore ? 'Cargando más títulos…' : 'Ver más títulos'}</button></div>}
    </div>
  );
}
