import React, { useState, useEffect } from 'react';
import api from '../services/api.js';
import { Play, Info, Star, Calendar, Volume2, VolumeX, Bookmark, Check } from 'lucide-react';

export default function HeroBanner({
  item,
  onPlay,
  onSelectDetails,
  onToggleWatchlist,
  isSavedInWatchlist = false,
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

  const backdropUrl = item.backdrop_url || (item.backdrop_path
    ? `https://image.tmdb.org/t/p/original${item.backdrop_path}`
    : 'https://images.unsplash.com/photo-1574375927938-d5a98e8ffe85?q=80&w=1920&auto=format&fit=crop');

  // Buscar el tráiler oficial de YouTube en el backend
  useEffect(() => {
    let isMounted = true;
    setShowTrailer(false);
    setTrailerKey(null);

    const fetchTrailer = async () => {
      try {
        const trailer = await api.getTrailers(mediaType, item.id);
        if (isMounted && trailer?.key) {
          setTrailerKey(trailer.key);
        }
      } catch (e) {
        // Fallback silencioso a póster estático
      }
    };

    fetchTrailer();

    // Fade-in del tráiler después de 3 segundos
    const timer = setTimeout(() => {
      if (isMounted) setShowTrailer(true);
    }, 3200);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [item.id, mediaType]);

  return (
    <div className="relative w-full h-[72vh] sm:h-[82vh] lg:h-[90vh] overflow-hidden select-none bg-black">
      {/* 1. Backdrop Static Image */}
      <img
        src={backdropUrl}
        alt={title}
        className={`absolute inset-0 w-full h-full object-cover object-center filter brightness-90 transform scale-105 transition-opacity duration-1000 ${
          showTrailer && trailerKey ? 'opacity-0' : 'opacity-100'
        }`}
      />

      {/* 2. YouTube Background Video Fade-In */}
      {showTrailer && trailerKey && (
        <div className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none transition-opacity duration-1000 opacity-100 scale-125">
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

      {/* Cinematic Gradient Overlays */}
      <div className="absolute inset-0 bg-gradient-to-r from-[#141414] via-[#141414]/75 to-transparent w-full md:w-3/4 z-10"></div>
      <div className="absolute inset-0 bg-gradient-to-t from-[#141414] via-[#141414]/30 to-transparent z-10"></div>
      <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-[#141414]/80 to-transparent z-10"></div>

      {/* Hero Content */}
      <div className="absolute bottom-16 sm:bottom-24 left-4 sm:left-12 lg:left-16 max-w-2xl z-20 space-y-4">
        {/* Badges */}
        <div className="flex items-center gap-3 text-xs sm:text-sm font-semibold">
          <span className="px-2.5 py-0.5 bg-red-600 text-white rounded font-bold uppercase tracking-wider text-[11px]">
            {item.media_type === 'tv' ? 'Serie Original' : 'Estreno Destacado'}
          </span>
          <div className="flex items-center gap-1 text-amber-400 bg-black/40 backdrop-blur-md px-2 py-0.5 rounded border border-white/10">
            <Star className="w-3.5 h-3.5 fill-current" />
            <span>{rating}</span>
          </div>
          {releaseYear && (
            <div className="flex items-center gap-1 text-gray-300">
              <Calendar className="w-3.5 h-3.5" />
              <span>{releaseYear}</span>
            </div>
          )}
          <span className="border border-gray-500 text-gray-300 px-1.5 py-0.2 rounded text-[10px]">
            1080p Ultra HD • Dual
          </span>
        </div>

        {/* Title */}
        <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight drop-shadow-2xl leading-none font-netflix">
          {title}
        </h1>

        {/* Overview with line clamp */}
        <p className="text-sm sm:text-base text-gray-300 line-clamp-3 sm:line-clamp-4 max-w-xl drop-shadow-md leading-relaxed font-light">
          {overview}
        </p>

        {/* Action Buttons */}
        <div className="flex items-center flex-wrap gap-3 pt-2">
          {/* Botón Reproducir */}
          <button
            onClick={() => onPlay(item)}
            className="flex items-center gap-2.5 px-6 sm:px-8 py-3 bg-white hover:bg-neutral-200 text-black font-extrabold text-sm sm:text-base rounded-md shadow-2xl transition-all duration-200 hover:scale-105 active:scale-95"
          >
            <Play className="w-5 h-5 fill-current text-black" />
            <span>Reproducir</span>
          </button>

          {/* Botón Mi Lista */}
          {onToggleWatchlist && (
            <button
              onClick={() => onToggleWatchlist(item)}
              className={`flex items-center gap-2 px-4 sm:px-5 py-3 rounded-md font-semibold text-sm sm:text-base transition-all duration-200 hover:scale-105 border ${
                isSavedInWatchlist
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  : 'bg-black/50 text-white border-white/20 hover:bg-black/70'
              }`}
            >
              {isSavedInWatchlist ? (
                <>
                  <Check className="w-5 h-5 text-amber-400" />
                  <span>En Mi Lista</span>
                </>
              ) : (
                <>
                  <Bookmark className="w-5 h-5" />
                  <span>Mi Lista</span>
                </>
              )}
            </button>
          )}

          {/* Botón Más Información */}
          <button
            onClick={() => onSelectDetails(item)}
            className="flex items-center gap-2 px-5 sm:px-6 py-3 bg-neutral-600/70 hover:bg-neutral-600/90 text-white font-semibold text-sm sm:text-base rounded-md backdrop-blur-md transition-all duration-200 hover:scale-105 active:scale-95 border border-white/10"
          >
            <Info className="w-5 h-5" />
            <span>Más Información</span>
          </button>
        </div>
      </div>

      {/* Audio Mute/Unmute toggle button (estilo Netflix TV) */}
      {showTrailer && trailerKey && (
        <button
          onClick={() => setIsMuted(!isMuted)}
          className="absolute bottom-24 right-6 sm:right-12 z-20 w-11 h-11 rounded-full bg-black/60 hover:bg-black/80 text-white border border-white/20 flex items-center justify-center transition-all hover:scale-110 shadow-2xl backdrop-blur-md"
          title={isMuted ? 'Activar sonido del tráiler' : 'Silenciar tráiler'}
        >
          {isMuted ? <VolumeX className="w-5 h-5 text-gray-300" /> : <Volume2 className="w-5 h-5 text-white" />}
        </button>
      )}
    </div>
  );
}
