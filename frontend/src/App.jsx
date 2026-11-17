import React, { useState, useEffect, useCallback, useMemo } from 'react';
import api from './services/api.js';
import Navbar from './components/Navbar.jsx';
import HeroBanner from './components/HeroBanner.jsx';
import PlatformHubs from './components/PlatformHubs.jsx';
import MediaGrid from './components/MediaGrid.jsx';
import DetailModal from './components/DetailModal.jsx';
import BrandLogo from './components/BrandLogo.jsx';
import CustomSelect from './components/CustomSelect.jsx';
import ProfilePage from './components/ProfilePage.jsx';
import PlayerErrorBoundary from './components/PlayerErrorBoundary.jsx';
import DiscoveryRows, { buildGenreRows } from './components/DiscoveryRows.jsx';
import useUserMedia, { computePersonalizedPool } from './hooks/useUserMedia.js';
import { MOVIE_GENRES, SERIES_GENRES, ANIME_GENRES, SORT_OPTIONS, TV_NETWORKS } from './utils/catalogOptions.js';

const SmartPlayer = React.lazy(() => import('./components/SmartPlayer.jsx'));
const LiveTV = React.lazy(() => import('./components/LiveTV.jsx'));
const DownloadsPage = React.lazy(() => import('./components/DownloadsPage.jsx'));
import {
  Film,
  Tv,
  RefreshCw,
  Flame,
  AlertCircle,
  Bookmark,
  Layers,
} from 'lucide-react';

/** Completa las filas solo con títulos que coincidan con la etiqueta de género. */
function ensureRowItems(sectionItems = [], fallbackPool = [], genreIds = [], sliceStart = 0) {
  const existing = Array.isArray(sectionItems) ? sectionItems : [];
  const seen = new Set(existing.map((i) => i?.id));
  const out = [...existing];
  const candidates = genreIds.length
    ? fallbackPool.filter((item) => Array.isArray(item.genre_ids) && item.genre_ids.some((gid) => genreIds.includes(Number(gid))))
    : fallbackPool.slice(sliceStart);
  for (const item of candidates) {
    if (out.length >= 30) break;
    if (item?.id && !seen.has(item.id)) {
      seen.add(item.id);
      out.push(item);
    }
  }

  return out;
}

