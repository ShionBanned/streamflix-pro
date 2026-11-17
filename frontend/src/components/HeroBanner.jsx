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
import { getContentRating } from '../utils/contentRating.js';

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
  enableTrailer = true,
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
  const [contentRating, setContentRating] = useState(null);
  const [showTrailer, setShowTrailer] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [isPausedByHover, setIsPausedByHover] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false);

  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!query) return;
    const update = () => setReduceMotion(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    setActiveIndex(0);
  }, [sectionLabel, slides.length]);

  const currentItem = slides[activeIndex] || slides[0] || null;

  useEffect(() => {
    if (!currentItem?.id) { setContentRating(null); return; }
    let active = true;
    setContentRating(null);
    const type = currentItem.media_type || (currentItem.first_air_date ? 'tv' : 'movie');
    const lang = LANGUAGE_OPTIONS.find((option) => option.id === preferredLanguage)?.tmdbLang || 'es-MX';
    (type === 'tv' ? api.getTvDetails(currentItem.id, lang) : api.getMovieDetails(currentItem.id, lang))
      .then((details) => { if (active) setContentRating({ id: currentItem.id, label: getContentRating(details, type) }); })
      .catch(() => { if (active) setContentRating({ id: currentItem.id, label: null }); });
    return () => { active = false; };
  }, [currentItem?.id, currentItem?.media_type, currentItem?.first_air_date, preferredLanguage]);

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
    if (slides.length <= 1 || isPausedByHover || reduceMotion || (showTrailer && !isMuted)) return;
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') handleNextSlide();
    }, 9000);
    return () => clearInterval(interval);
  }, [slides.length, isPausedByHover, showTrailer, isMuted, handleNextSlide, reduceMotion]);

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

    if (enableTrailer) fetchTrailer();

    const timer = reduceMotion || !enableTrailer ? null : setTimeout(() => {
      if (isMounted && document.visibilityState === 'visible') setShowTrailer(true);
    }, 2800);

    return () => {
      isMounted = false;
      if (timer) clearTimeout(timer);
    };
  }, [currentItem?.id, currentItem?.media_type, currentItem?.first_air_date, preferredLanguage, reduceMotion, enableTrailer]);

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
      className="relative w-full h-[74vh] min-h-[560px] sm:h-[82vh] lg:h-[88vh] overflow-hidden select-none bg-[#141414]"
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
            src={`https://www.youtube-nocookie.com/embed/${trailerKey}?autoplay=1&mute=${
              isMuted ? 1 : 0
            }&controls=0&disablekb=1&fs=0&loop=1&playlist=${trailerKey}&playsinline=1&modestbranding=1&rel=0&iv_load_policy=3&cc_load_policy=0`}
            title={`Preview ${title}`}
            tabIndex={-1}
            aria-hidden="true"
            className="w-full h-full border-0 pointer-events-none select-none"
            allow="autoplay; encrypted-media"
          />
          <div className="absolute inset-0 z-10" aria-hidden="true" />
        </div>
      )}

      {/* 3. Capas de Degradado Cinemático Estilo Netflix */}
      <div className="absolute inset-0 bg-gradient-to-r from-[#141414]/95 via-[#141414]/70 to-transparent w-full md:w-[78%] z-10" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#141414] via-[#141414]/25 to-transparent z-10" />
      <div className="absolute bottom-0 left-0 right-0 h-44 bg-gradient-to-t from-[#141414] via-[#141414]/90 to-transparent z-10" />
      <div className="absolute top-0 left-0 right-0 h-28 bg-gradient-to-b from-black/80 to-transparent z-10" />

      {/* Controles Laterales del Carrusel Hero */}
      {slides.length > 1 && (
        <>
          <button
            type="button"
            onClick={handlePrevSlide}
            className="hidden lg:flex absolute left-3 top-1/2 -translate-y-1/2 z-30 w-11 h-16 rounded-2xl bg-black/45 hover:bg-[#E50914] text-white border border-white/15 items-center justify-center backdrop-blur-md transition-all duration-300 hover:scale-110 shadow-2xl"
            title="Destacado anterior"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <button
            type="button"
            onClick={handleNextSlide}
            className="hidden lg:flex absolute right-3 top-1/2 -translate-y-1/2 z-30 w-11 h-16 rounded-2xl bg-black/45 hover:bg-[#E50914] text-white border border-white/15 items-center justify-center backdrop-blur-md transition-all duration-300 hover:scale-110 shadow-2xl"
            title="Siguiente destacado"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        </>
      )}

      {/* 4. Información Principal del Billboard con Animación de Entrada Fluida */}
      <div
        key={`content-${currentItem.id}-${activeIndex}-${slideDirection}`}
        className="absolute bottom-24 sm:bottom-28 left-4 sm:left-8 lg:left-12 max-w-2xl z-20 space-y-3.5 animate-heroContent"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-white/90 text-xs font-semibold tracking-wide drop-shadow-lg">
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

          <span className="px-2 py-0.5 bg-[#E50914] text-white rounded-sm text-[10px] font-black uppercase tracking-wider shadow">
            TOP #{activeIndex + 1} HOY
          </span>

          <span className="text-emerald-400 font-extrabold">{matchScore}% para ti</span>

          <div className="flex items-center gap-1 text-amber-400 bg-black/50 backdrop-blur-md px-2 py-0.5 rounded border border-white/10">
            <Star className="w-3.5 h-3.5 fill-current" />
            <span>{rating}</span>
          </div>

          {releaseYear && <span className="text-neutral-300 font-semibold">{releaseYear}</span>}

        </div>

        <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight drop-shadow-[0_6px_24px_rgba(0,0,0,0.9)] leading-[1.03] line-clamp-2">
          {title}
        </h1>

        <p className="text-xs sm:text-base text-neutral-200/95 line-clamp-3 max-w-xl drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)] leading-relaxed font-normal">
          {overview}
        </p>

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
            className="hero-primary-cta flex items-center gap-2.5 px-7 sm:px-8 py-3 bg-white hover:bg-neutral-200 text-black font-extrabold text-sm sm:text-base rounded-md shadow-[0_8px_25px_rgba(255,255,255,0.25)] transition-all duration-200 hover:scale-105 active:scale-95"
          >
            <Play className="w-5 h-5 fill-current text-black" />
            <span>Reproducir</span>
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
              className="hidden lg:flex items-center gap-2 px-4 py-3 rounded-md bg-black/65 hover:bg-black/85 text-white font-bold text-xs sm:text-sm border border-white/25 backdrop-blur-md transition-all hover:scale-105"
            >
              <Film className="w-4 h-4 text-[#E50914]" />
              <span>{showTrailer && !isMuted ? 'Silenciar avance' : 'Ver avance'}</span>
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

        {contentRating?.id === currentItem.id && contentRating.label && <div className="bg-black/75 backdrop-blur-md border-l-[3px] border-[#E50914] py-1.5 pl-3 pr-6 text-xs font-bold text-neutral-200 tracking-wider" title="Clasificación publicada para este título">
          {contentRating.label}
        </div>}
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
                  className={`hero-slide-chip group relative overflow-hidden flex items-center gap-2 px-3.5 py-2 rounded-xl border backdrop-blur-xl transition-all duration-300 shrink-0 ${
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
