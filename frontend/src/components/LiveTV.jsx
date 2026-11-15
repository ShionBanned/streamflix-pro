import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import api from '../services/api.js';
import Hls from 'hls.js';
import {
  Radio,
  Search,
  Tv,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  RefreshCw,
  AlertCircle,
  ExternalLink,
  Star,
  PlusCircle,
  X,
  Trash2,
  Copy,
  Check,
  Globe,
  Sliders,
  ChevronDown,
} from 'lucide-react';

const CATEGORY_TABS = [
  { id: 'Todos', label: 'Todos', icon: '📺' },
  { id: 'Favoritos', label: 'Favoritos', icon: '⭐' },
  { id: 'Pluto TV 24/7', label: 'Pluto TV', icon: '🍿' },
  { id: 'Deportes', label: 'Deportes', icon: '⚽' },
  { id: 'Películas y Series', label: 'Películas & Series', icon: '🎬' },
  { id: 'Noticias', label: 'Noticias', icon: '📰' },
  { id: 'Infantil y Anime', label: 'Infantil & Anime', icon: '🧸' },
  { id: 'Colombia', label: 'Colombia', icon: '🇨🇴' },
  { id: 'México', label: 'México', icon: '🇲🇽' },
  { id: 'Argentina', label: 'Argentina', icon: '🇦🇷' },
  { id: 'España', label: 'España', icon: '🇪🇸' },
  { id: 'Música', label: 'Música', icon: '🎵' },
  { id: 'Entretenimiento', label: 'Entretenimiento', icon: '🎭' },
];

const INITIAL_BATCH_SIZE = 60;
const BATCH_INCREMENT = 60;

