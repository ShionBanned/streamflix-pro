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
import DiscoveryRows, { buildGenreRows } from './components/DiscoveryRows.jsx';
import useUserMedia, { computePersonalizedPool } from './hooks/useUserMedia.js';

const SmartPlayer = React.lazy(() => import('./components/SmartPlayer.jsx'));
const LiveTV = React.lazy(() => import('./components/LiveTV.jsx'));
const DownloadsPage = React.lazy(() => import('./components/DownloadsPage.jsx'));
const PremiumAccess = React.lazy(() => import('./components/PremiumAccess.jsx'));
import {
  Film,
  Tv,
  RefreshCw,
  Flame,
  AlertCircle,
  Bookmark,
  Layers,
} from 'lucide-react';

// Géneros personalizados estilo Netflix para PELÍCULAS (con integración pasiva de clásicos en cada género)
const MOVIE_GENRES = [
  {
    id: 'all',
    value: 'all',
    label: 'Todos los Géneros',
    icon: '🎬',
    description: 'Vista completa con todas las filas de cine y taquilla',
  },
  {
    id: '28',
    value: '28',
    label: 'Acción y Adrenalina',
    icon: '💥',
    badge: 'TOP',
    description: 'Blockbusters explosivos, artes marciales y persecuciones',
  },
  {
    id: '12',
    value: '12',
    label: 'Aventura Épica',
    icon: '🗺️',
    description: 'Viajes extraordinarios, supervivencia y mundos perdidos',
  },
  {
    id: '878',
    value: '878',
    label: 'Ciencia Ficción y Cyberpunk',
    icon: '🚀',
    badge: 'SCI-FI',
    description: 'Viajes espaciales, IA, futuros distópicos y multiversos',
  },
  {
    id: '27',
    value: '27',
    label: 'Terror y Sobrenatural',
    icon: '👻',
    description: 'Horror psicológico, posesiones y slashers de culto',
  },
  {
    id: '53',
    value: '53',
    label: 'Suspenso y Thrillers',
    icon: '🕵️',
    description: 'Giros inesperados, tensión al límite y misterio',
  },
  {
    id: '35',
    value: '35',
    label: 'Comedia',
    icon: '😂',
    description: 'Humor irreverente, comedias románticas y sátira',
  },
  {
    id: '80',
    value: '80',
    label: 'Crimen, Mafia y Atracos',
    icon: '💼',
    description: 'Gánsteres, robos maestros e investigaciones policiales',
  },
  {
    id: '14',
    value: '14',
    label: 'Fantasía y Mundos Mágicos',
    icon: '🐉',
    description: 'Mitología, hechicería y leyendas épicas',
  },
  {
    id: '18',
    value: '18',
    label: 'Drama y Obras Maestras',
    icon: '🎭',
    badge: 'ÓSCAR',
    description: 'Historias intensas aclamadas por la crítica internacional',
  },
  {
    id: '10749',
    value: '10749',
    label: 'Romance y Pasión',
    icon: '❤️',
    description: 'Historias de amor inolvidables y dramas románticos',
  },
  {
    id: '16',
    value: '16',
    label: 'Animación y Familia',
    icon: '🎨',
    description: 'Grandes producciones animadas para todas las edades',
  },
  {
    id: '9648',
    value: '9648',
    label: 'Misterio y Enigmas',
    icon: '🧩',
    description: 'Casos sin resolver, detectives y acertijos mentales',
  },
  {
    id: '10752',
    value: '10752',
    label: 'Bélico e Historia',
    icon: '⚔️',
    description: 'Grandes batallas históricas y epopeyas basadas en hechos reales',
  },
  { id: '10751', value: '10751', label: 'Cine familiar', icon: '👨‍👩‍👧', description: 'Aventuras y comedias para ver en familia' },
  { id: '99', value: '99', label: 'Documentales', icon: '🎥', description: 'Historias y personas reales' },
  { id: '36', value: '36', label: 'Historia', icon: '🏛️', description: 'Relatos y acontecimientos históricos' },
  { id: '37', value: '37', label: 'Western', icon: '🤠', description: 'Historias del viejo oeste' },
  { id: '10402', value: '10402', label: 'Música y musicales', icon: '🎶', description: 'Conciertos, artistas y musicales' },
  { id: '10770', value: '10770', label: 'Películas para TV', icon: '📺', description: 'Producciones originales para televisión' },
];

