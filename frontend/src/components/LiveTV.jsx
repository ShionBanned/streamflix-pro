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
  ChevronDown,
  Sparkles,
  SkipForward,
  SkipBack,
  Columns,
  PictureInPicture2,
} from 'lucide-react';

const CATEGORY_TABS = [
  { id: 'Todos', label: 'Todos', icon: '📺' },
  { id: 'Favoritos', label: 'Favoritos', icon: '⭐' },
  { id: 'Pluto TV 24/7', label: 'Pluto TV', icon: '🍿' },
  { id: 'Deportes', label: 'Deportes', icon: '⚽' },
  { id: 'Películas y Series', label: 'Cine & Series', icon: '🎬' },
  { id: 'Noticias', label: 'Noticias', icon: '📰' },
  { id: 'Infantil y Anime', label: 'Infantil & Anime', icon: '🧸' },
  { id: 'Colombia', label: 'Colombia', icon: '🇨🇴' },
  { id: 'México', label: 'México', icon: '🇲🇽' },
  { id: 'Argentina', label: 'Argentina', icon: '🇦🇷' },
  { id: 'España', label: 'España', icon: '🇪🇸' },
  { id: 'Música', label: 'Música', icon: '🎵' },
  { id: 'Entretenimiento', label: 'Entretenimiento', icon: '🎭' },
];

const INITIAL_BATCH_SIZE = 72;
const BATCH_INCREMENT = 72;