export default function App() {
  const [activeTab, setActiveTab] = useState('home');
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const updateConnection = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', updateConnection);
    window.addEventListener('offline', updateConnection);
    return () => { window.removeEventListener('online', updateConnection); window.removeEventListener('offline', updateConnection); };
  }, []);
  const [profile, setProfile] = useState(() => {
    try { return { name: 'Mi Perfil', avatar: '🎬', photo: '', movieGenres: [], seriesGenres: [], autoplayTrailers: true, ...JSON.parse(localStorage.getItem('streamflix_profile_v1') || '{}') }; }
    catch { return { name: 'Mi Perfil', avatar: '🎬', photo: '', movieGenres: [], seriesGenres: [], autoplayTrailers: true }; }
  });
  const saveProfile = (next) => { localStorage.setItem('streamflix_profile_v1', JSON.stringify(next)); setProfile(next); };
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

  const {
    continueWatching,
    watchlist,
    tasteHistory,
    preferredLanguage,
    setPreferredLanguage,
    audioEnginePreset,
    setAudioEnginePreset,
    currentLanguageObj,
    recordTasteInteraction,
    saveProgress,
    removeFromContinueWatching,
    getSavedProgress,
    getSavedEntry,
    toggleWatchlist,
    isInWatchlist,
  } = useUserMedia();

  // Catálogos principales
  const [trending, setTrending] = useState([]);
  const [nowPlaying, setNowPlaying] = useState([]);
  const [popularMovies, setPopularMovies] = useState([]);
  const [popularSeries, setPopularSeries] = useState([]);
  const [topRated, setTopRated] = useState([]);
  const [animeCatalog, setAnimeCatalog] = useState([]);
  const [movieSections, setMovieSections] = useState({});
  const [seriesSections, setSeriesSections] = useState({});
  const [animeSections, setAnimeSections] = useState({});
  const [loadingCatalog, setLoadingCatalog] = useState(true);

  // Filtros personalizados de Géneros, Cadena y Ordenamiento
  const [selectedGenre, setSelectedGenre] = useState('all');
  const [selectedNetwork, setSelectedNetwork] = useState('all');
  const [selectedSortBy, setSelectedSortBy] = useState('popularity.desc');
  const [filteredItems, setFilteredItems] = useState([]);
  const [loadingFilter, setLoadingFilter] = useState(false);
  const [filteredPage, setFilteredPage] = useState(3);
  const [hasMoreFiltered, setHasMoreFiltered] = useState(false);
  const [loadingMoreFiltered, setLoadingMoreFiltered] = useState(false);

  // Hubs de Plataformas
  const [activeHub, setActiveHub] = useState(null);
  const [hubCatalog, setHubCatalog] = useState([]);
  const [loadingHub, setLoadingHub] = useState(false);

  // Modales
  const [detailItem, setDetailItem] = useState(null);
  const [playerConfig, setPlayerConfig] = useState(null);

  const tmdbLang = currentLanguageObj?.tmdbLang || 'es-MX';
  const preferredGenreIds = [...new Set([...(profile.movieGenres || []), ...(profile.seriesGenres || [])])];
  const movieRowSpecs = useMemo(() => buildGenreRows(MOVIE_GENRES, 'movie', { preferredGenreIds: profile.movieGenres || [], limit: 40 }), [profile]);
  const seriesRowSpecs = useMemo(() => buildGenreRows(SERIES_GENRES, 'tv', { preferredGenreIds: profile.seriesGenres || [], limit: 40 }), [profile]);
  const animeRowSpecs = useMemo(() => buildGenreRows(ANIME_GENRES, 'tv', { originalLanguage: 'ja', limit: 42 }), []);
  const homeRowSpecs = useMemo(() => {
    const movies = buildGenreRows(MOVIE_GENRES, 'movie', { preferredGenreIds: profile.movieGenres || [], limit: 21 });
    const series = buildGenreRows(SERIES_GENRES, 'tv', { preferredGenreIds: profile.seriesGenres || [], limit: 20 });
    return Array.from({ length: 21 }, (_, index) => [movies[index], series[index]]).flat().filter(Boolean);
  }, [profile]);

  const loadCatalogs = useCallback(async () => {
    setLoadingCatalog(true);
    try {
      const [
        trendRes,
        nowRes,
        popMovRes,
        popSerRes,
        topRes,
        animeRes,
        movSecRes,
        serSecRes,
        aniSecRes,
      ] = await Promise.allSettled([
        api.getTrending('all', 1, tmdbLang),
        api.getNowPlaying(1, tmdbLang),
        api.getPopularMovies(1, tmdbLang),
        api.getPopularSeries(1, tmdbLang),
        api.getTopRated(1, tmdbLang),
        api.getAnime(1, tmdbLang),
        api.getMovieSections(tmdbLang),
        api.getSeriesSections(tmdbLang),
        api.getAnimeSections(tmdbLang),
      ]);

      if (trendRes.status === 'fulfilled' && trendRes.value?.length > 0) setTrending(trendRes.value);
      if (nowRes.status === 'fulfilled' && nowRes.value?.length > 0) setNowPlaying(nowRes.value);
      if (popMovRes.status === 'fulfilled' && popMovRes.value?.length > 0) setPopularMovies(popMovRes.value);
      if (popSerRes.status === 'fulfilled' && popSerRes.value?.length > 0) setPopularSeries(popSerRes.value);
      if (topRes.status === 'fulfilled' && topRes.value?.length > 0) setTopRated(topRes.value);
      if (animeRes.status === 'fulfilled' && animeRes.value?.length > 0) setAnimeCatalog(animeRes.value);
      if (movSecRes.status === 'fulfilled' && movSecRes.value) setMovieSections(movSecRes.value);
      if (serSecRes.status === 'fulfilled' && serSecRes.value) setSeriesSections(serSecRes.value);
      if (aniSecRes.status === 'fulfilled' && aniSecRes.value) setAnimeSections(aniSecRes.value);
    } catch (err) {
      console.error('Error cargando catálogos:', err);
    } finally {
      setLoadingCatalog(false);
    }
  }, [tmdbLang]);

  useEffect(() => {
    loadCatalogs();
    // Precargar módulo y catálogo de TV en Vivo en segundo plano tras montar Inicio para que abra en 0ms
    const warmTimer = window.setTimeout(() => {
      import("./components/LiveTV.jsx").catch(() => {});
      api.prefetchIptvChannels();
    }, 600);
    return () => window.clearTimeout(warmTimer);
  }, [loadCatalogs]);

  // Cargar resultados cuando el usuario elige un Género personalizado, Cadena u Ordenamiento
  useEffect(() => {
    const isFilterActive =
      selectedGenre !== 'all' ||
      selectedNetwork !== 'all' ||
      selectedSortBy !== 'popularity.desc';

    if (!isFilterActive) {
      setFilteredItems([]);
      setHasMoreFiltered(false);
      return;
    }

    let isMounted = true;
    setLoadingFilter(true);

    const type = activeTab === 'series' || activeTab === 'anime' ? 'tv' : 'movie';
    const originalLanguage = activeTab === 'anime' ? 'ja' : null;
    const genreParam =
      activeTab === 'anime' && selectedGenre === 'all' ? '16' : selectedGenre;

    Promise.all([1, 2, 3].map((page) => api.discoverCatalog({
      type, genre: genreParam, network: selectedNetwork, originalLanguage,
      sortBy: selectedSortBy, page, lang: tmdbLang,
    })))
      .then((pages) => {
        if (!isMounted) return;
        setFilteredItems([...new Map(pages.flat().filter((item) => item?.id).map((item) => [item.id, item])).values()]);
        setFilteredPage(3);
        setHasMoreFiltered(pages[2].length > 0);
        setLoadingFilter(false);
      })
      .catch(() => {
        if (isMounted) { setLoadingFilter(false); setHasMoreFiltered(false); }
      });

    return () => {
      isMounted = false;
    };
  }, [
    activeTab,
    selectedGenre,
    selectedNetwork,
    selectedSortBy,
    tmdbLang,
  ]);

  const loadMoreFiltered = async () => {
    if (loadingMoreFiltered || !hasMoreFiltered) return;
    const page = filteredPage + 1;
    setLoadingMoreFiltered(true);
    try {
      const type = activeTab === 'series' || activeTab === 'anime' ? 'tv' : 'movie';
      const genre = activeTab === 'anime' && selectedGenre === 'all' ? '16' : selectedGenre;
      const next = await api.discoverCatalog({ type, genre, network: selectedNetwork, originalLanguage: activeTab === 'anime' ? 'ja' : null, sortBy: selectedSortBy, page, lang: tmdbLang });
      setFilteredItems((current) => [...new Map([...current, ...next].filter((item) => item?.id).map((item) => [item.id, item])).values()]);
      setFilteredPage(page);
      setHasMoreFiltered(next.length > 0 && page < 25);
    } finally { setLoadingMoreFiltered(false); }
  };

  useEffect(() => {
    if (!activeHub) {
      setHubCatalog([]);
      return;
    }

    let isMounted = true;
    setLoadingHub(true);

    api
      .getByProvider(activeHub.id, 1, tmdbLang)
      .then((items) => {
        if (isMounted) {
          setHubCatalog(items || []);
          setLoadingHub(false);
        }
      })
      .catch(() => {
        if (isMounted) setLoadingHub(false);
      });

    return () => {
      isMounted = false;
    };
  }, [activeHub, tmdbLang]);

  const handleSearch = async (query) => {
    setSearchQuery(query);
    if (!query || !query.trim()) {
      setSearchResults([]);
      setSearching(false);
      if (activeTab === 'search') setActiveTab('home');
      return;
    }

    setActiveTab('search');
    setSearchResults([]);
    setSearching(true);
  };

  useEffect(() => {
    const query = searchQuery.trim();
    if (!query) return;
    let current = true;
    const timer = window.setTimeout(async () => {
      try {
        const results = await api.searchMulti(query, 1, tmdbLang);
        if (!current) return;
        setSearchResults((results || []).filter(
          (i) => (i.media_type === 'movie' || i.media_type === 'tv') && (i.poster_path || i.poster_url)
        ));
      } catch (err) {
        if (current) { console.error('Error en búsqueda:', err); setSearchResults([]); }
      } finally {
        if (current) setSearching(false);
      }
    }, 250);
    return () => { current = false; window.clearTimeout(timer); };
  }, [searchQuery, tmdbLang]);

  const handleSelectDetails = useCallback(
    (item) => {
      if (item) recordTasteInteraction(item);
      setDetailItem(item);
    },
    [recordTasteInteraction]
  );

  const handlePlay = (
    item,
    season = null,
    episode = null,
    explicitTime = null,
    language = preferredLanguage
  ) => {
    if (!item) return;
    recordTasteInteraction(item);

    const itemId = item.id || item.tmdbId;
    const isTv =
      item?.media_type === 'tv' ||
      item?.type === 'tv' ||
      Boolean(item?.first_air_date) ||
      Boolean(item?.number_of_seasons) ||
      Boolean(season);

    const savedEntry = getSavedEntry(itemId);
    const targetSeason = isTv ? season || savedEntry?.season || 1 : null;
    const targetEpisode = isTv ? episode || savedEntry?.episode || 1 : null;

    let startSeconds = 0;
    if (explicitTime !== null && explicitTime !== undefined && Number(explicitTime) > 0) {
      startSeconds = Number(explicitTime);
    } else if (explicitTime === null || explicitTime === undefined) {
      startSeconds = getSavedProgress(itemId, targetSeason, targetEpisode);
    }

    setPlayerConfig({
      item: { ...item, id: itemId },
      season: targetSeason,
      episode: targetEpisode,
      initialTime: startSeconds,
      language: language || savedEntry?.language || preferredLanguage,
    });
  };

  const handleSurpriseMe = () => {
    const pool = [...nowPlaying, ...trending, ...popularMovies, ...popularSeries, ...topRated];
    if (pool.length === 0) return;
    const randomItem = pool[Math.floor(Math.random() * pool.length)];
    handleSelectDetails(randomItem);
  };

  // Pools de respaldo combinados por tipo (integrando pasivamente joyas históricas con estrenos)
  const allMoviesPool = useMemo(() => {
    return [...nowPlaying, ...popularMovies, ...topRated, ...(movieSections.action || [])];
  }, [nowPlaying, popularMovies, topRated, movieSections.action]);

  const allSeriesPool = useMemo(() => {
    return [...popularSeries, ...(seriesSections.topRated || []), ...trending.filter((i) => i.media_type === 'tv')];
  }, [popularSeries, seriesSections.topRated, trending]);

  const allAnimePool = useMemo(() => {
    return [...animeCatalog, ...(animeSections.trending || [])];
  }, [animeCatalog, animeSections.trending]);

  // Pools personalizados de 8 destacados para HeroBanner en Inicio, Películas, Series y Anime
  const homeHeroPool = useMemo(() => {
    return computePersonalizedPool({
      continueWatching,
      watchlist,
      tasteHistory,
      nowPlaying,
      trending,
      preferredGenreIds,
      sectionItems: [...nowPlaying.slice(0, 6), ...trending.slice(0, 8)],
      maxItems: 8,
    });
  }, [continueWatching, watchlist, tasteHistory, nowPlaying, trending, profile]);

  const moviesHeroPool = useMemo(() => {
    return computePersonalizedPool({
      continueWatching,
      watchlist,
      tasteHistory,
      nowPlaying,
      trending: popularMovies,
      preferredGenreIds: profile.movieGenres || [],
      sectionItems: [
        ...nowPlaying.slice(0, 6),
        ...popularMovies.slice(0, 6),
        ...topRated.slice(0, 4),
      ],
      maxItems: 8,
    });
  }, [continueWatching, watchlist, tasteHistory, nowPlaying, popularMovies, topRated, profile]);

  const seriesHeroPool = useMemo(() => {
    return computePersonalizedPool({
      continueWatching,
      watchlist,
      tasteHistory,
      nowPlaying: [],
      trending: popularSeries,
      preferredGenreIds: profile.seriesGenres || [],
      sectionItems: [
        ...popularSeries.slice(0, 8),
        ...(seriesSections.topRated || []).slice(0, 6),
      ],
      maxItems: 8,
    });
  }, [continueWatching, watchlist, tasteHistory, popularSeries, seriesSections.topRated, profile]);

  const animeHeroPool = useMemo(() => {
    return computePersonalizedPool({
      continueWatching,
      watchlist,
      tasteHistory,
      nowPlaying: animeSections.animeMovies || [],
      trending: animeCatalog,
      preferredGenreIds: profile.seriesGenres || [],
      sectionItems: [
        ...animeCatalog.slice(0, 8),
        ...(animeSections.shonenAction || []).slice(0, 6),
      ],
      maxItems: 8,
    });
  }, [continueWatching, watchlist, tasteHistory, animeCatalog, animeSections, profile]);

  const personalizedRowItems = useMemo(() => {
    return computePersonalizedPool({
      continueWatching,
      watchlist,
      tasteHistory,
      nowPlaying,
      trending: [...trending, ...popularMovies, ...popularSeries],
      preferredGenreIds,
      sectionItems: [...nowPlaying, ...trending],
      maxItems: 16,
    });
  }, [continueWatching, watchlist, tasteHistory, nowPlaying, trending, popularMovies, popularSeries, profile]);

  const hasActiveFilters =
    selectedGenre !== 'all' ||
    selectedNetwork !== 'all' ||
    selectedSortBy !== 'popularity.desc';

  const currentGenreLabel = useMemo(() => {
    const list =
      activeTab === 'anime'
        ? ANIME_GENRES
        : activeTab === 'series'
        ? SERIES_GENRES
        : MOVIE_GENRES;
    return list.find((g) => g.value === selectedGenre)?.label || 'Explorando Género';
  }, [activeTab, selectedGenre]);
  const expandedMediaProps = { onSelectDetails: handleSelectDetails, onPlay: handlePlay, onToggleWatchlist: toggleWatchlist, isSavedInWatchlist: isInWatchlist, getSavedEntry, preferredLanguage };

  return (
    <div className="min-h-screen bg-[#141414] text-white flex flex-col font-netflix select-none">
      <Navbar
        activeTab={activeTab}
        setActiveTab={(tab) => {
          setActiveTab(tab);
          setActiveHub(null);
          setSelectedGenre('all');
          setSelectedNetwork('all');
          setSelectedSortBy('popularity.desc');
        }}
        onSearch={handleSearch}
        searchQuery={searchQuery}
        watchlistCount={watchlist.length}
        preferredLanguage={preferredLanguage}
        onChangeLanguage={setPreferredLanguage}
        audioEnginePreset={audioEnginePreset}
        onChangeAudioPreset={setAudioEnginePreset}
        onSurpriseMe={handleSurpriseMe}
        profile={profile}
      />

      {!isOnline && activeTab !== 'downloads' && (
        <div role="status" className="mt-20 mx-4 sm:mx-8 rounded-lg border border-emerald-500/30 bg-emerald-950/90 px-4 py-3 flex items-center justify-between gap-3 text-sm">
          <span>Estás sin conexión. Tus videos guardados siguen disponibles en este equipo.</span>
          <button type="button" onClick={() => setActiveTab('downloads')} className="shrink-0 rounded bg-emerald-600 px-3 py-1.5 font-bold hover:bg-emerald-500">Ver descargas</button>
        </div>
      )}

      <main className="flex-1 pb-20">
        {activeTab === 'downloads' ? (
          <React.Suspense fallback={<p className="pt-28 text-center text-neutral-400">Cargando biblioteca offline…</p>}><DownloadsPage /></React.Suspense>
        ) : activeTab === 'live_tv' ? (
          <React.Suspense fallback={<p className="pt-28 text-center text-neutral-400">Preparando televisión en vivo…</p>}><LiveTV /></React.Suspense>
        ) : activeTab === 'profile' ? (
          <ProfilePage profile={profile} onSave={saveProfile} movieGenres={MOVIE_GENRES} seriesGenres={SERIES_GENRES} preferredLanguage={preferredLanguage} onChangeLanguage={setPreferredLanguage} audioEnginePreset={audioEnginePreset} onChangeAudioPreset={setAudioEnginePreset} />
        ) : activeTab === 'watchlist' ? (
          <div className="pt-24 sm:pt-28 px-4 sm:px-8 lg:px-12 max-w-[1480px] mx-auto animate-fadeIn">
            <h1 className="text-3xl font-black mb-2 flex items-center gap-3">
              <Bookmark className="w-8 h-8 text-amber-400" />
              <span>Mi Lista</span>
            </h1>
            <p className="text-xs text-neutral-400 mb-6">
              Títulos guardados para reproducir al instante con Motor de Audio en {currentLanguageObj.label}.
            </p>

            {watchlist.length === 0 ? (
              <div className="py-24 text-center text-neutral-400 space-y-3 bg-neutral-900/30 rounded-2xl border border-white/[0.06]">
                <Bookmark className="w-12 h-12 mx-auto text-neutral-600" />
                <p className="text-base font-bold text-neutral-200">Tu lista está vacía.</p>
                <p className="text-xs text-neutral-500">
                  Haz clic en "Mi Lista" en cualquier película, serie o anime para guardarla aquí.
                </p>
              </div>
            ) : (
              <MediaGrid
                items={watchlist}
                onSelectDetails={handleSelectDetails}
                onPlay={handlePlay}
                onToggleWatchlist={toggleWatchlist}
                isSavedInWatchlist={isInWatchlist}
                getSavedEntry={getSavedEntry}
                preferredLanguage={preferredLanguage}
              />
            )}
          </div>
        ) : activeTab === 'anime' ? (
          /* PESTAÑA: ANIME CON SUB-BARRA DE GÉNEROS PERSONALIZADOS ESTILO NETFLIX Y CARGA 100% GARANTIZADA */
          <div className="pb-16">
            {animeHeroPool.length > 0 && (
              <HeroBanner
                items={animeHeroPool}
                sectionLabel="🎌 ANIME SIMULCAST & PELÍCULAS"
                onPlay={handlePlay}
                onSelectDetails={handleSelectDetails}
                onToggleWatchlist={toggleWatchlist}
                isSavedInWatchlist={isInWatchlist}
                preferredLanguage={preferredLanguage}
                onChangeLanguage={setPreferredLanguage}
                enableTrailer={profile.autoplayTrailers !== false}
              />
            )}

            {/* Sub-Header Estilo Netflix con Selector Desplegable "Géneros" Personalizado para Anime */}
            <div
              className={`relative z-30 px-4 sm:px-8 lg:px-12 max-w-[1480px] mx-auto mb-5 space-y-3.5 ${
                animeHeroPool.length > 0 ? '-mt-10 sm:-mt-14' : 'pt-24 sm:pt-28'
              }`}
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#141414]/90 backdrop-blur-2xl px-5 py-4 rounded-2xl border border-white/10 shadow-2xl">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2.5">
                    <span className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#d4560a] to-[#F47521] flex items-center justify-center shadow-lg">
                      <Flame className="w-5 h-5 text-white fill-current" />
                    </span>
                    <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                      Anime
                    </h1>
                  </div>

                  {/* Selector de Géneros de Anime Estilo Netflix */}
                  <CustomSelect
                    icon={Layers}
                    options={ANIME_GENRES}
                    value={selectedGenre}
                    onChange={setSelectedGenre}
                    label="Géneros"
                    searchable={true}
                  />
                </div>

                <div className="flex items-center flex-wrap gap-2">
                  <CustomSelect
                    options={SORT_OPTIONS}
                    value={selectedSortBy}
                    onChange={setSelectedSortBy}
                    label="Ordenar por"
                    align="right"
                  />
                  {hasActiveFilters && (
                    <button
                      onClick={() => {
                        setSelectedGenre('all');
                        setSelectedSortBy('popularity.desc');
                      }}
                      className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-[#E50914] text-xs font-extrabold text-white transition"
                    >
                      Ver Todo
                    </button>
                  )}
                </div>
              </div>

              {/* Barra Rápida de Píldoras de Géneros de Anime */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                {ANIME_GENRES.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => setSelectedGenre(g.value)}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all border flex items-center gap-1.5 ${
                      selectedGenre === g.value
                        ? 'bg-[#E50914] text-white border-red-400 shadow-lg shadow-red-950/50 scale-105'
                        : 'bg-[#181818]/90 hover:bg-neutral-800 text-neutral-300 border-white/[0.08]'
                    }`}
                  >
                    <span>{g.icon}</span>
                    <span>{g.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {hasActiveFilters ? (
              <MediaGrid
                title={currentGenreLabel}
                subtitle="Catálogo de anime con episodios completos y películas"
                items={filteredItems}
                isLoading={loadingFilter}
                onLoadMore={hasMoreFiltered ? loadMoreFiltered : null}
                isLoadingMore={loadingMoreFiltered}
                onRetry={() => {
                  setSelectedGenre('all');
                  setSelectedSortBy('popularity.desc');
                }}
                onSelectDetails={handleSelectDetails}
                onPlay={handlePlay}
                onToggleWatchlist={toggleWatchlist}
                isSavedInWatchlist={isInWatchlist}
                getSavedEntry={getSavedEntry}
                preferredLanguage={preferredLanguage}
              />
            ) : (
              <>
                <MediaGrid
                  title="Top 10 Anime en Tendencia"
                  subtitle="Los animes más vistos de la semana"
                  items={ensureRowItems(animeSections.trending, allAnimePool, [], 0)}
                  isLoading={loadingCatalog}
                  onRetry={loadCatalogs}
                  onSelectDetails={handleSelectDetails}
                  onPlay={handlePlay}
                  isTop10={true}
                  onToggleWatchlist={toggleWatchlist}
                  isSavedInWatchlist={isInWatchlist}
                  getSavedEntry={getSavedEntry}
                  preferredLanguage={preferredLanguage}
                />

                <MediaGrid
                  title="⚔️ Shonen & Acción Explosiva"
                  subtitle="Batallas épicas, torneos y aventuras de alto voltaje"
                  items={ensureRowItems(
                    animeSections.shonenAction,
                    allAnimePool,
                    [10759, 28, 12],
                    0
                  )}
                  isLoading={loadingCatalog}
                  onSelectDetails={handleSelectDetails}
                  onPlay={handlePlay}
                  isRow={true}
                  onToggleWatchlist={toggleWatchlist}
                  isSavedInWatchlist={isInWatchlist}
                  getSavedEntry={getSavedEntry}
                  preferredLanguage={preferredLanguage}
                />

                <MediaGrid
                  title="🔮 Fantasía Oscura, Magia & Isekai"
                  subtitle="Mundos paralelos, reencarnaciones y hechicería"
                  items={ensureRowItems(
                    animeSections.fantasyIsekai,
                    allAnimePool,
                    [10765, 14, 878],
                    4
                  )}
                  isLoading={loadingCatalog}
                  onSelectDetails={handleSelectDetails}
                  onPlay={handlePlay}
                  isRow={true}
                  onToggleWatchlist={toggleWatchlist}
                  isSavedInWatchlist={isInWatchlist}
                  getSavedEntry={getSavedEntry}
                  preferredLanguage={preferredLanguage}
                />

                <MediaGrid
                  title="🧠 Seinen, Cyberpunk & Misterio Psicológico"
                  subtitle="Tramas adultas, suspenso mental y futuros distópicos"
                  items={ensureRowItems(
                    animeSections.seinenMystery,
                    allAnimePool,
                    [9648, 80, 18],
                    8
                  )}
                  isLoading={loadingCatalog}
                  onSelectDetails={handleSelectDetails}
                  onPlay={handlePlay}
                  isRow={true}
                  onToggleWatchlist={toggleWatchlist}
                  isSavedInWatchlist={isInWatchlist}
                  getSavedEntry={getSavedEntry}
                  preferredLanguage={preferredLanguage}
                />

                <MediaGrid
                  title="🌸 Romance, Comedia & Slice of Life"
                  subtitle="Historias entrañables, humor escolar y romance japonés"
                  items={ensureRowItems(
                    animeSections.romanceSlice,
                    allAnimePool,
                    [35, 10749],
                    10
                  )}
                  isLoading={loadingCatalog}
                  onSelectDetails={handleSelectDetails}
                  onPlay={handlePlay}
                  isRow={true}
                  onToggleWatchlist={toggleWatchlist}
                  isSavedInWatchlist={isInWatchlist}
                  getSavedEntry={getSavedEntry}
                  preferredLanguage={preferredLanguage}
                />

                <MediaGrid
                  title="🎬 Películas de Anime & Taquilla Japonesa"
                  subtitle="Largometrajes aclamados de animación japonesa en 1080p y 4K"
                  items={ensureRowItems(animeSections.animeMovies, allAnimePool, [], 6)}
                  isLoading={loadingCatalog}
                  onSelectDetails={handleSelectDetails}
                  onPlay={handlePlay}
                  isRow={true}
                  onToggleWatchlist={toggleWatchlist}
                  isSavedInWatchlist={isInWatchlist}
                  getSavedEntry={getSavedEntry}
                  preferredLanguage={preferredLanguage}
                />
                <DiscoveryRows specs={animeRowSpecs} lang={tmdbLang} mediaProps={expandedMediaProps} />
              </>
            )}
          </div>
        ) : activeTab === 'search' ? (
          <div className="pt-24 sm:pt-28 px-4 sm:px-8 lg:px-12 max-w-[1480px] mx-auto animate-fadeIn">
            <h1 className="text-2xl font-extrabold mb-6 flex items-center gap-2">
              <span>Resultados para:</span>
              <span className="text-[#E50914] font-black italic">"{searchQuery}"</span>
            </h1>

            {searching ? (
              <div className="py-20 flex flex-col items-center justify-center text-neutral-400 gap-3">
                <RefreshCw className="w-8 h-8 text-[#E50914] animate-spin" />
                <span className="text-sm font-semibold">Buscando en catálogo global...</span>
              </div>
            ) : searchResults.length === 0 ? (
              <div className="py-20 text-center text-neutral-400 space-y-2">
                <AlertCircle className="w-12 h-12 mx-auto text-neutral-600" />
                <p className="text-base font-bold">No se encontraron resultados para tu búsqueda.</p>
              </div>
            ) : (
              <MediaGrid
                items={searchResults}
                onSelectDetails={handleSelectDetails}
                onPlay={handlePlay}
                onToggleWatchlist={toggleWatchlist}
                isSavedInWatchlist={isInWatchlist}
                getSavedEntry={getSavedEntry}
                preferredLanguage={preferredLanguage}
              />
            )}
          </div>
        ) : activeTab === 'movies' ? (
          /* PESTAÑA: PELÍCULAS CON SELECTOR DE GÉNEROS PERSONALIZADO ESTILO NETFLIX */
          <div className="pb-16">
            {moviesHeroPool.length > 0 && (
              <HeroBanner
                items={moviesHeroPool}
                sectionLabel="🍿 CINE & ESTRENOS EN TAQUILLA"
                onPlay={handlePlay}
                onSelectDetails={handleSelectDetails}
                onToggleWatchlist={toggleWatchlist}
                isSavedInWatchlist={isInWatchlist}
                preferredLanguage={preferredLanguage}
                onChangeLanguage={setPreferredLanguage}
                enableTrailer={profile.autoplayTrailers !== false}
              />
            )}

            <div
              className={`relative z-30 px-4 sm:px-8 lg:px-12 max-w-[1480px] mx-auto mb-5 space-y-3.5 ${
                moviesHeroPool.length > 0 ? '-mt-10 sm:-mt-14' : 'pt-24 sm:pt-28'
              }`}
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#141414]/90 backdrop-blur-2xl px-5 py-4 rounded-2xl border border-white/10 shadow-2xl">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2.5">
                    <Film className="w-7 h-7 text-[#E50914]" />
                    <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                      Películas
                    </h1>
                  </div>

                  {/* Selector Desplegable "Géneros" Personalizado para Películas */}
                  <CustomSelect
                    icon={Layers}
                    options={MOVIE_GENRES}
                    value={selectedGenre}
                    onChange={setSelectedGenre}
                    label="Géneros"
                    searchable={true}
                  />
                </div>

                <div className="flex items-center flex-wrap gap-2">
                  <CustomSelect
                    options={SORT_OPTIONS}
                    value={selectedSortBy}
                    onChange={setSelectedSortBy}
                    label="Ordenar por"
                    align="right"
                  />
                  {hasActiveFilters && (
                    <button
                      onClick={() => {
                        setSelectedGenre('all');
                        setSelectedSortBy('popularity.desc');
                      }}
                      className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-[#E50914] text-xs font-extrabold text-white transition"
                    >
                      Ver Todo
                    </button>
                  )}
                </div>
              </div>

              {/* Barra Rápida de Píldoras de Géneros de Películas */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                {MOVIE_GENRES.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => setSelectedGenre(g.value)}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all border flex items-center gap-1.5 ${
                      selectedGenre === g.value
                        ? 'bg-[#E50914] text-white border-red-400 shadow-lg shadow-red-950/50 scale-105'
                        : 'bg-[#181818]/90 hover:bg-neutral-800 text-neutral-300 border-white/[0.08]'
                    }`}
                  >
                    <span>{g.icon}</span>
                    <span>{g.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {hasActiveFilters ? (
              <MediaGrid
                title={currentGenreLabel}
                subtitle="Selección curada en alta definición con audio preparado"
                items={filteredItems}
                isLoading={loadingFilter}
                onLoadMore={hasMoreFiltered ? loadMoreFiltered : null}
                isLoadingMore={loadingMoreFiltered}
                onRetry={() => {
                  setSelectedGenre('all');
                  setSelectedSortBy('popularity.desc');
                }}
                onSelectDetails={handleSelectDetails}
                onPlay={handlePlay}
                onToggleWatchlist={toggleWatchlist}
                isSavedInWatchlist={isInWatchlist}
                getSavedEntry={getSavedEntry}
                preferredLanguage={preferredLanguage}
              />
            ) : (
              <>
                <MediaGrid
                  title="🍿 Top 10 Películas Estallando en Taquilla Hoy"
                  subtitle="Los estrenos más taquilleros en cines y plataformas"
                  items={ensureRowItems(nowPlaying, allMoviesPool, [], 0)}
                  isLoading={loadingCatalog}
                  onSelectDetails={handleSelectDetails}
                  onPlay={handlePlay}
                  isTop10={true}
                  onToggleWatchlist={toggleWatchlist}
                  isSavedInWatchlist={isInWatchlist}
                  getSavedEntry={getSavedEntry}
                  preferredLanguage={preferredLanguage}
                />
                <MediaGrid
                  title="💥 Acción y Adrenalina Pura"
                  items={ensureRowItems(movieSections.action, allMoviesPool, [28, 12], 0)}
                  isLoading={loadingCatalog}
                  onSelectDetails={handleSelectDetails}
                  onPlay={handlePlay}
                  isRow={true}
                  onToggleWatchlist={toggleWatchlist}
                  isSavedInWatchlist={isInWatchlist}
                  getSavedEntry={getSavedEntry}
                  preferredLanguage={preferredLanguage}
                />
                <MediaGrid
                  title="🚀 Ciencia Ficción y Futuros Distópicos"
                  items={ensureRowItems(movieSections.scifi, allMoviesPool, [878, 14], 4)}
                  isLoading={loadingCatalog}
                  onSelectDetails={handleSelectDetails}
                  onPlay={handlePlay}
                  isRow={true}
                  onToggleWatchlist={toggleWatchlist}
                  isSavedInWatchlist={isInWatchlist}
                  getSavedEntry={getSavedEntry}
                  preferredLanguage={preferredLanguage}
                />
                <MediaGrid
                  title="🕵️ Suspenso, Intriga y Thrillers"
                  items={ensureRowItems(
                    movieSections.thrillerMystery,
                    allMoviesPool,
                    [53, 80, 9648],
                    8
                  )}
                  isLoading={loadingCatalog}
                  onSelectDetails={handleSelectDetails}
                  onPlay={handlePlay}
                  isRow={true}
                  onToggleWatchlist={toggleWatchlist}
                  isSavedInWatchlist={isInWatchlist}
                  getSavedEntry={getSavedEntry}
                  preferredLanguage={preferredLanguage}
                />
                <MediaGrid
                  title="👻 Terror y Suspenso Sobrenatural"
                  items={ensureRowItems(movieSections.horror, allMoviesPool, [27, 53], 12)}
                  isLoading={loadingCatalog}
                  onSelectDetails={handleSelectDetails}
                  onPlay={handlePlay}
                  isRow={true}
                  onToggleWatchlist={toggleWatchlist}
                  isSavedInWatchlist={isInWatchlist}
                  getSavedEntry={getSavedEntry}
                  preferredLanguage={preferredLanguage}
                />
                <MediaGrid
                  title="😂 Comedia y Entretenimiento"
                  items={ensureRowItems(movieSections.comedy, allMoviesPool, [35], 6)}
                  isLoading={loadingCatalog}
                  onSelectDetails={handleSelectDetails}
                  onPlay={handlePlay}
                  isRow={true}
                  onToggleWatchlist={toggleWatchlist}
                  isSavedInWatchlist={isInWatchlist}
                  getSavedEntry={getSavedEntry}
                  preferredLanguage={preferredLanguage}
                />
                <MediaGrid
                  title="❤️ Drama y Romance Imperdible"
                  items={ensureRowItems(movieSections.romanceDrama, allMoviesPool, [18, 10749], 10)}
                  isLoading={loadingCatalog}
                  onSelectDetails={handleSelectDetails}
                  onPlay={handlePlay}
                  isRow={true}
                  onToggleWatchlist={toggleWatchlist}
                  isSavedInWatchlist={isInWatchlist}
                  getSavedEntry={getSavedEntry}
                  preferredLanguage={preferredLanguage}
                />
                <MediaGrid
                  title="🎨 Animación y Aventura Familiar"
                  items={ensureRowItems(movieSections.animation, allMoviesPool, [16, 10751], 14)}
                  isLoading={loadingCatalog}
                  onSelectDetails={handleSelectDetails}
                  onPlay={handlePlay}
                  isRow={true}
                  onToggleWatchlist={toggleWatchlist}
                  isSavedInWatchlist={isInWatchlist}
                  getSavedEntry={getSavedEntry}
                  preferredLanguage={preferredLanguage}
                />
                <MediaGrid
                  title="🏆 Obras Maestras Aclamadas por la Crítica"
                  items={ensureRowItems(topRated, allMoviesPool, [], 2)}
                  isLoading={loadingCatalog}
                  onSelectDetails={handleSelectDetails}
                  onPlay={handlePlay}
                  isRow={true}
                  onToggleWatchlist={toggleWatchlist}
                  isSavedInWatchlist={isInWatchlist}
                  getSavedEntry={getSavedEntry}
                  preferredLanguage={preferredLanguage}
                />
                <DiscoveryRows specs={movieRowSpecs} lang={tmdbLang} mediaProps={expandedMediaProps} />
              </>
            )}
          </div>
        ) : activeTab === 'series' ? (
          /* PESTAÑA: SERIES DE TV CON SELECTOR DE GÉNEROS PERSONALIZADO ESTILO NETFLIX */
          <div className="pb-16">
            {seriesHeroPool.length > 0 && (
              <HeroBanner
                items={seriesHeroPool}
                sectionLabel="📺 SERIES ACLAMADAS & MARATONES"
                onPlay={handlePlay}
                onSelectDetails={handleSelectDetails}
                onToggleWatchlist={toggleWatchlist}
                isSavedInWatchlist={isInWatchlist}
                preferredLanguage={preferredLanguage}
                onChangeLanguage={setPreferredLanguage}
                enableTrailer={profile.autoplayTrailers !== false}
              />
            )}

            <div
              className={`relative z-30 px-4 sm:px-8 lg:px-12 max-w-[1480px] mx-auto mb-5 space-y-3.5 ${
                seriesHeroPool.length > 0 ? '-mt-10 sm:-mt-14' : 'pt-24 sm:pt-28'
              }`}
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#141414]/90 backdrop-blur-2xl px-5 py-4 rounded-2xl border border-white/10 shadow-2xl">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2.5">
                    <Tv className="w-7 h-7 text-sky-400" />
                    <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                      Series
                    </h1>
                  </div>

                  {/* Selector Desplegable "Géneros" Personalizado para Series */}
                  <CustomSelect
                    icon={Layers}
                    options={SERIES_GENRES}
                    value={selectedGenre}
                    onChange={setSelectedGenre}
                    label="Géneros"
                    searchable={true}
                  />
                </div>

                <div className="flex items-center flex-wrap gap-2">
                  <CustomSelect
                    options={TV_NETWORKS}
                    value={selectedNetwork}
                    onChange={setSelectedNetwork}
                    label="Plataforma"
                    align="right"
                  />
                  <CustomSelect
                    options={SORT_OPTIONS}
                    value={selectedSortBy}
                    onChange={setSelectedSortBy}
                    label="Ordenar por"
                    align="right"
                  />
                  {hasActiveFilters && (
                    <button
                      onClick={() => {
                        setSelectedGenre('all');
                        setSelectedNetwork('all');
                        setSelectedSortBy('popularity.desc');
                      }}
                      className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-[#E50914] text-xs font-extrabold text-white transition"
                    >
                      Ver Todo
                    </button>
                  )}
                </div>
              </div>

              {/* Barra Rápida de Píldoras de Géneros de Series */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                {SERIES_GENRES.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => setSelectedGenre(g.value)}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all border flex items-center gap-1.5 ${
                      selectedGenre === g.value
                        ? 'bg-[#E50914] text-white border-red-400 shadow-lg shadow-red-950/50 scale-105'
                        : 'bg-[#181818]/90 hover:bg-neutral-800 text-neutral-300 border-white/[0.08]'
                    }`}
                  >
                    <span>{g.icon}</span>
                    <span>{g.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {hasActiveFilters ? (
              <MediaGrid
                title={currentGenreLabel}
                subtitle="Temporadas completas listas para maratonear"
                items={filteredItems}
                isLoading={loadingFilter}
                onLoadMore={hasMoreFiltered ? loadMoreFiltered : null}
                isLoadingMore={loadingMoreFiltered}
                onRetry={() => {
                  setSelectedGenre('all');
                  setSelectedNetwork('all');
                  setSelectedSortBy('popularity.desc');
                }}
                onSelectDetails={handleSelectDetails}
                onPlay={handlePlay}
                onToggleWatchlist={toggleWatchlist}
                isSavedInWatchlist={isInWatchlist}
                getSavedEntry={getSavedEntry}
                preferredLanguage={preferredLanguage}
              />
            ) : (
              <>
                <MediaGrid
                  title="🔥 Top 10 Series Más Vistas Hoy"
                  items={ensureRowItems(popularSeries, allSeriesPool, [], 0)}
                  isLoading={loadingCatalog}
                  onSelectDetails={handleSelectDetails}
                  onPlay={handlePlay}
                  isTop10={true}
                  onToggleWatchlist={toggleWatchlist}
                  isSavedInWatchlist={isInWatchlist}
                  getSavedEntry={getSavedEntry}
                  preferredLanguage={preferredLanguage}
                />
                <MediaGrid
                  title="⚔️ Acción, Supervivencia y Aventura"
                  items={ensureRowItems(
                    seriesSections.actionAdventure,
                    allSeriesPool,
                    [10759],
                    0
                  )}
                  isLoading={loadingCatalog}
                  onSelectDetails={handleSelectDetails}
                  onPlay={handlePlay}
                  isRow={true}
                  onToggleWatchlist={toggleWatchlist}
                  isSavedInWatchlist={isInWatchlist}
                  getSavedEntry={getSavedEntry}
                  preferredLanguage={preferredLanguage}
                />
                <MediaGrid
                  title="🛸 Ciencia Ficción, Fantasía y Mundos Paralelos"
                  items={ensureRowItems(
                    seriesSections.scifiFantasy,
                    allSeriesPool,
                    [10765],
                    4
                  )}
                  isLoading={loadingCatalog}
                  onSelectDetails={handleSelectDetails}
                  onPlay={handlePlay}
                  isRow={true}
                  onToggleWatchlist={toggleWatchlist}
                  isSavedInWatchlist={isInWatchlist}
                  getSavedEntry={getSavedEntry}
                  preferredLanguage={preferredLanguage}
                />
                <MediaGrid
                  title="🔍 Crimen, Misterio e Investigación"
                  items={ensureRowItems(
                    seriesSections.crimeMystery,
                    allSeriesPool,
                    [80, 9648],
                    6
                  )}
                  isLoading={loadingCatalog}
                  onSelectDetails={handleSelectDetails}
                  onPlay={handlePlay}
                  isRow={true}
                  onToggleWatchlist={toggleWatchlist}
                  isSavedInWatchlist={isInWatchlist}
                  getSavedEntry={getSavedEntry}
                  preferredLanguage={preferredLanguage}
                />
                <MediaGrid
                  title="🇰🇷 K-Dramas y Series Asiáticas de Éxito"
                  items={ensureRowItems(seriesSections.kdramas, allSeriesPool, [18, 10749], 8)}
                  isLoading={loadingCatalog}
                  onSelectDetails={handleSelectDetails}
                  onPlay={handlePlay}
                  isRow={true}
                  onToggleWatchlist={toggleWatchlist}
                  isSavedInWatchlist={isInWatchlist}
                  getSavedEntry={getSavedEntry}
                  preferredLanguage={preferredLanguage}
                />
                <MediaGrid
                  title="😂 Comedias y Sitcoms Inolvidables"
                  items={ensureRowItems(seriesSections.sitcoms, allSeriesPool, [35], 2)}
                  isLoading={loadingCatalog}
                  onSelectDetails={handleSelectDetails}
                  onPlay={handlePlay}
                  isRow={true}
                  onToggleWatchlist={toggleWatchlist}
                  isSavedInWatchlist={isInWatchlist}
                  getSavedEntry={getSavedEntry}
                  preferredLanguage={preferredLanguage}
                />
                <MediaGrid
                  title="🏆 Series Mejor Valoradas de la Historia (IMDb / TMDB)"
                  items={ensureRowItems(seriesSections.topRated, allSeriesPool, [18], 0)}
                  isLoading={loadingCatalog}
                  onSelectDetails={handleSelectDetails}
                  onPlay={handlePlay}
                  isRow={true}
                  onToggleWatchlist={toggleWatchlist}
                  isSavedInWatchlist={isInWatchlist}
                  getSavedEntry={getSavedEntry}
                  preferredLanguage={preferredLanguage}
                />
                <MediaGrid
                  title="📺 Animación y Cartoons"
                  items={ensureRowItems(seriesSections.cartoons, allSeriesPool, [16], 10)}
                  isLoading={loadingCatalog}
                  onSelectDetails={handleSelectDetails}
                  onPlay={handlePlay}
                  isRow={true}
                  onToggleWatchlist={toggleWatchlist}
                  isSavedInWatchlist={isInWatchlist}
                  getSavedEntry={getSavedEntry}
                  preferredLanguage={preferredLanguage}
                />
                <DiscoveryRows specs={seriesRowSpecs} lang={tmdbLang} mediaProps={expandedMediaProps} />
              </>
            )}
          </div>
        ) : (
          /* PESTAÑA: INICIO (HOME CON MOTOR ALGORÍTMICO DE RECOMENDACIÓN Y TAQUILLA) */
          <>
            {homeHeroPool.length > 0 ? (
              <HeroBanner
                items={homeHeroPool}
                onPlay={handlePlay}
                onSelectDetails={handleSelectDetails}
                onToggleWatchlist={toggleWatchlist}
                isSavedInWatchlist={isInWatchlist}
                preferredLanguage={preferredLanguage}
                onChangeLanguage={setPreferredLanguage}
                enableTrailer={profile.autoplayTrailers !== false}
              />
            ) : loadingCatalog ? (
              <div className="w-full h-[78vh] netflix-shimmer flex items-center justify-center pt-20">
                <div className="flex flex-col items-center gap-3">
                  <RefreshCw className="w-9 h-9 animate-spin text-[#E50914]" />
                  <span className="text-sm font-bold text-neutral-300 tracking-wide">
                    Cargando experiencia StreamFlix Pro...
                  </span>
                </div>
              </div>
            ) : null}

            <div
              className={`relative z-20 ${
                homeHeroPool.length > 0 ? '-mt-12 sm:-mt-16' : 'pt-24 sm:pt-28'
              }`}
            >
              <PlatformHubs activeHub={activeHub} onSelectHub={(hub) => setActiveHub(hub)} />
            </div>

            {activeHub && (
              <div className="pt-2 animate-fadeIn">
                <MediaGrid
                  title={`Catálogo Destacado de ${activeHub.name}`}
                  items={hubCatalog}
                  isLoading={loadingHub}
                  onSelectDetails={handleSelectDetails}
                  onPlay={handlePlay}
                  isRow={true}
                  onToggleWatchlist={toggleWatchlist}
                  isSavedInWatchlist={isInWatchlist}
                  getSavedEntry={getSavedEntry}
                  preferredLanguage={preferredLanguage}
                />
              </div>
            )}

            <div className="relative z-20 space-y-2 pt-2">
              {continueWatching.length > 0 && (
                <MediaGrid
                  title="Continuar Viendo"
                  subtitle="Reanuda tus películas y episodios exactamente en el segundo donde los dejaste"
                  items={continueWatching}
                  onSelectDetails={handleSelectDetails}
                  onPlay={handlePlay}
                  isContinueWatching={true}
                  onRemoveContinueWatching={removeFromContinueWatching}
                  preferredLanguage={preferredLanguage}
                />
              )}

              {personalizedRowItems.length > 0 && (
                <MediaGrid
                  title="🎯 Seleccionado Para Ti"
                  subtitle="Recomendaciones basadas en tus gustos y en lo que está arrasando en taquilla"
                  items={personalizedRowItems}
                  isLoading={loadingCatalog}
                  onSelectDetails={handleSelectDetails}
                  onPlay={handlePlay}
                  isRow={true}
                  onToggleWatchlist={toggleWatchlist}
                  isSavedInWatchlist={isInWatchlist}
                  getSavedEntry={getSavedEntry}
                  preferredLanguage={preferredLanguage}
                />
              )}

              <MediaGrid
                title="Las 10 más populares en Colombia hoy"
                subtitle="Ranking actualizado con reproducción instantánea Cloud & P2P"
                items={trending}
                isLoading={loadingCatalog}
                onRetry={loadCatalogs}
                onSelectDetails={handleSelectDetails}
                onPlay={handlePlay}
                isTop10={true}
                onToggleWatchlist={toggleWatchlist}
                isSavedInWatchlist={isInWatchlist}
                getSavedEntry={getSavedEntry}
                preferredLanguage={preferredLanguage}
              />

              <MediaGrid
                title="🍿 Estallando en Taquilla y Cartelera"
                subtitle="Películas recientes arrasando en cines y plataformas"
                items={nowPlaying}
                isLoading={loadingCatalog}
                onRetry={loadCatalogs}
                onSelectDetails={handleSelectDetails}
                onPlay={handlePlay}
                isRow={true}
                onToggleWatchlist={toggleWatchlist}
                isSavedInWatchlist={isInWatchlist}
                getSavedEntry={getSavedEntry}
                preferredLanguage={preferredLanguage}
              />

              <MediaGrid
                title="Series Aclamadas para Maratonear"
                items={popularSeries}
                isLoading={loadingCatalog}
                onRetry={loadCatalogs}
                onSelectDetails={handleSelectDetails}
                onPlay={handlePlay}
                isRow={true}
                onToggleWatchlist={toggleWatchlist}
                isSavedInWatchlist={isInWatchlist}
                getSavedEntry={getSavedEntry}
                preferredLanguage={preferredLanguage}
              />

              <MediaGrid
                title="🎌 Anime Simulcast & Éxitos de Japón"
                items={animeCatalog}
                isLoading={loadingCatalog}
                onRetry={loadCatalogs}
                onSelectDetails={handleSelectDetails}
                onPlay={handlePlay}
                isRow={true}
                onToggleWatchlist={toggleWatchlist}
                isSavedInWatchlist={isInWatchlist}
                getSavedEntry={getSavedEntry}
                preferredLanguage={preferredLanguage}
              />

              <MediaGrid
                title="💥 Acción, Ciencia Ficción y Aventura"
                items={ensureRowItems(movieSections.action, allMoviesPool, [28, 878, 12], 0)}
                isLoading={loadingCatalog}
                onSelectDetails={handleSelectDetails}
                onPlay={handlePlay}
                isRow={true}
                onToggleWatchlist={toggleWatchlist}
                isSavedInWatchlist={isInWatchlist}
                getSavedEntry={getSavedEntry}
                preferredLanguage={preferredLanguage}
              />

              <MediaGrid
                title="🏆 Joyas del Cine Mejor Valoradas"
                items={topRated}
                isLoading={loadingCatalog}
                onRetry={loadCatalogs}
                onSelectDetails={handleSelectDetails}
                onPlay={handlePlay}
                isRow={true}
                onToggleWatchlist={toggleWatchlist}
                isSavedInWatchlist={isInWatchlist}
                getSavedEntry={getSavedEntry}
                preferredLanguage={preferredLanguage}
              />
              <DiscoveryRows specs={homeRowSpecs} lang={tmdbLang} mediaProps={expandedMediaProps} />
            </div>
          </>
        )}
      </main>

      <footer className="border-t border-white/[0.07] bg-[#0a0a0a] py-10 px-4 sm:px-8 text-center text-xs text-neutral-500 space-y-3">
        <div className="flex justify-center">
          <BrandLogo size="sm" showSubtitle={false} />
        </div>
        <p className="font-bold text-neutral-300">
          StreamFlix Pro v5.3 — fuentes y audio según disponibilidad
        </p>
        <p>
          Motor Algorítmico de Gustos & Taquilla • Fuentes Cloud con diagnóstico + reproducción local + conversión de audio con FFmpeg • Netflix Live TV.
        </p>
      </footer>

      {detailItem && (
        <DetailModal
          item={detailItem}
          onClose={() => setDetailItem(null)}
          onPlay={(item, season, episode, initialTime = null, lang = preferredLanguage) => {
            setDetailItem(null);
            handlePlay(item, season, episode, initialTime, lang);
          }}
          onToggleWatchlist={toggleWatchlist}
          isSavedInWatchlist={isInWatchlist}
          getSavedEntry={getSavedEntry}
          preferredLanguage={preferredLanguage}
          onChangeLanguage={setPreferredLanguage}
          onSelectSimilar={(simItem) => handleSelectDetails(simItem)}
        />
      )}

      {playerConfig && (
        <PlayerErrorBoundary onClose={() => setPlayerConfig(null)}>
          <React.Suspense fallback={<p className="fixed inset-0 z-50 grid place-items-center bg-black text-white">Preparando reproductor…</p>}><SmartPlayer
            item={playerConfig.item}
            season={playerConfig.season}
            episode={playerConfig.episode}
            initialTime={playerConfig.initialTime || 0}
            initialLanguage={playerConfig.language || preferredLanguage}
            audioEnginePreset={audioEnginePreset}
            onChangeAudioPreset={setAudioEnginePreset}
            onClose={() => setPlayerConfig(null)}
            onSaveProgress={saveProgress}
            onChangeLanguage={setPreferredLanguage}
            onPlayNextEpisode={(nextConfig) => setPlayerConfig(nextConfig)}
          /></React.Suspense>
        </PlayerErrorBoundary>
      )}
    </div>
  );
}