// Géneros personalizados estilo Netflix para SERIES
const SERIES_GENRES = [
  {
    id: 'all',
    value: 'all',
    label: 'Todos los Géneros de Series',
    icon: '📺',
    description: 'Todas las categorías de series para maratonear',
  },
  {
    id: '10759',
    value: '10759',
    label: 'Acción, Supervivencia y Aventura',
    icon: '⚔️',
    badge: 'POPULAR',
    description: 'Series de alto impacto, batallas y misiones extremas',
  },
  {
    id: '10765',
    value: '10765',
    label: 'Sci-Fi, Fantasía y Mundos Paralelos',
    icon: '🛸',
    badge: 'SCI-FI',
    description: 'Distopías, superpoderes, magia y futuros alternativos',
  },
  {
    id: '80',
    value: '80',
    label: 'Crimen, Narcos e Investigación',
    icon: '🔍',
    description: 'Detectives, cárteles, forenses y thrillers judiciales',
  },
  {
    id: '9648',
    value: '9648',
    label: 'Misterio y Suspenso Psicológico',
    icon: '🕯️',
    description: 'Secretos oscuros, desapariciones y tramas hipnóticas',
  },
  {
    id: '18',
    value: '18',
    label: 'Drama de Prestigio',
    icon: '🎭',
    badge: 'EMMY',
    description: 'Las series dramáticas más premiadas de la televisión',
  },
  {
    id: '35',
    value: '35',
    label: 'Comedias y Sitcoms Icónicas',
    icon: '😂',
    description: 'Sitcoms legendarias y comedias modernas para reír sin parar',
  },
  {
    id: '16',
    value: '16',
    label: 'Animación Adulta y Cartoons',
    icon: '🎨',
    description: 'Series animadas irreverentes y cartoons inolvidables',
  },
  {
    id: '10768',
    value: '10768',
    label: 'Política, Guerra y Espionaje',
    icon: '♟️',
    description: 'Conspiraciones de estado, agentes secretos y poder',
  },
  {
    id: '10751',
    value: '10751',
    label: 'Series Familiares y Juveniles',
    icon: '🌟',
    description: 'Historias coming-of-age, instituto y aventuras en grupo',
  },
  {
    id: '99',
    value: '99',
    label: 'Docuseries y True Crime',
    icon: '📹',
    description: 'Investigaciones reales, crímenes verídicos y naturaleza',
  },
  { id: '10762', value: '10762', label: 'Series infantiles', icon: '🧸', description: 'Historias para los más pequeños' },
  { id: '10766', value: '10766', label: 'Telenovelas', icon: '💐', description: 'Historias largas y personajes inolvidables' },
  { id: '10767', value: '10767', label: 'Talk shows', icon: '🎙️', description: 'Entrevistas, humor y conversación' },
  { id: '10763', value: '10763', label: 'Actualidad', icon: '📰', description: 'Informativos y programas de actualidad' },
  { id: '37', value: '37', label: 'Western', icon: '🤠', description: 'Series ambientadas en el oeste' },
];

