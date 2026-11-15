import React, { useRef } from 'react';
import { Star, Play, Info, X, Bookmark, Check, ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react';

export default function MediaGrid({
  title,
  items = [],
  isLoading = false,
  onSelectDetails,
  onPlay,
  isRow = false,
  isContinueWatching = false,
  onRemoveContinueWatching = null,
  onToggleWatchlist = null,
  isSavedInWatchlist = null,
  onRetry = null,
}) {
  const scrollRef = useRef(null);

  const scroll = (direction) => {
    if (scrollRef.current) {
      const scrollAmount = direction === 'left' ? -650 : 650;
      scrollRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  // 1. Estado de Carga: Skeleton Shimmer Cards estilo Netflix
  if (isLoading) {
    return (
      <div className="py-5 px-4 sm:px-8 lg:px-12">
        {title && (
          <div className="h-7 w-48 bg-neutral-800/80 rounded animate-pulse mb-4"></div>
        )}
        <div
          className={
            isRow || isContinueWatching
              ? 'flex gap-4 overflow-hidden pb-4'
              : 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-6'
          }
        >
          {Array.from({ length: 6 }).map((_, idx) => (
            <div
              key={idx}
              className={`flex-shrink-0 rounded-lg overflow-hidden bg-neutral-900 border border-neutral-800 animate-pulse ${
                isContinueWatching
                  ? 'w-64 sm:w-72 aspect-video'
                  : isRow
                  ? 'w-40 sm:w-48 aspect-[2/3]'
                  : 'w-full aspect-[2/3]'
              }`}
            >
              <div className="w-full h-full bg-gradient-to-t from-neutral-800 via-neutral-850 to-neutral-800"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // 2. Estado Vacío: Si no hay items, no dejar un espacio muerto negro
  if (!items || items.length === 0) {
    if (isContinueWatching) return null; // No mostrar fila de continuar viendo si no hay reproducciones previas
    return (
      <div className="py-6 px-4 sm:px-8 lg:px-12 text-center">
        {title && (
          <h2 className="text-xl sm:text-2xl font-bold text-white tracking-wide flex items-center gap-2 mb-4">
            <span className="w-1.5 h-5 bg-red-600 rounded-full inline-block"></span>
            {title}
          </h2>
        )}
        <div className="py-12 bg-neutral-900/40 rounded-xl border border-neutral-800/60 max-w-xl mx-auto p-6 space-y-3">
          <AlertCircle className="w-8 h-8 text-neutral-500 mx-auto" />
          <p className="text-sm font-semibold text-gray-300">
            No hay contenido disponible en esta sección temporalmente.
          </p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="px-4 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-xs font-bold text-white rounded-md border border-neutral-700 transition"
            >
              Reintentar Carga
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="relative group/row py-5 px-4 sm:px-8 lg:px-12">
      {title && (
        <div className="flex items-center justify-between mb-3.5">
          <h2 className="text-xl sm:text-2xl font-bold text-white tracking-wide flex items-center gap-2">
            <span className="w-1.5 h-5 bg-red-600 rounded-full inline-block"></span>
            {title}
          </h2>
          <span className="text-xs text-gray-400 font-medium">
            {items.length} títulos
          </span>
        </div>
      )}

      {/* Botones de navegación lateral (Carousel scrollers estilo Netflix) */}
      {(isRow || isContinueWatching) && (
        <>
          <button
            onClick={() => scroll('left')}
            className="hidden md:flex absolute left-2 top-1/2 z-30 w-11 h-24 -translate-y-1/2 bg-black/60 hover:bg-black/90 text-white rounded-r items-center justify-center opacity-0 group-hover/row:opacity-100 transition-all hover:scale-105 border-y border-r border-white/10"
            title="Desplazar a la izquierda"
          >
            <ChevronLeft className="w-7 h-7" />
          </button>
          <button
            onClick={() => scroll('right')}
            className="hidden md:flex absolute right-2 top-1/2 z-30 w-11 h-24 -translate-y-1/2 bg-black/60 hover:bg-black/90 text-white rounded-l items-center justify-center opacity-0 group-hover/row:opacity-100 transition-all hover:scale-105 border-y border-l border-white/10"
            title="Desplazar a la derecha"
          >
            <ChevronRight className="w-7 h-7" />
          </button>
        </>
      )}

      {/* Grid / Row Container */}
      <div
        ref={scrollRef}
        className={
          isRow || isContinueWatching
            ? 'flex gap-4 overflow-x-auto no-scrollbar pb-4 pt-1 -mx-4 px-4 sm:-mx-8 sm:px-8 scroll-smooth'
            : 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-6'
        }
      >
        {items.map((item) => {
          const itemTitle = item.title || item.name || 'Sin título';
          const releaseYear = (item.release_date || item.first_air_date || '').substring(0, 4);
          const rating = item.vote_average ? item.vote_average.toFixed(1) : null;
          const isTv = item.type === 'tv' || item.media_type === 'tv' || Boolean(item.first_air_date) || Boolean(item.season);

          // Si es tarjeta de Continuar Viendo, priorizar backdrop en 16:9 estilo Netflix
          if (isContinueWatching) {
            const backdropImg =
              item.backdrop_url ||
              (item.backdrop_path ? `https://image.tmdb.org/t/p/original${item.backdrop_path}` : null) ||
              item.poster_url ||
              'https://images.unsplash.com/photo-1574375927938-d5a98e8ffe85?q=80&w=600&auto=format&fit=crop';

            const remainingMins = Math.max(1, Math.round((item.duration - item.currentTime) / 60));
            const episodeLabel = item.season && item.episode ? `T${item.season}:E${item.episode} • ` : '';

            return (
              <div
                key={`cw-${item.tmdbId}-${item.season}-${item.episode}`}
                className="group relative flex-shrink-0 w-64 sm:w-72 rounded-lg overflow-hidden bg-neutral-900 border border-neutral-800 transition-all duration-300 hover:scale-[1.04] hover:shadow-2xl hover:border-neutral-700 cursor-pointer"
                onClick={() => onPlay(item, item.season, item.episode, item.currentTime)}
              >
                {/* 16:9 Thumbnail Image */}
                <div className="aspect-video w-full overflow-hidden relative bg-black">
                  <img
                    src={backdropImg}
                    alt={itemTitle}
                    loading="lazy"
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />

                  {/* Red progress bar at the bottom */}
                  <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-neutral-800">
                    <div
                      className="h-full bg-red-600 transition-all shadow-sm"
                      style={{ width: `${item.progressPercent || 20}%` }}
                    ></div>
                  </div>

                  {/* Play icon overlay on hover */}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <div className="w-12 h-12 rounded-full bg-red-600 text-white flex items-center justify-center shadow-2xl transform group-hover:scale-110 transition-transform">
                      <Play className="w-6 h-6 fill-current ml-0.5" />
                    </div>
                  </div>

                  {/* Botón X para remover de Continuar Viendo */}
                  {onRemoveContinueWatching && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveContinueWatching(item.tmdbId, item.season, item.episode);
                      }}
                      className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/70 hover:bg-red-600 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:scale-110 shadow"
                      title="Eliminar de Continuar Viendo"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Info Card */}
                <div className="p-3">
                  <h3 className="text-xs sm:text-sm font-bold text-white truncate group-hover:text-red-400 transition-colors">
                    {itemTitle}
                  </h3>
                  <div className="flex items-center justify-between text-[11px] text-gray-400 mt-1">
                    <span className="text-red-400 font-semibold font-mono">
                      {episodeLabel}Restan {remainingMins} min
                    </span>
                    <span className="text-emerald-400 text-[10px] font-semibold">Reanudar</span>
                  </div>
                </div>
              </div>
            );
          }

          // Tarjetas estándar de catálogo (Poster 2:3)
          const posterUrl =
            item.poster_url ||
            (item.poster_path
              ? `https://image.tmdb.org/t/p/w500${item.poster_path}`
              : 'https://images.unsplash.com/photo-1594909122845-11baa439b7bf?q=80&w=500&auto=format&fit=crop');

          const inWatchlist = isSavedInWatchlist ? isSavedInWatchlist(item.id) : false;

          return (
            <div
              key={`${item.id}-${itemTitle}`}
              className={`group relative flex-shrink-0 cursor-pointer rounded-lg overflow-hidden bg-neutral-900 border border-neutral-800 transition-all duration-300 hover:scale-[1.04] hover:shadow-2xl hover:shadow-red-950/20 hover:border-neutral-700 ${
                isRow ? 'w-40 sm:w-48' : 'w-full'
              }`}
              onClick={() => onSelectDetails(item)}
            >
              {/* Poster Image */}
              <div className="aspect-[2/3] w-full overflow-hidden relative">
                <img
                  src={posterUrl}
                  alt={itemTitle}
                  loading="lazy"
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                />

                {/* Rating Badge top-right */}
                {rating && (
                  <div className="absolute top-2 right-2 flex items-center gap-1 bg-black/70 backdrop-blur-md px-1.5 py-0.5 rounded text-[11px] font-bold text-amber-400 border border-white/10">
                    <Star className="w-3 h-3 fill-current" />
                    <span>{rating}</span>
                  </div>
                )}

                {/* Type Badge top-left */}
                <div className="absolute top-2 left-2">
                  <span
                    className={`px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider uppercase text-white shadow ${
                      isTv ? 'bg-blue-600' : 'bg-red-600'
                    }`}
                  >
                    {isTv ? 'Serie' : 'Película'}
                  </span>
                </div>

                {/* Hover Overlay with Quick Play Button */}
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onPlay(item);
                      }}
                      className="w-10 h-10 rounded-full bg-white text-black hover:bg-neutral-200 flex items-center justify-center shadow-lg transition-transform hover:scale-110 active:scale-90"
                      title="Reproducir ahora"
                    >
                      <Play className="w-5 h-5 fill-current ml-0.5" />
                    </button>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectDetails(item);
                      }}
                      className="w-10 h-10 rounded-full bg-neutral-800/80 text-white hover:bg-neutral-700 border border-white/20 flex items-center justify-center transition-transform hover:scale-110"
                      title="Detalles y Temporadas"
                    >
                      <Info className="w-4 h-4" />
                    </button>

                    {/* Botón Mi Lista en Hover */}
                    {onToggleWatchlist && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleWatchlist(item);
                        }}
                        className={`w-10 h-10 rounded-full border flex items-center justify-center transition-transform hover:scale-110 ${
                          inWatchlist
                            ? 'bg-amber-500/30 text-amber-300 border-amber-400'
                            : 'bg-neutral-800/80 text-white hover:bg-neutral-700 border-white/20'
                        }`}
                        title={inWatchlist ? 'Quitar de Mi Lista' : 'Añadir a Mi Lista'}
                      >
                        {inWatchlist ? <Check className="w-4 h-4 text-amber-400" /> : <Bookmark className="w-4 h-4" />}
                      </button>
                    )}
                  </div>

                  <p className="text-xs font-semibold text-white line-clamp-1">
                    {itemTitle}
                  </p>
                  <p className="text-[10px] text-gray-400">
                    {releaseYear || 'Estreno'} • Full HD
                  </p>
                </div>
              </div>

              {/* Bottom Info bar */}
              <div className="p-2.5">
                <h3 className="text-xs sm:text-sm font-semibold text-gray-100 truncate group-hover:text-red-400 transition-colors">
                  {itemTitle}
                </h3>
                <div className="flex items-center justify-between text-[11px] text-gray-400 mt-1">
                  <span>{releaseYear || 'N/A'}</span>
                  <span className="text-[10px] text-emerald-400 font-medium">Híbrido $0</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
