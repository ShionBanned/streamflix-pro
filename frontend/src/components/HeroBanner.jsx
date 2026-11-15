import React, { useState, useEffect } from 'react';
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
} from 'lucide-react';
import { LANGUAGE_OPTIONS } from '../hooks/useUserMedia.js';

export default function HeroBanner({
  item,
  onPlay,
  onSelectDetails,
  onToggleWatchlist,
  isSavedInWatchlist = false,
  preferredLanguage = 'latino',
  onChangeLanguage = null,
}) {
  if (!item) return null;

  const [trailerKey, setTrailerKey] = useState(null);
  const [showTrailer, setShowTrailer] = useState(false);
  const [isMuted, setIsMuted] = useState(true);

  const title = item.title || item.name || 'Título Destacado';
  const overview = item.overview || 'Sin descripción disponible para este título.';
  const releaseYear = (item.release_date || item.first_air_date || '').substring(0, 4);
  const rating = item.vote_average ? item.vote_average.toFixed(1) : '8.5';
  const mediaType = item.media_type || (item.first_air_date ? 'tv' : 'movie');

  const backdropUrl =
    item.backdrop_url ||
    (item.backdrop_path
      ? `https://image.tmdb.org/t/p/w1280${item.backdrop_path}`
      : 'https://images.unsplash.com/photo-1574375927938-d5a98e8ffe85?q=80&w=1920&auto=format&fit=crop');

  const currentLang =
    LANGUAGE_OPTIONS.find((l) => l.id === preferredLanguage) || LANGUAGE_OPTIONS[0];

  useEffect(() => {
    let isMounted = true;
    setShowTrailer(false);
    setTrailerKey(null);

    const fetchTrailer = async () => {
      try {
        const trailer = await api.getTrailers(mediaType, item.id, preferredLanguage);
        if (isMounted && trailer?.key) {
          setTrailerKey(trailer.key);
        }
      } catch {
        // Fallback silencioso
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
  }, [item.id, mediaType, preferredLanguage]);

  return (
    <div className="relative w-full h-[78vh] sm:h-[85vh] lg:h-[92vh] overflow-hidden select-none bg-[#0f0f0f]">
      {/* 1. Backdrop Image optimizada (w1280 para carga instantánea) */}
      <img
        src={backdropUrl}
        alt={title}
        className={`absolute inset-0 w-full h-full object-cover object-center filter brightness-[0.88] transform scale-105 transition-all duration-1000 ${
          showTrailer && trailerKey ? 'opacity-0 scale-110' : 'opacity-100 scale-100'
        }`}
      />

      {/* 2. YouTube Background Video Fade-In */}
      {showTrailer && trailerKey && (
        <div className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none transition-opacity duration-1000 opacity-100 scale-[1.32]">
          <iframe
            src={`https://www.youtube.com/embed/${trailerKey}?autoplay=1&mute=${
              isMuted ? 1 : 0
            }&controls=0&loop=1&playlist=${trailerKey}&playsinline=1&modestbranding=1&rel=0&iv_load_policy=3`}
            title={`Tráiler ${title}`}
            className="w-full h-full border-0 pointer-events-none"
            allow="autoplay; encrypted-media"
          />
        </div>
      )}

      {/* 3. Capas de Degradado Cinemático */}
      <div className="absolute inset-0 bg-gradient-to-r from-[#0f0f0f] via-[#0f0f0f]/70 to-transparent w-full md:w-[75%] z-10" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#0f0f0f] via-[#0f0f0f]/25 to-transparent z-10" />
      <div className="absolute bottom-0 left-0 right-0 h-36 bg-gradient-to-t from-[#0f0f0f] to-transparent z-10" />
      <div className="absolute top-0 left-0 right-0 h-28 bg-gradient-to-b from-black/80 to-transparent z-10" />

      {/* 4. Contenido Principal del Billboard */}
      <div className="absolute bottom-20 sm:bottom-28 left-4 sm:left-8 lg:left-12 max-w-2xl z-20 space-y-4">
        <div className="flex flex-wrap items-center gap-2.5 text-xs font-bold tracking-wider">
          <div className="flex items-center gap-1.5">
            <span className="text-[#E50914] font-black text-lg leading-none">N</span>
            <span className="text-neutral-300 uppercase tracking-[0.25em] text-[11px] font-extrabold">
              {mediaType === 'tv' ? 'SERIE DESTACADA' : 'PELÍCULA DESTACADA'}
            </span>
          </div>

          <span className="text-neutral-600">•</span>

          <span className="px-2 py-0.5 bg-[#E50914] text-white rounded text-[10px] font-black uppercase tracking-wider shadow">
            TOP #1 HOY
          </span>

          <div className="flex items-center gap-1 text-amber-400 bg-black/50 backdrop-blur-md px-2 py-0.5 rounded border border-white/10">
            <Star className="w-3.5 h-3.5 fill-current" />
            <span>{rating}</span>
          </div>

          {releaseYear && (
            <span className="text-neutral-300 font-semibold">{releaseYear}</span>
          )}

          <span className="border border-white/30 bg-black/30 text-neutral-200 px-1.5 py-0.2 rounded text-[10px] font-bold">
            4K HDR
          </span>
        </div>

        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight drop-shadow-[0_6px_24px_rgba(0,0,0,0.9)] leading-[1.03]">
          {title}
        </h1>

        <p className="text-sm sm:text-base text-neutral-200/95 line-clamp-3 max-w-xl drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)] leading-relaxed font-normal">
          {overview}
        </p>

        {onChangeLanguage && (
          <div className="flex items-center flex-wrap gap-1.5 pt-0.5">
            <span className="text-[11px] font-semibold text-neutral-400 flex items-center gap-1 mr-1">
              <Globe className="w-3.5 h-3.5 text-[#E50914]" />
              Audio / Subtítulos:
            </span>
            {LANGUAGE_OPTIONS.map((opt) => {
              const active = opt.id === preferredLanguage;
              return (
                <button
                  key={opt.id}
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

        <div className="flex items-center flex-wrap gap-3 pt-2">
          <button
            onClick={() =>
              onPlay(
                item,
                mediaType === 'tv' ? 1 : null,
                mediaType === 'tv' ? 1 : null,
                null,
                preferredLanguage
              )
            }
            className="flex items-center gap-2.5 px-7 sm:px-8 py-3 bg-white hover:bg-neutral-200 text-black font-extrabold text-sm sm:text-base rounded-md shadow-[0_8px_25px_rgba(255,255,255,0.25)] transition-all duration-200 hover:scale-105 active:scale-95"
          >
            <Play className="w-5 h-5 fill-current text-black" />
            <span>Reproducir ({currentLang.flag} {currentLang.shortLabel})</span>
          </button>

          <button
            onClick={() => onSelectDetails(item)}
            className="flex items-center gap-2.5 px-6 sm:px-7 py-3 bg-neutral-500/40 hover:bg-neutral-500/60 text-white font-bold text-sm sm:text-base rounded-md backdrop-blur-md transition-all duration-200 hover:scale-105 active:scale-95 border border-white/15"
          >
            <Info className="w-5 h-5" />
            <span>Más información</span>
          </button>

          {onToggleWatchlist && (
            <button
              onClick={() => onToggleWatchlist(item)}
              className={`flex items-center gap-2 px-4 py-3 rounded-md font-bold text-sm transition-all duration-200 hover:scale-105 border backdrop-blur-md ${
                isSavedInWatchlist
                  ? 'bg-amber-500/25 text-amber-300 border-amber-400/50'
                  : 'bg-black/50 text-white border-white/20 hover:bg-black/75'
              }`}
            >
              {isSavedInWatchlist ? (
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

      <div className="absolute bottom-24 right-0 z-20 flex items-center gap-3">
        {trailerKey && (
          <button
            onClick={() => {
              if (!showTrailer) setShowTrailer(true);
              else setIsMuted(!isMuted);
            }}
            className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-black/60 hover:bg-black/85 text-white border border-white/30 flex items-center justify-center transition-all hover:scale-110 shadow-xl backdrop-blur-md"
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
    </div>
  );
}