// Géneros personalizados estilo Netflix/Crunchyroll para ANIME
const ANIME_GENRES = [
  {
    id: 'all',
    value: 'all',
    label: 'Todos los Géneros de Anime',
    icon: '🎌',
    description: 'Vista completa con todos los carruseles de Anime y Simulcast',
  },
  {
    id: '16,10759',
    value: '16,10759',
    label: 'Shonen y Batallas Épicas',
    icon: '⚔️',
    badge: 'SHONEN',
    description: 'Combates legendarios, poderes sobrenaturales y torneos',
  },
  {
    id: '16,10765',
    value: '16,10765',
    label: 'Isekai, Magia y Mundos de Fantasía',
    icon: '🔮',
    badge: 'ISEKAI',
    description: 'Reencarnaciones en mundos RPG, demonios y hechicería',
  },
  {
    id: '16,9648',
    value: '16,9648',
    label: 'Seinen y Misterio Psicológico',
    icon: '🧠',
    badge: 'SEINEN',
    description: 'Tramas oscuras, juegos mentales y suspenso adulto',
  },
  {
    id: '16,35',
    value: '16,35',
    label: 'Comedia Escolar y Slice of Life',
    icon: '🌸',
    description: 'Humor japonés, vida cotidiana y clubes estudiantiles',
  },
  {
    id: '16,10749',
    value: '16,10749',
    label: 'Romance y Drama (Shojo / RomCom)',
    icon: '💖',
    description: 'Historias de amor, triángulos amorosos y emoción pura',
  },
  {
    id: '16,80',
    value: '16,80',
    label: 'Cyberpunk, Crimen y Acción Oscura',
    icon: '🌃',
    description: 'Futuros distópicos, mercenarios y organizaciones secretas',
  },
  {
    id: '16,18',
    value: '16,18',
    label: 'Drama Épico e Histórico',
    icon: '🏯',
    description: 'Samuráis, guerra, superación y relatos conmovedores',
  },
  { id: '16,10751', value: '16,10751', label: 'Anime para toda la familia', icon: '🌈', description: 'Aventuras animadas para disfrutar juntos' },
  { id: '16,12', value: '16,12', label: 'Viajes y aventuras', icon: '🗺️', description: 'Mundos por descubrir y grandes viajes' },
  { id: '16,99', value: '16,99', label: 'Documental animado', icon: '🎞️', description: 'Historias reales contadas con animación' },
];

const SORT_OPTIONS = [
  { id: 'popularity.desc', value: 'popularity.desc', label: 'Tendencias y Más Populares', icon: '🔥' },
  { id: 'vote_count.desc', value: 'vote_count.desc', label: 'Más Aclamados de Todos los Tiempos', icon: '🏆' },
  { id: 'vote_average.desc', value: 'vote_average.desc', label: 'Mejor Calificados (IMDb/TMDB)', icon: '⭐' },
];

const TV_NETWORKS = [
  { id: 'all', value: 'all', label: 'Todas las Cadenas', icon: '📺' },
  { id: '213', value: '213', label: 'Netflix Originals', icon: '🔴', badge: 'TOP' },
  { id: '49', value: '49', label: 'HBO / Max', icon: '🎭' },
  { id: '2739', value: '2739', label: 'Disney+', icon: '✨' },
  { id: '1024', value: '1024', label: 'Prime Video', icon: '💠' },
  { id: '2552', value: '2552', label: 'Apple TV+', icon: '🍎' },
];

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

class PlayerErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error('[PlayerErrorBoundary] Error atrapado en SmartPlayer:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 z-50 bg-[#0a0a0a] flex flex-col items-center justify-center p-6 text-white text-center space-y-4">
          <div className="w-14 h-14 rounded-full bg-red-600/20 border border-red-500/40 flex items-center justify-center text-red-500 text-2xl font-bold">
            !
          </div>
          <h2 className="text-xl font-bold">Interrupción inesperada de reproducción</h2>
          <p className="text-sm text-neutral-400 max-w-md">
            {this.state.error?.message || 'Ocurrió un problema durante la reproducción.'}
          </p>
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="px-5 py-2.5 bg-[#E50914] text-white rounded-lg text-sm font-bold hover:bg-red-700 transition"
            >
              Reintentar reproducción
            </button>
            <button
              onClick={this.props.onClose}
              className="px-5 py-2.5 bg-white/10 text-white rounded-lg text-sm font-bold hover:bg-white/20 transition"
            >
              Cerrar reproductor
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
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
        ) : activeTab === 'premium' ? (
          <React.Suspense fallback={<p className="pt-28 text-center text-neutral-400">Cargando proveedores…</p>}><PremiumAccess onOpenLiveTv={() => setActiveTab('live_tv')} /></React.Suspense>
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
