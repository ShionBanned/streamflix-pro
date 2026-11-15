import React, { useState, useEffect } from 'react';
import api from '../services/api.js';
import { X, Play, Star, Calendar, Clock, Film, Tv, ChevronDown, Check, Bookmark } from 'lucide-react';

export default function DetailModal({
  item,
  onClose,
  onPlay,
  onToggleWatchlist = null,
  isSavedInWatchlist = null,
}) {
  if (!item) return null;

  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedSeason, setSelectedSeason] = useState(1);
  const [seasonEpisodes, setSeasonEpisodes] = useState([]);
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);

  const isTv = item.media_type === 'tv' || Boolean(item.first_air_date) || Boolean(item.number_of_seasons);
  const inWatchlist = isSavedInWatchlist ? isSavedInWatchlist(item.id) : false;

  // Cargar detalles completos del título
  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    const fetchDetails = async () => {
      try {
        const data = isTv ? await api.getTvDetails(item.id) : await api.getMovieDetails(item.id);
        if (isMounted) {
          setDetails(data);
          setLoading(false);
        }
      } catch (err) {
        console.error('Error fetching details:', err);
        if (isMounted) setLoading(false);
      }
    };

    fetchDetails();
    return () => {
      isMounted = false;
    };
  }, [item.id, isTv]);

  // Cargar episodios de la temporada seleccionada si es serie
  useEffect(() => {
    if (!isTv) return;
    let isMounted = true;
    setLoadingEpisodes(true);

    const fetchSeason = async () => {
      try {
        const data = await api.getSeasonDetails(item.id, selectedSeason);
        if (isMounted) {
          setSeasonEpisodes(data?.episodes || []);
          setLoadingEpisodes(false);
        }
      } catch (err) {
        console.error('Error fetching season episodes:', err);
        if (isMounted) setLoadingEpisodes(false);
      }
    };

    fetchSeason();
    return () => {
      isMounted = false;
    };
  }, [item.id, selectedSeason, isTv]);

  // Cerrar con Escape
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const title = details?.title || details?.name || item.title || item.name || 'Sin título';
  const overview = details?.overview || item.overview || 'Sin descripción disponible.';
  const releaseYear = (details?.release_date || details?.first_air_date || item.release_date || item.first_air_date || '').substring(0, 4);
  const rating = (details?.vote_average || item.vote_average || 8.0).toFixed(1);
  const backdropUrl = details?.backdrop_url || item.backdrop_url || (details?.backdrop_path || item.backdrop_path
    ? `https://image.tmdb.org/t/p/original${details?.backdrop_path || item.backdrop_path}`
    : 'https://images.unsplash.com/photo-1574375927938-d5a98e8ffe85?q=80&w=1920&auto=format&fit=crop');

  const genres = details?.genres?.map((g) => g.name).join(' • ') || 'Acción • Drama';
  const runtime = details?.runtime ? `${Math.floor(details.runtime / 60)}h ${details.runtime % 60}m` : null;
  const seasonsCount = details?.number_of_seasons || 1;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/85 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 md:p-6 animate-fadeIn">
      {/* Modal Container */}
      <div className="relative w-full max-w-4xl bg-[#181818] rounded-xl overflow-hidden shadow-2xl border border-white/10 my-8">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-30 w-10 h-10 rounded-full bg-black/70 hover:bg-black text-white flex items-center justify-center transition-all hover:scale-110 border border-white/10"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Backdrop Banner */}
        <div className="relative h-64 sm:h-80 md:h-96 w-full overflow-hidden">
          <img
            src={backdropUrl}
            alt={title}
            className="w-full h-full object-cover object-center filter brightness-90"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#181818] via-[#181818]/40 to-transparent"></div>
          <div className="absolute inset-0 bg-gradient-to-r from-[#181818]/80 via-transparent to-transparent"></div>

          {/* Floating Action Bar inside Banner */}
          <div className="absolute bottom-6 left-6 right-6 flex flex-wrap items-center gap-3">
            <button
              onClick={() => onPlay({ ...item, ...details }, isTv ? selectedSeason : null, isTv ? 1 : null)}
              className="flex items-center gap-2.5 px-7 py-3 bg-white hover:bg-neutral-200 text-black font-extrabold text-base rounded-md shadow-xl transition-all hover:scale-105 active:scale-95"
            >
              <Play className="w-5 h-5 fill-current" />
              <span>{isTv ? `Reproducir T${selectedSeason} : E1` : 'Reproducir Ahora'}</span>
            </button>

            {onToggleWatchlist && (
              <button
                onClick={() => onToggleWatchlist({ ...item, ...details })}
                className={`flex items-center gap-2 px-4 py-3 rounded-md font-semibold text-sm transition-all hover:scale-105 border backdrop-blur-md ${
                  inWatchlist
                    ? 'bg-amber-500/25 text-amber-300 border-amber-500/50'
                    : 'bg-black/60 text-white border-white/20 hover:bg-black/80'
                }`}
              >
                {inWatchlist ? (
                  <>
                    <Check className="w-4 h-4 text-amber-400" />
                    <span>En Mi Lista</span>
                  </>
                ) : (
                  <>
                    <Bookmark className="w-4 h-4" />
                    <span>Añadir a Mi Lista</span>
                  </>
                )}
              </button>
            )}

            <div className="flex items-center gap-2 bg-black/50 backdrop-blur-md px-3 py-2 rounded-md border border-white/10 text-xs text-gray-300">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              <span>Resolución P2P Torrentio 1080p / 4K + Auto-Embed</span>
            </div>
          </div>
        </div>

        {/* Body Info */}
        <div className="p-6 sm:p-8 space-y-6">
          {/* Main Info Columns */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2 space-y-4">
              {/* Badges */}
              <div className="flex flex-wrap items-center gap-3 text-xs sm:text-sm">
                <span className="text-emerald-400 font-bold">98% para ti</span>
                <span className="text-gray-400">{releaseYear}</span>
                <span className="px-1.5 py-0.5 border border-gray-600 rounded text-gray-300 text-[10px] font-semibold">
                  HD / 4K
                </span>
                {runtime && (
                  <span className="flex items-center gap-1 text-gray-400">
                    <Clock className="w-3.5 h-3.5" />
                    {runtime}
                  </span>
                )}
                {isTv && (
                  <span className="text-gray-400">
                    {seasonsCount} {seasonsCount === 1 ? 'Temporada' : 'Temporadas'}
                  </span>
                )}
                <div className="flex items-center gap-1 text-amber-400 bg-black/40 px-2 py-0.5 rounded border border-white/5">
                  <Star className="w-3.5 h-3.5 fill-current" />
                  <span className="font-bold">{rating}</span>
                </div>
              </div>

              {/* Title & Tagline */}
              <div>
                <h2 className="text-2xl sm:text-3xl font-black text-white">{title}</h2>
                {details?.tagline && (
                  <p className="text-xs sm:text-sm text-gray-400 italic mt-1 font-serif">
                    "{details.tagline}"
                  </p>
                )}
              </div>

              {/* Overview */}
              <p className="text-sm text-gray-300 leading-relaxed font-light">
                {overview}
              </p>
            </div>

            {/* Sidebar Details */}
            <div className="bg-neutral-900/60 p-4 rounded-lg border border-white/5 text-xs space-y-3 h-fit">
              <div>
                <span className="text-gray-500 block">Géneros:</span>
                <span className="text-gray-200 font-medium">{genres}</span>
              </div>
              {details?.production_countries?.length > 0 && (
                <div>
                  <span className="text-gray-500 block">País de origen:</span>
                  <span className="text-gray-200 font-medium">
                    {details.production_countries.map((c) => c.name).join(', ')}
                  </span>
                </div>
              )}
              {details?.vote_count && (
                <div>
                  <span className="text-gray-500 block">Votos TMDB:</span>
                  <span className="text-gray-200 font-medium">
                    {details.vote_count.toLocaleString()} calificaciones
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Section: Episodes & Seasons (if TV Show / Anime) */}
          {isTv && (
            <div className="pt-6 border-t border-white/10 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  <Tv className="w-5 h-5 text-red-500" />
                  Episodios
                </h3>

                {/* Season Dropdown */}
                {seasonsCount > 1 && (
                  <div className="relative">
                    <select
                      value={selectedSeason}
                      onChange={(e) => setSelectedSeason(Number(e.target.value))}
                      className="bg-neutral-800 text-white border border-neutral-700 rounded-md px-3 py-1.5 text-xs font-semibold focus:outline-none focus:border-red-500 cursor-pointer"
                    >
                      {Array.from({ length: seasonsCount }, (_, i) => i + 1).map((s) => (
                        <option key={s} value={s}>
                          Temporada {s}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Episodes List */}
              {loadingEpisodes ? (
                <div className="py-8 text-center text-gray-400 text-sm">
                  Cargando episodios de la Temporada {selectedSeason}...
                </div>
              ) : seasonEpisodes.length === 0 ? (
                <div className="py-8 text-center text-gray-400 text-sm">
                  No se encontraron episodios listados para esta temporada.
                </div>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                  {seasonEpisodes.map((ep) => {
                    const epStill = ep.still_url || (ep.still_path
                      ? `https://image.tmdb.org/t/p/w300${ep.still_path}`
                      : 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?q=80&w=300&auto=format&fit=crop');

                    return (
                      <div
                        key={ep.id}
                        onClick={() => onPlay({ ...item, ...details }, selectedSeason, ep.episode_number)}
                        className="group flex flex-col sm:flex-row items-start sm:items-center justify-between p-3 rounded-lg bg-neutral-900/70 hover:bg-neutral-800 border border-white/5 transition cursor-pointer gap-4"
                      >
                        <div className="flex items-center gap-4">
                          <span className="text-lg font-bold text-gray-400 group-hover:text-white w-6 text-center">
                            {ep.episode_number}
                          </span>

                          <div className="relative w-28 sm:w-32 aspect-video rounded overflow-hidden flex-shrink-0 bg-neutral-800">
                            <img
                              src={epStill}
                              alt={ep.name}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                            />
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                              <Play className="w-6 h-6 text-white fill-current" />
                            </div>
                          </div>

                          <div>
                            <h4 className="text-sm font-semibold text-white group-hover:text-red-400 transition-colors">
                              {ep.name || `Episodio ${ep.episode_number}`}
                            </h4>
                            <p className="text-xs text-gray-400 line-clamp-2 mt-0.5">
                              {ep.overview || 'Sin descripción para este episodio.'}
                            </p>
                          </div>
                        </div>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onPlay({ ...item, ...details }, selectedSeason, ep.episode_number);
                          }}
                          className="px-3 py-1.5 bg-red-600/20 group-hover:bg-red-600 text-red-400 group-hover:text-white rounded text-xs font-semibold flex items-center gap-1.5 transition whitespace-nowrap self-end sm:self-center"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>Ver</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
