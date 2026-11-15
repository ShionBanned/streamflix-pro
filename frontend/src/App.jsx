import React, { useState, useEffect, useCallback } from 'react';
import api from './services/api.js';
import Navbar from './components/Navbar.jsx';
import HeroBanner from './components/HeroBanner.jsx';
import PlatformHubs from './components/PlatformHubs.jsx';
import MediaGrid from './components/MediaGrid.jsx';
import DetailModal from './components/DetailModal.jsx';
import SmartPlayer from './components/SmartPlayer.jsx';
import LiveTV from './components/LiveTV.jsx';
import BrandLogo from './components/BrandLogo.jsx';
import useUserMedia from './hooks/useUserMedia.js';
import {
  Film,
  Tv,
  RefreshCw,
  Flame,
  AlertCircle,
  Bookmark,
  History,
  Sliders,
  Sparkles,
} from 'lucide-react';

const MOVIE_GENRES = [
  { id: 'all', label: 'Todos los Géneros' },
  { id: '28,12', label: '💥 Acción y Aventura' },
  { id: '878', label: '🚀 Ciencia Ficción' },
  { id: '27,53', label: '👻 Terror y Suspenso' },
  { id: '35', label: '😂 Comedia' },
  { id: '18', label: '🎭 Drama' },
  { id: '80,9648', label: '🕵️ Crimen y Misterio' },
  { id: '16', label: '🎨 Animación' },
  { id: '14', label: '🐉 Fantasía' },
  { id: '10749', label: '❤️ Romance' },
];

const SERIES_GENRES = [
  { id: 'all', label: 'Todas las Categorías' },
  { id: '10759', label: '⚔️ Acción y Aventura' },
  { id: '10765', label: '🛸 Sci-Fi y Fantasía' },
  { id: '80,9648', label: '🔍 Crimen y Misterio' },
  { id: '18', label: '🎭 Drama de Prestigio' },
  { id: '35', label: '😂 Comedia / Sitcoms' },
  { id: '16', label: '📺 Animación y Cartoons' },
];

const DECADE_FILTERS = [
  { id: 'all', label: 'Todas las Épocas' },
  { id: '2020s', label: '🔥 Actuales (2020–2026)' },
  { id: '2010s', label: '🎬 Años 2010s' },
  { id: '2000s', label: '📀 Años 2000s' },
  { id: '1990s', label: '📼 Años 90s (Hace 30 años)' },
  { id: '1980s', label: '🕹️ Años 80s (Retro Cult)' },
  { id: '1970s', label: '🏛️ Clásicos 70s y Oro' },
];

