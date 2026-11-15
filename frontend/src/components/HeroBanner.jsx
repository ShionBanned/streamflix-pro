import React, { useState, useEffect, useMemo, useCallback } from 'react';
import api from '../services/api.js';
import {
  Play,
  Info,
  Star,
  Volume2,
  VolumeX,
  Bookmark,
  Check,
  Globe,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Film,
} from 'lucide-react';
import { LANGUAGE_OPTIONS } from '../hooks/useUserMedia.js';

/**
 * HeroBanner.jsx — Billboard Carrusel Multi-Slide con Transiciones Cinemáticas Ken Burns,
 * Barra de Progreso Animada en Miniaturas, Motor de Gustos/Taquilla y Preview en Vivo
 */
export default function HeroBanner({
  items = [],
  item = null,
  sectionLabel = null,
  onPlay,
  onSelectDetails,
  onToggleWatchlist,
  isSavedInWatchlist = false,
  preferredLanguage = 'latino',
  onChangeLanguage = null,
}) {
  const slides = useMemo(() => {
    if (Array.isArray(items) && items.length > 0) {
      return items.slice(0, 8);
    }
    return item ? [item] : [];
  }, [items, item]);

  const [activeIndex, setActiveIndex] = useState(0);
  const [slideDirection, setSlideDirection] = useState('next');
  const [trailerKey, setTrailerKey] = useState(null);
  const [showTrailer, setShowTrailer] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [isPausedByHover, setIsPausedByHover] = useState(false);

  useEffect(() => {
    setActiveIndex(0);
  }, [sectionLabel, slides.length]);

  const currentItem = slides[activeIndex] || slides[0] || null;

  const handleNextSlide = useCallback(() => {
    if (slides.length <= 1) return;
    setSlideDirection('next');
    setActiveIndex((prev) => (prev + 1) % slides.length);
  }, [slides.length]);

  const handlePrevSlide = useCallback(() => {
    if (slides.length <= 1) return;
    setSlideDirection('prev');
    setActiveIndex((prev) => (prev - 1 + slides.length) % slides.length);
  }, [slides.length]);

  const handlePickSlide = (idx) => {
    if (idx === activeIndex) return;
    setSlideDirection(idx > activeIndex ? 'next' : 'prev');
    setActiveIndex(idx);
  };

  // Rotación automática cada 9 segundos
  useEffect(() => {
    if (slides.length <= 1 || isPausedByHover || (showTrailer && !isMuted)) return;
    const interval = setInterval(() => {
      handleNextSlide();
    }, 9000);
    return () => clearInterval(interval);
  }, [slides.length, isPausedByHover, showTrailer, isMuted, handleNextSlide]);

  useEffect(() => {
    if (!currentItem?.id) return;
    let isMounted = true;
    setShowTrailer(false);
    setTrailerKey(null);

    const mediaType =
      currentItem.media_type || (currentItem.first_air_date ? 'tv' : 'movie');

    const fetchTrailer = async () => {
      try {
        const trailer = await api.getTrailers(mediaType, currentItem.id, preferredLanguage);
        if (isMounted && trailer?.key) {
          setTrailerKey(trailer.key);
        }
      } catch {
        // Fallback silencioso a imagen backdrop HD
      }
    };

    fetchTrailer();

    const timer = setTimeout(() => {
      if (isMounted) setShowTrailer(true);
    }, 2800);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [currentItem?.id, currentItem?.media_type, currentItem?.first_air_date, preferredLanguage]);

  if (!currentItem) return null;

  const title = currentItem.title || currentItem.name || 'Título Destacado';
  const overview =
    currentItem.overview || 'Disfruta de esta producción en alta definición con audio preparado.';
  const releaseYear = (
    currentItem.release_date ||
    currentItem.first_air_date ||
    ''
  ).substring(0, 4);
  const rating = currentItem.vote_average ? Number(currentItem.vote_average).toFixed(1) : '8.6';
  const mediaType =
    currentItem.media_type || (currentItem.first_air_date ? 'tv' : 'movie');
  const matchScore =
    currentItem.matchScore || Math.min(99, Math.max(90, Math.round(Number(rating) * 10 + 9)));
  const reasonTag =
    currentItem.heroReasonTag || `🍿 Estallando en Taquilla • ${matchScore}% para ti`;

  const backdropUrl =
    currentItem.backdrop_url ||
    (currentItem.backdrop_path
      ? `https://image.tmdb.org/t/p/w1280${currentItem.backdrop_path}`
      : 'https://images.unsplash.com/photo-1574375927938-d5a98e8ffe85?q=80&w=1920&auto=format&fit=crop');

  const currentLang =
    LANGUAGE_OPTIONS.find((l) => l.id === preferredLanguage) || LANGUAGE_OPTIONS[0];

  const savedStatus =
    typeof isSavedInWatchlist === 'function'
      ? isSavedInWatchlist(currentItem.id)
      : Boolean(isSavedInWatchlist);

  return (
    <div
      onMouseEnter={() => setIsPausedByHover(true)}
      onMouseLeave={() => setIsPausedByHover(false)}
      className="relative w-full h-[80vh] sm:h-[86vh] lg:h-[92vh] overflow-hidden select-none bg-[#141414]"
    >
      {/* 1. Imagen Backdrop con Animación Cinemática Ken Burns en cada cambio de slide */}
      <img
        key={`backdrop-${currentItem.id}-${activeIndex}`}
        src={backdropUrl}
        alt={title}
        className={`absolute inset-0 w-full h-full object-cover object-center filter brightness-[0.86] animate-heroBackdrop transition-opacity duration-1000 ${
          showTrailer && trailerKey ? 'opacity-0' : 'opacity-100'
        }`}
      />

      {/* 2. Tráiler en Vivo de Fondo (YouTube Preview) */}
      {showTrailer && trailerKey && (
        <div className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none transition-opacity duration-1000 opacity-100 scale-[1.32] animate-fadeIn">
          <iframe
            key={`yt-${currentItem.id}-${trailerKey}`}
            src={`https://www.youtube.com/embed/${trailerKey}?autoplay=1&mute=${
              isMuted ? 1 : 0
            }&controls=0&loop=1&playlist=${trailerKey}&playsinline=1&modestbranding=1&rel=0&iv_load_policy=3`}
            title={`Preview ${title}`}
            className="w-full h-full border-0 pointer-events-none"
            allow="autoplay; encrypted-media"
          />
        </div>
      )}

      {/* 3. Capas de Degradado Cinemático Estilo Netflix */}
      <div className="absolute inset-0 bg-gradient-to-r from-[#141414] via-[#141414]/75 to-transparent w-full md:w-[78%] z-10" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#141414] via-[#141414]/25 to-transparent z-10" />
      <div className="absolute bottom-0 left-0 right-0 h-44 bg-gradient-to-t from-[#141414] via-[#141414]/90 to-transparent z-10" />
      <div className="absolute top-0 left-0 right-0 h-28 bg-gradient-to-b from-black/80 to-transparent z-10" />

      {/* Controles Laterales del Carrusel Hero */}
      {slides.length > 1 && (
        <>
          <button
            type="button"
            onClick={handlePrevSlide}
            className="hidden sm:flex absolute left-3 top-1/2 -translate-y-1/2 z-30 w-11 h-16 rounded-2xl bg-black/45 hover:bg-[#E50914] text-white border border-white/15 items-center justify-center backdrop-blur-md transition-all duration-300 hover:scale-110 shadow-2xl"
            title="Destacado anterior"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <button
            type="button"
            onClick={handleNextSlide}
            className="hidden sm:flex absolute right-3 top-1/2 -translate-y-1/2 z-30 w-11 h-16 rounded-2xl bg-black/45 hover:bg-[#E50914] text-white border border-white/15 items-center justify-center backdrop-blur-md transition-all duration-300 hover:scale-110 shadow-2xl"
            title="Siguiente destacado"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        </>
      )}

      {/* 4. Información Principal del Billboard con Animación de Entrada Fluida */}
      <div
        key={`content-${currentItem.id}-${activeIndex}-${slideDirection}`}
        className="absolute bottom-28 sm:bottom-32 left-4 sm:left-8 lg:left-12 max-w-2xl z-20 space-y-3.5 animate-heroContent"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#E50914]/25 border border-[#E50914]/60 text-red-200 text-xs font-extrabold shadow-lg backdrop-blur-md">
            <Sparkles className="w-3.5 h-3.5 text-[#E50914]" />
            <span>{reasonTag}</span>
          </span>

          {sectionLabel && (
            <span className="px-2.5 py-1 rounded-full bg-white/10 border border-white/15 text-[11px] font-black uppercase tracking-wider text-white backdrop-blur-md">
              {sectionLabel}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2.5 text-xs font-bold tracking-wider">
          <div className="flex items-center gap-1.5">
            <span className="text-[#E50914] font-black text-lg leading-none">N</span>
            <span className="text-neutral-300 uppercase tracking-[0.22em] text-[11px] font-extrabold">
              {mediaType === 'tv' ? 'SERIE DESTACADA' : 'PELÍCULA DESTACADA'}
            </span>
          </div>

          <span className="text-neutral-600">•</span>

          <span className="px-2 py-0.5 bg-[#E50914] text-white rounded text-[10px] font-black uppercase tracking-wider shadow">
            TOP #{activeIndex + 1} HOY
          </span>

          <span className="text-emerald-400 font-extrabold">{matchScore}% para ti</span>

          <div className="flex items-center gap-1 text-amber-400 bg-black/50 backdrop-blur-md px-2 py-0.5 rounded border border-white/10">
            <Star className="w-3.5 h-3.5 fill-current" />
            <span>{rating}</span>
          </div>

          {releaseYear && <span className="text-neutral-300 font-semibold">{releaseYear}</span>}

          <span className="border border-white/30 bg-black/30 text-neutral-200 px-1.5 py-0.2 rounded text-[10px] font-bold">
            Calidad y audio según la fuente
          </span>
        </div>

        <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight drop-shadow-[0_6px_24px_rgba(0,0,0,0.9)] leading-[1.03] line-clamp-2">
          {title}
        </h1>

        <p className="text-xs sm:text-base text-neutral-200/95 line-clamp-3 max-w-xl drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)] leading-relaxed font-normal">
          {overview}
        </p>

        {onChangeLanguage && (
          <div className="flex items-center flex-wrap gap-1.5 pt-0.5">
            <span className="text-[11px] font-semibold text-neutral-400 flex items-center gap-1 mr-1">
              <Globe className="w-3.5 h-3.5 text-[#E50914]" />
              Motor de Audio:
            </span>
            {LANGUAGE_OPTIONS.map((opt) => {
              const active = opt.id === preferredLanguage;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onChangeLanguage(opt.id)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition-all flex items-center gap-1 border ${
                    active
                      ? 'bg-[#E50914] text-white border-red-500 shadow-lg shadow-red-950/60 scale-105'
                      : 'bg-black/60 hover:bg-black/80 text-neutral-300 border-white/15'
                  }`}
                >
                  <span>{opt.flag}</span>
                  <span>{opt.shortLabel}</span>
                </button>
              );
            })}
          </div>
        )}

        <div className="flex items-center flex-wrap gap-3 pt-1.5">
          <button
            type="button"
            onClick={() =>
              onPlay(
                currentItem,
                mediaType === 'tv' ? 1 : null,
                mediaType === 'tv' ? 1 : null,
                null,
                preferredLanguage
              )
            }
            className="flex items-center gap-2.5 px-7 sm:px-8 py-3 bg-white hover:bg-neutral-200 text-black font-extrabold text-sm sm:text-base rounded-md shadow-[0_8px_25px_rgba(255,255,255,0.25)] transition-all duration-200 hover:scale-105 active:scale-95"
          >
            <Play className="w-5 h-5 fill-current text-black" />
            <span>Reproducir · {currentLang.flag} {currentLang.shortLabel}</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectDetails(currentItem)}
            className="flex items-center gap-2.5 px-6 sm:px-7 py-3 bg-neutral-500/40 hover:bg-neutral-500/60 text-white font-bold text-sm sm:text-base rounded-md backdrop-blur-md transition-all duration-200 hover:scale-105 active:scale-95 border border-white/15"
          >
            <Info className="w-5 h-5" />
            <span>Más información</span>
          </button>

          {trailerKey && (
            <button
              type="button"
              onClick={() => {
                setShowTrailer(true);
                setIsMuted((prev) => !prev);
              }}
              className="flex items-center gap-2 px-4 py-3 rounded-md bg-black/65 hover:bg-black/85 text-white font-bold text-xs sm:text-sm border border-white/25 backdrop-blur-md transition-all hover:scale-105"
            >
              <Film className="w-4 h-4 text-[#E50914]" />
              <span>{showTrailer && !isMuted ? 'Silenciar Preview' : '🎬 Preview en Vivo'}</span>
            </button>
          )}

          {onToggleWatchlist && (
            <button
              type="button"
              onClick={() => onToggleWatchlist(currentItem)}
              className={`flex items-center gap-2 px-4 py-3 rounded-md font-bold text-sm transition-all duration-200 hover:scale-105 border backdrop-blur-md ${
                savedStatus
                  ? 'bg-amber-500/25 text-amber-300 border-amber-400/50'
                  : 'bg-black/50 text-white border-white/20 hover:bg-black/75'
              }`}
            >
              {savedStatus ? (
                <>
                  <Check className="w-5 h-5 text-amber-400" />
                  <span className="hidden sm:inline">En Mi Lista</span>
                </>
              ) : (
                <>
                  <Bookmark className="w-5 h-5" />
                  <span className="hidden sm:inline">Mi Lista</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Control de Audio del Tráiler y Clasificación de Edad */}
      <div className="absolute bottom-32 right-0 z-20 flex items-center gap-3">
        {trailerKey && (
          <button
            type="button"
            onClick={() => {
              if (!showTrailer) setShowTrailer(true);
              else setIsMuted(!isMuted);
            }}
            className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-black/60 hover:bg-black/85 text-white border border-white/30 flex items-center justify-center transition-all hover:scale-110 shadow-xl backdrop-blur-md"
            title="Activar/Desactivar sonido del avance"
          >
            {!showTrailer ? (
              <RotateCcw className="w-4 h-4 text-white" />
            ) : isMuted ? (
              <VolumeX className="w-5 h-5 text-neutral-300" />
            ) : (
              <Volume2 className="w-5 h-5 text-white" />
            )}
          </button>
        )}

        <div className="bg-black/65 backdrop-blur-md border-l-[3px] border-[#E50914] py-1.5 pl-3 pr-6 text-xs font-bold text-neutral-200 tracking-wider">
          16+
        </div>
      </div>

      {/* 5. Tira Inferior de Miniaturas Multi-Slide con Barra de Progreso Animada */}
      {slides.length > 1 && (
        <div className="absolute bottom-12 sm:bottom-14 left-4 sm:left-8 lg:left-12 right-4 sm:right-8 lg:right-12 z-30 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1.5">
            {slides.map((slideItem, idx) => {
              const isCurrent = idx === activeIndex;
              const sTitle = slideItem.title || slideItem.name || `Destacado ${idx + 1}`;
              return (
                <button
                  key={slideItem.id || idx}
                  type="button"
                  onClick={() => handlePickSlide(idx)}
                  className={`group relative overflow-hidden flex items-center gap-2 px-3.5 py-2 rounded-xl border backdrop-blur-xl transition-all duration-300 shrink-0 ${
                    isCurrent
                      ? 'bg-[#E50914]/25 border-[#E50914] text-white scale-105 shadow-[0_0_20px_rgba(229,9,20,0.38)]'
                      : 'bg-black/55 hover:bg-black/80 border-white/10 text-neutral-400 hover:text-white'
                  }`}
                >
                  <span
                    className={`text-[10px] font-black px-1.5 py-0.2 rounded ${
                      isCurrent ? 'bg-[#E50914] text-white' : 'bg-white/10 text-neutral-300'
                    }`}
                  >
                    #{idx + 1}
                  </span>
                  <span className="text-xs font-bold truncate max-w-[110px] sm:max-w-[145px]">
                    {sTitle}
                  </span>

                  {/* Barra inferior de progreso de 9s en la miniatura activa */}
                  {isCurrent && !isPausedByHover && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/15">
                      <span
                        key={`timer-${activeIndex}`}
                        className="block h-full bg-[#E50914] animate-slideProgress"
                      />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