export default function LiveTV() {
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filtros
  const [selectedCategory, setSelectedCategory] = useState('Todos');
  const [searchQuery, setSearchQuery] = useState('');
  const [visibleLimit, setVisibleLimit] = useState(INITIAL_BATCH_SIZE);

  // Canal Activo y Reproductor
  const [currentChannel, setCurrentChannel] = useState(null);
  const [playerError, setPlayerError] = useState(false);
  const [usingProxy, setUsingProxy] = useState(true);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [launchMessage, setLaunchMessage] = useState(null);
  const [copiedUrl, setCopiedUrl] = useState(false);

  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const playerContainerRef = useRef(null);

  // Canales Favoritos (guardados en localStorage)
  const [favorites, setFavorites] = useState(() => {
    try {
      const saved = localStorage.getItem('streamflix_iptv_favorites');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Listas personalizadas del usuario (M3U externas y credenciales Xtream Codes)
  const [customSources, setCustomSources] = useState(() => {
    try {
      const saved = localStorage.getItem('streamflix_custom_iptv_sources');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Modal para agregar listas M3U o Xtream Codes
  const [showModal, setShowModal] = useState(false);
  const [modalTab, setModalTab] = useState('m3u'); // 'm3u' | 'xtream'
  const [newM3uUrl, setNewM3uUrl] = useState('');
  const [newM3uName, setNewM3uName] = useState('');
  const [xtreamServer, setXtreamServer] = useState('');
  const [xtreamUser, setXtreamUser] = useState('');
  const [xtreamPass, setXtreamPass] = useState('');

  // 1. Cargar canales de la API con listas agregadas y personalizadas
  const loadChannels = useCallback(
    async (forceRefresh = false) => {
      if (forceRefresh) setRefreshing(true);
      else setLoading(true);

      setPlayerError(false);
      try {
        const customUrls = customSources
          .filter((s) => s.type === 'm3u' && s.url)
          .map((s) => s.url);

        const xtreamSource = customSources.find((s) => s.type === 'xtream');
        const xtream = xtreamSource
          ? {
              server: xtreamSource.server,
              username: xtreamSource.username,
              password: xtreamSource.password,
            }
          : null;

        const data = await api.getIptvChannels({
          refresh: forceRefresh,
          customUrls,
          xtream,
        });

        const list = data?.channels || [];
        setChannels(list);

        // Seleccionar primer canal si no hay ninguno activo
        if (!currentChannel && list.length > 0) {
          // Si hay favoritos, poner el primer favorito
          const firstFav = list.find((c) => favorites.includes(c.url));
          setCurrentChannel(firstFav || list[0]);
        }
      } catch (err) {
        console.error('Error cargando canales IPTV:', err);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [customSources, currentChannel, favorites]
  );

  useEffect(() => {
    loadChannels();
  }, []);

  // 2. Guardar favoritos en localStorage
  const toggleFavorite = (channel, e) => {
    if (e) e.stopPropagation();
    setFavorites((prev) => {
      const exists = prev.includes(channel.url);
      const updated = exists ? prev.filter((u) => u !== channel.url) : [...prev, channel.url];
      try {
        localStorage.setItem('streamflix_iptv_favorites', JSON.stringify(updated));
      } catch (err) {
        console.error('Error guardando favoritos:', err);
      }
      return updated;
    });
  };

  const isFavorite = (channel) => {
    return channel ? favorites.includes(channel.url) : false;
  };

  // 3. Inicializar / Reproducir con HLS.js
  useEffect(() => {
    if (!currentChannel || !videoRef.current) return;

    setPlayerError(false);
    const video = videoRef.current;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const streamTarget = usingProxy
      ? `/api/iptv/proxy?url=${encodeURIComponent(currentChannel.url)}`
      : currentChannel.url;

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 30,
        manifestLoadingTimeOut: 15000,
        levelLoadingTimeOut: 15000,
        fragLoadingTimeOut: 20000,
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
      });

      hls.loadSource(streamTarget);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setIsPlaying(true);
        video.play().catch(() => {
          // Autoplay silenciado si el navegador bloquea audio inicial
          video.muted = true;
          setIsMuted(true);
          video.play().catch(() => {});
        });
      });

      hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          console.warn('[HLS.js Fatal Error]:', data.type, data.details);
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              // Probar primero con el proxy anti-CORS local
              if (!usingProxy) {
                console.log('Fallo de red/CORS directo. Intentando proxy anti-CORS...');
                setUsingProxy(true);
              } else {
                setPlayerError(true);
                hls.destroy();
              }
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError();
              break;
            default:
              setPlayerError(true);
              hls.destroy();
              break;
          }
        }
      });

      hlsRef.current = hls;
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari iOS/macOS
      video.src = streamTarget;
      video.addEventListener('loadedmetadata', () => {
        video.play().catch(() => {});
      });
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [currentChannel, usingProxy]);

  // Selección de canal
  const handleSelectChannel = (channel) => {
    setUsingProxy(true);
    setPlayerError(false);
    setCurrentChannel(channel);
  };

  // Lanzar en VLC Media Player
  const handleLaunchVLC = async () => {
    if (!currentChannel) return;

    setLaunchMessage({
      type: 'info',
      text: 'Iniciando VLC Media Player con stream directo...',
    });

    try {
      const res = await api.launchExternalPlayer({
        player: 'vlc',
        streamUrl: currentChannel.url,
        title: currentChannel.name,
      });

      if (res.success) {
        setLaunchMessage({
          type: 'success',
          text: '✓ Reproduciendo canal en VLC Media Player',
        });
      } else {
        // Fallback al protocolo directo vlc://
        window.location.href = `vlc://${currentChannel.url}`;
        setLaunchMessage({
          type: 'info',
          text: 'Lanzando protocolo vlc://...',
        });
      }
    } catch {
      window.location.href = `vlc://${currentChannel.url}`;
    }

    setTimeout(() => setLaunchMessage(null), 4000);
  };

  // Lanzar en MPV
  const handleLaunchMPV = async () => {
    if (!currentChannel) return;

    setLaunchMessage({
      type: 'info',
      text: 'Iniciando MPV Player...',
    });

    try {
      const res = await api.launchExternalPlayer({
        player: 'mpv',
        streamUrl: currentChannel.url,
        title: currentChannel.name,
      });

      if (res.success) {
        setLaunchMessage({
          type: 'success',
          text: '✓ Reproduciendo canal en MPV',
        });
      }
    } catch {
      setLaunchMessage({
        type: 'error',
        text: 'No se pudo conectar con el lanzador de MPV',
      });
    }

    setTimeout(() => setLaunchMessage(null), 4000);
  };

  // Copiar URL de stream
  const handleCopyUrl = () => {
    if (!currentChannel?.url) return;
    navigator.clipboard.writeText(currentChannel.url).then(() => {
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 3000);
    });
  };

  // Controles de Video
  const togglePlay = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play();
      setIsPlaying(true);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const handleVolumeChange = (e) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (videoRef.current) {
      videoRef.current.volume = val;
      if (val === 0) {
        videoRef.current.muted = true;
        setIsMuted(true);
      } else if (isMuted) {
        videoRef.current.muted = false;
        setIsMuted(false);
      }
    }
  };

  const toggleFullscreen = () => {
    if (!playerContainerRef.current) return;
    if (!document.fullscreenElement) {
      playerContainerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  // Agregar Lista M3U Personalizada
  const handleAddM3u = () => {
    if (!newM3uUrl.trim()) return;
    const item = {
      id: `m3u-${Date.now()}`,
      type: 'm3u',
      name: newM3uName.trim() || 'Lista Privada M3U',
      url: newM3uUrl.trim(),
    };
    const updated = [...customSources, item];
    setCustomSources(updated);
    localStorage.setItem('streamflix_custom_iptv_sources', JSON.stringify(updated));
    setNewM3uUrl('');
    setNewM3uName('');
    setShowModal(false);
    setTimeout(() => loadChannels(true), 100);
  };

  // Agregar Xtream Codes
  const handleAddXtream = () => {
    if (!xtreamServer.trim() || !xtreamUser.trim() || !xtreamPass.trim()) return;
    const item = {
      id: `xtream-${Date.now()}`,
      type: 'xtream',
      name: `Xtream (${xtreamUser})`,
      server: xtreamServer.trim(),
      username: xtreamUser.trim(),
      password: xtreamPass.trim(),
    };
    // Reemplazar cuenta Xtream previa si existe
    const filtered = customSources.filter((s) => s.type !== 'xtream');
    const updated = [...filtered, item];
    setCustomSources(updated);
    localStorage.setItem('streamflix_custom_iptv_sources', JSON.stringify(updated));
    setXtreamServer('');
    setXtreamUser('');
    setXtreamPass('');
    setShowModal(false);
    setTimeout(() => loadChannels(true), 100);
  };

  // Eliminar fuente personalizada
  const handleRemoveCustomSource = (id) => {
    const updated = customSources.filter((s) => s.id !== id);
    setCustomSources(updated);
    localStorage.setItem('streamflix_custom_iptv_sources', JSON.stringify(updated));
    setTimeout(() => loadChannels(true), 100);
  };

  // 4. Filtrado Eficiente de Canales en Memoria
  const filteredChannels = useMemo(() => {
    let result = channels;

    // Filtro por Categoría / Favoritos
    if (selectedCategory === 'Favoritos') {
      result = result.filter((c) => favorites.includes(c.url));
    } else if (selectedCategory === 'Pluto TV 24/7') {
      result = result.filter((c) => c.category === 'Pluto TV 24/7');
    } else if (selectedCategory === 'Colombia') {
      result = result.filter((c) => c.country === 'co' || c.category === 'Colombia');
    } else if (selectedCategory === 'México') {
      result = result.filter((c) => c.country === 'mx' || c.category === 'México');
    } else if (selectedCategory === 'Argentina') {
      result = result.filter((c) => c.country === 'ar' || c.category === 'Argentina');
    } else if (selectedCategory === 'España') {
      result = result.filter((c) => c.country === 'es' || c.category === 'España');
    } else if (selectedCategory !== 'Todos') {
      result = result.filter((c) => c.category === selectedCategory);
    }

    // Filtro por Búsqueda
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.fullName.toLowerCase().includes(q) ||
          (c.countryName && c.countryName.toLowerCase().includes(q)) ||
          (c.category && c.category.toLowerCase().includes(q))
      );
    }

    // Ordenar: Los favoritos aparecen siempre primero en "Todos"
    if (selectedCategory === 'Todos' && !searchQuery) {
      const favs = [];
      const nonFavs = [];
      for (const ch of result) {
        if (favorites.includes(ch.url)) favs.push(ch);
        else nonFavs.push(ch);
      }
      return [...favs, ...nonFavs];
    }

    return result;
  }, [channels, selectedCategory, searchQuery, favorites]);

  // Lista paginada para evitar lag del DOM (Virtualización Liviana)
  const visibleChannels = useMemo(() => {
    return filteredChannels.slice(0, visibleLimit);
  }, [filteredChannels, visibleLimit]);

  // Reset de límite al cambiar búsqueda o categoría
  useEffect(() => {
    setVisibleLimit(INITIAL_BATCH_SIZE);
  }, [selectedCategory, searchQuery]);

  return (
    <div className="pt-2 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto pb-16 font-netflix">
      {/* 1. Header Bar: Magis TV Style */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5 border-b border-neutral-800 pb-4">
        <div>
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-gradient-to-tr from-red-700 to-red-500 flex items-center justify-center shadow-lg shadow-red-950/40">
              <Radio className="w-5 h-5 text-white animate-pulse" />
            </span>
            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-white flex items-center gap-2">
                <span>Televisión en Vivo</span>
                <span className="px-2 py-0.5 bg-red-600 text-white font-extrabold text-[10px] rounded uppercase tracking-wider">
                  FAST & IPTV
                </span>
              </h1>
              <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-2">
                <span>Multi-Fuente en Español (+4,500 canales)</span>
                <span>•</span>
                <span className="text-emerald-400 font-semibold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block animate-pulse"></span>
                  Pluto TV 24/7 & Abiertos
                </span>
              </p>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center flex-wrap gap-2.5">
          {/* Barra de Búsqueda Instantánea */}
          <div className="relative min-w-[220px] sm:w-64">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar canal, fútbol, país..."
              className="w-full bg-neutral-900 border border-neutral-700 rounded-lg pl-9 pr-8 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-red-500 transition"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Botón "+ Agregar Lista M3U / IPTV" */}
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-bold rounded-lg border border-neutral-700 hover:border-neutral-500 transition shadow-sm"
          >
            <PlusCircle className="w-4 h-4 text-emerald-400" />
            <span>+ Agregar Lista M3U</span>
            {customSources.length > 0 && (
              <span className="ml-1 px-1.5 py-0.2 bg-emerald-600 text-[10px] rounded-full">
                {customSources.length}
              </span>
            )}
          </button>

          {/* Refrescar Catálogo */}
          <button
            onClick={() => loadChannels(true)}
            disabled={refreshing}
            className="p-2 bg-neutral-900 hover:bg-neutral-800 text-gray-300 hover:text-white rounded-lg border border-neutral-800 transition"
            title="Refrescar y recargar fuentes"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-red-500' : ''}`} />
          </button>
        </div>
      </div>

      {/* 2. Top Categorías / Países Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-3 mb-5 scrollbar-none">
        {CATEGORY_TABS.map((tab) => {
          const isSelected = selectedCategory === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setSelectedCategory(tab.id)}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all duration-200 ${
                isSelected
                  ? 'bg-red-600 text-white shadow-lg shadow-red-950/40 ring-1 ring-red-400'
                  : 'bg-neutral-900/90 hover:bg-neutral-800 text-gray-300 hover:text-white border border-neutral-800'
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
              {tab.id === 'Favoritos' && favorites.length > 0 && (
                <span className="px-1.5 py-0.2 bg-amber-400/20 text-amber-300 text-[10px] rounded-full font-black">
                  {favorites.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* 3. Reproductor en Vivo Cinema con HLS */}
      {currentChannel && (
        <div
          ref={playerContainerRef}
          className="relative bg-black rounded-2xl overflow-hidden border border-neutral-800/80 shadow-2xl mb-8 group/player aspect-video max-h-[68vh] w-full flex flex-col justify-between"
        >
          {/* Header flotante sobre el video */}
          <div className="relative z-30 p-4 bg-gradient-to-b from-black/90 via-black/40 to-transparent flex items-center justify-between pointer-events-auto">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg overflow-hidden bg-neutral-900 border border-white/10 flex items-center justify-center p-1 flex-shrink-0">
                <img
                  src={currentChannel.logo}
                  alt={currentChannel.name}
                  className="w-full h-full object-contain"
                  onError={(e) => {
                    e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(
                      currentChannel.name
                    )}&background=E50914&color=fff&size=128&bold=true`;
                  }}
                />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base sm:text-lg font-black text-white leading-tight">
                    {currentChannel.name}
                  </h2>
                  <span className="flex items-center gap-1 px-2 py-0.5 bg-red-600 text-white font-extrabold text-[10px] rounded-full uppercase tracking-wider animate-pulse">
                    <span className="w-1.5 h-1.5 rounded-full bg-white inline-block"></span>
                    EN VIVO
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-400 mt-0.5">
                  <span className="text-gray-300 font-semibold">{currentChannel.category}</span>
                  <span>•</span>
                  <span>{currentChannel.countryName || 'Global'}</span>
                  {usingProxy && (
                    <>
                      <span>•</span>
                      <span className="text-amber-400 font-semibold">Proxy Anti-CORS</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Acciones del reproductor */}
            <div className="flex items-center gap-2">
              {/* Botón Favorito */}
              <button
                onClick={(e) => toggleFavorite(currentChannel, e)}
                className={`p-2 rounded-full border transition ${
                  isFavorite(currentChannel)
                    ? 'bg-amber-500/20 text-amber-300 border-amber-400/50'
                    : 'bg-black/60 text-gray-300 hover:text-white border-white/10'
                }`}
                title={isFavorite(currentChannel) ? 'Quitar de favoritos' : 'Añadir a favoritos'}
              >
                <Star
                  className={`w-4 h-4 ${
                    isFavorite(currentChannel) ? 'fill-current text-amber-400' : ''
                  }`}
                />
              </button>

              {/* Botón Abrir en VLC */}
              <button
                onClick={handleLaunchVLC}
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-orange-600/90 hover:bg-orange-600 text-white text-xs font-bold rounded-lg border border-orange-500 transition shadow"
                title="Abrir en VLC Media Player"
              >
                <span>VLC</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>

              {/* Botón Abrir en MPV */}
              <button
                onClick={handleLaunchMPV}
                className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-gray-200 text-xs font-semibold rounded-lg border border-white/10 transition"
                title="Abrir en MPV"
              >
                <span>MPV</span>
              </button>
            </div>
          </div>

          {/* Feedback Toast */}
          {launchMessage && (
            <div className="absolute top-16 left-1/2 -translate-x-1/2 z-40 bg-neutral-900/95 border border-white/20 text-white px-4 py-2 rounded-xl text-xs font-semibold shadow-2xl backdrop-blur-md animate-fadeIn">
              {launchMessage.text}
            </div>
          )}

          {/* Video Player */}
          <div className="relative flex-1 flex items-center justify-center overflow-hidden bg-black">
            <video
              ref={videoRef}
              className="w-full h-full object-contain"
              playsInline
              onClick={togglePlay}
            />

            {/* Overlay de Canal Caído / Restricción CORS con opción VLC */}
            {playerError && (
              <div className="absolute inset-0 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center z-20 space-y-4 animate-fadeIn">
                <div className="w-14 h-14 rounded-full bg-red-950/60 border border-red-600 flex items-center justify-center text-red-500 shadow-xl">
                  <AlertCircle className="w-7 h-7" />
                </div>
                <div className="max-w-md space-y-1">
                  <h3 className="text-base sm:text-lg font-black text-white">
                    Canal no reproducible en el navegador
                  </h3>
                  <p className="text-xs text-gray-400">
                    Este stream utiliza códecs nativos (TS/AC3) o tiene restricciones de dominio (CORS) que los navegadores bloquean, pero funciona perfectamente en reproductores de escritorio.
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
                  <button
                    onClick={handleLaunchVLC}
                    className="flex items-center gap-2 px-5 py-2.5 bg-orange-600 hover:bg-orange-500 text-white font-extrabold text-xs rounded-lg shadow-lg transition"
                  >
                    <span>▶ Abrir en VLC Media Player</span>
                  </button>
                  <button
                    onClick={handleLaunchMPV}
                    className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white font-bold text-xs rounded-lg border border-neutral-700 transition"
                  >
                    Abrir en MPV
                  </button>
                  <button
                    onClick={() => {
                      setUsingProxy(true);
                      setPlayerError(false);
                    }}
                    className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-gray-300 font-bold text-xs rounded-lg border border-neutral-700 transition"
                  >
                    Probar Proxy Anti-CORS
                  </button>
                  <button
                    onClick={handleCopyUrl}
                    className="px-3 py-2 bg-neutral-900 hover:bg-neutral-800 text-gray-300 text-xs rounded-lg border border-neutral-800 transition flex items-center gap-1"
                  >
                    {copiedUrl ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedUrl ? 'Copiado' : 'Copiar URL'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Barra de Controles Inferior */}
          <div className="relative z-30 p-4 bg-gradient-to-t from-black/90 via-black/50 to-transparent flex items-center justify-between opacity-0 group-hover/player:opacity-100 transition-opacity duration-200">
            <div className="flex items-center gap-4">
              <button
                onClick={togglePlay}
                className="text-white hover:text-red-500 transition"
              >
                {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current" />}
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={toggleMute}
                  className="text-white hover:text-red-500 transition"
                >
                  {isMuted || volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                </button>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="w-20 h-1 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-red-600"
                />
              </div>

              {/* Botón Reintentar señal */}
              <button
                onClick={() => {
                  setUsingProxy(false);
                  setPlayerError(false);
                  const ch = currentChannel;
                  setCurrentChannel(null);
                  setTimeout(() => setCurrentChannel(ch), 50);
                }}
                className="text-xs text-gray-400 hover:text-white flex items-center gap-1 transition"
                title="Recargar señal"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Recargar señal</span>
              </button>
            </div>

            <div className="flex items-center gap-3">
              {/* Botón Proxy Manual */}
              <button
                onClick={() => setUsingProxy(!usingProxy)}
                className={`text-[11px] font-bold px-2 py-0.5 rounded border transition ${
                  usingProxy
                    ? 'bg-amber-600/30 text-amber-300 border-amber-500'
                    : 'bg-neutral-800 text-gray-400 border-neutral-700 hover:text-white'
                }`}
                title="Alternar entre conexión directa o proxy local anti-CORS"
              >
                {usingProxy ? 'Proxy Anti-CORS ACTIVO' : 'Modo Directo'}
              </button>

              <button
                onClick={toggleFullscreen}
                className="text-white hover:text-red-500 transition"
              >
                {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. Contador de Canales y Estado */}
      <div className="flex items-center justify-between mb-4 text-xs text-gray-400">
        <div className="flex items-center gap-2">
          <span className="font-bold text-white tracking-wide">
            {selectedCategory}
          </span>
          <span>•</span>
          <span>
            Mostrando {visibleChannels.length} de {filteredChannels.length} canales
          </span>
          {channels.length > 0 && (
            <span className="hidden sm:inline text-neutral-500">
              (Total disponible: {channels.length.toLocaleString()})
            </span>
          )}
        </div>
        {selectedCategory === 'Favoritos' && favorites.length === 0 && (
          <span className="text-amber-400/80">
            Marca canales con la estrella ⭐ para verlos aquí
          </span>
        )}
      </div>

      {/* 5. Grid de Canales con Carga Progresiva (Anti-Lag) */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 py-6">
          {Array.from({ length: 18 }).map((_, i) => (
            <div
              key={i}
              className="bg-neutral-900 rounded-xl p-3 border border-neutral-800 animate-pulse h-28 flex flex-col justify-between"
            >
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-lg bg-neutral-800"></div>
                <div className="space-y-1.5 flex-1">
                  <div className="h-3 w-3/4 bg-neutral-800 rounded"></div>
                  <div className="h-2 w-1/2 bg-neutral-800/60 rounded"></div>
                </div>
              </div>
              <div className="h-2 w-1/3 bg-neutral-800/40 rounded"></div>
            </div>
          ))}
        </div>
      ) : visibleChannels.length === 0 ? (
        <div className="py-20 text-center text-gray-400 space-y-3 bg-neutral-900/40 rounded-2xl border border-neutral-800/60">
          <Tv className="w-12 h-12 mx-auto text-neutral-600" />
          <p className="text-base font-bold text-gray-300">
            No se encontraron canales en esta categoría.
          </p>
          <p className="text-xs text-gray-500">
            Prueba ajustando el término de búsqueda o seleccionando "Todos".
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {visibleChannels.map((channel) => {
              const isActive = currentChannel?.url === channel.url;
              const fav = isFavorite(channel);

              return (
                <div
                  key={channel.url}
                  onClick={() => handleSelectChannel(channel)}
                  className={`group relative p-3 rounded-xl border transition-all duration-200 cursor-pointer flex flex-col justify-between h-28 ${
                    isActive
                      ? 'bg-neutral-900 border-red-600 ring-2 ring-red-600 shadow-lg shadow-red-950/40'
                      : 'bg-neutral-900/70 hover:bg-neutral-850 border-neutral-800 hover:border-neutral-600 hover:shadow-md'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 overflow-hidden">
                      <div className="w-9 h-9 rounded-lg overflow-hidden bg-neutral-950 border border-neutral-800 flex items-center justify-center p-0.5 flex-shrink-0">
                        <img
                          src={channel.logo}
                          alt={channel.name}
                          className="w-full h-full object-contain"
                          loading="lazy"
                          onError={(e) => {
                            e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(
                              channel.name
                            )}&background=E50914&color=fff&size=128&bold=true`;
                          }}
                        />
                      </div>
                      <div className="overflow-hidden">
                        <h4
                          className={`text-xs font-bold truncate leading-tight transition-colors ${
                            isActive ? 'text-red-400 font-black' : 'text-gray-100 group-hover:text-white'
                          }`}
                        >
                          {channel.name}
                        </h4>
                        <span className="text-[10px] text-gray-400 truncate block mt-0.5">
                          {channel.category}
                        </span>
                      </div>
                    </div>

                    {/* Botón Estrella Favorito */}
                    <button
                      onClick={(e) => toggleFavorite(channel, e)}
                      className={`p-1 rounded transition ${
                        fav
                          ? 'text-amber-400'
                          : 'text-neutral-600 hover:text-amber-400 opacity-0 group-hover:opacity-100'
                      }`}
                      title={fav ? 'Quitar de favoritos' : 'Marcar favorito'}
                    >
                      <Star className={`w-3.5 h-3.5 ${fav ? 'fill-current' : ''}`} />
                    </button>
                  </div>

                  {/* Footer de tarjeta */}
                  <div className="flex items-center justify-between pt-1 border-t border-neutral-800/60 text-[10px]">
                    <span className="text-gray-400 truncate">
                      {channel.countryName || 'Global'}
                    </span>
                    {isActive ? (
                      <span className="text-red-500 font-black flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span>
                        ACTIVO
                      </span>
                    ) : (
                      <span className="text-neutral-600 group-hover:text-gray-400 transition">
                        Ver señal ▶
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Botón Cargar Más Canales */}
          {filteredChannels.length > visibleLimit && (
            <div className="pt-8 text-center">
              <button
                onClick={() => setVisibleLimit((prev) => prev + BATCH_INCREMENT)}
                className="px-6 py-2.5 bg-neutral-900 hover:bg-neutral-800 text-white font-bold text-xs rounded-xl border border-neutral-700 hover:border-neutral-500 transition shadow-lg inline-flex items-center gap-2"
              >
                <span>Cargar más canales (+{BATCH_INCREMENT})</span>
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>
          )}
        </>
      )}

      {/* 6. Modal: Agregar Lista M3U / IPTV Privado / Xtream Codes */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
          <div className="relative w-full max-w-lg bg-[#181818] rounded-2xl overflow-hidden shadow-2xl border border-white/10 p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <div className="flex items-center gap-2.5">
                <PlusCircle className="w-5 h-5 text-emerald-400" />
                <h3 className="text-lg font-black text-white">
                  Agregar Canales IPTV / M3U
                </h3>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Tabs */}
            <div className="flex rounded-lg bg-neutral-900 p-1 border border-neutral-800 text-xs font-bold">
              <button
                onClick={() => setModalTab('m3u')}
                className={`flex-1 py-2 rounded-md transition ${
                  modalTab === 'm3u' ? 'bg-red-600 text-white shadow' : 'text-gray-400 hover:text-white'
                }`}
              >
                Lista M3U / M3U8 (URL)
              </button>
              <button
                onClick={() => setModalTab('xtream')}
                className={`flex-1 py-2 rounded-md transition ${
                  modalTab === 'xtream' ? 'bg-red-600 text-white shadow' : 'text-gray-400 hover:text-white'
                }`}
              >
                Xtream Codes API
              </button>
            </div>

            {/* Formulario Tab 1: M3U URL */}
            {modalTab === 'm3u' && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">
                    URL de la Lista M3U / M3U8:
                  </label>
                  <input
                    type="url"
                    value={newM3uUrl}
                    onChange={(e) => setNewM3uUrl(e.target.value)}
                    placeholder="https://ejemplo.com/canales.m3u"
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-red-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">
                    Nombre de la Lista (Opcional):
                  </label>
                  <input
                    type="text"
                    value={newM3uName}
                    onChange={(e) => setNewM3uName(e.target.value)}
                    placeholder="Ej. Mis Canales de Cable / Deportes VIP"
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-red-500"
                  />
                </div>
                <button
                  onClick={handleAddM3u}
                  disabled={!newM3uUrl.trim()}
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-extrabold text-xs rounded-lg transition shadow"
                >
                  Guardar y Fusionar con Catálogo
                </button>
              </div>
            )}

            {/* Formulario Tab 2: Xtream Codes */}
            {modalTab === 'xtream' && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">
                    Servidor Xtream (Host y Puerto):
                  </label>
                  <input
                    type="text"
                    value={xtreamServer}
                    onChange={(e) => setXtreamServer(e.target.value)}
                    placeholder="http://servidor.xyz:8080"
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-red-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-gray-300 mb-1">
                      Usuario:
                    </label>
                    <input
                      type="text"
                      value={xtreamUser}
                      onChange={(e) => setXtreamUser(e.target.value)}
                      placeholder="Usuario"
                      className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-red-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-300 mb-1">
                      Contraseña:
                    </label>
                    <input
                      type="password"
                      value={xtreamPass}
                      onChange={(e) => setXtreamPass(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-red-500"
                    />
                  </div>
                </div>
                <button
                  onClick={handleAddXtream}
                  disabled={!xtreamServer.trim() || !xtreamUser.trim() || !xtreamPass.trim()}
                  className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-extrabold text-xs rounded-lg transition shadow"
                >
                  Conectar Servidor Xtream
                </button>
              </div>
            )}

            {/* Listas Guardadas Previamente */}
            {customSources.length > 0 && (
              <div className="pt-3 border-t border-neutral-800">
                <span className="block text-xs font-bold text-gray-400 mb-2">
                  Listas Personalizadas Guardadas ({customSources.length}):
                </span>
                <div className="space-y-2 max-h-36 overflow-y-auto">
                  {customSources.map((src) => (
                    <div
                      key={src.id}
                      className="flex items-center justify-between p-2 rounded-lg bg-neutral-900 border border-neutral-800 text-xs"
                    >
                      <div className="truncate mr-2">
                        <span className="font-bold text-white block truncate">{src.name}</span>
                        <span className="text-[10px] text-gray-500 truncate block">
                          {src.type === 'm3u' ? src.url : `${src.server} (${src.username})`}
                        </span>
                      </div>
                      <button
                        onClick={() => handleRemoveCustomSource(src.id)}
                        className="p-1 text-red-400 hover:text-red-300 transition"
                        title="Eliminar lista"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
