import React, { useState, useEffect, useRef, useMemo } from 'react';
import api from '../services/api.js';
import {
  X,
  Play,
  Star,
  Clock,
  Tv,
  Check,
  Bookmark,
  Globe,
  Search,
  ArrowUp,
  Users,
  Film,
  Sparkles,
  Volume2,
  RotateCcw,
} from 'lucide-react';
import { LANGUAGE_OPTIONS } from '../hooks/useUserMedia.js';

export default function DetailModal({
  item,
  onClose,
  onPlay,
  onToggleWatchlist = null,
  isSavedInWatchlist = null,
  getSavedEntry = null,
  preferredLanguage = 'latino',
  onChangeLanguage = null,
  onSelectSimilar = null,
}) {
  if (!item) return null;

  const itemId = item.id || item.tmdbId;
  const savedEntry = getSavedEntry ? getSavedEntry(itemId) : null;

  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedSeason, setSelectedSeason] = useState(savedEntry?.season || 1);
  const [seasonEpisodes, setSeasonEpisodes] = useState([]);
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);
  const [episodeFilter, setEpisodeFilter] = useState('');
  const [activeModalTab, setActiveModalTab] = useState('episodes');
  const [selectedLang, setSelectedLang] = useState(preferredLanguage || 'latino');
  const [showScrollTop, setShowScrollTop] = useState(false);

  const scrollContainerRef = useRef(null);

  const isTv =
    item.media_type === 'tv' ||
    item.type === 'tv' ||
    Boolean(item.first_air_date) ||
    Boolean(item.number_of_seasons);

  const inWatchlist = isSavedInWatchlist ? isSavedInWatchlist(itemId) : false;

  useEffect(() => {
    setSelectedLang(preferredLanguage || 'latino');
  }, [preferredLanguage]);

  const handleLanguagePick = (langId) => {
    setSelectedLang(langId);
    if (onChangeLanguage) onChangeLanguage(langId);
  };

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }

    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [itemId]);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setActiveModalTab(isTv ? 'episodes' : 'similar');

    const fetchDetails = async () => {
      try {
        const langObj = LANGUAGE_OPTIONS.find((l) => l.id === selectedLang) || LANGUAGE_OPTIONS[0];
        const data = isTv
          ? await api.getTvDetails(itemId, langObj.tmdbLang)
          : await api.getMovieDetails(itemId, langObj.tmdbLang);
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
  }, [itemId, isTv, selectedLang]);

  useEffect(() => {
    if (!isTv) return;
    let isMounted = true;
    setLoadingEpisodes(true);

    const fetchSeason = async () => {
      try {
        const langObj = LANGUAGE_OPTIONS.find((l) => l.id === selectedLang) || LANGUAGE_OPTIONS[0];
        const data = await api.getSeasonDetails(itemId, selectedSeason, langObj.tmdbLang);
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
  }, [itemId, selectedSeason, isTv, selectedLang]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleContainerScroll = (e) => {
    setShowScrollTop(e.currentTarget.scrollTop > 260);
  };

  const scrollToTop = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const formatMinsSec = (secs = 0) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  const title = details?.title || details?.name || item.title || item.name || 'Sin título';
  const overview = details?.overview || item.overview || 'Sin descripción disponible.';
  const releaseYear = (
    details?.release_date ||
    details?.first_air_date ||
    item.release_date ||
    item.first_air_date ||
    ''
  ).substring(0, 4);
  const rating = (details?.vote_average || item.vote_average || 8.0).toFixed(1);
  const matchScore = Math.min(99, Math.max(86, Math.round(Number(rating) * 10 + 8)));

  const backdropUrl =
    details?.backdrop_url ||
    item.backdrop_url ||
    (details?.backdrop_path || item.backdrop_path
      ? `https://image.tmdb.org/t/p/w1280${details?.backdrop_path || item.backdrop_path}`
      : 'https://images.unsplash.com/photo-1574375927938-d5a98e8ffe85?q=80&w=1920&auto=format&fit=crop');

  const genres = details?.genres?.map((g) => g.name).join(' • ') || 'Acción • Drama • Suspenso';
  const runtime = details?.runtime
    ? `${Math.floor(details.runtime / 60)}h ${details.runtime % 60}m`
    : null;
  const seasonsCount = details?.number_of_seasons || 1;
  const castList = details?.credits?.cast?.slice(0, 12) || [];
  const similarItems =
    details?.recommendations?.results?.slice(0, 9) ||
    details?.similar?.results?.slice(0, 9) ||
    [];
  const officialTrailer =
    details?.videos?.results?.find((v) => v.site === 'YouTube' && v.type === 'Trailer') ||
    details?.videos?.results?.find((v) => v.site === 'YouTube');

  const currentLangObj =
    LANGUAGE_OPTIONS.find((l) => l.id === selectedLang) || LANGUAGE_OPTIONS[0];

  const filteredEpisodes = useMemo(() => {
    if (!episodeFilter.trim()) return seasonEpisodes;
    const q = episodeFilter.toLowerCase().trim();
    return seasonEpisodes.filter(
      (ep) =>
        String(ep.episode_number).includes(q) ||
        (ep.name && ep.name.toLowerCase().includes(q)) ||
        (ep.overview && ep.overview.toLowerCase().includes(q))
    );
  }, [seasonEpisodes, episodeFilter]);

  return (
    <div
      ref={scrollContainerRef}
      onScroll={handleContainerScroll}
      onClick={onClose}
      className="fixed inset-0 z-50 overflow-y-auto bg-black/85 backdrop-blur-md flex items-start justify-center p-2 sm:p-4 md:py-8 animate-fadeIn"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-4xl bg-[#161616] rounded-2xl overflow-hidden shadow-[0_25px_70px_rgba(0,0,0,0.95)] border border-white/15 my-2 sm:my-4 animate-modalSlideUp"
      >
        {/* Barra Superior Sticky */}
        <div
          className={`sticky top-0 left-0 right-0 z-40 flex items-center justify-between px-4 sm:px-6 py-3 transition-all duration-300 ${
            showScrollTop
              ? 'bg-[#161616]/95 backdrop-blur-xl border-b border-white/10 shadow-lg'
              : 'bg-gradient-to-b from-black/80 to-transparent'
          }`}
        >
          <div className="flex items-center gap-2.5 truncate">
            <span className="w-6 h-6 rounded bg-[#E50914] text-white font-black text-xs flex items-center justify-center shrink-0">
              N
            </span>
            <span className="text-sm font-extrabold text-white truncate">{title}</span>
            <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/10 text-[11px] text-neutral-200 font-semibold">
              {currentLangObj.flag} {currentLangObj.shortLabel}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {showScrollTop && (
              <button
                onClick={scrollToTop}
                className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-neutral-800 hover:bg-neutral-700 text-xs font-bold text-neutral-200 border border-white/10 transition"
              >
                <ArrowUp className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Subir</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="w-9 h-9 rounded-full bg-[#181818]/90 hover:bg-[#E50914] text-white flex items-center justify-center transition-all hover:scale-110 border border-white/20 shadow-lg"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Banner Hero Superior */}
        <div className="relative h-64 sm:h-80 md:h-96 w-full overflow-hidden -mt-14">
          <img
            src={backdropUrl}
            alt={title}
            className="w-full h-full object-cover object-center filter brightness-90"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#161616] via-[#161616]/45 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#161616]/85 via-transparent to-transparent" />

          <div className="absolute bottom-5 left-6 right-6 space-y-3">
            <h2 className="text-2xl sm:text-4xl font-black text-white drop-shadow-2xl leading-tight">
              {title}
            </h2>

            <div className="flex flex-wrap items-center gap-2.5">
              {/* Botón Principal: Si tiene progreso guardado en Continuar Viendo, permite Reanudar en el segundo exacto */}
              <button
                onClick={() =>
                  onPlay(
                    { ...item, ...details },
                    isTv ? savedEntry?.season || selectedSeason : null,
                    isTv ? savedEntry?.episode || 1 : null,
                    savedEntry?.currentTime || 0,
                    selectedLang
                  )
                }
                className="flex items-center gap-2.5 px-7 py-3 bg-white hover:bg-neutral-200 text-black font-extrabold text-sm sm:text-base rounded-md shadow-xl transition-all hover:scale-105 active:scale-95"
              >
                <Play className="w-5 h-5 fill-current" />
                <span>
                  {savedEntry && savedEntry.currentTime > 10
                    ? isTv
                      ? `Reanudar T${savedEntry.season}:E${savedEntry.episode} (${formatMinsSec(
                          savedEntry.currentTime
                        )})`
                      : `Reanudar en ${formatMinsSec(savedEntry.currentTime)}`
                    : isTv
                    ? `Reproducir T${selectedSeason}:E1 (${currentLangObj.flag} ${currentLangObj.shortLabel})`
                    : `Reproducir (${currentLangObj.flag} ${currentLangObj.shortLabel})`}
                </span>
              </button>

              {/* Si hay progreso guardado, ofrecer también "Desde el inicio (00:00)" */}
              {savedEntry && savedEntry.currentTime > 10 && (
                <button
                  onClick={() =>
                    onPlay(
                      { ...item, ...details },
                      isTv ? selectedSeason : null,
                      isTv ? 1 : null,
                      0,
                      selectedLang
                    )
                  }
                  className="flex items-center gap-2 px-4 py-3 rounded-md bg-neutral-800/85 hover:bg-neutral-700 text-white font-bold text-xs sm:text-sm border border-white/20 backdrop-blur-md transition-all"
                  title="Empezar desde el segundo 00:00"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Desde el inicio</span>
                </button>
              )}

              {onToggleWatchlist && (
                <button
                  onClick={() => onToggleWatchlist({ ...item, ...details })}
                  className={`flex items-center gap-2 px-4 py-3 rounded-md font-bold text-xs sm:text-sm transition-all hover:scale-105 border backdrop-blur-md ${
                    inWatchlist
                      ? 'bg-amber-500/25 text-amber-300 border-amber-500/50'
                      : 'bg-black/60 text-white border-white/25 hover:bg-black/80'
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
                      <span>Mi Lista</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Selector de Idioma Dedicado */}
        <div className="px-6 sm:px-8 pt-2 pb-4 border-b border-white/10 bg-neutral-900/50">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-[#E50914]" />
              <span className="text-xs font-extrabold uppercase tracking-wider text-neutral-300">
                Selector de Idioma (Audio y Subtítulos):
              </span>
            </div>

            <div className="grid grid-cols-2 sm:flex items-center gap-2">
              {LANGUAGE_OPTIONS.map((opt) => {
                const isSelected = selectedLang === opt.id;
                return (
                  <button
                    key={opt.id}
                    onClick={() => handleLanguagePick(opt.id)}
                    className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                      isSelected
                        ? 'bg-[#E50914] text-white border-red-500 shadow-lg shadow-red-950/50'
                        : 'bg-neutral-800/80 hover:bg-neutral-700 text-neutral-300 border-white/10'
                    }`}
                  >
                    <span>{opt.flag}</span>
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Cuerpo de Información */}
        <div className="p-6 sm:p-8 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2 space-y-4">
              <div className="flex flex-wrap items-center gap-2.5 text-xs sm:text-sm">
                <span className="text-emerald-400 font-extrabold">{matchScore}% para ti</span>
                <span className="text-neutral-300 font-semibold">{releaseYear}</span>
                <span className="px-1.5 py-0.5 border border-neutral-500 rounded text-neutral-200 text-[10px] font-bold">
                  4K ULTRA HD
                </span>
                {runtime && (
                  <span className="flex items-center gap-1 text-neutral-300">
                    <Clock className="w-3.5 h-3.5" />
                    {runtime}
                  </span>
                )}
                {isTv && (
                  <span className="text-neutral-300 font-semibold">
                    {seasonsCount} {seasonsCount === 1 ? 'Temporada' : 'Temporadas'}
                  </span>
                )}
                <div className="flex items-center gap-1 text-amber-400 bg-black/40 px-2 py-0.5 rounded border border-white/10">
                  <Star className="w-3.5 h-3.5 fill-current" />
                  <span className="font-bold">{rating}</span>
                </div>
              </div>

              {details?.tagline && (
                <p className="text-xs sm:text-sm text-neutral-400 italic">
                  "{details.tagline}"
                </p>
              )}

              <p className="text-sm text-neutral-200 leading-relaxed font-normal">
                {overview}
              </p>
            </div>

            <div className="bg-neutral-900/70 p-4 rounded-xl border border-white/[0.07] text-xs space-y-3 h-fit">
              <div>
                <span className="text-neutral-500 block">Géneros:</span>
                <span className="text-neutral-200 font-semibold">{genres}</span>
              </div>
              {castList.length > 0 && (
                <div>
                  <span className="text-neutral-500 block">Elenco principal:</span>
                  <span className="text-neutral-200 font-medium">
                    {castList
                      .slice(0, 4)
                      .map((c) => c.name)
                      .join(', ')}
                  </span>
                </div>
              )}
              <div>
                <span className="text-neutral-500 block">Motores disponibles:</span>
                <span className="text-emerald-400 font-semibold">
                  6 Servidores Cloud (18 Espejos) + P2P
                </span>
              </div>
            </div>
          </div>

          {/* Pestañas del Modal */}
          <div className="border-b border-white/10 flex items-center gap-6 pt-2 overflow-x-auto no-scrollbar">
            {isTv && (
              <button
                onClick={() => setActiveModalTab('episodes')}
                className={`pb-3 text-sm font-extrabold flex items-center gap-2 border-b-[3px] transition whitespace-nowrap ${
                  activeModalTab === 'episodes'
                    ? 'border-[#E50914] text-white'
                    : 'border-transparent text-neutral-400 hover:text-white'
                }`}
              >
                <Tv className="w-4 h-4 text-[#E50914]" />
                <span>Episodios ({seasonEpisodes.length})</span>
              </button>
            )}

            <button
              onClick={() => setActiveModalTab('similar')}
              className={`pb-3 text-sm font-extrabold flex items-center gap-2 border-b-[3px] transition whitespace-nowrap ${
                activeModalTab === 'similar'
                  ? 'border-[#E50914] text-white'
                  : 'border-transparent text-neutral-400 hover:text-white'
              }`}
            >
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>Más títulos similares</span>
            </button>

            {castList.length > 0 && (
              <button
                onClick={() => setActiveModalTab('cast')}
                className={`pb-3 text-sm font-extrabold flex items-center gap-2 border-b-[3px] transition whitespace-nowrap ${
                  activeModalTab === 'cast'
                    ? 'border-[#E50914] text-white'
                    : 'border-transparent text-neutral-400 hover:text-white'
                }`}
              >
                <Users className="w-4 h-4 text-sky-400" />
                <span>Reparto ({castList.length})</span>
              </button>
            )}

            {officialTrailer && (
              <button
                onClick={() => setActiveModalTab('trailer')}
                className={`pb-3 text-sm font-extrabold flex items-center gap-2 border-b-[3px] transition whitespace-nowrap ${
                  activeModalTab === 'trailer'
                    ? 'border-[#E50914] text-white'
                    : 'border-transparent text-neutral-400 hover:text-white'
                }`}
              >
                <Film className="w-4 h-4 text-emerald-400" />
                <span>Tráiler Oficial</span>
              </button>
            )}
          </div>

          {activeModalTab === 'episodes' && isTv && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="relative flex-1 max-w-xs">
                  <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={episodeFilter}
                    onChange={(e) => setEpisodeFilter(e.target.value)}
                    placeholder="Filtrar episodio..."
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-[#E50914]"
                  />
                </div>

                {seasonsCount > 1 && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-neutral-400 font-semibold">Temporada:</span>
                    <select
                      value={selectedSeason}
                      onChange={(e) => setSelectedSeason(Number(e.target.value))}
                      className="bg-neutral-800 text-white border border-neutral-700 rounded-lg px-3.5 py-2 text-xs font-extrabold focus:outline-none focus:border-[#E50914] cursor-pointer"
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

              {loadingEpisodes ? (
                <div className="py-10 text-center text-neutral-400 text-sm">
                  Cargando episodios de la Temporada {selectedSeason}...
                </div>
              ) : filteredEpisodes.length === 0 ? (
                <div className="py-10 text-center text-neutral-400 text-sm">
                  No se encontraron episodios en esta temporada.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {filteredEpisodes.map((ep) => {
                    const epStill =
                      ep.still_url ||
                      (ep.still_path
                        ? `https://image.tmdb.org/t/p/w300${ep.still_path}`
                        : backdropUrl);

                    const isSavedEp =
                      savedEntry &&
                      Number(savedEntry.season) === Number(selectedSeason) &&
                      Number(savedEntry.episode) === Number(ep.episode_number);

                    return (
                      <div
                        key={ep.id}
                        onClick={() =>
                          onPlay(
                            { ...item, ...details },
                            selectedSeason,
                            ep.episode_number,
                            isSavedEp ? savedEntry.currentTime : 0,
                            selectedLang
                          )
                        }
                        className="group flex flex-col sm:flex-row items-start sm:items-center justify-between p-3.5 rounded-xl bg-neutral-900/75 hover:bg-neutral-800/90 border border-white/[0.06] hover:border-white/20 transition-all cursor-pointer gap-4"
                      >
                        <div className="flex items-center gap-4 w-full sm:w-auto">
                          <span className="text-lg font-black text-neutral-500 group-hover:text-white w-7 text-center shrink-0">
                            {ep.episode_number}
                          </span>

                          <div className="relative w-32 sm:w-36 aspect-video rounded-lg overflow-hidden shrink-0 bg-neutral-800 border border-white/10">
                            <img
                              src={epStill}
                              alt={ep.name}
                              loading="lazy"
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                            {isSavedEp && (
                              <div className="absolute bottom-0 left-0 right-0 h-1 bg-neutral-800">
                                <div
                                  className="h-full bg-[#E50914]"
                                  style={{ width: `${savedEntry.progressPercent || 20}%` }}
                                />
                              </div>
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            <h4 className="text-sm font-bold text-white group-hover:text-red-400 transition-colors truncate">
                              {ep.name || `Episodio ${ep.episode_number}`}
                            </h4>
                            <p className="text-xs text-neutral-400 line-clamp-2 mt-1">
                              {ep.overview || 'Episodio disponible en alta definición.'}
                            </p>
                          </div>
                        </div>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onPlay(
                              { ...item, ...details },
                              selectedSeason,
                              ep.episode_number,
                              isSavedEp ? savedEntry.currentTime : 0,
                              selectedLang
                            );
                          }}
                          className="px-3.5 py-2 bg-[#E50914]/20 group-hover:bg-[#E50914] text-red-400 group-hover:text-white rounded-lg text-xs font-extrabold flex items-center gap-1.5 transition whitespace-nowrap self-end sm:self-center shrink-0"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>
                            {isSavedEp
                              ? `Reanudar (${formatMinsSec(savedEntry.currentTime)})`
                              : `${currentLangObj.flag} Ver`}
                          </span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeModalTab === 'similar' && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {similarItems.map((sim) => {
                const simTitle = sim.title || sim.name || 'Título';
                const simImg =
                  sim.backdrop_url ||
                  (sim.backdrop_path
                    ? `https://image.tmdb.org/t/p/w500${sim.backdrop_path}`
                    : sim.poster_url);
                return (
                  <div
                    key={sim.id}
                    onClick={() => {
                      if (onSelectSimilar) onSelectSimilar(sim);
                    }}
                    className="group bg-neutral-900/80 rounded-xl overflow-hidden border border-white/[0.07] hover:border-white/25 transition cursor-pointer flex flex-col justify-between"
                  >
                    <div className="aspect-video w-full relative overflow-hidden bg-neutral-800">
                      {simImg && (
                        <img
                          src={simImg}
                          alt={simTitle}
                          loading="lazy"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                      )}
                    </div>
                    <div className="p-3">
                      <h4 className="text-xs font-bold text-white truncate">{simTitle}</h4>
                      <p className="text-[11px] text-neutral-400 line-clamp-2 mt-1">
                        {sim.overview || 'Explorar detalles de este título.'}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {activeModalTab === 'cast' && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {castList.map((actor) => (
                <div
                  key={actor.id}
                  className="flex items-center gap-3 p-2.5 rounded-xl bg-neutral-900/70 border border-white/[0.06]"
                >
                  <img
                    src={
                      actor.profile_path
                        ? `https://image.tmdb.org/t/p/w185${actor.profile_path}`
                        : `https://ui-avatars.com/api/?name=${encodeURIComponent(
                            actor.name
                          )}&background=282828&color=fff`
                    }
                    alt={actor.name}
                    loading="lazy"
                    className="w-11 h-11 rounded-full object-cover shrink-0 border border-white/10"
                  />
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-white truncate">{actor.name}</p>
                    <p className="text-[11px] text-neutral-400 truncate">
                      {actor.character || 'Reparto'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeModalTab === 'trailer' && officialTrailer && (
            <div className="aspect-video w-full rounded-xl overflow-hidden border border-white/10 bg-black">
              <iframe
                src={`https://www.youtube.com/embed/${officialTrailer.key}?autoplay=1&rel=0`}
                title={officialTrailer.name || 'Tráiler Oficial'}
                className="w-full h-full border-0"
                allow="autoplay; encrypted-media; fullscreen"
                allowFullScreen
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