export default function LiveTV() {
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [selectedCategory, setSelectedCategory] = useState('Todos');
  const [searchQuery, setSearchQuery] = useState('');
  const [visibleLimit, setVisibleLimit] = useState(INITIAL_BATCH_SIZE);

  // Diseño TiviMate / Apple TV+: Modo Split-View (Reproductor + Guía Lateral) vs Modo Teatro
  const [theaterMode, setTheaterMode] = useState(false);

  const [currentChannel, setCurrentChannel] = useState(null);
  const [playerError, setPlayerError] = useState(false);
  const [audioOnlyWarning, setAudioOnlyWarning] = useState(false);
  const [usingProxy, setUsingProxy] = useState(true);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [launchMessage, setLaunchMessage] = useState(null);
  const [copiedUrl, setCopiedUrl] = useState(false);

  const [hlsLevels, setHlsLevels] = useState([]);
  const [currentLevel, setCurrentLevel] = useState(-1);
  const [cinemaBoost, setCinemaBoost] = useState(true);
  const [videoDimensions, setVideoDimensions] = useState({ width: 0, height: 0 });
  const [showHud, setShowHud] = useState(true);

  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const playerContainerRef = useRef(null);
  const watchdogTimerRef = useRef(null);
  const hudTimerRef = useRef(null);
  const autoRetriedDirectRef = useRef(false);

  const [favorites, setFavorites] = useState(() => {
    try {
      const saved = localStorage.getItem('streamflix_iptv_favorites');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [customSources, setCustomSources] = useState(() => {
    try {
      const saved = localStorage.getItem('streamflix_custom_iptv_sources');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [showModal, setShowModal] = useState(false);
  const [modalTab, setModalTab] = useState('m3u');
  const [newM3uUrl, setNewM3uUrl] = useState('');
  const [newM3uName, setNewM3uName] = useState('');
  const [xtreamServer, setXtreamServer] = useState('');
  const [xtreamUser, setXtreamUser] = useState('');
  const [xtreamPass, setXtreamPass] = useState('');

  const triggerHud = useCallback(() => {
    setShowHud(true);
    if (hudTimerRef.current) clearTimeout(hudTimerRef.current);
    hudTimerRef.current = setTimeout(() => setShowHud(false), 2600);
  }, []);

  useEffect(() => {
    triggerHud();
    return () => {
      if (hudTimerRef.current) clearTimeout(hudTimerRef.current);
    };
  }, [triggerHud]);

  const loadChannels = useCallback(
    async (forceRefresh = false) => {
      if (forceRefresh) setRefreshing(true);
      else setLoading(true);

      setPlayerError(false);
      setAudioOnlyWarning(false);
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

        if (!currentChannel && list.length > 0) {
          const firstFav = list.find((c) => favorites.includes(c.url));
          const firstPluto = list.find((c) => c.category === 'Pluto TV 24/7' && !c.isHevcHint);
          setCurrentChannel(firstFav || firstPluto || list[0]);
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

  const toggleFavorite = (channel, e) => {
    if (e) e.stopPropagation();
    setFavorites((prev) => {
      const exists = prev.includes(channel.url);
      const updated = exists ? prev.filter((u) => u !== channel.url) : [...prev, channel.url];
      try {
        localStorage.setItem('streamflix_iptv_favorites', JSON.stringify(updated));
      } catch {
        // Ignore
      }
      return updated;
    });
  };

  const isFavorite = (channel) => {
    return channel ? favorites.includes(channel.url) : false;
  };

  // Inicializar HLS con selección automática H.264 y Watchdog Anti-Pantalla Negra
  useEffect(() => {
    if (!currentChannel || !videoRef.current) return;

    setPlayerError(false);
    setAudioOnlyWarning(false);
    setVideoDimensions({ width: 0, height: 0 });
    setHlsLevels([]);
    setCurrentLevel(-1);

    if (watchdogTimerRef.current) clearTimeout(watchdogTimerRef.current);

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
        manifestLoadingTimeOut: 14000,
        levelLoadingTimeOut: 14000,
        fragLoadingTimeOut: 18000,
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
      });

      hls.loadSource(streamTarget);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
        const levels = data.levels || [];
        setHlsLevels(levels);

        if (levels.length > 1) {
          const avcLevelIdx = levels.findIndex(
            (lvl) =>
              lvl.videoCodec &&
              lvl.videoCodec.toLowerCase().includes('avc1') &&
              !lvl.videoCodec.toLowerCase().includes('hev') &&
              !lvl.videoCodec.toLowerCase().includes('hvc')
          );
          const hasHevcLevel = levels.some(
            (lvl) =>
              lvl.videoCodec &&
              (lvl.videoCodec.toLowerCase().includes('hev') ||
                lvl.videoCodec.toLowerCase().includes('hvc'))
          );

          if (hasHevcLevel && avcLevelIdx !== -1) {
            hls.currentLevel = avcLevelIdx;
            setCurrentLevel(avcLevelIdx);
          }
        }

        setIsPlaying(true);
        video.play().catch(() => {
          video.muted = true;
          setIsMuted(true);
          video.play().catch(() => {});
        });

        watchdogTimerRef.current = setTimeout(() => {
          if (!videoRef.current) return;
          const vw = videoRef.current.videoWidth;
          const vh = videoRef.current.videoHeight;

          if (vw === 0 && vh === 0 && !videoRef.current.paused) {
            if (hls.levels && hls.levels.length > 1) {
              const nextLvl = (hls.currentLevel + 1) % hls.levels.length;
              hls.currentLevel = nextLvl;
              setCurrentLevel(nextLvl);
            }

            setTimeout(() => {
              if (!videoRef.current) return;
              if (videoRef.current.videoWidth === 0 && !videoRef.current.paused) {
                if (usingProxy && !autoRetriedDirectRef.current) {
                  autoRetriedDirectRef.current = true;
                  setUsingProxy(false);
                } else {
                  setAudioOnlyWarning(true);
                }
              }
            }, 2500);
          }
        }, 3800);
      });

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              if (!usingProxy) {
                setUsingProxy(true);
              } else if (!autoRetriedDirectRef.current) {
                autoRetriedDirectRef.current = true;
                setUsingProxy(false);
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
      video.src = streamTarget;
      video.addEventListener('loadedmetadata', () => {
        video.play().catch(() => {});
      });
    }

    return () => {
      if (watchdogTimerRef.current) clearTimeout(watchdogTimerRef.current);
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [currentChannel, usingProxy]);

  const handleSelectChannel = (channel) => {
    autoRetriedDirectRef.current = false;
    setUsingProxy(true);
    setPlayerError(false);
    setAudioOnlyWarning(false);
    setCurrentChannel(channel);
    triggerHud();
  };

  const filteredChannels = useMemo(() => {
    let result = channels;

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

  const handlePrevChannel = () => {
    if (!filteredChannels.length) return;
    const idx = filteredChannels.findIndex((c) => c.url === currentChannel?.url);
    const prevIdx = idx > 0 ? idx - 1 : filteredChannels.length - 1;
    handleSelectChannel(filteredChannels[prevIdx]);
  };

  const handleNextChannel = () => {
    if (!filteredChannels.length) return;
    const idx = filteredChannels.findIndex((c) => c.url === currentChannel?.url);
    const nextIdx = idx !== -1 && idx + 1 < filteredChannels.length ? idx + 1 : 0;
    handleSelectChannel(filteredChannels[nextIdx]);
  };

  const togglePiP = async () => {
    if (!videoRef.current) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (videoRef.current.requestPictureInPicture) {
        await videoRef.current.requestPictureInPicture();
      }
    } catch {
      // Ignore if PiP is not available
    }
  };

  const handleLaunchVLC = async () => {
    if (!currentChannel) return;
    setLaunchMessage({
      type: 'info',
      text: 'Abriendo canal en VLC Media Player...',
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
          text: '✓ Reproduciendo en VLC Media Player',
        });
      } else {
        window.location.href = `vlc://${currentChannel.url}`;
      }
    } catch {
      window.location.href = `vlc://${currentChannel.url}`;
    }

    setTimeout(() => setLaunchMessage(null), 4000);
  };

  const handleLaunchMPV = async () => {
    if (!currentChannel) return;
    setLaunchMessage({
      type: 'info',
      text: 'Abriendo MPV Player...',
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
          text: '✓ Reproduciendo en MPV',
        });
      }
    } catch {
      setLaunchMessage({
        type: 'error',
        text: 'No se pudo conectar con MPV',
      });
    }

    setTimeout(() => setLaunchMessage(null), 4000);
  };

  const handleCopyUrl = () => {
    if (!currentChannel?.url) return;
    navigator.clipboard.writeText(currentChannel.url).then(() => {
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 3000);
    });
  };

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
      playerContainerRef.current
        .requestFullscreen()
        .then(() => setIsFullscreen(true))
        .catch(() => {});
    } else {
      document
        .exitFullscreen()
        .then(() => setIsFullscreen(false))
        .catch(() => {});
    }
  };

  const handleLevelChange = (lvlIdx) => {
    setCurrentLevel(lvlIdx);
    if (hlsRef.current) {
      hlsRef.current.currentLevel = lvlIdx;
    }
  };

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

  const handleRemoveCustomSource = (id) => {
    const updated = customSources.filter((s) => s.id !== id);
    setCustomSources(updated);
    localStorage.setItem('streamflix_custom_iptv_sources', JSON.stringify(updated));
    setTimeout(() => loadChannels(true), 100);
  };

  const visibleChannels = useMemo(() => {
    return filteredChannels.slice(0, visibleLimit);
  }, [filteredChannels, visibleLimit]);

  useEffect(() => {
    setVisibleLimit(INITIAL_BATCH_SIZE);
  }, [selectedCategory, searchQuery]);

  return (
    <div className="pt-2 px-4 sm:px-8 lg:px-12 max-w-[1480px] mx-auto pb-16 font-netflix">
      {/* 1. Cabecera Broadcast Studio */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5 border-b border-white/[0.08] pb-4">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#E50914] to-[#80040a] flex items-center justify-center shadow-[0_8px_24px_rgba(229,9,20,0.4)] border border-white/15">
            <Radio className="w-5 h-5 text-white animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                Live TV Studio
              </h1>
              <span className="px-2 py-0.5 bg-[#E50914] text-white font-black text-[10px] rounded-full uppercase tracking-wider">
                TIVIMATE VIEW
              </span>
            </div>
            <p className="text-xs text-neutral-400 mt-0.5 flex items-center gap-2">
              <span>+{channels.length.toLocaleString()} Canales FAST & IPTV</span>
              <span>•</span>
              <span className="text-emerald-400 font-semibold">
                Zapping Instantáneo & Anti-Pantalla Negra
              </span>
            </p>
          </div>
        </div>

        {/* Barra de Herramientas Derecha */}
        <div className="flex items-center flex-wrap gap-2">
          <div className="relative min-w-[210px] sm:w-64">
            <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar canal, país, deporte..."
              className="w-full bg-neutral-900/90 border border-white/15 rounded-full pl-9 pr-8 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-[#E50914] transition"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <button
            onClick={() => setTheaterMode(!theaterMode)}
            className={`hidden lg:flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold border transition ${
              theaterMode
                ? 'bg-[#E50914] text-white border-red-400'
                : 'bg-neutral-900 hover:bg-neutral-800 text-neutral-300 border-white/15'
            }`}
            title="Alternar entre Vista Dividida con Guía EPG o Modo Teatro Completo"
          >
            <Columns className="w-3.5 h-3.5" />
            <span>{theaterMode ? 'Mostrar Guía Lateral' : 'Modo Teatro'}</span>
          </button>

          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-bold rounded-full border border-white/15 transition"
          >
            <PlusCircle className="w-4 h-4 text-emerald-400" />
            <span>+ Lista M3U / Xtream</span>
          </button>

          <button
            onClick={() => loadChannels(true)}
            disabled={refreshing}
            className="p-2 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 hover:text-white rounded-full border border-white/15 transition"
            title="Refrescar lista de canales"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-[#E50914]' : ''}`} />
          </button>
        </div>
      </div>

      {/* 2. Categorías en Píldoras */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-3 mb-5 no-scrollbar">
        {CATEGORY_TABS.map((tab) => {
          const isSelected = selectedCategory === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setSelectedCategory(tab.id)}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all duration-200 ${
                isSelected
                  ? 'bg-[#E50914] text-white shadow-lg shadow-red-950/50 ring-1 ring-red-400'
                  : 'bg-[#161616] hover:bg-neutral-800 text-neutral-300 hover:text-white border border-white/[0.08]'
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

      {/* 3. ESTUDIO PRINCIPAL SPLIT-VIEW (Reproductor No Invasivo + Guía Lateral de Zapping Instantáneo) */}
      {currentChannel && (
        <div
          className={`grid grid-cols-1 ${
            theaterMode ? 'lg:grid-cols-1' : 'lg:grid-cols-12'
          } gap-5 mb-9`}
        >
          {/* Panel Izquierdo: Monitor de Transmisión en Vivo */}
          <div className={theaterMode ? 'col-span-1' : 'lg:col-span-8'}>
            <div
              ref={playerContainerRef}
              onMouseMove={triggerHud}
              className="relative bg-black rounded-2xl overflow-hidden border border-white/15 shadow-[0_24px_60px_rgba(0,0,0,0.95)] aspect-video w-full"
            >
              {/* Video Absoluto (0 Colapso de Altura) */}
              <video
                ref={videoRef}
                className={`absolute inset-0 w-full h-full object-contain z-10 cursor-pointer bg-black transition-all ${
                  cinemaBoost ? 'contrast-[1.06] saturate-[1.08] brightness-[1.02]' : ''
                }`}
                playsInline
                autoPlay
                onClick={togglePlay}
                onLoadedMetadata={(e) => {
                  const vw = e.currentTarget.videoWidth;
                  const vh = e.currentTarget.videoHeight;
                  setVideoDimensions({ width: vw, height: vh });
                  if (vw > 0 && vh > 0) setAudioOnlyWarning(false);
                }}
                onResize={(e) => {
                  const vw = e.currentTarget.videoWidth;
                  const vh = e.currentTarget.videoHeight;
                  setVideoDimensions({ width: vw, height: vh });
                  if (vw > 0 && vh > 0) setAudioOnlyWarning(false);
                }}
              />

              {/* HUD Superior Flotante Minimalista (Se oculta tras 2.6s de inactividad) */}
              <div
                className={`absolute top-3 left-3 right-3 z-30 flex items-center justify-between gap-2 pointer-events-none transition-all duration-500 ${
                  showHud || !isPlaying
                    ? 'opacity-100 translate-y-0'
                    : 'opacity-0 -translate-y-3 pointer-events-none'
                }`}
              >
                <div className="pointer-events-auto flex items-center gap-2.5 bg-black/75 backdrop-blur-xl border border-white/15 px-3 py-1.5 rounded-full shadow-lg">
                  <img
                    src={currentChannel.logo}
                    alt={currentChannel.name}
                    className="w-6 h-6 object-contain rounded"
                    onError={(e) => {
                      e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(
                        currentChannel.name
                      )}&background=E50914&color=fff&size=64&bold=true`;
                    }}
                  />
                  <span className="text-xs sm:text-sm font-extrabold text-white truncate max-w-[180px] sm:max-w-xs">
                    {currentChannel.name}
                  </span>
                  <span className="flex items-center gap-1 px-2 py-0.5 bg-[#E50914] text-white font-black text-[9px] rounded-full uppercase">
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                    LIVE
                  </span>
                  {videoDimensions.height > 0 && (
                    <span className="hidden sm:inline-block px-2 py-0.5 bg-emerald-500/20 text-emerald-300 font-mono text-[10px] font-bold rounded-full">
                      {videoDimensions.height}p
                    </span>
                  )}
                </div>

                {/* Controles Rápidos Flotantes Arriba-Derecha */}
                <div className="pointer-events-auto flex items-center gap-1.5">
                  <button
                    onClick={handlePrevChannel}
                    className="p-2 rounded-full bg-black/75 hover:bg-white/20 text-white border border-white/15 backdrop-blur-xl transition"
                    title="Canal anterior (CH-)"
                  >
                    <SkipBack className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={handleNextChannel}
                    className="p-2 rounded-full bg-black/75 hover:bg-white/20 text-white border border-white/15 backdrop-blur-xl transition"
                    title="Siguiente canal (CH+)"
                  >
                    <SkipForward className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(e) => toggleFavorite(currentChannel, e)}
                    className={`p-2 rounded-full border backdrop-blur-xl transition ${
                      isFavorite(currentChannel)
                        ? 'bg-amber-500/30 text-amber-300 border-amber-400'
                        : 'bg-black/75 text-neutral-300 hover:text-white border-white/15'
                    }`}
                  >
                    <Star
                      className={`w-3.5 h-3.5 ${
                        isFavorite(currentChannel) ? 'fill-current text-amber-400' : ''
                      }`}
                    />
                  </button>
                  <button
                    onClick={handleLaunchVLC}
                    className="px-3 py-1.5 rounded-full bg-orange-600/90 hover:bg-orange-500 text-white text-[11px] font-extrabold shadow transition"
                  >
                    VLC
                  </button>
                </div>
              </div>

              {launchMessage && (
                <div className="absolute top-16 left-1/2 -translate-x-1/2 z-40 bg-black/90 border border-white/20 text-white px-4 py-2 rounded-full text-xs font-bold shadow-2xl backdrop-blur-xl animate-fadeIn">
                  {launchMessage.text}
                </div>
              )}

              {/* Alerta Watchdog Audio sin Video (HEVC/H.265) */}
              {audioOnlyWarning && !playerError && (
                <div className="absolute inset-0 bg-black/85 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center z-20 space-y-3 animate-fadeIn">
                  <div className="w-11 h-11 rounded-full bg-amber-500/20 border border-amber-500 flex items-center justify-center text-amber-400">
                    <AlertCircle className="w-5 h-5" />
                  </div>
                  <div className="max-w-md space-y-1">
                    <h3 className="text-sm sm:text-base font-black text-white">
                      Señal en códec HEVC / H.265 de cable detectada
                    </h3>
                    <p className="text-xs text-neutral-300">
                      El audio AAC está activo, pero el video usa HEVC nativo. Ábrelo con imagen completa en VLC o pasa al siguiente canal.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <button
                      onClick={handleLaunchVLC}
                      className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white font-extrabold text-xs rounded-full shadow"
                    >
                      ▶ Abrir Imagen en VLC
                    </button>
                    <button
                      onClick={handleNextChannel}
                      className="px-4 py-2 bg-[#E50914] hover:bg-red-700 text-white font-extrabold text-xs rounded-full"
                    >
                      Siguiente Canal ⏭
                    </button>
                    <button
                      onClick={() => setAudioOnlyWarning(false)}
                      className="px-3 py-2 bg-neutral-800 text-neutral-300 text-xs rounded-full"
                    >
                      Ocultar aviso
                    </button>
                  </div>
                </div>
              )}

              {/* Overlay de Canal Fuera del Aire */}
              {playerError && (
                <div className="absolute inset-0 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center z-20 space-y-3 animate-fadeIn">
                  <AlertCircle className="w-10 h-10 text-[#E50914]" />
                  <div className="max-w-sm space-y-1">
                    <h3 className="text-sm sm:text-base font-black text-white">
                      Señal temporalmente no disponible en navegador
                    </h3>
                    <p className="text-xs text-neutral-400">
                      Prueba en VLC Media Player, alterna el Proxy o pasa al siguiente canal.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <button
                      onClick={handleLaunchVLC}
                      className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white font-extrabold text-xs rounded-full"
                    >
                      ▶ Abrir en VLC
                    </button>
                    <button
                      onClick={handleNextChannel}
                      className="px-4 py-2 bg-[#E50914] hover:bg-red-700 text-white font-extrabold text-xs rounded-full"
                    >
                      Siguiente Canal ⏭
                    </button>
                    <button
                      onClick={() => {
                        setUsingProxy(!usingProxy);
                        setPlayerError(false);
                      }}
                      className="px-3.5 py-2 bg-neutral-800 text-neutral-200 font-bold text-xs rounded-full border border-white/15"
                    >
                      Modo {usingProxy ? 'Directo' : 'Proxy'}
                    </button>
                  </div>
                </div>
              )}

              {/* HUD Inferior Flotante Minimalista */}
              <div
                className={`absolute bottom-3 left-3 right-3 z-30 bg-black/75 backdrop-blur-xl border border-white/15 rounded-full px-4 py-2 flex items-center justify-between transition-all duration-500 ${
                  showHud || !isPlaying
                    ? 'opacity-100 translate-y-0'
                    : 'opacity-0 translate-y-3 pointer-events-none'
                }`}
              >
                <div className="flex items-center gap-3">
                  <button
                    onClick={togglePlay}
                    className="text-white hover:text-[#E50914] transition"
                  >
                    {isPlaying ? (
                      <Pause className="w-4 h-4 fill-current" />
                    ) : (
                      <Play className="w-4 h-4 fill-current" />
                    )}
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={toggleMute}
                      className="text-white hover:text-[#E50914] transition"
                    >
                      {isMuted || volume === 0 ? (
                        <VolumeX className="w-4 h-4 text-[#E50914]" />
                      ) : (
                        <Volume2 className="w-4 h-4" />
                      )}
                    </button>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={isMuted ? 0 : volume}
                      onChange={handleVolumeChange}
                      className="w-16 sm:w-20 h-1 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-[#E50914]"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {hlsLevels.length > 1 && (
                    <select
                      value={currentLevel}
                      onChange={(e) => handleLevelChange(Number(e.target.value))}
                      className="bg-white/10 text-white border border-white/15 rounded-full px-2.5 py-0.5 text-[10px] font-bold focus:outline-none"
                    >
                      <option value={-1} className="bg-neutral-900">
                        Auto H.264
                      </option>
                      {hlsLevels.map((lvl, idx) => (
                        <option key={idx} value={idx} className="bg-neutral-900">
                          {lvl.height ? `${lvl.height}p` : `Nivel ${idx + 1}`}
                        </option>
                      ))}
                    </select>
                  )}

                  <button
                    onClick={() => setCinemaBoost(!cinemaBoost)}
                    className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border transition flex items-center gap-1 ${
                      cinemaBoost
                        ? 'bg-red-600/30 text-red-200 border-red-500/50'
                        : 'bg-white/5 text-neutral-400 border-white/10'
                    }`}
                  >
                    <Sparkles className="w-3 h-3" />
                    <span className="hidden sm:inline">Nitidez</span>
                  </button>

                  <button
                    onClick={() => setUsingProxy(!usingProxy)}
                    className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border transition ${
                      usingProxy
                        ? 'bg-amber-500/25 text-amber-300 border-amber-500/50'
                        : 'bg-white/5 text-neutral-300 border-white/10'
                    }`}
                  >
                    {usingProxy ? 'Proxy ON' : 'Directo'}
                  </button>

                  <button
                    onClick={togglePiP}
                    className="p-1 text-neutral-300 hover:text-white transition hidden sm:inline-flex"
                    title="Picture-in-Picture (Mini ventana flotante)"
                  >
                    <PictureInPicture2 className="w-4 h-4" />
                  </button>

                  <button
                    onClick={toggleFullscreen}
                    className="p-1 text-white hover:text-[#E50914] transition"
                    title="Pantalla completa"
                  >
                    {isFullscreen ? (
                      <Minimize className="w-4 h-4" />
                    ) : (
                      <Maximize className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Panel Derecho: Guía Rápida de Zapping (EPG Sidebar estilo TiviMate) */}
          {!theaterMode && (
            <div className="lg:col-span-4 bg-[#141414] rounded-2xl border border-white/10 flex flex-col overflow-hidden h-[360px] lg:h-auto lg:max-h-[450px] shadow-2xl">
              <div className="p-3.5 border-b border-white/10 flex items-center justify-between bg-neutral-900/80">
                <div className="flex items-center gap-2">
                  <Tv className="w-4 h-4 text-[#E50914]" />
                  <span className="text-xs font-extrabold uppercase tracking-wider text-white">
                    Guía Rápida ({selectedCategory})
                  </span>
                </div>
                <span className="text-[11px] text-neutral-400 font-mono">
                  {filteredChannels.length} ch
                </span>
              </div>

              <div className="flex-1 overflow-y-auto divide-y divide-white/[0.05] p-1.5">
                {filteredChannels.slice(0, 80).map((ch, idx) => {
                  const active = currentChannel?.url === ch.url;
                  const fav = isFavorite(ch);
                  return (
                    <div
                      key={`guide-${ch.url}`}
                      onClick={() => handleSelectChannel(ch)}
                      className={`flex items-center justify-between gap-2.5 p-2 rounded-xl cursor-pointer transition ${
                        active
                          ? 'bg-[#E50914]/20 border border-[#E50914]/50 text-white'
                          : 'hover:bg-white/[0.05] text-neutral-300'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="text-[10px] font-mono text-neutral-500 w-5 text-right shrink-0">
                          {idx + 1}
                        </span>
                        <div className="w-8 h-8 rounded-lg bg-black border border-white/10 flex items-center justify-center p-0.5 shrink-0">
                          <img
                            src={ch.logo}
                            alt={ch.name}
                            loading="lazy"
                            className="w-full h-full object-contain"
                            onError={(e) => {
                              e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(
                                ch.name
                              )}&background=E50914&color=fff&size=64&bold=true`;
                            }}
                          />
                        </div>
                        <div className="min-w-0">
                          <p
                            className={`text-xs font-bold truncate ${
                              active ? 'text-red-400' : 'text-white'
                            }`}
                          >
                            {ch.name}
                          </p>
                          <p className="text-[10px] text-neutral-500 truncate">
                            {ch.category} • {ch.countryName || 'Global'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={(e) => toggleFavorite(ch, e)}
                          className={`p-1 ${
                            fav ? 'text-amber-400' : 'text-neutral-600 hover:text-amber-400'
                          }`}
                        >
                          <Star className={`w-3.5 h-3.5 ${fav ? 'fill-current' : ''}`} />
                        </button>
                        {active && (
                          <span className="w-2 h-2 rounded-full bg-[#E50914] animate-pulse" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 4. Grilla Completa de Canales */}
      <div className="flex items-center justify-between mb-3.5 text-xs text-neutral-400">
        <span className="font-extrabold text-white uppercase tracking-wider">
          Explorar Mosaico • {selectedCategory} ({filteredChannels.length})
        </span>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 py-4">
          {Array.from({ length: 18 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl p-3 border border-white/[0.06] netflix-shimmer h-24"
            />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {visibleChannels.map((channel) => {
              const isActive = currentChannel?.url === channel.url;
              const fav = isFavorite(channel);

              return (
                <div
                  key={channel.url}
                  onClick={() => handleSelectChannel(channel)}
                  className={`group relative p-3 rounded-xl border transition-all duration-200 cursor-pointer flex flex-col justify-between h-24 ${
                    isActive
                      ? 'bg-neutral-900 border-[#E50914] ring-1 ring-[#E50914] shadow-lg shadow-red-950/40'
                      : 'bg-[#151515] hover:bg-neutral-800/90 border-white/[0.07] hover:border-white/20'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 overflow-hidden">
                      <div className="w-9 h-9 rounded-lg overflow-hidden bg-black border border-white/10 flex items-center justify-center p-0.5 shrink-0">
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
                          className={`text-xs font-bold truncate leading-tight ${
                            isActive ? 'text-red-400 font-black' : 'text-neutral-100'
                          }`}
                        >
                          {channel.name}
                        </h4>
                        <span className="text-[10px] text-neutral-500 truncate block mt-0.5">
                          {channel.category}
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={(e) => toggleFavorite(channel, e)}
                      className={`p-1 rounded transition ${
                        fav
                          ? 'text-amber-400'
                          : 'text-neutral-600 hover:text-amber-400 opacity-0 group-hover:opacity-100'
                      }`}
                    >
                      <Star className={`w-3.5 h-3.5 ${fav ? 'fill-current' : ''}`} />
                    </button>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-white/[0.05] text-[10px]">
                    <span className="text-neutral-400 truncate">
                      {channel.countryName || 'Global'}
                    </span>
                    {isActive ? (
                      <span className="text-[#E50914] font-black">● EN VIVO</span>
                    ) : (
                      <span className="text-neutral-500 group-hover:text-neutral-300">
                        Sintonizar ▶
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {filteredChannels.length > visibleLimit && (
            <div className="pt-8 text-center">
              <button
                onClick={() => setVisibleLimit((prev) => prev + BATCH_INCREMENT)}
                className="px-6 py-2.5 bg-neutral-900 hover:bg-neutral-800 text-white font-bold text-xs rounded-full border border-white/15 transition shadow-lg inline-flex items-center gap-2"
              >
                <span>Mostrar más canales (+{BATCH_INCREMENT})</span>
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>
          )}
        </>
      )}

      {/* Modal Agregar Lista M3U / Xtream */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
          <div className="relative w-full max-w-lg bg-[#181818] rounded-2xl overflow-hidden shadow-2xl border border-white/15 p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2.5">
                <PlusCircle className="w-5 h-5 text-emerald-400" />
                <h3 className="text-lg font-black text-white">Agregar Canales IPTV / M3U</h3>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="text-neutral-400 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex rounded-lg bg-neutral-900 p-1 border border-white/10 text-xs font-bold">
              <button
                onClick={() => setModalTab('m3u')}
                className={`flex-1 py-2 rounded-md transition ${
                  modalTab === 'm3u'
                    ? 'bg-[#E50914] text-white shadow'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                Lista M3U / M3U8 (URL)
              </button>
              <button
                onClick={() => setModalTab('xtream')}
                className={`flex-1 py-2 rounded-md transition ${
                  modalTab === 'xtream'
                    ? 'bg-[#E50914] text-white shadow'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                Xtream Codes API
              </button>
            </div>

            {modalTab === 'm3u' && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-neutral-300 mb-1">
                    URL de la Lista M3U / M3U8:
                  </label>
                  <input
                    type="url"
                    value={newM3uUrl}
                    onChange={(e) => setNewM3uUrl(e.target.value)}
                    placeholder="https://ejemplo.com/canales.m3u"
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-[#E50914]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-300 mb-1">
                    Nombre de la Lista (Opcional):
                  </label>
                  <input
                    type="text"
                    value={newM3uName}
                    onChange={(e) => setNewM3uName(e.target.value)}
                    placeholder="Ej. Deportes VIP"
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-[#E50914]"
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

            {modalTab === 'xtream' && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-neutral-300 mb-1">
                    Servidor Xtream (Host y Puerto):
                  </label>
                  <input
                    type="text"
                    value={xtreamServer}
                    onChange={(e) => setXtreamServer(e.target.value)}
                    placeholder="http://servidor.xyz:8080"
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-[#E50914]"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-300 mb-1">
                      Usuario:
                    </label>
                    <input
                      type="text"
                      value={xtreamUser}
                      onChange={(e) => setXtreamUser(e.target.value)}
                      placeholder="Usuario"
                      className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-[#E50914]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-300 mb-1">
                      Contraseña:
                    </label>
                    <input
                      type="password"
                      value={xtreamPass}
                      onChange={(e) => setXtreamPass(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-[#E50914]"
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

            {customSources.length > 0 && (
              <div className="pt-3 border-t border-white/10">
                <span className="block text-xs font-bold text-neutral-400 mb-2">
                  Listas Personalizadas Guardadas ({customSources.length}):
                </span>
                <div className="space-y-2 max-h-36 overflow-y-auto">
                  {customSources.map((src) => (
                    <div
                      key={src.id}
                      className="flex items-center justify-between p-2 rounded-lg bg-neutral-900 border border-white/10 text-xs"
                    >
                      <div className="truncate mr-2">
                        <span className="font-bold text-white block truncate">{src.name}</span>
                        <span className="text-[10px] text-neutral-500 truncate block">
                          {src.type === 'm3u' ? src.url : `${src.server} (${src.username})`}
                        </span>
                      </div>
                      <button
                        onClick={() => handleRemoveCustomSource(src.id)}
                        className="p-1 text-red-400 hover:text-red-300 transition"
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
