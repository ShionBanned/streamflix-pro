import React, { useState, useEffect, useCallback } from 'react';
import api from './services/api.js';
import Navbar from './components/Navbar.jsx';
import HeroBanner from './components/HeroBanner.jsx';
import PlatformHubs from './components/PlatformHubs.jsx';
import MediaGrid from './components/MediaGrid.jsx';
import DetailModal from './components/DetailModal.jsx';
import SmartPlayer from './components/SmartPlayer.jsx';
import LiveTV from './components/LiveTV.jsx';
import useUserMedia from './hooks/useUserMedia.js';
import { Film, Tv, Radio, Sparkles, RefreshCw, Flame, AlertCircle, Bookmark } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState('home'); // 'home' | 'movies' | 'series' | 'anime' | 'live_tv' | 'watchlist' | 'search'
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

  // Hook de Calidad de Vida (Continuar Viendo y Mi Lista)
  const {
    continueWatching,
    watchlist,
    saveProgress,
    removeFromContinueWatching,
    toggleWatchlist,
    isInWatchlist,
  } = useUserMedia();

  // Catálogos cargados de la API local
  const [trending, setTrending] = useState([]);
  const [nowPlaying, setNowPlaying] = useState([]);
  const [popularMovies, setPopularMovies] = useState([]);
  const [popularSeries, setPopularSeries] = useState([]);
  const [topRated, setTopRated] = useState([]);
  const [animeCatalog, setAnimeCatalog] = useState([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);

  // Hubs de Plataformas
  const [activeHub, setActiveHub] = useState(null);
  const [hubCatalog, setHubCatalog] = useState([]);
  const [loadingHub, setLoadingHub] = useState(false);

  // Estados modales
  const [detailItem, setDetailItem] = useState(null);
  const [playerConfig, setPlayerConfig] = useState(null); // { item, season, episode, initialTime }

  // 1. Cargar catálogos principales al iniciar con resiliencia Promise.allSettled
  const loadCatalogs = useCallback(async () => {
    setLoadingCatalog(true);
    try {
      const [trendRes, nowRes, popMovRes, popSerRes, topRes, animeRes] = await Promise.allSettled([
        api.getTrending(),
        api.getNowPlaying(),
        api.getPopularMovies(),
        api.getPopularSeries(),
        api.getTopRated(),
        api.getAnime(),
      ]);

      if (trendRes.status === 'fulfilled' && Array.isArray(trendRes.value) && trendRes.value.length > 0) {
        setTrending(trendRes.value);
      }
      if (nowRes.status === 'fulfilled' && Array.isArray(nowRes.value) && nowRes.value.length > 0) {
        setNowPlaying(nowRes.value);
      }
      if (popMovRes.status === 'fulfilled' && Array.isArray(popMovRes.value) && popMovRes.value.length > 0) {
        setPopularMovies(popMovRes.value);
      }
      if (popSerRes.status === 'fulfilled' && Array.isArray(popSerRes.value) && popSerRes.value.length > 0) {
        setPopularSeries(popSerRes.value);
      }
      if (topRes.status === 'fulfilled' && Array.isArray(topRes.value) && topRes.value.length > 0) {
        setTopRated(topRes.value);
      }
      if (animeRes.status === 'fulfilled' && Array.isArray(animeRes.value) && animeRes.value.length > 0) {
        setAnimeCatalog(animeRes.value);
      }
    } catch (err) {
      console.error('Error cargando catálogos:', err);
    } finally {
      setLoadingCatalog(false);
    }
  }, []);

  useEffect(() => {
    loadCatalogs();
  }, [loadCatalogs]);

  // 2. Carga bajo demanda al cambiar de pestaña si los datos aún no están presentes
  useEffect(() => {
    if (activeTab === 'movies' && nowPlaying.length === 0 && popularMovies.length === 0) {
      setLoadingCatalog(true);
      Promise.allSettled([api.getNowPlaying(), api.getPopularMovies(), api.getTopRated()])
        .then(([now, pop, top]) => {
          if (now.status === 'fulfilled' && now.value?.length) setNowPlaying(now.value);
          if (pop.status === 'fulfilled' && pop.value?.length) setPopularMovies(pop.value);
          if (top.status === 'fulfilled' && top.value?.length) setTopRated(top.value);
        })
        .finally(() => setLoadingCatalog(false));
    } else if (activeTab === 'series' && popularSeries.length === 0) {
      setLoadingCatalog(true);
      Promise.allSettled([api.getPopularSeries(), api.getTrending('tv')])
        .then(([pop, trend]) => {
          if (pop.status === 'fulfilled' && pop.value?.length) setPopularSeries(pop.value);
          if (trend.status === 'fulfilled' && trend.value?.length) setTrending(trend.value);
        })
        .finally(() => setLoadingCatalog(false));
    } else if (activeTab === 'anime' && animeCatalog.length === 0) {
      setLoadingCatalog(true);
      api.getAnime()
        .then((items) => {
          if (items && items.length) setAnimeCatalog(items);
        })
        .finally(() => setLoadingCatalog(false));
    }
  }, [activeTab, nowPlaying.length, popularMovies.length, popularSeries.length, animeCatalog.length]);

  // 3. Cargar catálogo de la plataforma seleccionada en Hubs
  useEffect(() => {
    if (!activeHub) {
      setHubCatalog([]);
      return;
    }

    let isMounted = true;
    setLoadingHub(true);

    api.getByProvider(activeHub.id)
      .then((items) => {
        if (isMounted) {
          setHubCatalog(items || []);
          setLoadingHub(false);
        }
      })
      .catch((e) => {
        console.error('Error cargando catálogo de la plataforma:', e);
        if (isMounted) setLoadingHub(false);
      });

    return () => {
      isMounted = false;
    };
  }, [activeHub]);

  // 4. Búsqueda universal
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
      const results = await api.searchMulti(query);
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

  // Lanzar reproductor inteligente
  const handlePlay = (item, season = null, episode = null, initialTime = 0) => {
    setPlayerConfig({ item, season, episode, initialTime });
  };

  const heroItem = trending.length > 0 ? trending[0] : null;

  return (
    <div className="min-h-screen bg-[#141414] text-white flex flex-col font-netflix select-none">
      {/* Top Navigation */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={(tab) => {
          setActiveTab(tab);
          setActiveHub(null); // Resetear hub al cambiar de pestaña
        }}
        onSearch={handleSearch}
        searchQuery={searchQuery}
        watchlistCount={watchlist.length}
      />

      {/* Main Content Area */}
      <main className="flex-1 pb-20">
        {activeTab === 'live_tv' ? (
          /* PESTAÑA: TV EN VIVO (IPTV) */
          <div className="pt-20 sm:pt-24">
            <LiveTV />
          </div>
        ) : activeTab === 'watchlist' ? (
          /* PESTAÑA: MI LISTA */
          <div className="pt-24 sm:pt-28 px-4 sm:px-8 lg:px-12 max-w-7xl mx-auto">
            <h1 className="text-3xl font-black mb-2 flex items-center gap-3">
              <Bookmark className="w-8 h-8 text-amber-400" />
              <span>Mi Lista</span>
            </h1>
            <p className="text-xs text-gray-400 mb-6">
              Títulos que has guardado para ver en cualquier momento.
            </p>

            {watchlist.length === 0 ? (
              <div className="py-24 text-center text-gray-400 space-y-3">
                <Bookmark className="w-12 h-12 mx-auto text-neutral-600" />
                <p className="text-base font-semibold">Tu lista está vacía.</p>
                <p className="text-xs text-gray-500">
                  Haz clic en "+ Mi Lista" en cualquier película, serie o anime para guardarla aquí.
                </p>
              </div>
            ) : (
              <MediaGrid
                items={watchlist}
                onSelectDetails={setDetailItem}
                onPlay={handlePlay}
                onToggleWatchlist={toggleWatchlist}
                isSavedInWatchlist={isInWatchlist}
              />
            )}
          </div>
        ) : activeTab === 'anime' ? (
          /* PESTAÑA: ANIME DEDICADO (CRUNCHYROLL VIBE) */
          <div className="pt-24 sm:pt-28 pb-16">
            <div className="px-4 sm:px-8 lg:px-12 mb-6">
              <div className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#d4560a] to-[#F47521] flex items-center justify-center shadow-lg shadow-orange-950/40">
                  <Flame className="w-6 h-6 text-white fill-current" />
                </span>
                <div>
                  <h1 className="text-3xl font-black text-white flex items-center gap-2">
                    <span>Anime en Emisión y Clásicos</span>
                    <span className="px-2 py-0.5 bg-[#F47521] text-black font-black text-xs rounded uppercase">
                      Crunchyroll
                    </span>
                  </h1>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Episodios con subtítulos oficiales integrados (Erai-raws / SubsPlease) y audio en japonés.
                  </p>
                </div>
              </div>
            </div>

            <MediaGrid
              title="Anime Más Popular"
              items={animeCatalog}
              isLoading={loadingCatalog}
              onRetry={loadCatalogs}
              onSelectDetails={setDetailItem}
              onPlay={handlePlay}
              isRow={true}
              onToggleWatchlist={toggleWatchlist}
              isSavedInWatchlist={isInWatchlist}
            />
          </div>
        ) : activeTab === 'search' ? (
          /* PESTAÑA: RESULTADOS DE BÚSQUEDA */
          <div className="pt-24 sm:pt-28 px-4 sm:px-8 lg:px-12 max-w-7xl mx-auto">
            <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
              <span>Resultados para:</span>
              <span className="text-red-500 font-extrabold italic">"{searchQuery}"</span>
            </h1>

            {searching ? (
              <div className="py-20 flex flex-col items-center justify-center text-gray-400 gap-3">
                <RefreshCw className="w-8 h-8 text-red-500 animate-spin" />
                <span className="text-sm">Buscando en catálogo TMDB...</span>
              </div>
            ) : searchResults.length === 0 ? (
              <div className="py-20 text-center text-gray-400 space-y-2">
                <AlertCircle className="w-12 h-12 mx-auto text-neutral-600" />
                <p className="text-base font-semibold">No se encontraron resultados para tu búsqueda.</p>
                <p className="text-xs text-gray-500">Prueba con otro título o revisa la ortografía.</p>
              </div>
            ) : (
              <MediaGrid
                items={searchResults}
                onSelectDetails={setDetailItem}
                onPlay={handlePlay}
                onToggleWatchlist={toggleWatchlist}
                isSavedInWatchlist={isInWatchlist}
              />
            )}
          </div>
        ) : activeTab === 'movies' ? (
          /* PESTAÑA: PELÍCULAS */
          <div className="pt-24 sm:pt-28 pb-16">
            <div className="px-4 sm:px-8 lg:px-12 mb-6">
              <h1 className="text-3xl font-black text-white flex items-center gap-3">
                <Film className="w-8 h-8 text-red-600" />
                <span>Películas</span>
              </h1>
              <p className="text-xs text-gray-400 mt-1">
                Catálogo de cine mundial con resolución automática en 1080p y 4K.
              </p>
            </div>
            <MediaGrid
              title="En Cartelera y Recientes"
              items={nowPlaying}
              isLoading={loadingCatalog}
              onRetry={loadCatalogs}
              onSelectDetails={setDetailItem}
              onPlay={handlePlay}
              isRow={true}
              onToggleWatchlist={toggleWatchlist}
              isSavedInWatchlist={isInWatchlist}
            />
            <MediaGrid
              title="Películas Populares"
              items={popularMovies}
              isLoading={loadingCatalog}
              onRetry={loadCatalogs}
              onSelectDetails={setDetailItem}
              onPlay={handlePlay}
              isRow={true}
              onToggleWatchlist={toggleWatchlist}
              isSavedInWatchlist={isInWatchlist}
            />
            <MediaGrid
              title="Mejor Valoradas por la Crítica"
              items={topRated}
              isLoading={loadingCatalog}
              onRetry={loadCatalogs}
              onSelectDetails={setDetailItem}
              onPlay={handlePlay}
              isRow={true}
              onToggleWatchlist={toggleWatchlist}
              isSavedInWatchlist={isInWatchlist}
            />
          </div>
        ) : activeTab === 'series' ? (
          /* PESTAÑA: SERIES DE TV */
          <div className="pt-24 sm:pt-28 pb-16">
            <div className="px-4 sm:px-8 lg:px-12 mb-6">
              <h1 className="text-3xl font-black text-white flex items-center gap-3">
                <Tv className="w-8 h-8 text-blue-500" />
                <span>Series y Temporadas</span>
              </h1>
              <p className="text-xs text-gray-400 mt-1">
                Temporadas completas con selección de episodios en español y audio dual.
              </p>
            </div>
            <MediaGrid
              title="Series Populares del Momento"
              items={popularSeries}
              isLoading={loadingCatalog}
              onRetry={loadCatalogs}
              onSelectDetails={setDetailItem}
              onPlay={handlePlay}
              isRow={true}
              onToggleWatchlist={toggleWatchlist}
              isSavedInWatchlist={isInWatchlist}
            />
            <MediaGrid
              title="Tendencias de la Semana"
              items={trending.filter((i) => i.media_type === 'tv' || (!i.title && i.name))}
              isLoading={loadingCatalog}
              onRetry={loadCatalogs}
              onSelectDetails={setDetailItem}
              onPlay={handlePlay}
              isRow={true}
              onToggleWatchlist={toggleWatchlist}
              isSavedInWatchlist={isInWatchlist}
            />
          </div>
        ) : (
          /* PESTAÑA: INICIO (HOME ESTILO NETFLIX CON CONTINUAR VIENDO Y HUBS) */
          <>
            {/* Hero Billboard con Tráiler de YouTube a los 3s */}
            {heroItem ? (
              <HeroBanner
                item={heroItem}
                onPlay={handlePlay}
                onSelectDetails={setDetailItem}
                onToggleWatchlist={toggleWatchlist}
                isSavedInWatchlist={isInWatchlist(heroItem.id)}
              />
            ) : loadingCatalog ? (
              <div className="w-full h-[65vh] bg-neutral-900/40 animate-pulse flex items-center justify-center pt-20">
                <div className="flex flex-col items-center gap-3 text-neutral-600">
                  <RefreshCw className="w-9 h-9 animate-spin text-red-600" />
                  <span className="text-sm font-semibold text-neutral-400 tracking-wide">Cargando catálogo StreamFlix...</span>
                </div>
              </div>
            ) : null}

            {/* Fila de Botones Rápidos (Hubs de Plataformas) */}
            <div className={`relative z-20 ${heroItem ? '-mt-10 sm:-mt-16' : 'pt-24 sm:pt-28'}`}>
              <PlatformHubs
                activeHub={activeHub}
                onSelectHub={(hub) => setActiveHub(hub)}
              />
            </div>

            {/* Si un Hub está activo, mostrar su catálogo de forma prioritaria */}
            {activeHub && (
              <div className="pt-2 animate-fadeIn">
                {loadingHub ? (
                  <div className="py-12 flex flex-col items-center justify-center text-gray-400 gap-2">
                    <RefreshCw className="w-7 h-7 text-red-500 animate-spin" />
                    <span className="text-xs">Cargando catálogo de {activeHub.name}...</span>
                  </div>
                ) : (
                  <MediaGrid
                    title={`Catálogo Original de ${activeHub.name}`}
                    items={hubCatalog}
                    isLoading={loadingHub}
                    onSelectDetails={setDetailItem}
                    onPlay={handlePlay}
                    isRow={true}
                    onToggleWatchlist={toggleWatchlist}
                    isSavedInWatchlist={isInWatchlist}
                  />
                )}
              </div>
            )}

            {/* Content Rows */}
            <div className="relative z-20 space-y-4 pt-2">
              {/* PRIMERA FILA: CONTINUAR VIENDO (CON BARRA ROJA Y REMOVER X) */}
              {continueWatching.length > 0 && (
                <MediaGrid
                  title="Continuar Viendo"
                  items={continueWatching}
                  onSelectDetails={setDetailItem}
                  onPlay={handlePlay}
                  isContinueWatching={true}
                  onRemoveContinueWatching={removeFromContinueWatching}
                />
              )}

              {/* Tendencias */}
              <MediaGrid
                title="Tendencias de la Semana"
                items={trending}
                isLoading={loadingCatalog}
                onRetry={loadCatalogs}
                onSelectDetails={setDetailItem}
                onPlay={handlePlay}
                isRow={true}
                onToggleWatchlist={toggleWatchlist}
                isSavedInWatchlist={isInWatchlist}
              />

              {/* Anime Crunchyroll */}
              <MediaGrid
                title="Anime Destacado (Crunchyroll)"
                items={animeCatalog}
                isLoading={loadingCatalog}
                onRetry={loadCatalogs}
                onSelectDetails={setDetailItem}
                onPlay={handlePlay}
                isRow={true}
                onToggleWatchlist={toggleWatchlist}
                isSavedInWatchlist={isInWatchlist}
              />

              {/* Estrenos */}
              <MediaGrid
                title="Estrenos en Cartelera"
                items={nowPlaying}
                isLoading={loadingCatalog}
                onRetry={loadCatalogs}
                onSelectDetails={setDetailItem}
                onPlay={handlePlay}
                isRow={true}
                onToggleWatchlist={toggleWatchlist}
                isSavedInWatchlist={isInWatchlist}
              />

              {/* Series */}
              <MediaGrid
                title="Series Aclamadas"
                items={popularSeries}
                isLoading={loadingCatalog}
                onRetry={loadCatalogs}
                onSelectDetails={setDetailItem}
                onPlay={handlePlay}
                isRow={true}
                onToggleWatchlist={toggleWatchlist}
                isSavedInWatchlist={isInWatchlist}
              />

              {/* Mejor Valorado */}
              <MediaGrid
                title="Cine Mejor Valorado"
                items={topRated}
                isLoading={loadingCatalog}
                onRetry={loadCatalogs}
                onSelectDetails={setDetailItem}
                onPlay={handlePlay}
                isRow={true}
                onToggleWatchlist={toggleWatchlist}
                isSavedInWatchlist={isInWatchlist}
              />
            </div>
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-neutral-800 py-8 px-4 sm:px-8 text-center text-xs text-gray-500 space-y-2">
        <p className="font-semibold text-gray-400">
          StreamFlix Pro — Plataforma Personal de Streaming Híbrida ($0 Costo)
        </p>
        <p>
          Integración con Torrentio Pro (Trackers Latino & Anime), OpenSubtitles v3, VLC/MPV Launcher & HLS.js.
        </p>
      </footer>

      {/* Detail Modal (Sinopsis, Selección de Temporadas y Episodios) */}
      {detailItem && (
        <DetailModal
          item={detailItem}
          onClose={() => setDetailItem(null)}
          onPlay={(item, season, episode) => {
            setDetailItem(null);
            handlePlay(item, season, episode);
          }}
          onToggleWatchlist={toggleWatchlist}
          isSavedInWatchlist={isInWatchlist}
        />
      )}

      {/* SmartPlayer Pro (P2P Range 206, Selector de Calidades, Sync Subtítulos, Siguiente Episodio) */}
      {playerConfig && (
        <SmartPlayer
          item={playerConfig.item}
          season={playerConfig.season}
          episode={playerConfig.episode}
          initialTime={playerConfig.initialTime || 0}
          onClose={() => setPlayerConfig(null)}
          onSaveProgress={saveProgress}
          onPlayNextEpisode={(nextConfig) => setPlayerConfig(nextConfig)}
        />
      )}
    </div>
  );
}
