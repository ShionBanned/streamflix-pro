import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import {
  X,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Server,
  Zap,
  ShieldAlert,
  AlertTriangle,
  ChevronDown,
  RefreshCw,
  Sliders,
  ExternalLink,
  Subtitles,
  Copy,
  Check,
  FastForward,
  RotateCcw,
  SkipForward,
} from 'lucide-react';

export default function SmartPlayer({
  item,
  season = null,
  episode = null,
  initialTime = 0,
  onClose,
  onSaveProgress = null,
  onPlayNextEpisode = null,
}) {
  const [resolutionData, setResolutionData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Modo activo: 'p2p' | 'vidsrc' | 'superembed' | 'autoembed'
  const [activeServer, setActiveServer] = useState('p2p');
  const [selectedP2PStream, setSelectedP2PStream] = useState(null);
  const [videoError, setVideoError] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);

  // Subtítulos y Sincronización en vivo
  const [subtitles, setSubtitles] = useState([]);
  const [selectedSubId, setSelectedSubId] = useState('auto'); // 'off' | 'auto' | sub.id
  const [showSubMenu, setShowSubMenu] = useState(false);
  const [subtitleOffset, setSubtitleOffset] = useState(0); // Offset en segundos (-1.0s, +0.5s, etc.)

  // Estado P2P en vivo y selector manual de streams
  const [torrentStatus, setTorrentStatus] = useState(null);
  const [showStreamList, setShowStreamList] = useState(false);

  // Siguiente Episodio Automático
  const [showNextPrompt, setShowNextPrompt] = useState(false);
  const [nextCountdown, setNextCountdown] = useState(10);
  const nextTimerRef = useRef(null);
  const autoPlayCancelledRef = useRef(false);

  // Feedback de lanzador externo y copiado
  const [launchMessage, setLaunchMessage] = useState(null);
  const [copiedUrl, setCopiedUrl] = useState(false);

  // Controles de reproductor HTML5
  const videoRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(initialTime || 0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const controlsTimeoutRef = useRef(null);

  const title = item?.title || item?.name || 'Reproduciendo Contenido';
  const isSeries = Boolean(season && episode);
  const mediaType = item.media_type || (item.first_air_date ? 'tv' : 'movie');
  const originalLanguage = item.original_language || null;

  // 1. Resolver fuentes de video y subtítulos en paralelo
  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);
    autoPlayCancelledRef.current = false;
    setShowNextPrompt(false);
    setSubtitleOffset(0);

    const resolveSources = async () => {
      try {
        const params = {
          tmdbId: item.id,
          type: mediaType,
          originalLanguage,
        };
        if (season) params.season = season;
        if (episode) params.episode = episode;

        // 1.1 Resolución inteligente con Torrentio extendido
        const res = await axios.get('/api/resolve', { params });
        if (!isMounted) return;

        setResolutionData(res.data);

        // Decisión inteligente inicial
        if (res.data.decision === 'p2p' && res.data.bestStream) {
          setActiveServer('p2p');
          setSelectedP2PStream(res.data.bestStream);
        } else {
          setActiveServer('vidsrc');
          if (res.data.streams?.length > 0) {
            setSelectedP2PStream(res.data.streams[0]);
          }
        }

        // 1.2 Carga de subtítulos en español (Stremio v3 OpenSubtitles)
        if (res.data.imdbId) {
          try {
            const subParams = {};
            if (season) subParams.season = season;
            if (episode) subParams.episode = episode;

            const subRes = await axios.get(
              `/api/subtitles/${isSeries ? 'series' : 'movie'}/${res.data.imdbId}`,
              { params: subParams }
            );

            if (isMounted && subRes.data?.subtitles) {
              setSubtitles(subRes.data.subtitles);
              if (subRes.data.subtitles.length > 0) {
                setSelectedSubId(subRes.data.subtitles[0].id);
              }
            }
          } catch (subErr) {
            console.warn('Error cargando subtítulos:', subErr.message);
          }
        }

        setLoading(false);
      } catch (err) {
        console.error('Error resolviendo fuentes:', err);
        if (isMounted) {
          setError(err.response?.data?.error || 'Error conectando con los servidores de streaming');
          setActiveServer('vidsrc');
          setLoading(false);
        }
      }
    };

    resolveSources();
    return () => {
      isMounted = false;
    };
  }, [item.id, season, episode, mediaType, originalLanguage, isSeries]);

  // 2. Reanudar en el tiempo guardado (initialTime de Continuar Viendo)
  useEffect(() => {
    if (initialTime > 0 && videoRef.current) {
      videoRef.current.currentTime = initialTime;
    }
  }, [initialTime, activeServer]);

  // 3. Monitorear estado del torrent en vivo cuando esté en modo P2P
  useEffect(() => {
    if (activeServer !== 'p2p' || !selectedP2PStream?.infoHash) return;

    const interval = setInterval(async () => {
      try {
        const res = await axios.get(`/api/stream/${selectedP2PStream.infoHash}/status`);
        setTorrentStatus(res.data);
      } catch (e) {
        // Ignorar errores transitorios de polling
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [activeServer, selectedP2PStream?.infoHash]);

  // 4. Guardado periódico de progreso cada 10 segundos
  useEffect(() => {
    if (!onSaveProgress || activeServer !== 'p2p') return;

    const interval = setInterval(() => {
      if (videoRef.current && !videoRef.current.paused && videoRef.current.duration > 0) {
        onSaveProgress({
          item,
          season,
          episode,
          currentTime: videoRef.current.currentTime,
          duration: videoRef.current.duration,
        });
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [onSaveProgress, item, season, episode, activeServer]);

  // 5. Autolimpieza de almacenamiento temporal al cerrar el reproductor
  const handleSafeClose = useCallback(() => {
    // Guardar progreso final antes de salir
    if (onSaveProgress && videoRef.current && videoRef.current.duration > 0) {
      onSaveProgress({
        item,
        season,
        episode,
        currentTime: videoRef.current.currentTime,
        duration: videoRef.current.duration,
      });
    }

    // Ordenar al backend que destruya el torrent y limpie los archivos temporales de disco
    if (selectedP2PStream?.infoHash) {
      axios.post('/api/stream/close', { infoHash: selectedP2PStream.infoHash }).catch(() => {});
    }

    onClose();
  }, [item, season, episode, onSaveProgress, onClose, selectedP2PStream?.infoHash]);

  // 6. Activar/Desactivar pista de subtítulos en el elemento <video>
  useEffect(() => {
    if (!videoRef.current || !videoRef.current.textTracks) return;

    const tracks = videoRef.current.textTracks;
    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i];
      if (selectedSubId === 'off') {
        track.mode = 'disabled';
      } else {
        const currentSub = subtitles.find((s) => s.id === selectedSubId);
        if (currentSub && track.label === currentSub.label) {
          track.mode = 'showing';
        } else {
          track.mode = 'disabled';
        }
      }
    }
  }, [selectedSubId, subtitles]);

  // 7. Sincronizador de Subtítulos en Vivo (+0.5s / -0.5s)
  const adjustSubtitleOffset = (delta) => {
    const newOffset = Math.round((subtitleOffset + delta) * 10) / 10;
    setSubtitleOffset(newOffset);

    if (!videoRef.current || !videoRef.current.textTracks) return;

    const tracks = videoRef.current.textTracks;
    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i];
      if (track.cues) {
        for (let j = 0; j < track.cues.length; j++) {
          const cue = track.cues[j];
          cue.startTime += delta;
          cue.endTime += delta;
        }
      }
    }

    setLaunchMessage({
      type: 'info',
      text: `Sincronización de subtítulos: ${newOffset >= 0 ? '+' : ''}${newOffset}s`,
    });
    setTimeout(() => setLaunchMessage(null), 3000);
  };

  // 8. Siguiente Episodio Automático (Detección de finalización o últimos 25s)
  const handleTimeUpdate = () => {
    if (!videoRef.current) return;

    const cur = videoRef.current.currentTime;
    const dur = videoRef.current.duration || 0;
    setCurrentTime(cur);
    setDuration(dur);

    // Si es serie, faltan <= 25 segundos y el usuario no canceló el auto-play
    if (
      isSeries &&
      dur > 60 &&
      dur - cur <= 25 &&
      !showNextPrompt &&
      !autoPlayCancelledRef.current &&
      onPlayNextEpisode
    ) {
      setShowNextPrompt(true);
      setNextCountdown(10);
    }
  };

  // Cuenta regresiva del siguiente episodio
  useEffect(() => {
    if (!showNextPrompt) return;

    nextTimerRef.current = setInterval(() => {
      setNextCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(nextTimerRef.current);
          if (onPlayNextEpisode) {
            onPlayNextEpisode({ item, season, episode: (episode || 1) + 1 });
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(nextTimerRef.current);
  }, [showNextPrompt, onPlayNextEpisode, item, season, episode]);

  const cancelNextEpisode = () => {
    autoPlayCancelledRef.current = true;
    setShowNextPrompt(false);
    if (nextTimerRef.current) clearInterval(nextTimerRef.current);
  };

  // Helper para construir la URL absoluta de streaming local
  const getAbsoluteStreamUrl = () => {
    if (!selectedP2PStream?.infoHash) return '';
    return `http://localhost:4000/api/stream/${selectedP2PStream.infoHash}`;
  };

  // Lanzar reproductor externo nativo (VLC o MPV)
  const handleLaunchExternal = async (playerType) => {
    const streamUrl = getAbsoluteStreamUrl();
    if (!streamUrl) return;

    const activeSub = subtitles.find((s) => s.id === selectedSubId);
    const subtitleUrl = activeSub ? activeSub.vttUrl : null;

    setLaunchMessage({
      type: 'info',
      text: `Iniciando ${playerType.toUpperCase()} con decodificación de audio AC3/DTS...`,
    });

    try {
      const res = await axios.post('/api/player/launch', {
        player: playerType,
        streamUrl,
        subtitleUrl,
        title,
      });

      if (res.data?.success) {
        setLaunchMessage({
          type: 'success',
          text: `✓ Reproduciendo en ${playerType.toUpperCase()} (Audio multi-canal y subtítulos activos)`,
        });
      } else {
        setLaunchMessage({
          type: 'error',
          text: res.data?.error || `No se pudo iniciar ${playerType.toUpperCase()}`,
        });
      }
    } catch (err) {
      setLaunchMessage({
        type: 'error',
        text: `Error conectando con el lanzador de ${playerType.toUpperCase()}`,
      });
    }

    setTimeout(() => setLaunchMessage(null), 5000);
  };

  // Copiar URL de streaming al portapapeles
  const handleCopyStreamUrl = () => {
    const url = getAbsoluteStreamUrl();
    if (!url) return;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 3000);
    });
  };

  // Manejo de pantalla completa
  const toggleFullscreen = () => {
    const elem = document.getElementById('smart-player-container');
    if (!elem) return;

    if (!document.fullscreenElement) {
      elem.requestFullscreen().then(() => setIsFullscreen(true)).catch(console.error);
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(console.error);
    }
  };

  // Auto-ocultar controles de video al mover el ratón
  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying) setShowControls(false);
    }, 3500);
  };

  // Controles de reproducción HTML5
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

  const handleSeek = (e) => {
    const newTime = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  const handleVolumeChange = (e) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (videoRef.current) {
      videoRef.current.volume = val;
      setIsMuted(val === 0);
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    if (isMuted) {
      videoRef.current.muted = false;
      videoRef.current.volume = volume || 0.5;
      setIsMuted(false);
    } else {
      videoRef.current.muted = true;
      setIsMuted(true);
    }
  };

  const formatTime = (secs) => {
    if (!secs || isNaN(secs)) return '00:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Construir URL del iframe embed activo
  const getEmbedUrl = () => {
    const imdb = resolutionData?.imdbId || 'tt0137523';
    if (!resolutionData?.embedServers) {
      if (activeServer === 'vidsrc') {
        return isSeries
          ? `https://vidsrc.to/embed/tv/${imdb}/${season}/${episode}`
          : `https://vidsrc.to/embed/movie/${imdb}`;
      }
      if (activeServer === 'superembed') {
        return isSeries
          ? `https://multiembed.mov/?video_id=${imdb}&s=${season}&e=${episode}`
          : `https://multiembed.mov/?video_id=${imdb}`;
      }
      if (activeServer === 'twoembed') {
        return isSeries
          ? `https://2embed.cc/embedtv/${imdb}&s=${season}&e=${episode}`
          : `https://2embed.cc/embed/${imdb}`;
      }
      return isSeries
        ? `https://autoembed.co/tv/imdb/${imdb}-${season}-${episode}`
        : `https://autoembed.co/movie/imdb/${imdb}`;
    }

    const serverObj = resolutionData.embedServers.find((s) => s.id === activeServer);
    return serverObj ? serverObj.url : resolutionData.embedServers[0]?.url;
  };

  return (
    <div
      id="smart-player-container"
      onMouseMove={handleMouseMove}
      className="fixed inset-0 z-50 bg-black flex flex-col overflow-hidden select-none font-netflix"
    >
      {/* Top Header / Server Selector Bar */}
      <div
        className={`w-full bg-gradient-to-b from-black via-black/85 to-transparent px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3 z-30 transition-opacity duration-300 ${
          showControls || !isPlaying ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Title & Episode info */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleSafeClose}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition hover:scale-105"
            title="Volver"
          >
            <X className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-sm sm:text-base font-bold text-white leading-tight">
              {title}
            </h2>
            <div className="flex items-center gap-2 text-xs text-gray-400">
              {isSeries && (
                <span className="text-red-500 font-semibold">
                  Temporada {season} • Episodio {episode}
                </span>
              )}
              <span>•</span>
              <span className="text-emerald-400 font-medium">Resolución $0 Costo</span>
            </div>
          </div>
        </div>

        {/* Server Switcher Toolbar (Selector en pantalla) */}
        <div className="flex items-center flex-wrap gap-1.5 bg-neutral-900/90 border border-neutral-700 p-1 rounded-lg backdrop-blur-md">
          <span className="text-[11px] font-semibold text-gray-400 px-2 hidden sm:inline">
            Servidor:
          </span>

          {/* Botón P2P Torrentio */}
          <button
            onClick={() => setActiveServer('p2p')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition ${
              activeServer === 'p2p'
                ? 'bg-red-600 text-white shadow-md'
                : 'text-gray-300 hover:text-white hover:bg-white/10'
            }`}
          >
            <Zap className="w-3.5 h-3.5 fill-current" />
            <span>P2P Torrentio</span>
            {selectedP2PStream?.seeders > 0 && (
              <span className="text-[10px] bg-black/40 px-1 rounded text-emerald-300 font-mono">
                👤 {selectedP2PStream.seeders}
              </span>
            )}
          </button>

          {/* Servidor 1: VidSrc */}
          <button
            onClick={() => setActiveServer('vidsrc')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition ${
              activeServer === 'vidsrc'
                ? 'bg-red-600 text-white shadow-md'
                : 'text-gray-300 hover:text-white hover:bg-white/10'
            }`}
          >
            <Server className="w-3.5 h-3.5" />
            <span>VidSrc (1)</span>
          </button>

          {/* Servidor 2: SuperEmbed */}
          <button
            onClick={() => setActiveServer('superembed')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition ${
              activeServer === 'superembed'
                ? 'bg-red-600 text-white shadow-md'
                : 'text-gray-300 hover:text-white hover:bg-white/10'
            }`}
          >
            <Server className="w-3.5 h-3.5" />
            <span>SuperEmbed (2)</span>
          </button>

          {/* Servidor 3: AutoEmbed */}
          <button
            onClick={() => setActiveServer('autoembed')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition ${
              activeServer === 'autoembed'
                ? 'bg-red-600 text-white shadow-md'
                : 'text-gray-300 hover:text-white hover:bg-white/10'
            }`}
          >
            <Server className="w-3.5 h-3.5" />
            <span>AutoEmbed (3)</span>
          </button>

          {/* Servidor 4: 2Embed */}
          <button
            onClick={() => setActiveServer('twoembed')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition ${
              activeServer === 'twoembed'
                ? 'bg-red-600 text-white shadow-md'
                : 'text-gray-300 hover:text-white hover:bg-white/10'
            }`}
          >
            <Server className="w-3.5 h-3.5" />
            <span>2Embed (4)</span>
          </button>

          {/* Selector Manual de Calidad/Audio P2P */}
          {activeServer === 'p2p' && resolutionData?.streams?.length > 1 && (
            <button
              onClick={() => setShowStreamList(!showStreamList)}
              className="px-2.5 py-1.5 text-xs text-amber-300 hover:text-amber-200 rounded border-l border-neutral-700 flex items-center gap-1 font-semibold"
              title="Selector Manual de Calidad y Audio"
            >
              <Sliders className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden md:inline">Calidades ({resolutionData.streams.length})</span>
              <ChevronDown className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Toast de estado de lanzador nativo / subtítulos */}
      {launchMessage && (
        <div className="absolute top-16 left-1/2 transform -translate-x-1/2 z-50 animate-fadeIn">
          <div
            className={`px-4 py-2 rounded-lg shadow-2xl text-xs font-semibold flex items-center gap-2 border ${
              launchMessage.type === 'error'
                ? 'bg-red-950/90 border-red-500 text-red-200'
                : launchMessage.type === 'success'
                ? 'bg-emerald-950/90 border-emerald-500 text-emerald-200'
                : 'bg-neutral-900/90 border-neutral-700 text-gray-200'
            }`}
          >
            <span>{launchMessage.text}</span>
          </div>
        </div>
      )}

      {/* Menú Desplegable Selector Manual de Calidades/Audios Torrentio */}
      {showStreamList && activeServer === 'p2p' && (
        <div className="absolute top-16 right-4 sm:right-6 z-40 bg-neutral-900 border border-neutral-700 rounded-lg shadow-2xl p-3 w-88 max-w-[90vw] max-h-80 overflow-y-auto space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-gray-300 pb-2 border-b border-neutral-800">
            <span>Calidades / Audios Disponibles ({resolutionData.streams.length})</span>
            <button onClick={() => setShowStreamList(false)} className="text-gray-400 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          {resolutionData.streams.map((s) => (
            <div
              key={s.infoHash}
              onClick={() => {
                setSelectedP2PStream(s);
                setShowStreamList(false);
                if (videoRef.current) {
                  const savedCurrentTime = videoRef.current.currentTime;
                  videoRef.current.load();
                  videoRef.current.currentTime = savedCurrentTime;
                  videoRef.current.play().catch(console.error);
                }
              }}
              className={`p-2 rounded text-xs cursor-pointer transition flex items-center justify-between gap-2 ${
                selectedP2PStream?.infoHash === s.infoHash
                  ? 'bg-red-600/30 border border-red-500 text-white'
                  : 'bg-neutral-800/60 hover:bg-neutral-800 text-gray-300'
              }`}
            >
              <div className="truncate">
                <p className="font-semibold truncate">{s.displayLabel || s.cleanTitle}</p>
                <div className="flex items-center gap-2 text-[10px] text-gray-400 mt-0.5">
                  <span className="text-amber-400 font-bold">{s.resolution}</span>
                  <span>•</span>
                  <span className="text-blue-400">{s.language}</span>
                  {s.size && (
                    <>
                      <span>•</span>
                      <span>{s.size}</span>
                    </>
                  )}
                </div>
              </div>
              <span className="text-[10px] text-emerald-400 font-mono whitespace-nowrap">
                👤 {s.seeders}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Main Video Viewport */}
      <div className="relative flex-1 bg-black flex items-center justify-center overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center gap-4 text-center p-6">
            <RefreshCw className="w-10 h-10 text-red-600 animate-spin" />
            <div className="space-y-1">
              <p className="text-base font-bold text-white">Consultando Torrentio Latino & Subtítulos...</p>
              <p className="text-xs text-gray-400">
                Indexando trackers en español y preparando resolución híbrida automática
              </p>
            </div>
          </div>
        ) : activeServer === 'p2p' ? (
          /* MODO P2P: Reproductor HTML5 con Range 206 y WebTorrent */
          <div className="relative w-full h-full flex items-center justify-center">
            {selectedP2PStream ? (
              <>
                <video
                  ref={videoRef}
                  crossOrigin="anonymous"
                  src={`/api/stream/${selectedP2PStream.infoHash}`}
                  className="w-full h-full object-contain cursor-pointer"
                  onClick={togglePlay}
                  onTimeUpdate={handleTimeUpdate}
                  onWaiting={() => setIsBuffering(true)}
                  onCanPlay={() => {
                    setIsBuffering(false);
                    setVideoError(false);
                  }}
                  onError={(e) => {
                    console.warn('[P2P Video HTML5 Error]', e);
                    setVideoError(true);
                    setIsBuffering(false);
                  }}
                  onEnded={() => {
                    setIsPlaying(false);
                    if (isSeries && onPlayNextEpisode) {
                      setShowNextPrompt(true);
                      setNextCountdown(10);
                    }
                  }}
                  onPlay={() => {
                    setIsPlaying(true);
                    setIsBuffering(false);
                  }}
                  onPause={() => setIsPlaying(false)}
                  autoPlay
                  playsInline
                >
                  {/* Pistas de subtítulos en español WebVTT */}
                  {subtitles.map((sub, idx) => (
                    <track
                      key={sub.id}
                      kind="subtitles"
                      src={sub.vttUrl}
                      srcLang="es"
                      label={sub.label}
                      default={idx === 0}
                    />
                  ))}
                </video>

                {/* Indicador de buffering / conexión P2P */}
                {isBuffering && !videoError && (
                  <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center bg-black/40 z-20 space-y-3 animate-fadeIn">
                    <div className="w-10 h-10 border-4 border-red-600/30 border-t-red-600 rounded-full animate-spin"></div>
                    <span className="text-xs font-semibold text-gray-200 bg-black/60 px-3 py-1 rounded-full backdrop-blur-sm">
                      Conectando enjambre P2P y cargando buffer...
                    </span>
                  </div>
                )}

                {/* Overlay de fallback si el códec MKV/AC3 no es decodificable por el navegador */}
                {videoError && (
                  <div className="absolute inset-0 z-30 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center space-y-4">
                    <div className="w-14 h-14 rounded-full bg-red-600/20 border border-red-500/40 flex items-center justify-center text-red-500 shadow-xl">
                      <AlertTriangle className="w-7 h-7" />
                    </div>
                    <div className="max-w-md space-y-2">
                      <h3 className="text-base sm:text-lg font-bold text-white">
                        Códec o formato nativo detectado (MKV/AC3/HEVC)
                      </h3>
                      <p className="text-xs text-gray-300 leading-relaxed">
                        Este archivo multimedia de alta fidelidad requiere decodificación por hardware de audio/video. Puedes abrirlo al instante en VLC con soporte total o cambiar a un servidor Auto-Embed.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                      <button
                        onClick={() => setActiveServer('vidsrc')}
                        className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition shadow-lg flex items-center gap-2"
                      >
                        <Server className="w-4 h-4" />
                        <span>Cambiar a Servidor Auto-Embed</span>
                      </button>
                      <button
                        onClick={() => handleLaunchExternal('vlc')}
                        className="px-5 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-white border border-neutral-600 rounded-lg text-xs font-bold transition flex items-center gap-2 shadow"
                      >
                        <Play className="w-4 h-4 fill-current" />
                        <span>Abrir en VLC Media Player</span>
                      </button>
                      <button
                        onClick={() => {
                          setVideoError(false);
                          setIsBuffering(true);
                          if (videoRef.current) {
                            videoRef.current.load();
                            videoRef.current.play().catch(() => {});
                          }
                        }}
                        className="px-4 py-2.5 bg-neutral-900 hover:bg-neutral-800 text-gray-300 border border-white/10 rounded-lg text-xs transition"
                      >
                        Reintentar
                      </button>
                    </div>
                  </div>
                )}

                {/* Banner de estado P2P en vivo */}
                <div className="absolute top-4 left-4 z-20 flex items-center gap-2 bg-black/70 backdrop-blur-md border border-white/10 px-3 py-1.5 rounded-full text-xs text-gray-200">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span className="font-semibold text-white">P2P:</span>
                  <span>👤 {torrentStatus?.numPeers ?? selectedP2PStream.seeders} semillas</span>
                  {torrentStatus?.downloadSpeed > 0 && (
                    <>
                      <span>•</span>
                      <span className="text-emerald-400 font-mono">
                        ⚡ {(torrentStatus.downloadSpeed / (1024 * 1024)).toFixed(1)} MB/s
                      </span>
                    </>
                  )}
                  {torrentStatus?.progress !== undefined && (
                    <>
                      <span>•</span>
                      <span className="text-blue-400 font-mono">{torrentStatus.progress}%</span>
                    </>
                  )}
                </div>

                {/* Botón Flotante: Siguiente Episodio Automático (Estilo Netflix) */}
                {showNextPrompt && isSeries && (
                  <div className="absolute bottom-24 right-6 sm:right-12 z-40 bg-neutral-900/95 border border-white/20 rounded-xl p-4 shadow-2xl backdrop-blur-md flex items-center gap-4 animate-fadeIn">
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                        Siguiente Episodio
                      </p>
                      <p className="text-sm font-bold text-white">
                        Episodio {(episode || 1) + 1} en {nextCountdown}s...
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          if (nextTimerRef.current) clearInterval(nextTimerRef.current);
                          if (onPlayNextEpisode) {
                            onPlayNextEpisode({ item, season, episode: (episode || 1) + 1 });
                          }
                        }}
                        className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg text-xs flex items-center gap-1.5 shadow transition"
                      >
                        <SkipForward className="w-4 h-4 fill-current" />
                        <span>Reproducir Ahora</span>
                      </button>

                      <button
                        onClick={cancelNextEpisode}
                        className="px-3 py-2 bg-neutral-800 hover:bg-neutral-700 text-gray-300 rounded-lg text-xs font-medium transition"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}

                {/* Controles de video HTML5 en hover/pausa */}
                <div
                  className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black via-black/80 to-transparent p-4 sm:p-6 space-y-3 z-30 transition-opacity duration-300 ${
                    showControls || !isPlaying ? 'opacity-100' : 'opacity-0 pointer-events-none'
                  }`}
                >
                  {/* Seekbar */}
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono text-gray-300 min-w-[40px]">
                      {formatTime(currentTime)}
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={duration || 100}
                      value={currentTime}
                      onChange={handleSeek}
                      className="w-full h-1.5 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-red-600"
                    />
                    <span className="text-xs font-mono text-gray-400 min-w-[40px]">
                      {formatTime(duration)}
                    </span>
                  </div>

                  {/* Fila principal de controles: Play, volumen, subtítulos, sincronizador y reproductores nativos */}
                  <div className="flex items-center justify-between pt-1 flex-wrap gap-2">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={togglePlay}
                        className="p-2 text-white hover:text-red-500 transition"
                      >
                        {isPlaying ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current" />}
                      </button>

                      {/* Control de volumen */}
                      <div className="flex items-center gap-2">
                        <button onClick={toggleMute} className="text-gray-300 hover:text-white">
                          {isMuted ? <VolumeX className="w-5 h-5 text-red-500" /> : <Volume2 className="w-5 h-5" />}
                        </button>
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.05}
                          value={isMuted ? 0 : volume}
                          onChange={handleVolumeChange}
                          className="w-16 sm:w-20 h-1 bg-neutral-600 rounded cursor-pointer accent-red-600"
                        />
                      </div>

                      {/* Selector de Subtítulos */}
                      <div className="relative">
                        <button
                          onClick={() => setShowSubMenu(!showSubMenu)}
                          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-semibold transition border ${
                            selectedSubId !== 'off'
                              ? 'bg-neutral-800 text-white border-neutral-600'
                              : 'bg-transparent text-gray-400 border-transparent hover:text-white'
                          }`}
                          title="Seleccionar subtítulo en español"
                        >
                          <Subtitles className="w-4 h-4 text-amber-400" />
                          <span>Subtítulos ({subtitles.length})</span>
                          <ChevronDown className="w-3 h-3" />
                        </button>

                        {/* Menú desplegable de subtítulos */}
                        {showSubMenu && (
                          <div className="absolute bottom-10 left-0 bg-neutral-900 border border-neutral-700 rounded-lg shadow-2xl p-2 w-64 z-50 space-y-1">
                            <div className="text-[11px] font-bold text-gray-400 pb-1 border-b border-neutral-800">
                              Subtítulos en Español
                            </div>
                            <button
                              onClick={() => {
                                setSelectedSubId('off');
                                setShowSubMenu(false);
                              }}
                              className={`w-full text-left px-2 py-1.5 rounded text-xs transition ${
                                selectedSubId === 'off' ? 'bg-red-600 text-white' : 'text-gray-300 hover:bg-neutral-800'
                              }`}
                            >
                              ✕ Desactivados
                            </button>
                            {subtitles.map((sub) => (
                              <button
                                key={sub.id}
                                onClick={() => {
                                  setSelectedSubId(sub.id);
                                  setShowSubMenu(false);
                                }}
                                className={`w-full text-left px-2 py-1.5 rounded text-xs truncate transition ${
                                  selectedSubId === sub.id ? 'bg-red-600 text-white font-bold' : 'text-gray-300 hover:bg-neutral-800'
                                }`}
                              >
                                {sub.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Sincronizador de Subtítulos en Vivo */}
                      {selectedSubId !== 'off' && (
                        <div className="flex items-center gap-1 bg-neutral-900/90 border border-neutral-700 px-2 py-1 rounded text-[11px]">
                          <span className="text-gray-400 font-medium">Sync:</span>
                          <button
                            onClick={() => adjustSubtitleOffset(-0.5)}
                            className="px-1.5 py-0.5 rounded bg-neutral-800 hover:bg-neutral-700 text-white font-mono"
                            title="Atrasar subtítulos 0.5s"
                          >
                            -0.5s
                          </button>
                          <span className="font-mono text-amber-300 px-1">
                            {subtitleOffset >= 0 ? `+${subtitleOffset}` : subtitleOffset}s
                          </span>
                          <button
                            onClick={() => adjustSubtitleOffset(0.5)}
                            className="px-1.5 py-0.5 rounded bg-neutral-800 hover:bg-neutral-700 text-white font-mono"
                            title="Adelantar subtítulos 0.5s"
                          >
                            +0.5s
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Barra de Lanzadores Nativos (VLC / MPV) y Copiar URL */}
                    <div className="flex items-center gap-2">
                      {/* Botón VLC */}
                      <button
                        onClick={() => handleLaunchExternal('vlc')}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-600/90 hover:bg-orange-500 text-white rounded text-xs font-bold transition shadow hover:scale-105"
                        title="Abrir en VLC con audio AC3/DTS y soporte dual-audio por hardware"
                      >
                        <span>Abrir en VLC (Audio Latino / Subtítulos MKV)</span>
                      </button>

                      {/* Botón MPV */}
                      <button
                        onClick={() => handleLaunchExternal('mpv')}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-700/90 hover:bg-purple-600 text-white rounded text-xs font-bold transition shadow hover:scale-105"
                        title="Abrir en MPV con subtítulos y audio avanzado"
                      >
                        <span>Abrir en MPV</span>
                      </button>

                      {/* Botón Copiar URL */}
                      <button
                        onClick={handleCopyStreamUrl}
                        className="flex items-center gap-1 px-2.5 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-gray-300 hover:text-white rounded text-xs transition border border-neutral-700"
                        title="Copiar URL local del stream para VLC / MPV o reproductor externo"
                      >
                        {copiedUrl ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        <span className="hidden sm:inline">{copiedUrl ? '¡Copiado!' : 'Copiar URL'}</span>
                      </button>

                      {/* Botón Pantalla Completa */}
                      <button
                        onClick={toggleFullscreen}
                        className="p-2 text-gray-300 hover:text-white transition"
                        title="Pantalla completa"
                      >
                        {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center p-6 space-y-3">
                <ShieldAlert className="w-10 h-10 text-amber-500 mx-auto" />
                <p className="text-white font-semibold">
                  No se encontraron semillas P2P con el umbral óptimo (15+).
                </p>
                <button
                  onClick={() => setActiveServer('vidsrc')}
                  className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-md text-xs font-bold transition shadow-lg"
                >
                  Cambiar al Servidor 1 (Auto-Embed)
                </button>
              </div>
            )}
          </div>
        ) : (
          /* MODO FALLBACK AUTO-EMBED: iframe con sandbox estricto */
          <div className="relative w-full h-full flex flex-col">
            <iframe
              key={activeServer}
              src={getEmbedUrl()}
              title={`Reproductor ${activeServer}`}
              className="w-full h-full border-0"
              allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
              sandbox={activeServer === 'superembed' ? undefined : "allow-scripts allow-same-origin allow-forms allow-presentation"}
              allowFullScreen
            />

            {/* Aviso informativo en la base del iframe */}
            <div className="absolute bottom-2 left-4 right-4 z-20 pointer-events-none">
              <div className="inline-flex items-center gap-2 bg-black/80 backdrop-blur-md px-3 py-1 rounded text-[11px] text-gray-300 border border-white/10">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                <span>
                  Servidor {activeServer.toUpperCase()} activo. Si tarda en conectar, alterna entre los servidores arriba.
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