const TV_NETWORKS = [
  { id: 'all', label: 'Todas las Cadenas' },
  { id: '213', label: 'Netflix Originals' },
  { id: '49', label: 'HBO' },
  { id: '2739', label: 'Disney+' },
  { id: '56', label: 'Cartoon Network' },
  { id: '13', label: 'Nickelodeon' },
  { id: '19', label: 'FOX' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState('home');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

  const {
    continueWatching,
    watchlist,
    preferredLanguage,
    setPreferredLanguage,
    currentLanguageObj,
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
  const [loadingCatalog, setLoadingCatalog] = useState(true);

  // Filtros interactivos en Películas, Series y Clásicos
  const [selectedGenre, setSelectedGenre] = useState('all');
  const [selectedDecade, setSelectedDecade] = useState('all');
  const [selectedNetwork, setSelectedNetwork] = useState('all');
  const [filteredItems, setFilteredItems] = useState([]);
  const [loadingFilter, setLoadingFilter] = useState(false);

  // Hubs de Plataformas
  const [activeHub, setActiveHub] = useState(null);
  const [hubCatalog, setHubCatalog] = useState([]);
  const [loadingHub, setLoadingHub] = useState(false);

  // Modales
  const [detailItem, setDetailItem] = useState(null);
  const [playerConfig, setPlayerConfig] = useState(null);

  const tmdbLang = currentLanguageObj?.tmdbLang || 'es-MX';

  const loadCatalogs = useCallback(async () => {
    setLoadingCatalog(true);
    try {
      const [trendRes, nowRes, popMovRes, popSerRes, topRes, animeRes, movSecRes, serSecRes] =
        await Promise.allSettled([
          api.getTrending('all', 1, tmdbLang),
          api.getNowPlaying(1, tmdbLang),
          api.getPopularMovies(1, tmdbLang),
          api.getPopularSeries(1, tmdbLang),
          api.getTopRated(1, tmdbLang),
          api.getAnime(1, tmdbLang),
          api.getMovieSections(tmdbLang),
          api.getSeriesSections(tmdbLang),
        ]);

      if (trendRes.status === 'fulfilled' && trendRes.value?.length > 0) setTrending(trendRes.value);
      if (nowRes.status === 'fulfilled' && nowRes.value?.length > 0) setNowPlaying(nowRes.value);
      if (popMovRes.status === 'fulfilled' && popMovRes.value?.length > 0) setPopularMovies(popMovRes.value);
      if (popSerRes.status === 'fulfilled' && popSerRes.value?.length > 0) setPopularSeries(popSerRes.value);
      if (topRes.status === 'fulfilled' && topRes.value?.length > 0) setTopRated(topRes.value);
      if (animeRes.status === 'fulfilled' && animeRes.value?.length > 0) setAnimeCatalog(animeRes.value);
      if (movSecRes.status === 'fulfilled' && movSecRes.value) setMovieSections(movSecRes.value);
      if (serSecRes.status === 'fulfilled' && serSecRes.value) setSeriesSections(serSecRes.value);
    } catch (err) {
      console.error('Error cargando catálogos:', err);
    } finally {
      setLoadingCatalog(false);
    }
  }, [tmdbLang]);

  useEffect(() => {
    loadCatalogs();
  }, [loadCatalogs]);

  // Cargar resultados del explorador cuando el usuario filtra por Género, Década o Cadena
  useEffect(() => {
    const isFilterActive =
      selectedGenre !== 'all' || selectedDecade !== 'all' || selectedNetwork !== 'all';

    if (!isFilterActive && activeTab !== 'classics') {
      setFilteredItems([]);
      return;
    }

    let isMounted = true;
    setLoadingFilter(true);

    const type = activeTab === 'series' ? 'tv' : 'movie';
    const targetDecade =
      activeTab === 'classics' && selectedDecade === 'all' ? 'classic' : selectedDecade;

    api
      .discoverCatalog({
        type,
        genre: selectedGenre,
        decade: targetDecade,
        network: selectedNetwork,
        sortBy: targetDecade === 'classic' ? 'vote_count.desc' : 'popularity.desc',
        lang: tmdbLang,
      })
      .then((res) => {
        if (isMounted) {
          setFilteredItems(res || []);
          setLoadingFilter(false);
        }
      })
      .catch(() => {
        if (isMounted) setLoadingFilter(false);
      });

    return () => {
      isMounted = false;
    };
  }, [activeTab, selectedGenre, selectedDecade, selectedNetwork, tmdbLang]);

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
      if (activeTab === 'search') setActiveTab('home');
      return;
    }

    setActiveTab('search');
    setSearching(true);
    try {
      const results = await api.searchMulti(query, 1, tmdbLang);
      const filtered = (results || []).filter(
        (i) => (i.media_type === 'movie' || i.media_type === 'tv') && (i.poster_path || i.poster_url)
      );
      setSearchResults(filtered);
    } catch (err) {
      console.error('Error en búsqueda:', err);
    } finally {
      setSearching(false);
    }
  };

  /**
   * Lanzar reproductor inteligente con soporte automático para Continuar Viendo:
   * Si `explicitTime` no fue pasado o es 0, verifica automáticamente si existe progreso guardado
   * en `continueWatching` para ese título/episodio y reanuda desde ese segundo exacto.
   */
  const handlePlay = (
    item,
    season = null,
    episode = null,
    explicitTime = null,
    language = preferredLanguage
  ) => {
    if (!item) return;
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

  // Botón "¿Qué veo hoy? (Sorpréndeme)"
  const handleSurpriseMe = () => {
    const pool = [...trending, ...popularMovies, ...popularSeries, ...(seriesSections.classics90s || [])];
    if (pool.length === 0) return;
    const randomItem = pool[Math.floor(Math.random() * pool.length)];
    setDetailItem(randomItem);
  };

  const heroItem = trending.length > 0 ? trending[0] : null;
  const hasActiveFilters =
    selectedGenre !== 'all' || selectedDecade !== 'all' || selectedNetwork !== 'all';

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white flex flex-col font-netflix select-none">
      <Navbar
        activeTab={activeTab}
        setActiveTab={(tab) => {
          setActiveTab(tab);
          setActiveHub(null);
          setSelectedGenre('all');
          setSelectedDecade('all');
          setSelectedNetwork('all');
        }}
        onSearch={handleSearch}
        searchQuery={searchQuery}
        watchlistCount={watchlist.length}
        preferredLanguage={preferredLanguage}
        onChangeLanguage={setPreferredLanguage}
        onSurpriseMe={handleSurpriseMe}
      />

      <main className="flex-1 pb-20">
        {activeTab === 'live_tv' ? (
          <div className="pt-20 sm:pt-24">
            <LiveTV />
          </div>
        ) : activeTab === 'watchlist' ? (
          <div className="pt-24 sm:pt-28 px-4 sm:px-8 lg:px-12 max-w-[1480px] mx-auto">
            <h1 className="text-3xl font-black mb-2 flex items-center gap-3">
              <Bookmark className="w-8 h-8 text-amber-400" />
              <span>Mi Lista</span>
            </h1>
            <p className="text-xs text-neutral-400 mb-6">
              Títulos guardados para reproducir al instante en {currentLanguageObj.label}.
            </p>

            {watchlist.length === 0 ? (
              <div className="py-24 text-center text-neutral-400 space-y-3 bg-neutral-900/30 rounded-2xl border border-white/[0.06]">
                <Bookmark className="w-12 h-12 mx-auto text-neutral-600" />
                <p className="text-base font-bold text-neutral-200">Tu lista está vacía.</p>
                <p className="text-xs text-neutral-500">
                  Haz clic en "Mi Lista" en cualquier película, serie o clásico para guardarla aquí.
                </p>
              </div>
            ) : (
              <MediaGrid
                items={watchlist}
                onSelectDetails={setDetailItem}
                onPlay={handlePlay}
                onToggleWatchlist={toggleWatchlist}
                isSavedInWatchlist={isInWatchlist}
                getSavedEntry={getSavedEntry}
                preferredLanguage={preferredLanguage}
              />
            )}
          </div>
        ) : activeTab === 'classics' ? (
          /* PESTAÑA ESPECIAL: BÓVEDA DE CLÁSICOS (HACE 30, 40 Y 50 AÑOS: 70s, 80s, 90s y 2000s) */
          <div className="pt-24 sm:pt-28 pb-16">
            <div className="px-4 sm:px-8 lg:px-12 max-w-[1480px] mx-auto mb-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-amber-950/35 via-neutral-900/60 to-transparent p-6 rounded-2xl border border-amber-500/20">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-700 flex items-center justify-center shadow-lg shadow-amber-950/50 shrink-0">
                    <History className="w-6 h-6 text-black" />
                  </div>
                  <div>
                    <h1 className="text-2xl sm:text-3xl font-black text-white flex items-center gap-2.5">
                      <span>Bóveda Retro & Clásicos de Culto</span>
                      <span className="px-2.5 py-0.5 bg-amber-500 text-black font-black text-[10px] rounded-full uppercase">
                        70s • 80s • 90s • 2000s
                      </span>
                    </h1>
                    <p className="text-xs text-neutral-300 mt-1">
                      Series y películas legendarias de hace 20, 30 y 40 años respaldadas por nuestro clúster de 18 espejos Cloud + P2P.
                    </p>
                  </div>
                </div>

                {/* Selector de Década en Clásicos */}
                <div className="flex items-center flex-wrap gap-1.5">
                  {DECADE_FILTERS.filter((d) =>
                    ['all', '1990s', '1980s', '1970s', '2000s'].includes(d.id)
                  ).map((dec) => (
                    <button
                      key={dec.id}
                      onClick={() => setSelectedDecade(dec.id)}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold border transition ${
                        selectedDecade === dec.id
                          ? 'bg-amber-500 text-black border-amber-400 shadow'
                          : 'bg-neutral-900 text-neutral-300 border-white/10 hover:text-white'
                      }`}
                    >
                      {dec.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {selectedDecade !== 'all' ? (
              <MediaGrid
                title={`Explorando Clásicos (${
                  DECADE_FILTERS.find((d) => d.id === selectedDecade)?.label
                })`}
                items={filteredItems}
                isLoading={loadingFilter}
                onSelectDetails={setDetailItem}
                onPlay={handlePlay}
                onToggleWatchlist={toggleWatchlist}
                isSavedInWatchlist={isInWatchlist}
                getSavedEntry={getSavedEntry}
                preferredLanguage={preferredLanguage}
              />
            ) : (
              <>
                <MediaGrid
                  title="Series Legendarias de los Años 90 (Hace 30 Años)"
                  subtitle="Iconos de la televisión de 1990 a 1999 con temporadas completas"
                  items={seriesSections.classics90s || []}
                  isLoading={loadingCatalog}
                  onSelectDetails={setDetailItem}
                  onPlay={handlePlay}
                  isRow={true}
                  onToggleWatchlist={toggleWatchlist}
                  isSavedInWatchlist={isInWatchlist}
                  getSavedEntry={getSavedEntry}
                  preferredLanguage={preferredLanguage}
                />

                <MediaGrid
                  title="Cine Inmortal de los Años 90"
                  subtitle="Obras maestras de los 90s en 1080p y 4K"
                  items={movieSections.classics90s || []}
                  isLoading={loadingCatalog}
                  onSelectDetails={setDetailItem}
                  onPlay={handlePlay}
                  isRow={true}
                  onToggleWatchlist={toggleWatchlist}
                  isSavedInWatchlist={isInWatchlist}
                  getSavedEntry={getSavedEntry}
                  preferredLanguage={preferredLanguage}
                />

                <MediaGrid
                  title="Series Retro de los Años 80 (Culto & Nostalgia)"
                  subtitle="Clásicos de 1980 a 1989"
                  items={seriesSections.retro80s || []}
                  isLoading={loadingCatalog}
                  onSelectDetails={setDetailItem}
                  onPlay={handlePlay}
                  isRow={true}
                  onToggleWatchlist={toggleWatchlist}
                  isSavedInWatchlist={isInWatchlist}
                  getSavedEntry={getSavedEntry}
                  preferredLanguage={preferredLanguage}
                />

                <MediaGrid
                  title="Joyas Mejor Valoradas de Todos los Tiempos"
                  items={topRated}
                  isLoading={loadingCatalog}
                  onSelectDetails={setDetailItem}
                  onPlay={handlePlay}
                  isRow={true}
                  onToggleWatchlist={toggleWatchlist}
                  isSavedInWatchlist={isInWatchlist}
                  getSavedEntry={getSavedEntry}
                  preferredLanguage={preferredLanguage}
                />
              </>
            )}
          </div>
        ) : activeTab === 'anime' ? (
          <div className="pt-24 sm:pt-28 pb-16">
            <div className="px-4 sm:px-8 lg:px-12 max-w-[1480px] mx-auto mb-4">
              <div className="flex items-center gap-3">
                <span className="w-11 h-11 rounded-xl bg-gradient-to-tr from-[#d4560a] to-[#F47521] flex items-center justify-center shadow-lg shadow-orange-950/50">
                  <Flame className="w-6 h-6 text-white fill-current" />
                </span>
                <div>
                  <h1 className="text-3xl font-black text-white flex items-center gap-2">
                    <span>Anime Simulcast & Clásicos</span>
                    <span className="px-2 py-0.5 bg-[#F47521] text-black font-black text-xs rounded uppercase">
                      Crunchyroll Hub
                    </span>
                  </h1>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    Audio Japonés con Subtítulos en Español y Doblaje Latino disponible.
                  </p>
                </div>
              </div>
            </div>

            <MediaGrid
              title="Top 10 Anime Más Visto"
              items={animeCatalog}
              isLoading={loadingCatalog}
              onRetry={loadCatalogs}
              onSelectDetails={setDetailItem}
              onPlay={handlePlay}
              isTop10={true}
              onToggleWatchlist={toggleWatchlist}
              isSavedInWatchlist={isInWatchlist}
              getSavedEntry={getSavedEntry}
              preferredLanguage={preferredLanguage}
            />

            <MediaGrid
              title="Catálogo Completo de Anime"
              items={animeCatalog}
              isLoading={loadingCatalog}
              onRetry={loadCatalogs}
              onSelectDetails={setDetailItem}
              onPlay={handlePlay}
              onToggleWatchlist={toggleWatchlist}
              isSavedInWatchlist={isInWatchlist}
              getSavedEntry={getSavedEntry}
              preferredLanguage={preferredLanguage}
            />
          </div>
        ) : activeTab === 'search' ? (
          <div className="pt-24 sm:pt-28 px-4 sm:px-8 lg:px-12 max-w-[1480px] mx-auto">
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
                onSelectDetails={setDetailItem}
                onPlay={handlePlay}
                onToggleWatchlist={toggleWatchlist}
                isSavedInWatchlist={isInWatchlist}
                getSavedEntry={getSavedEntry}
                preferredLanguage={preferredLanguage}
              />
            )}
          </div>
        ) : activeTab === 'movies' ? (
          /* PESTAÑA: PELÍCULAS CON EXPLORADOR DE GÉNEROS Y DÉCADAS */
          <div className="pt-24 sm:pt-28 pb-16">
            <div className="px-4 sm:px-8 lg:px-12 max-w-[1480px] mx-auto mb-4 space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h1 className="text-3xl font-black text-white flex items-center gap-3">
                    <Film className="w-8 h-8 text-[#E50914]" />
                    <span>Cine & Películas</span>
                  </h1>
                  <p className="text-xs text-neutral-400 mt-1">
                    Explora por género o viaja en el tiempo desde los años 70s/80s/90s hasta los estrenos actuales.
                  </p>
                </div>

                {/* Selector de Época / Década */}
                <div className="flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-[#E50914]" />
                  <select
                    value={selectedDecade}
                    onChange={(e) => setSelectedDecade(e.target.value)}
                    className="bg-neutral-900 text-white border border-white/15 rounded-full px-4 py-2 text-xs font-bold focus:outline-none focus:border-[#E50914] cursor-pointer"
                  >
                    {DECADE_FILTERS.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Barra de Píldoras de Géneros de Películas */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-2 no-scrollbar">
                {MOVIE_GENRES.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => setSelectedGenre(g.id)}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition border ${
                      selectedGenre === g.id
                        ? 'bg-[#E50914] text-white border-red-400 shadow-lg shadow-red-950/40'
                        : 'bg-[#161616] hover:bg-neutral-800 text-neutral-300 border-white/[0.08]'
                    }`}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            </div>

            {hasActiveFilters ? (
              <MediaGrid
                title="Resultados del Explorador de Películas"
                items={filteredItems}
                isLoading={loadingFilter}
                onRetry={() => {
                  setSelectedGenre('all');
                  setSelectedDecade('all');
                }}
                onSelectDetails={setDetailItem}
                onPlay={handlePlay}
                onToggleWatchlist={toggleWatchlist}
                isSavedInWatchlist={isInWatchlist}
                getSavedEntry={getSavedEntry}
                preferredLanguage={preferredLanguage}
              />
            ) : (
              <>
                <MediaGrid
                  title="Top 10 Películas Hoy"
                  items={nowPlaying}
                  isLoading={loadingCatalog}
                  onSelectDetails={setDetailItem}
                  onPlay={handlePlay}
                  isTop10={true}
                  onToggleWatchlist={toggleWatchlist}
                  isSavedInWatchlist={isInWatchlist}
                  getSavedEntry={getSavedEntry}
                  preferredLanguage={preferredLanguage}
                />
                <MediaGrid
                  title="Acción y Adrenalina Pura"
                  items={movieSections.action || popularMovies}
                  isLoading={loadingCatalog}
                  onSelectDetails={setDetailItem}
                  onPlay={handlePlay}
                  isRow={true}
                  onToggleWatchlist={toggleWatchlist}
                  isSavedInWatchlist={isInWatchlist}
                  getSavedEntry={getSavedEntry}
                  preferredLanguage={preferredLanguage}
                />
                <MediaGrid
                  title="Ciencia Ficción y Futuros Distópicos"
                  items={movieSections.scifi || []}
                  isLoading={loadingCatalog}
                  onSelectDetails={setDetailItem}
                  onPlay={handlePlay}
                  isRow={true}
                  onToggleWatchlist={toggleWatchlist}
                  isSavedInWatchlist={isInWatchlist}
                  getSavedEntry={getSavedEntry}
                  preferredLanguage={preferredLanguage}
                />
                <MediaGrid
                  title="Clásicos Inmortales de los Años 90"
                  items={movieSections.classics90s || []}
                  isLoading={loadingCatalog}
                  onSelectDetails={setDetailItem}
                  onPlay={handlePlay}
                  isRow={true}
                  onToggleWatchlist={toggleWatchlist}
                  isSavedInWatchlist={isInWatchlist}
                  getSavedEntry={getSavedEntry}
                  preferredLanguage={preferredLanguage}
                />
                <MediaGrid
                  title="Terror y Suspenso Psicológico"
                  items={movieSections.horror || []}
                  isLoading={loadingCatalog}
                  onSelectDetails={setDetailItem}
                  onPlay={handlePlay}
                  isRow={true}
                  onToggleWatchlist={toggleWatchlist}
                  isSavedInWatchlist={isInWatchlist}
                  getSavedEntry={getSavedEntry}
                  preferredLanguage={preferredLanguage}
                />
                <MediaGrid
                  title="Comedia y Entretenimiento"
                  items={movieSections.comedy || []}
                  isLoading={loadingCatalog}
                  onSelectDetails={setDetailItem}
                  onPlay={handlePlay}
                  isRow={true}
                  onToggleWatchlist={toggleWatchlist}
                  isSavedInWatchlist={isInWatchlist}
                  getSavedEntry={getSavedEntry}
                  preferredLanguage={preferredLanguage}
                />
                <MediaGrid
                  title="Aclamadas por la Crítica"
                  items={topRated}
                  isLoading={loadingCatalog}
                  onSelectDetails={setDetailItem}
                  onPlay={handlePlay}
                  isRow={true}
                  onToggleWatchlist={toggleWatchlist}
                  isSavedInWatchlist={isInWatchlist}
                  getSavedEntry={getSavedEntry}
                  preferredLanguage={preferredLanguage}
                />
              </>
            )}
          </div>
        ) : activeTab === 'series' ? (
          /* PESTAÑA: SERIES DE TV CON EXPLORADOR DE GÉNEROS, DÉCADAS (30+ AÑOS) Y CADENAS DE TV */
          <div className="pt-24 sm:pt-28 pb-16">
            <div className="px-4 sm:px-8 lg:px-12 max-w-[1480px] mx-auto mb-4 space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h1 className="text-3xl font-black text-white flex items-center gap-3">
                    <Tv className="w-8 h-8 text-sky-400" />
                    <span>Series de TV (Actuales & Clásicas)</span>
                  </h1>
                  <p className="text-xs text-neutral-400 mt-1">
                    Desde las series más vistas de hoy hasta clásicos de hace 30 años (80s, 90s y 2000s).
                  </p>
                </div>

                {/* Selectores de Década y Cadena de TV */}
                <div className="flex items-center flex-wrap gap-2">
                  <select
                    value={selectedDecade}
                    onChange={(e) => setSelectedDecade(e.target.value)}
                    className="bg-neutral-900 text-white border border-white/15 rounded-full px-3.5 py-2 text-xs font-bold focus:outline-none focus:border-[#E50914] cursor-pointer"
                  >
                    {DECADE_FILTERS.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.label}
                      </option>
                    ))}
                  </select>

                  <select
                    value={selectedNetwork}
                    onChange={(e) => setSelectedNetwork(e.target.value)}
                    className="bg-neutral-900 text-white border border-white/15 rounded-full px-3.5 py-2 text-xs font-bold focus:outline-none focus:border-[#E50914] cursor-pointer"
                  >
                    {TV_NETWORKS.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Barra de Píldoras de Categorías de Series */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-2 no-scrollbar">
                {SERIES_GENRES.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => setSelectedGenre(g.id)}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition border ${
                      selectedGenre === g.id
                        ? 'bg-[#E50914] text-white border-red-400 shadow-lg shadow-red-950/40'
                        : 'bg-[#161616] hover:bg-neutral-800 text-neutral-300 border-white/[0.08]'
                    }`}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            </div>

            {hasActiveFilters ? (
              <MediaGrid
                title="Resultados del Explorador de Series"
                items={filteredItems}
                isLoading={loadingFilter}
                onRetry={() => {
                  setSelectedGenre('all');
                  setSelectedDecade('all');
                  setSelectedNetwork('all');
                }}
                onSelectDetails={setDetailItem}
                onPlay={handlePlay}
                onToggleWatchlist={toggleWatchlist}
                isSavedInWatchlist={isInWatchlist}
                getSavedEntry={getSavedEntry}
                preferredLanguage={preferredLanguage}
              />
            ) : (
              <>
                <MediaGrid
                  title="Top 10 Series Más Vistas"
                  items={popularSeries}
                  isLoading={loadingCatalog}
                  onSelectDetails={setDetailItem}
                  onPlay={handlePlay}
                  isTop10={true}
                  onToggleWatchlist={toggleWatchlist}
                  isSavedInWatchlist={isInWatchlist}
                  getSavedEntry={getSavedEntry}
                  preferredLanguage={preferredLanguage}
                />
                <MediaGrid
                  title="Series Clásicas de hace 30 Años (Años 90s)"
                  subtitle="Joyas noventeras completas listas para maratonear"
                  items={seriesSections.classics90s || []}
                  isLoading={loadingCatalog}
                  onSelectDetails={setDetailItem}
                  onPlay={handlePlay}
                  isRow={true}
                  onToggleWatchlist={toggleWatchlist}
                  isSavedInWatchlist={isInWatchlist}
                  getSavedEntry={getSavedEntry}
                  preferredLanguage={preferredLanguage}
                />
                <MediaGrid
                  title="Series Retro de los Años 80"
                  subtitle="Iconos de la televisión ochentera"
                  items={seriesSections.retro80s || []}
                  isLoading={loadingCatalog}
                  onSelectDetails={setDetailItem}
                  onPlay={handlePlay}
                  isRow={true}
                  onToggleWatchlist={toggleWatchlist}
                  isSavedInWatchlist={isInWatchlist}
                  getSavedEntry={getSavedEntry}
                  preferredLanguage={preferredLanguage}
                />
                <MediaGrid
                  title="Series Mejor Valoradas de la Historia (IMDb / TMDB)"
                  items={seriesSections.topRated || []}
                  isLoading={loadingCatalog}
                  onSelectDetails={setDetailItem}
                  onPlay={handlePlay}
                  isRow={true}
                  onToggleWatchlist={toggleWatchlist}
                  isSavedInWatchlist={isInWatchlist}
                  getSavedEntry={getSavedEntry}
                  preferredLanguage={preferredLanguage}
                />
                <MediaGrid
                  title="Crimen, Misterio e Investigación"
                  items={seriesSections.crimeMystery || []}
                  isLoading={loadingCatalog}
                  onSelectDetails={setDetailItem}
                  onPlay={handlePlay}
                  isRow={true}
                  onToggleWatchlist={toggleWatchlist}
                  isSavedInWatchlist={isInWatchlist}
                  getSavedEntry={getSavedEntry}
                  preferredLanguage={preferredLanguage}
                />
                <MediaGrid
                  title="Ciencia Ficción, Fantasía y Mundos Paralelos"
                  items={seriesSections.scifiFantasy || []}
                  isLoading={loadingCatalog}
                  onSelectDetails={setDetailItem}
                  onPlay={handlePlay}
                  isRow={true}
                  onToggleWatchlist={toggleWatchlist}
                  isSavedInWatchlist={isInWatchlist}
                  getSavedEntry={getSavedEntry}
                  preferredLanguage={preferredLanguage}
                />
                <MediaGrid
                  title="Animación y Cartoons Legendarios"
                  items={seriesSections.cartoons || []}
                  isLoading={loadingCatalog}
                  onSelectDetails={setDetailItem}
                  onPlay={handlePlay}
                  isRow={true}
                  onToggleWatchlist={toggleWatchlist}
                  isSavedInWatchlist={isInWatchlist}
                  getSavedEntry={getSavedEntry}
                  preferredLanguage={preferredLanguage}
                />
              </>
            )}
          </div>
        ) : (
          /* PESTAÑA: INICIO (HOME MASTERPIECE) */
          <>
            {heroItem ? (
              <HeroBanner
                item={heroItem}
                onPlay={handlePlay}
                onSelectDetails={setDetailItem}
                onToggleWatchlist={toggleWatchlist}
                isSavedInWatchlist={isInWatchlist(heroItem.id)}
                preferredLanguage={preferredLanguage}
                onChangeLanguage={setPreferredLanguage}
              />
            ) : loadingCatalog ? (
              <div className="w-full h-[75vh] netflix-shimmer flex items-center justify-center pt-20">
                <div className="flex flex-col items-center gap-3">
                  <RefreshCw className="w-9 h-9 animate-spin text-[#E50914]" />
                  <span className="text-sm font-bold text-neutral-300 tracking-wide">
                    Cargando experiencia StreamFlix Pro...
                  </span>
                </div>
              </div>
            ) : null}

            <div className={`relative z-20 ${heroItem ? '-mt-14 sm:-mt-20' : 'pt-24 sm:pt-28'}`}>
              <PlatformHubs activeHub={activeHub} onSelectHub={(hub) => setActiveHub(hub)} />
            </div>

            {activeHub && (
              <div className="pt-2 animate-fadeIn">
                <MediaGrid
                  title={`Catálogo Destacado de ${activeHub.name}`}
                  items={hubCatalog}
                  isLoading={loadingHub}
                  onSelectDetails={setDetailItem}
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
                  onSelectDetails={setDetailItem}
                  onPlay={handlePlay}
                  isContinueWatching={true}
                  onRemoveContinueWatching={removeFromContinueWatching}
                  preferredLanguage={preferredLanguage}
                />
              )}

              <MediaGrid
                title="Las 10 más populares en Colombia hoy"
                subtitle="Ranking actualizado con reproducción instantánea Cloud & P2P"
                items={trending}
                isLoading={loadingCatalog}
                onRetry={loadCatalogs}
                onSelectDetails={setDetailItem}
                onPlay={handlePlay}
                isTop10={true}
                onToggleWatchlist={toggleWatchlist}
                isSavedInWatchlist={isInWatchlist}
                getSavedEntry={getSavedEntry}
                preferredLanguage={preferredLanguage}
              />

              <MediaGrid
                title="Tendencias Globales de la Semana"
                items={trending}
                isLoading={loadingCatalog}
                onRetry={loadCatalogs}
                onSelectDetails={setDetailItem}
                onPlay={handlePlay}
                isRow={true}
                onToggleWatchlist={toggleWatchlist}
                isSavedInWatchlist={isInWatchlist}
                getSavedEntry={getSavedEntry}
                preferredLanguage={preferredLanguage}
              />

              <MediaGrid
                title="Series Clásicas de los 90s (Hace 30 Años)"
                items={seriesSections.classics90s || []}
                isLoading={loadingCatalog}
                onSelectDetails={setDetailItem}
                onPlay={handlePlay}
                isRow={true}
                onToggleWatchlist={toggleWatchlist}
                isSavedInWatchlist={isInWatchlist}
                getSavedEntry={getSavedEntry}
                preferredLanguage={preferredLanguage}
              />

              <MediaGrid
                title="Anime Simulcast (Crunchyroll Selection)"
                items={animeCatalog}
                isLoading={loadingCatalog}
                onRetry={loadCatalogs}
                onSelectDetails={setDetailItem}
                onPlay={handlePlay}
                isRow={true}
                onToggleWatchlist={toggleWatchlist}
                isSavedInWatchlist={isInWatchlist}
                getSavedEntry={getSavedEntry}
                preferredLanguage={preferredLanguage}
              />

              <MediaGrid
                title="Estrenos de Cine en Cartelera"
                items={nowPlaying}
                isLoading={loadingCatalog}
                onRetry={loadCatalogs}
                onSelectDetails={setDetailItem}
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
                onSelectDetails={setDetailItem}
                onPlay={handlePlay}
                isRow={true}
                onToggleWatchlist={toggleWatchlist}
                isSavedInWatchlist={isInWatchlist}
                getSavedEntry={getSavedEntry}
                preferredLanguage={preferredLanguage}
              />

              <MediaGrid
                title="Joyas del Cine Mejor Valoradas"
                items={topRated}
                isLoading={loadingCatalog}
                onRetry={loadCatalogs}
                onSelectDetails={setDetailItem}
                onPlay={handlePlay}
                isRow={true}
                onToggleWatchlist={toggleWatchlist}
                isSavedInWatchlist={isInWatchlist}
                getSavedEntry={getSavedEntry}
                preferredLanguage={preferredLanguage}
              />
            </div>
          </>
        )}
      </main>

      <footer className="border-t border-white/[0.07] bg-[#0a0a0a] py-10 px-4 sm:px-8 text-center text-xs text-neutral-500 space-y-3">
        <div className="flex justify-center">
          <BrandLogo size="sm" showSubtitle={false} />
        </div>
        <p className="font-bold text-neutral-300">
          StreamFlix Pro v4.0 — Masterpiece Edition ($0 Costo)
        </p>
        <p>
          Cobertura Universal (Desde clásicos de los 70s/80s/90s hasta estrenos 2026) • 6 Motores Cloud (18 Espejos) + P2P Torrentio • Live TV Studio.
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
          onSelectSimilar={(simItem) => setDetailItem(simItem)}
        />
      )}

      {playerConfig && (
        <SmartPlayer
          item={playerConfig.item}
          season={playerConfig.season}
          episode={playerConfig.episode}
          initialTime={playerConfig.initialTime || 0}
          initialLanguage={playerConfig.language || preferredLanguage}
          onClose={() => setPlayerConfig(null)}
          onSaveProgress={saveProgress}
          onChangeLanguage={setPreferredLanguage}
          onPlayNextEpisode={(nextConfig) => setPlayerConfig(nextConfig)}
        />
      )}
    </div>
  );
}
