import React, { useState, useEffect, useRef, useMemo } from 'react';
import api from '../services/api.js';
import CustomSelect from './CustomSelect.jsx';
import {
  X,
  Play,
  Star,
  Check,
  Plus,
  ThumbsUp,
  ThumbsDown,
  Volume2,
  VolumeX,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Layers,
} from 'lucide-react';
import { LANGUAGE_OPTIONS } from '../hooks/useUserMedia.js';
import { getContentRating } from '../utils/contentRating.js';

function formatRuntime(mins) {
  if (!mins || !Number.isFinite(mins)) return '';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

function getAgeDescription(ageRating) {
  if (!ageRating) return '';
  const num = parseInt(ageRating, 10);
  if (!Number.isFinite(num)) return '';
  return `Apta para mayores de ${num} años`;
}

export default function DetailModal({
  item,
  onClose,
  onPlay,
  onToggleWatchlist = null,
  isSavedInWatchlist = null,
  getSavedEntry = null,
  preferredLanguage = 'latino',
  onChangeLanguage = null,
  onSelectRelated = null,
}) {
  const [details, setDetails] = useState(null);
  const [collection, setCollection] = useState(null);
  const [selectedSeason, setSelectedSeason] = useState(1);
  const [episodes, setEpisodes] = useState([]);
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);
  const [trailerKey, setTrailerKey] = useState(null);
  const [isTrailerMuted, setIsTrailerMuted] = useState(true);
  const [showAllSimilar, setShowAllSimilar] = useState(false);
  const [userReaction, setUserReaction] = useState(null); // 'dislike' | 'like' | 'love' | null
  const [rateMenuOpen, setRateMenuOpen] = useState(false);
  const [rateAnim, setRateAnim] = useState(null);
  const rateCloseTimerRef = useRef(null);

  const trailerFrameRef = useRef(null);
  const modalBodyRef = useRef(null);
  const aboutSectionRef = useRef(null);

  const isTv =
    item?.type === 'tv' ||
    item?.media_type === 'tv' ||
    Boolean(item?.first_air_date) ||
    Boolean(item?.name && !item?.title);

  const mediaType = isTv ? 'tv' : 'movie';
  const currentLangObj =
    LANGUAGE_OPTIONS.find((l) => l.id === preferredLanguage) || LANGUAGE_OPTIONS[0];

  const ratingStorageKey = item?.id ? `sf_reaction:${mediaType}:${item.id}` : null;

  useEffect(() => {
    if (!ratingStorageKey) return;
    try {
      setUserReaction(localStorage.getItem(ratingStorageKey) || null);
    } catch {
      setUserReaction(null);
    }
  }, [ratingStorageKey]);

  const handleSetReaction = (reaction) => {
    const next = userReaction === reaction ? null : reaction;
    setUserReaction(next);
    if (rateCloseTimerRef.current) clearTimeout(rateCloseTimerRef.current);
    if (next) {
      setRateAnim(next);
      const duration = next === 'love' ? 720 : next === 'dislike' ? 580 : 540;
      rateCloseTimerRef.current = setTimeout(() => {
        setRateMenuOpen(false);
      }, duration);
      setTimeout(() => setRateAnim((cur) => (cur === next ? null : cur)), 950);
    } else {
      setRateMenuOpen(false);
    }
    if (ratingStorageKey) {
      try {
        if (next) localStorage.setItem(ratingStorageKey, next);
        else localStorage.removeItem(ratingStorageKey);
      } catch {}
    }
    try {
      const taste = JSON.parse(localStorage.getItem('sf_taste_profile') || '{}');
      taste[`${mediaType}:${item.id}`] = { reaction: next, genres: (details?.genres || []).map((g) => g.id) };
      localStorage.setItem('sf_taste_profile', JSON.stringify(taste));
    } catch {}
  };

  // Cargar detalles, colección y tráiler automático en silencio
  useEffect(() => {
    if (!item?.id) return;
    let isMounted = true;
    setDetails(null);
    setCollection(null);
    setTrailerKey(null);
    setIsTrailerMuted(true);
    setShowAllSimilar(false);
    setSelectedSeason(item?.season || 1);

    if (modalBodyRef.current) modalBodyRef.current.scrollTop = 0;

    const loadAll = async () => {
      try {
        const [det, tr] = await Promise.all([
          isTv
            ? api.getTvDetails(item.id, currentLangObj.tmdbLang)
            : api.getMovieDetails(item.id, currentLangObj.tmdbLang),
          api.getTrailers(mediaType, item.id, currentLangObj.tmdbLang),
        ]);
        if (!isMounted) return;
        setDetails(det);
        if (tr?.key) setTrailerKey(tr.key);

        if (!isTv && det?.belongs_to_collection?.id) {
          const col = await api.getCollection(det.belongs_to_collection.id, currentLangObj.tmdbLang);
          if (isMounted && col?.parts?.length > 1) {
            setCollection(col);
          }
        }
      } catch {
        // Ignorar errores silenciosamente
      }
    };

    loadAll();
    return () => {
      isMounted = false;
    };
  }, [item?.id, isTv, mediaType, currentLangObj.tmdbLang]);

  // Cargar episodios de la temporada seleccionada
  useEffect(() => {
    if (!isTv || !item?.id) return;
    let isMounted = true;
    setLoadingEpisodes(true);
    api
      .getSeasonDetails(item.id, selectedSeason, currentLangObj.tmdbLang)
      .then((data) => {
        if (isMounted) setEpisodes(data?.episodes || []);
      })
      .catch(() => {
        if (isMounted) setEpisodes([]);
      })
      .finally(() => {
        if (isMounted) setLoadingEpisodes(false);
      });
    return () => {
      isMounted = false;
    };
  }, [isTv, item?.id, selectedSeason, currentLangObj.tmdbLang]);

  // Escape para cerrar
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const toggleTrailerMute = () => {
    const nextMuted = !isTrailerMuted;
    setIsTrailerMuted(nextMuted);
    const frame = trailerFrameRef.current;
    if (frame?.contentWindow) {
      try {
        frame.contentWindow.postMessage(
          JSON.stringify({ event: 'command', func: nextMuted ? 'mute' : 'unMute', args: [] }),
          '*'
        );
      } catch {}
    }
  };

  const similarItems = useMemo(() => {
    const raw = details?.recommendations?.results || details?.similar?.results || [];
    return raw.filter((r) => r && r.id !== item?.id && (r.backdrop_path || r.poster_path));
  }, [details, item?.id]);

  if (!item) return null;

  const title = details?.title || details?.name || item.title || item.name || 'Sin título';
  const overview =
    details?.overview || item.overview || 'Sin descripción disponible en este idioma.';
  const backdropUrl =
    details?.backdrop_url ||
    (details?.backdrop_path ? `https://image.tmdb.org/t/p/w1280${details.backdrop_path}` : null) ||
    item.backdrop_url ||
    (item.backdrop_path ? `https://image.tmdb.org/t/p/w1280${item.backdrop_path}` : null) ||
    item.poster_url ||
    (item.poster_path ? `https://image.tmdb.org/t/p/w780${item.poster_path}` : null);

  const releaseYear = (
    details?.release_date ||
    details?.first_air_date ||
    item.release_date ||
    item.first_air_date ||
    ''
  ).substring(0, 4);

  const rating = (details?.vote_average || item.vote_average || 8.0).toFixed(1);
  const ageRating = getContentRating(details || item, mediaType);
  const runtime = !isTv ? formatRuntime(details?.runtime) : '';
  const seasonsCount = details?.number_of_seasons || item.number_of_seasons || 1;
  const episodesCount = details?.number_of_episodes || null;

  const cast = details?.credits?.cast?.slice(0, 10) || [];
  const genres = details?.genres || [];



  const visibleSimilar = showAllSimilar ? similarItems : similarItems.slice(0, 9);

  const savedEntry = getSavedEntry ? getSavedEntry(item.id) : null;
  const inWatchlist = isSavedInWatchlist ? isSavedInWatchlist(item.id) : false;

  const formatMinsSec = (secs = 0) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  const seasonOptions = Array.from({ length: seasonsCount }, (_, i) => ({
    id: i + 1,
    label: `Temporada ${i + 1}`,
  }));

  const currentSeasonMeta = details?.seasons?.find((s) => s.season_number === selectedSeason);

  const openRelated = (rel) => {
    if (onSelectRelated) {
      onSelectRelated(rel);
    } else {
      onPlay?.(rel, rel.first_air_date ? 1 : null, rel.first_air_date ? 1 : null, 0, preferredLanguage);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-start justify-center overflow-y-auto p-2 sm:p-6 animate-fadeIn"
      onClick={onClose}
    >
      <div
        ref={modalBodyRef}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-[920px] my-4 sm:my-8 bg-[#181818] rounded-xl overflow-hidden shadow-[0_30px_90px_rgba(0,0,0,0.95)] border border-white/10 text-white animate-modalSlideUp"
      >
        {/* 1. HERO CON TRÁILER AUTOMÁTICO EN SILENCIO */}
        <div className="relative w-full aspect-video max-h-[520px] bg-black overflow-hidden">
          {backdropUrl && (
            <img
              src={backdropUrl}
              alt={title}
              className="w-full h-full object-cover"
            />
          )}

          {trailerKey && (
            <iframe
              ref={trailerFrameRef}
              key={`modal-trailer-${trailerKey}`}
              src={`https://www.youtube-nocookie.com/embed/${trailerKey}?autoplay=1&mute=1&controls=0&disablekb=1&fs=0&loop=1&playlist=${trailerKey}&modestbranding=1&rel=0&playsinline=1&iv_load_policy=3&cc_load_policy=0&enablejsapi=1`}
              title={`Tráiler de ${title}`}
              tabIndex={-1}
              aria-hidden="true"
              className="absolute inset-0 w-full h-full scale-[1.28] pointer-events-none select-none border-0"
              allow="autoplay; encrypted-media"
            />
          )}

          <div className="absolute inset-0 z-10 bg-gradient-to-t from-[#181818] via-[#181818]/25 to-black/35" />

          {/* Botón Cerrar */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar vista previa"
            className="absolute top-4 right-4 z-20 w-9 h-9 rounded-full bg-[#181818]/90 hover:bg-[#2a2a2a] text-white flex items-center justify-center border border-white/15 transition"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Título + Botones de Acción (Reproducir / + o ✓ / Calificación / Mute) */}
          <div className="absolute bottom-6 left-6 right-6 z-20 flex items-end justify-between gap-4">
            <div className="space-y-4 max-w-xl">
              <h1 className="text-2xl sm:text-4xl font-black text-white tracking-tight drop-shadow-[0_4px_16px_rgba(0,0,0,0.9)] leading-tight">
                {title}
              </h1>

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() =>
                    onPlay(
                      item,
                      savedEntry?.season || (isTv ? selectedSeason : null),
                      savedEntry?.episode || (isTv ? 1 : null),
                      savedEntry?.currentTime || 0,
                      preferredLanguage
                    )
                  }
                  className="flex items-center gap-2 px-6 py-2.5 bg-white hover:bg-neutral-200 text-black font-bold text-sm sm:text-base rounded-[4px] shadow-lg transition active:scale-95"
                >
                  <Play className="w-5 h-5 fill-current" />
                  <span>
                    {savedEntry && savedEntry.currentTime > 10
                      ? isTv
                        ? `Reanudar T${savedEntry.season}:E${savedEntry.episode} (${formatMinsSec(savedEntry.currentTime)})`
                        : `Reanudar (${formatMinsSec(savedEntry.currentTime)})`
                      : 'Reproducir'}
                  </span>
                </button>

                {savedEntry && savedEntry.currentTime > 10 && (
                  <button
                    type="button"
                    onClick={() =>
                      onPlay(
                        item,
                        isTv ? selectedSeason : null,
                        isTv ? 1 : null,
                        0,
                        preferredLanguage
                      )
                    }
                    className="flex items-center gap-1.5 px-3.5 py-2.5 bg-neutral-800/90 hover:bg-neutral-700 text-white font-semibold text-xs sm:text-sm rounded-[4px] border border-white/20 transition"
                    title="Reproducir desde el inicio"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span className="hidden sm:inline">Desde el inicio</span>
                  </button>
                )}

                {onToggleWatchlist && (
                  <button
                    type="button"
                    onClick={() => onToggleWatchlist(item)}
                    title={inWatchlist ? 'Quitar de Mi lista' : 'Agregar a Mi lista'}
                    className="w-10 h-10 rounded-full border-2 border-white/50 hover:border-white bg-[#2a2a2a]/70 text-white flex items-center justify-center transition"
                  >
                    {inWatchlist ? <Check className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
                  </button>
                )}

                {/* Botón de Calificación estilo Netflix con microanimaciones frame por frame */}
                <div
                  className="relative"
                  onMouseEnter={() => setRateMenuOpen(true)}
                  onMouseLeave={() => {
                    if (rateCloseTimerRef.current) clearTimeout(rateCloseTimerRef.current);
                    setRateMenuOpen(false);
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setRateMenuOpen((v) => !v)}
                    title="Calificar título"
                    className={`relative w-10 h-10 rounded-full border-2 flex items-center justify-center transition ${
                      userReaction
                        ? 'border-white bg-white/15 text-white'
                        : 'border-white/50 hover:border-white bg-[#2a2a2a]/70 text-white'
                    }`}
                  >
                    {(rateAnim === 'like' || rateAnim === 'love') && (
                      <span className="absolute inset-0 rounded-full border-2 border-white/80 pointer-events-none animate-rate-ring" />
                    )}

                    {rateAnim === 'love' && (
                      <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        {[-65, -35, -10, 15, 40, 68].map((ang) => (
                          <span
                            key={ang}
                            className="absolute w-[2.5px] h-3 rounded-full bg-white animate-rate-spark-line"
                            style={{ '--ang': `${ang}deg` }}
                          />
                        ))}
                      </span>
                    )}

                    <span className="inline-flex items-center justify-center">
                      {userReaction === 'dislike' ? (
                        <ThumbsDown className={`w-4 h-4 fill-current ${rateAnim === 'dislike' ? 'animate-rate-dislike' : ''}`} />
                      ) : userReaction === 'love' ? (
                        <span className="relative inline-flex items-center justify-center w-5 h-5">
                          <ThumbsUp className={`w-3.5 h-3.5 fill-current -translate-x-1 translate-y-0.5 ${rateAnim === 'love' ? 'animate-rate-love-front' : ''}`} />
                          <ThumbsUp className={`w-3.5 h-3.5 fill-current translate-x-1 -translate-y-0.5 absolute ${rateAnim === 'love' ? 'animate-rate-love-back' : ''}`} />
                        </span>
                      ) : (
                        <ThumbsUp className={`w-4 h-4 ${userReaction === 'like' ? 'fill-current' : ''} ${rateAnim === 'like' ? 'animate-rate-like' : ''}`} />
                      )}
                    </span>
                  </button>

                  {rateMenuOpen && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="absolute left-1/2 top-1/2 z-30 flex items-center gap-1.5 bg-[#232323]/95 backdrop-blur-md border border-white/15 rounded-full px-2.5 py-1.5 shadow-[0_12px_35px_rgba(0,0,0,0.85)] animate-capsule-expand origin-center"
                    >
                      <button
                        type="button"
                        onClick={() => handleSetReaction('dislike')}
                        title="No es para mí"
                        style={{ animationDelay: '0.02s' }}
                        className={`w-9 h-9 rounded-full flex items-center justify-center transition hover:bg-white/15 animate-capsule-icon ${
                          userReaction === 'dislike' ? 'text-white' : 'text-neutral-200'
                        }`}
                      >
                        <ThumbsDown
                          className={`w-4 h-4 ${
                            userReaction === 'dislike' ? 'fill-current' : ''
                          } ${rateAnim === 'dislike' ? 'animate-rate-dislike' : ''}`}
                        />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSetReaction('like')}
                        title="Me gusta"
                        style={{ animationDelay: '0.05s' }}
                        className={`relative w-9 h-9 rounded-full flex items-center justify-center transition hover:bg-white/15 animate-capsule-icon ${
                          userReaction === 'like' ? 'text-white' : 'text-neutral-200'
                        }`}
                      >
                        {rateAnim === 'like' && (
                          <span className="absolute inset-0 rounded-full border border-white/80 pointer-events-none animate-rate-ring" />
                        )}
                        <ThumbsUp
                          className={`w-4 h-4 ${
                            userReaction === 'like' ? 'fill-current' : ''
                          } ${rateAnim === 'like' ? 'animate-rate-like' : ''}`}
                        />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSetReaction('love')}
                        title="¡Me encanta!"
                        style={{ animationDelay: '0.08s' }}
                        className={`relative w-9 h-9 rounded-full flex items-center justify-center transition hover:bg-white/15 animate-capsule-icon ${
                          userReaction === 'love' ? 'text-white' : 'text-neutral-200'
                        }`}
                      >
                        {rateAnim === 'love' && (
                          <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            {[-65, -35, -10, 15, 40, 68].map((ang) => (
                              <span
                                key={ang}
                                className="absolute w-[2.5px] h-3 rounded-full bg-white animate-rate-spark-line"
                                style={{ '--ang': `${ang}deg` }}
                              />
                            ))}
                          </span>
                        )}
                        <span className="relative inline-flex items-center justify-center w-5 h-5">
                          <ThumbsUp
                            className={`w-3.5 h-3.5 -translate-x-1 translate-y-0.5 ${
                              userReaction === 'love' ? 'fill-current' : ''
                            } ${rateAnim === 'love' ? 'animate-rate-love-front' : ''}`}
                          />
                          <ThumbsUp
                            className={`w-3.5 h-3.5 translate-x-1 -translate-y-0.5 absolute ${
                              userReaction === 'love' ? 'fill-current' : ''
                            } ${rateAnim === 'love' ? 'animate-rate-love-back' : ''}`}
                          />
                        </span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Botón Mute / Unmute en el extremo derecho */}
            {trailerKey && (
              <button
                type="button"
                onClick={toggleTrailerMute}
                aria-label={isTrailerMuted ? 'Activar sonido del tráiler' : 'Silenciar tráiler'}
                title={isTrailerMuted ? 'Activar sonido' : 'Silenciar'}
                className="w-10 h-10 rounded-full border border-white/40 hover:border-white bg-[#181818]/75 text-white flex items-center justify-center transition shrink-0"
              >
                {isTrailerMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
            )}
          </div>
        </div>

        {/* CUERPO DEL MODAL */}
        <div className="px-6 sm:px-10 py-6 space-y-8">
          {/* 2. INFORMACIÓN PRINCIPAL EN 2 COLUMNAS */}
          <div className="grid grid-cols-1 md:grid-cols-[1.65fr_1fr] gap-6 items-start">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm text-neutral-300">
                {releaseYear && <span className="font-semibold text-white">{releaseYear}</span>}
                {isTv ? (
                  <span className="font-medium">
                    {episodesCount
                      ? `${episodesCount} episodios`
                      : `${seasonsCount} ${seasonsCount === 1 ? 'temporada' : 'temporadas'}`}
                  </span>
                ) : (
                  runtime && <span className="font-medium">{runtime}</span>
                )}
                <span className="px-1.5 py-0.2 border border-white/35 rounded-[3px] text-[10px] font-bold text-neutral-200">
                  HD
                </span>
                <span className="inline-flex items-center gap-1 text-amber-400 font-bold">
                  <Star className="w-3.5 h-3.5 fill-current" />
                  {rating}
                </span>
                {ageRating && (
                  <span
                    className="px-1.5 py-0.2 border border-white/40 rounded-[3px] text-[11px] font-bold text-neutral-100"
                    title="Clasificación por edad"
                  >
                    {ageRating}
                  </span>
                )}
              </div>

              <p className="text-sm text-neutral-200 leading-relaxed">{overview}</p>
            </div>

            <div className="space-y-2.5 text-xs sm:text-[13px] leading-relaxed">
              {cast.length > 0 && (
                <p className="text-neutral-400">
                  Elenco:{' '}
                  <span className="text-neutral-100">
                    {cast.slice(0, 3).map((c) => c.name).join(', ')}
                  </span>
                  {cast.length > 3 && (
                    <button
                      type="button"
                      onClick={() => aboutSectionRef.current?.scrollIntoView({ behavior: 'smooth' })}
                      className="italic text-neutral-300 hover:underline ml-1"
                    >
                      , más
                    </button>
                  )}
                </p>
              )}

              {genres.length > 0 && (
                <p className="text-neutral-400">
                  Géneros:{' '}
                  <span className="text-neutral-100">
                    {genres.map((g) => g.name).join(', ')}
                  </span>
                </p>
              )}

              {onChangeLanguage && (
                <div className="pt-1 flex items-center gap-2">
                  <span className="text-neutral-400 shrink-0">Audio:</span>
                  <div className="w-44">
                    <CustomSelect
                      value={preferredLanguage}
                      onChange={onChangeLanguage}
                      options={LANGUAGE_OPTIONS.map((l) => ({
                        id: l.id,
                        label: `${l.flag} ${l.shortLabel}`,
                      }))}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 3. EPISODIOS (SOLO PARA SERIES / ANIME) */}
          {isTv && (
            <div className="space-y-4 pt-2 border-t border-white/10">
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-lg sm:text-xl font-bold text-white">Episodios</h2>
                {seasonsCount > 1 && (
                  <div className="w-44">
                    <CustomSelect
                      value={selectedSeason}
                      onChange={(val) => setSelectedSeason(Number(val))}
                      options={seasonOptions}
                    />
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-300">
                <span className="font-bold text-white">Temporada {selectedSeason}:</span>
                {ageRating && (
                  <span className="px-1.5 py-0.2 border border-white/40 rounded-[3px] text-[10px] font-bold text-neutral-100">
                    {ageRating}
                  </span>
                )}
                {currentSeasonMeta?.overview && (
                  <span className="text-neutral-400 line-clamp-1">{currentSeasonMeta.overview}</span>
                )}
              </div>

              {loadingEpisodes ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((n) => (
                    <div key={n} className="h-24 rounded bg-white/5 animate-pulse" />
                  ))}
                </div>
              ) : (
                <div className="divide-y divide-white/10">
                  {episodes.map((ep, idx) => {
                    const stillImg = ep.still_path
                      ? `https://image.tmdb.org/t/p/w300${ep.still_path}`
                      : backdropUrl;
                    return (
                      <button
                        key={ep.id || ep.episode_number}
                        type="button"
                        onClick={() =>
                          onPlay(
                            item,
                            selectedSeason,
                            ep.episode_number,
                            0,
                            preferredLanguage
                          )
                        }
                        className={`episode-row w-full text-left flex items-center gap-4 sm:gap-5 px-4 sm:px-7 py-5 sm:py-6 rounded transition group ${
                          idx === 0 ? 'bg-[#333333]/80 hover:bg-[#3a3a3a]' : 'hover:bg-white/[0.06]'
                        }`}
                      >
                        <span className="text-xl sm:text-2xl font-normal text-neutral-300 w-7 text-center shrink-0">
                          {ep.episode_number}
                        </span>
                        <div className="relative w-32 sm:w-40 aspect-video rounded overflow-hidden bg-neutral-900 shrink-0">
                          {stillImg && (
                            <img
                              src={stillImg}
                              alt={ep.name}
                              loading="lazy"
                              className="w-full h-full object-cover"
                            />
                          )}
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                            <div className="w-9 h-9 rounded-full border border-white bg-black/60 flex items-center justify-center">
                              <Play className="w-4 h-4 fill-white text-white ml-0.5" />
                            </div>
                          </div>
                        </div>
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center justify-between gap-3">
                            <h3 className="text-sm sm:text-[15px] font-bold text-white truncate">
                              {ep.name || `Episodio ${ep.episode_number}`}
                            </h3>
                            {ep.runtime && (
                              <span className="text-sm sm:text-[15px] text-white shrink-0 font-medium">
                                {ep.runtime} min
                              </span>
                            )}
                          </div>
                          <p className="text-xs sm:text-[13px] text-neutral-300 line-clamp-3 leading-relaxed">
                            {ep.overview || 'Sin sinopsis disponible.'}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* 4. COLECCIÓN (SOLO SI APLICA) */}
          {collection?.parts?.length > 1 && (
            <div className="space-y-4 pt-2 border-t border-white/10">
              <h2 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
                <Layers className="w-5 h-5 text-neutral-300" />
                <span>{collection.name}</span>
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {collection.parts.map((part) => {
                  const partImg = part.backdrop_path
                    ? `https://image.tmdb.org/t/p/w500${part.backdrop_path}`
                    : part.poster_path
                    ? `https://image.tmdb.org/t/p/w500${part.poster_path}`
                    : null;
                  const partYear = (part.release_date || '').substring(0, 4);
                  const partInList = isSavedInWatchlist ? isSavedInWatchlist(part.id) : false;
                  return (
                    <div
                      key={part.id}
                      onClick={() => openRelated(part)}
                      className={`group rounded-md overflow-hidden bg-[#2f2f2f] cursor-pointer transition hover:ring-1 hover:ring-white/40 ${
                        part.id === item.id ? 'ring-1 ring-[#E50914]' : ''
                      }`}
                    >
                      <div className="relative aspect-video bg-neutral-900 overflow-hidden">
                        {partImg && (
                          <img
                            src={partImg}
                            alt={part.title}
                            loading="lazy"
                            className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                          />
                        )}
                        <div className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                          <div className="w-10 h-10 rounded-full border border-white bg-black/60 flex items-center justify-center">
                            <Play className="w-4 h-4 fill-white text-white ml-0.5" />
                          </div>
                        </div>
                        {partYear && (
                          <span className="absolute top-2 right-2 text-[11px] font-semibold text-white drop-shadow">
                            {partYear}
                          </span>
                        )}
                      </div>
                      <div className="p-3.5 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 text-[11px] text-neutral-300">
                            <span className="px-1 border border-white/35 rounded-[2px] text-[9px] font-bold">
                              HD
                            </span>
                            <span className="font-semibold text-white truncate">{part.title}</span>
                          </div>
                          {onToggleWatchlist && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onToggleWatchlist(part);
                              }}
                              className="w-7 h-7 rounded-full border border-white/50 hover:border-white flex items-center justify-center text-white shrink-0"
                              title={partInList ? 'Quitar de Mi lista' : 'Agregar a Mi lista'}
                            >
                              {partInList ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                            </button>
                          )}
                        </div>
                        <p className="text-xs text-neutral-400 line-clamp-3 leading-relaxed">
                          {part.overview || 'Sin descripción disponible.'}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 5. MÁS TÍTULOS SIMILARES A ESTE (9 POR DEFECTO + FLECHA PARA DESPLEGAR MÁS) */}
          {similarItems.length > 0 && (
            <div className="space-y-4 pt-2 border-t border-white/10">
              <h2 className="text-lg sm:text-xl font-bold text-white">
                Más títulos similares a este
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {visibleSimilar.map((sim) => {
                  const simImg = sim.backdrop_path
                    ? `https://image.tmdb.org/t/p/w500${sim.backdrop_path}`
                    : sim.poster_path
                    ? `https://image.tmdb.org/t/p/w500${sim.poster_path}`
                    : null;
                  const simTitle = sim.title || sim.name || 'Sin título';
                  const simYear = (sim.release_date || sim.first_air_date || '').substring(0, 4);
                  const simRating = sim.vote_average ? Number(sim.vote_average).toFixed(1) : '8.0';
                  const simInList = isSavedInWatchlist ? isSavedInWatchlist(sim.id) : false;

                  return (
                    <div
                      key={sim.id}
                      onClick={() => openRelated(sim)}
                      className="group rounded-md overflow-hidden bg-[#2f2f2f] cursor-pointer transition hover:ring-1 hover:ring-white/30"
                    >
                      <div className="relative aspect-video bg-neutral-900 overflow-hidden">
                        {simImg && (
                          <img
                            src={simImg}
                            alt={simTitle}
                            loading="lazy"
                            className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                          />
                        )}
                        <div className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                          <div className="w-10 h-10 rounded-full border border-white bg-black/60 flex items-center justify-center">
                            <Play className="w-4 h-4 fill-white text-white ml-0.5" />
                          </div>
                        </div>
                        {simYear && (
                          <span className="absolute top-2 right-2 text-[11px] font-semibold text-white drop-shadow">
                            {simYear}
                          </span>
                        )}
                      </div>

                      <div className="p-3.5 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 text-xs text-neutral-300 min-w-0">
                            <span className="px-1 border border-white/35 rounded-[2px] text-[9px] font-bold shrink-0">
                              HD
                            </span>
                            <span className="text-amber-400 font-bold shrink-0">★ {simRating}</span>
                            <span className="text-white font-semibold truncate">{simTitle}</span>
                          </div>
                          {onToggleWatchlist && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onToggleWatchlist(sim);
                              }}
                              className="w-8 h-8 rounded-full border border-white/50 hover:border-white flex items-center justify-center text-white shrink-0"
                              title={simInList ? 'Quitar de Mi lista' : 'Agregar a Mi lista'}
                            >
                              {simInList ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                            </button>
                          )}
                        </div>
                        <p className="text-xs text-neutral-400 line-clamp-3 leading-relaxed">
                          {sim.overview || 'Sin descripción disponible.'}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {similarItems.length > 9 && (
                <div className="relative flex items-center justify-center pt-2">
                  <div className="w-full h-px bg-white/15" />
                  <button
                    type="button"
                    onClick={() => setShowAllSimilar((v) => !v)}
                    aria-label={showAllSimilar ? 'Mostrar menos títulos' : 'Mostrar más títulos'}
                    className="absolute w-10 h-10 rounded-full border border-white/50 hover:border-white bg-[#181818] text-white flex items-center justify-center shadow-lg transition"
                  >
                    {showAllSimilar ? (
                      <ChevronUp className="w-5 h-5" />
                    ) : (
                      <ChevronDown className="w-5 h-5" />
                    )}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* 6. ACERCA DE */}
          <div ref={aboutSectionRef} className="space-y-2.5 pt-4 border-t border-white/10 text-xs sm:text-[13px]">
            <h2 className="text-lg sm:text-xl font-bold text-white pb-1">
              Acerca de <span className="font-black">{title}</span>
            </h2>

            {cast.length > 0 && (
              <p className="text-neutral-400">
                Elenco:{' '}
                <span className="text-neutral-100">
                  {cast.map((c) => c.name).join(', ')}
                </span>
              </p>
            )}

            {genres.length > 0 && (
              <p className="text-neutral-400">
                Géneros:{' '}
                <span className="text-neutral-100">
                  {genres.map((g) => g.name).join(', ')}
                </span>
              </p>
            )}

            {ageRating && (
              <div className="flex flex-wrap items-center gap-2 text-neutral-400 pt-0.5">
                <span>Clasificación por edad:</span>
                <span className="px-1.5 py-0.2 border border-white/40 rounded-[3px] text-[11px] font-bold text-neutral-100">
                  {ageRating}
                </span>
                <span className="text-neutral-200">{getAgeDescription(ageRating)}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
