import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import axios from 'axios';
import api from '../services/api.js';
import {
  X,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Server,
  AlertTriangle,
  ChevronDown,
  ExternalLink,
  Subtitles,
  Copy,
  Check,
  SkipForward,
  Globe,
  Shield,
  Layers,
  Tv,
  ArrowLeft,
  Cpu,
  Film,
  RotateCcw,
} from 'lucide-react';
import { LANGUAGE_OPTIONS } from '../hooks/useUserMedia.js';

export default function SmartPlayer({
  item,
  season = null,
  episode = null,
  initialTime = 0,
  initialLanguage = 'latino',
  onClose,
  onSaveProgress = null,
  onPlayNextEpisode = null,
  onChangeLanguage = null,
}) {
  const [resolutionData, setResolutionData] = useState(null);
  const [resolvingP2P, setResolvingP2P] = useState(true);

  const [selectedLanguage, setSelectedLanguage] = useState(initialLanguage || 'latino');

  const isSeries =
    Boolean(season && episode) ||
    item?.media_type === 'tv' ||
    item?.type === 'tv' ||
    Boolean(item?.first_air_date);
  const currentSeason = season || 1;
  const currentEpisode = episode || 1;
  const mediaType = isSeries ? 'tv' : 'movie';
  const originalLanguage = item?.original_language || null;
  const releaseYear = parseInt(
    (item?.release_date || item?.first_air_date || '2020').substring(0, 4),
    10
  );
  const isClassicTitle = releaseYear > 0 && releaseYear <= 2002;

  // Arranque Instantáneo en 0.0s (Sin pantalla de espera bloqueante):
  // Inicia de inmediato en VidSrc Pro o VidLink 4K mientras Torrentio carga en segundo plano
  const [activeServer, setActiveServer] = useState(() => {
    if (item?.server && item.server !== 'p2p') return item.server;
    return initialLanguage === 'latino' || initialLanguage === 'castellano'
      ? 'vidsrc'
      : 'vidlink';
  });
  const [activeMirrorIdx, setActiveMirrorIdx] = useState(0);
  const [useSandboxOnEmbed, setUseSandboxOnEmbed] = useState(false);

  // Control exacto de tiempo de reanudación ("Continuar Viendo")
  const [resumeOffset, setResumeOffset] = useState(() => Math.floor(Number(initialTime) || 0));
  const [showResumeBanner, setShowResumeBanner] = useState(() => Number(initialTime) > 10);
  const hasSeekedVideoRef = useRef(false);
  const trackedTimeRef = useRef(Math.floor(Number(initialTime) || 0));
  const trackedDurationRef = useRef(
    item?.duration && item.duration > 60
      ? item.duration
      : item?.runtime
      ? item.runtime * 60
      : isSeries
      ? 2700
      : 6000
  );

  const [selectedP2PStream, setSelectedP2PStream] = useState(null);
  const [forceTranscode, setForceTranscode] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [trailerFallbackKey, setTrailerFallbackKey] = useState(null);

  const [activeDrawer, setActiveDrawer] = useState(null); // null | 'servers' | 'language' | 'episodes' | 'subtitles'

  const [drawerSeason, setDrawerSeason] = useState(currentSeason);
  const [drawerEpisodes, setDrawerEpisodes] = useState([]);
  const [loadingDrawerEps, setLoadingDrawerEps] = useState(false);
  const [totalSeasons, setTotalSeasons] = useState(item?.number_of_seasons || 1);

  const [subtitles, setSubtitles] = useState([]);
  const [selectedSubId, setSelectedSubId] = useState('off');
  const [subtitleOffset, setSubtitleOffset] = useState(0);

  const [torrentStatus, setTorrentStatus] = useState(null);

  const [showNextPrompt, setShowNextPrompt] = useState(false);
  const [nextCountdown, setNextCountdown] = useState(10);
  const nextTimerRef = useRef(null);
  const autoPlayCancelledRef = useRef(false);

  const [launchMessage, setLaunchMessage] = useState(null);
  const [copiedUrl, setCopiedUrl] = useState(false);

  const videoRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(Math.floor(Number(initialTime) || 0));
  const [duration, setDuration] = useState(trackedDurationRef.current);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showHud, setShowHud] = useState(true);
  const hudTimeoutRef = useRef(null);
  const p2pWatchdogRef = useRef(null);

  const title = item?.title || item?.name || 'Reproduciendo Contenido';

  // Sincronizar initialTime cuando cambia de episodio o título
  useEffect(() => {
    const startSec = Math.floor(Number(initialTime) || 0);
    setResumeOffset(startSec);
    setCurrentTime(startSec);
    trackedTimeRef.current = startSec;
    hasSeekedVideoRef.current = false;
    setShowResumeBanner(startSec > 10);

    const timer = setTimeout(() => setShowResumeBanner(false), 7000);
    return () => clearTimeout(timer);
  }, [initialTime, item?.id, currentSeason, currentEpisode]);

  const triggerHudVisibility = useCallback(() => {
    setShowHud(true);
    if (hudTimeoutRef.current) clearTimeout(hudTimeoutRef.current);
    hudTimeoutRef.current = setTimeout(() => {
      if (!activeDrawer) {
        setShowHud(false);
      }
    }, 2500);
  }, [activeDrawer]);

  useEffect(() => {
    triggerHudVisibility();
    return () => {
      if (hudTimeoutRef.current) clearTimeout(hudTimeoutRef.current);
    };
  }, [triggerHudVisibility]);

  // 1. Resolver fuentes P2P y subtítulos en segundo plano (sin bloquear el arranque instantáneo del video)
  useEffect(() => {
    let isMounted = true;
    setResolvingP2P(true);
    autoPlayCancelledRef.current = false;
    setShowNextPrompt(false);
    setSubtitleOffset(0);
    setActiveMirrorIdx(0);

    const resolveInBackground = async () => {
      try {
        const params = {
          tmdbId: item.id || item.tmdbId,
          imdbId: item.imdb_id || item.imdbId,
          type: mediaType,
          originalLanguage,
          preferredLanguage: selectedLanguage,
        };
        if (isSeries) {
          params.season = currentSeason;
          params.episode = currentEpisode;
        }

        const [res, trailerRes] = await Promise.allSettled([
          api.resolveSource(params),
          api.getTrailers(mediaType, item.id || item.tmdbId, selectedLanguage),
        ]);

        if (!isMounted) return;

        if (trailerRes.status === 'fulfilled' && trailerRes.value?.key) {
          setTrailerFallbackKey(trailerRes.value.key);
        }

        if (res.status === 'fulfilled' && res.value) {
          const data = res.value;
          setResolutionData(data);

          if (data.streams?.length > 0) {
            setSelectedP2PStream(data.bestStream || data.streams[0]);
          }

          if (item.is_unreleased && (!data.streams || data.streams.length === 0)) {
            if (trailerRes.value?.key) setActiveServer('trailer');
          }

          if (data.imdbId) {
            try {
              const subs = await api.getSubtitles(
                isSeries ? 'series' : 'movie',
                data.imdbId,
                isSeries ? currentSeason : null,
                isSeries ? currentEpisode : null
              );
              if (isMounted && subs) {
                setSubtitles(subs);
                if (selectedLanguage === 'vose') {
                  const esSub = subs.find((s) => s.langGroup !== 'en') || subs[0];
                  setSelectedSubId(esSub ? esSub.id : 'off');
                } else if (selectedLanguage === 'en') {
                  const enSub = subs.find((s) => s.langGroup === 'en') || subs[0];
                  setSelectedSubId(enSub ? enSub.id : 'off');
                } else {
                  setSelectedSubId('off');
                }
              }
            } catch {
              // Ignorar
            }
          }
        }
      } catch (err) {
        console.warn('Error en resolución secundaria:', err.message);
      } finally {
        if (isMounted) setResolvingP2P(false);
      }
    };

    resolveInBackground();
    return () => {
      isMounted = false;
    };
  }, [
    item.id,
    item.tmdbId,
    currentSeason,
    currentEpisode,
    mediaType,
    originalLanguage,
    isSeries,
    selectedLanguage,
    item.is_unreleased,
  ]);

  // 2. Escuchar eventos postMessage de reproductores Cloud (VidLink, VidSrc, Videasy) + Temporizador de Respaldo
  // Esto garantiza que "Continuar Viendo" guarde el segundo exacto tanto en P2P como en servidores Cloud
  useEffect(() => {
    const handlePlayerMessage = (event) => {
      try {
        const raw = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (!raw || typeof raw !== 'object') return;

        // Formato VidLink / Videasy / JWPlayer postMessage
        const evCurrent =
          raw.currentTime ??
          raw.data?.currentTime ??
          raw.progress ??
          raw.time ??
          null;
        const evDuration =
          raw.duration ?? raw.data?.duration ?? null;

        if (typeof evCurrent === 'number' && evCurrent > 2) {
          trackedTimeRef.current = Math.floor(evCurrent);
          setCurrentTime(Math.floor(evCurrent));
        }
        if (typeof evDuration === 'number' && evDuration > 60) {
          trackedDurationRef.current = Math.floor(evDuration);
          setDuration(Math.floor(evDuration));
        }
      } catch {
        // Ignorar mensajes que no sean JSON de video
      }
    };

    window.addEventListener('message', handlePlayerMessage);
    return () => window.removeEventListener('message', handlePlayerMessage);
  }, []);

  // 3. Guardado continuo de progreso cada 5 segundos (tanto en P2P como en Cloud Embed)
  useEffect(() => {
    if (!onSaveProgress) return;

    const interval = setInterval(() => {
      if (activeServer === 'p2p') {
        if (videoRef.current && !videoRef.current.paused && videoRef.current.currentTime > 5) {
          const cur = Math.floor(videoRef.current.currentTime);
          const dur = Math.floor(videoRef.current.duration || trackedDurationRef.current);
          trackedTimeRef.current = cur;
          trackedDurationRef.current = dur;
          onSaveProgress({
            item,
            season: isSeries ? currentSeason : null,
            episode: isSeries ? currentEpisode : null,
            currentTime: cur,
            duration: dur,
            language: selectedLanguage,
            server: activeServer,
          });
        }
      } else if (activeServer !== 'trailer') {
        // En modo Cloud Embed: avanzar el contador de sesión activa cada 5 segundos si el iframe no emite postMessage
        trackedTimeRef.current += 5;
        onSaveProgress({
          item,
          season: isSeries ? currentSeason : null,
          episode: isSeries ? currentEpisode : null,
          currentTime: trackedTimeRef.current,
          duration: trackedDurationRef.current,
          language: selectedLanguage,
          server: activeServer,
        });
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [
    onSaveProgress,
    item,
    isSeries,
    currentSeason,
    currentEpisode,
    activeServer,
    selectedLanguage,
  ]);

  // 4. Watchdog de 6.5 segundos en modo P2P
  useEffect(() => {
    if (p2pWatchdogRef.current) clearTimeout(p2pWatchdogRef.current);
    if (activeServer !== 'p2p') return;

    p2pWatchdogRef.current = setTimeout(() => {
      if (!videoRef.current) return;
      const vid = videoRef.current;
      const isStuck = vid.currentTime === 0 && (vid.readyState < 3 || vid.videoWidth === 0);

      if (isStuck) {
        if (torrentStatus?.hasFfmpeg && !forceTranscode) {
          setForceTranscode(true);
          setLaunchMessage({
            type: 'info',
            text: '⚡ Activando decodificador FFmpeg para contenedor MKV/AC3...',
          });
          setTimeout(() => setLaunchMessage(null), 3500);
        } else {
          const fallbackSrv =
            selectedLanguage === 'latino' || selectedLanguage === 'castellano'
              ? 'vidsrc'
              : 'vidlink';
          setActiveServer(fallbackSrv);
          setLaunchMessage({
            type: 'info',
            text: '⚡ Cambio automático a Servidor Cloud HD para reproducción inmediata',
          });
          setTimeout(() => setLaunchMessage(null), 4000);
        }
      }
    }, 6500);

    return () => {
      if (p2pWatchdogRef.current) clearTimeout(p2pWatchdogRef.current);
    };
  }, [activeServer, selectedP2PStream, forceTranscode, torrentStatus?.hasFfmpeg, selectedLanguage]);

  // Cargar episodios en el cajón integrado
  useEffect(() => {
    if (!isSeries || activeDrawer !== 'episodes') return;
    let isMounted = true;
    setLoadingDrawerEps(true);

    const tmdbId = item.id || item.tmdbId;
    Promise.all([
      api.getTvDetails(tmdbId),
      api.getSeasonDetails(tmdbId, drawerSeason),
    ])
      .then(([tvDetails, seasonData]) => {
        if (!isMounted) return;
        if (tvDetails?.number_of_seasons) {
          setTotalSeasons(tvDetails.number_of_seasons);
        }
        setDrawerEpisodes(seasonData?.episodes || []);
        setLoadingDrawerEps(false);
      })
      .catch(() => {
        if (isMounted) setLoadingDrawerEps(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isSeries, activeDrawer, drawerSeason, item.id, item.tmdbId]);

  const handleLanguageChange = (newLang) => {
    setSelectedLanguage(newLang);
    if (onChangeLanguage) onChangeLanguage(newLang);
    setActiveDrawer(null);
    const langObj = LANGUAGE_OPTIONS.find((l) => l.id === newLang);
    setLaunchMessage({
      type: 'info',
      text: `${langObj?.flag || '🌐'} Idioma cambiado a ${langObj?.label || newLang}`,
    });
    setTimeout(() => setLaunchMessage(null), 2800);
  };

  // Monitorear estado del torrent en vivo cuando esté en modo P2P
  useEffect(() => {
    if (activeServer !== 'p2p' || !selectedP2PStream?.infoHash) return;

    const interval = setInterval(async () => {
      try {
        const res = await axios.get(`/api/stream/${selectedP2PStream.infoHash}/status`);
        setTorrentStatus(res.data);
      } catch {
        // Ignorar
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [activeServer, selectedP2PStream?.infoHash]);

  // Guardar progreso exacto al cerrar el reproductor
  const handleSafeClose = useCallback(() => {
    if (onSaveProgress && trackedTimeRef.current > 5) {
      onSaveProgress({
        item,
        season: isSeries ? currentSeason : null,
        episode: isSeries ? currentEpisode : null,
        currentTime:
          activeServer === 'p2p' && videoRef.current?.currentTime > 5
            ? Math.floor(videoRef.current.currentTime)
            : trackedTimeRef.current,
        duration:
          activeServer === 'p2p' && videoRef.current?.duration > 60
            ? Math.floor(videoRef.current.duration)
            : trackedDurationRef.current,
        language: selectedLanguage,
        server: activeServer,
      });
    }

    if (selectedP2PStream?.infoHash) {
      axios.post('/api/stream/close', { infoHash: selectedP2PStream.infoHash }).catch(() => {});
    }

    onClose();
  }, [
    item,
    isSeries,
    currentSeason,
    currentEpisode,
    onSaveProgress,
    onClose,
    selectedP2PStream?.infoHash,
    selectedLanguage,
    activeServer,
  ]);

  // Reiniciar película/episodio desde 00:00
  const handleRestartFromZero = () => {
    setResumeOffset(0);
    trackedTimeRef.current = 0;
    setCurrentTime(0);
    setShowResumeBanner(false);
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play().catch(() => {});
    }
    if (onSaveProgress) {
      onSaveProgress({
        item,
        season: isSeries ? currentSeason : null,
        episode: isSeries ? currentEpisode : null,
        currentTime: 6,
        duration: trackedDurationRef.current,
        language: selectedLanguage,
        server: activeServer,
      });
    }
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (activeDrawer) {
          setActiveDrawer(null);
        } else {
          handleSafeClose();
        }
        return;
      }
      if (activeServer !== 'p2p' || !videoRef.current) return;

      if (e.key === ' ' || e.key.toLowerCase() === 'k') {
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        videoRef.current.currentTime = Math.min(
          videoRef.current.duration || 0,
          videoRef.current.currentTime + 10
        );
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 10);
      } else if (e.key.toLowerCase() === 'f') {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.key.toLowerCase() === 'm') {
        e.preventDefault();
        toggleMute();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeServer, activeDrawer, handleSafeClose]);

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
  };

  // Aplicar el salto exacto a `resumeOffset` apenas el elemento <video> cargue sus metadatos
  const applyInitialVideoSeek = (videoEl) => {
    if (!videoEl || hasSeekedVideoRef.current) return;
    if (resumeOffset > 5 && (!videoEl.duration || resumeOffset < videoEl.duration - 10)) {
      try {
        videoEl.currentTime = resumeOffset;
        setCurrentTime(resumeOffset);
        hasSeekedVideoRef.current = true;
      } catch {
        // Reintentar en onCanPlay
      }
    } else {
      hasSeekedVideoRef.current = true;
    }
  };

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;

    const cur = videoRef.current.currentTime;
    const dur = videoRef.current.duration || 0;
    setCurrentTime(cur);
    if (dur > 0) {
      setDuration(dur);
      trackedDurationRef.current = dur;
    }
    if (cur > 5) {
      trackedTimeRef.current = Math.floor(cur);
    }

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

  useEffect(() => {
    if (!showNextPrompt) return;

    nextTimerRef.current = setInterval(() => {
      setNextCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(nextTimerRef.current);
          if (onPlayNextEpisode) {
            onPlayNextEpisode({
              item,
              season: currentSeason,
              episode: currentEpisode + 1,
              initialTime: 0,
              language: selectedLanguage,
            });
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(nextTimerRef.current);
  }, [showNextPrompt, onPlayNextEpisode, item, currentSeason, currentEpisode, selectedLanguage]);

  const getP2PRelativeUrl = () => {
    if (!selectedP2PStream?.infoHash) return '';
    const qs = new URLSearchParams();
    if (selectedP2PStream.fileIdx !== null && selectedP2PStream.fileIdx !== undefined) {
      qs.set('fileIdx', selectedP2PStream.fileIdx);
    }
    if (isSeries) {
      qs.set('s', currentSeason);
      qs.set('e', currentEpisode);
    }
    if (forceTranscode) {
      qs.set('transcode', '1');
    }
    const query = qs.toString();
    return `/api/stream/${selectedP2PStream.infoHash}${query ? `?${query}` : ''}`;
  };

  const getAbsoluteStreamUrl = () => {
    const rel = getP2PRelativeUrl();
    if (!rel) return '';
    return `http://localhost:4000${rel}`;
  };

  const handleLaunchExternal = async (playerType) => {
    const streamUrl = getAbsoluteStreamUrl();
    if (!streamUrl) return;

    const activeSub = subtitles.find((s) => s.id === selectedSubId);
    const subtitleUrl = activeSub ? `http://localhost:4000${activeSub.vttUrl}` : null;

    setLaunchMessage({
      type: 'info',
      text: `Abriendo ${playerType.toUpperCase()}...`,
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
          text: `✓ Reproduciendo en ${playerType.toUpperCase()}`,
        });
      } else {
        setLaunchMessage({
          type: 'error',
          text: res.data?.error || `No se pudo iniciar ${playerType.toUpperCase()}`,
        });
      }
    } catch {
      setLaunchMessage({
        type: 'error',
        text: `Error conectando con ${playerType.toUpperCase()}`,
      });
    }

    setTimeout(() => setLaunchMessage(null), 4000);
  };

  const toggleFullscreen = () => {
    const elem = document.getElementById('smart-player-container');
    if (!elem) return;

    if (!document.fullscreenElement) {
      elem.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
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

  const handleSeek = (e) => {
    const newTime = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = newTime;
      setCurrentTime(newTime);
      trackedTimeRef.current = Math.floor(newTime);
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
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const embedServersList = useMemo(() => {
    if (resolutionData?.embedServers?.length > 0) {
      return resolutionData.embedServers;
    }
    const tmdb = item.id || item.tmdbId || '550';
    const s = currentSeason;
    const e = currentEpisode;
    return [
      {
        id: 'vidlink',
        name: 'VidLink 4K',
        badge: 'Ultra Rápido',
        mirrors: [
          {
            id: 'main',
            name: 'VidLink 4K Principal',
            url: isSeries
              ? `https://vidlink.pro/tv/${tmdb}/${s}/${e}?primaryColor=E50914&autoplay=true&nextbutton=true`
              : `https://vidlink.pro/movie/${tmdb}?primaryColor=E50914&autoplay=true`,
          },
        ],
      },
      {
        id: 'vidsrc',
        name: 'VidSrc Pro',
        badge: '5 Espejos',
        mirrors: [
          {
            id: 'cc-tmdb',
            name: 'VidSrc.cc v2 (TMDB)',
            url: isSeries
              ? `https://vidsrc.cc/v2/embed/tv/${tmdb}/${s}/${e}?autoPlay=true`
              : `https://vidsrc.cc/v2/embed/movie/${tmdb}?autoPlay=true`,
          },
          {
            id: 'me-ru',
            name: 'VidSrcMe (Sub ES)',
            url: isSeries
              ? `https://vidsrcme.ru/embed/tv/${tmdb}/${s}-${e}?ds_lang=es&autoplay=1`
              : `https://vidsrcme.ru/embed/movie/${tmdb}?ds_lang=es&autoplay=1`,
          },
        ],
      },
      {
        id: 'superembed',
        name: 'SuperEmbed VIP',
        badge: 'Multi-Audio ES',
        mirrors: [
          {
            id: 'direct-tmdb',
            name: 'DirectStream VIP (TMDB)',
            url: isSeries
              ? `https://multiembed.mov/directstream.php?video_id=${tmdb}&tmdb=1&s=${s}&e=${e}`
              : `https://multiembed.mov/directstream.php?video_id=${tmdb}&tmdb=1`,
          },
        ],
      },
      {
        id: 'autoembed',
        name: 'Embed.su / MoviesAPI',
        badge: 'Catálogo Masivo',
        mirrors: [
          {
            id: 'embedsu',
            name: 'Embed.su Cloud HD',
            url: isSeries
              ? `https://embed.su/embed/tv/${tmdb}/${s}/${e}`
              : `https://embed.su/embed/movie/${tmdb}`,
          },
          {
            id: 'moviesapi',
            name: 'MoviesAPI Club',
            url: isSeries
              ? `https://moviesapi.club/tv/${tmdb}-${s}-${e}`
              : `https://moviesapi.club/movie/${tmdb}`,
          },
        ],
      },
      {
        id: 'retro',
        name: 'Retro & Clásicos (80s/90s)',
        badge: 'Especial 30+ Años',
        mirrors: [
          {
            id: 'smashy',
            name: 'SmashyStream Clásicos',
            url: isSeries
              ? `https://player.smashy.stream/tv/${tmdb}?s=${s}&e=${e}`
              : `https://player.smashy.stream/movie/${tmdb}`,
          },
          {
            id: 'videasy',
            name: 'Videasy Cloud',
            url: isSeries
              ? `https://player.videasy.net/tv/${tmdb}/${s}/${e}?color=E50914`
              : `https://player.videasy.net/movie/${tmdb}?color=E50914`,
          },
        ],
      },
    ];
  }, [resolutionData, item, isSeries, currentSeason, currentEpisode]);

  const currentEmbedServerObj = useMemo(() => {
    return embedServersList.find((s) => s.id === activeServer) || embedServersList[0];
  }, [embedServersList, activeServer]);

  /**
   * Construye la URL final del servidor Cloud inyectando el segundo exacto de reanudación
   * (`startAt`, `startTime` o `progress`) cuando el usuario viene de "Continuar Viendo"
   */
  const currentEmbedUrl = useMemo(() => {
    if (!currentEmbedServerObj) return '';
    let base =
      currentEmbedServerObj.mirrors && currentEmbedServerObj.mirrors[activeMirrorIdx]
        ? currentEmbedServerObj.mirrors[activeMirrorIdx].url
        : currentEmbedServerObj.url || '';

    if (resumeOffset > 10 && base) {
      const sep = base.includes('?') ? '&' : '?';
      if (base.includes('smashy.stream')) {
        base = `${base}${sep}startTime=${resumeOffset}`;
      } else if (base.includes('videasy.net')) {
        base = `${base}${sep}progress=${resumeOffset}`;
      } else {
        base = `${base}${sep}startAt=${resumeOffset}`;
      }
    }
    return base;
  }, [currentEmbedServerObj, activeMirrorIdx, resumeOffset]);

  const handleCopyStreamUrl = () => {
    const url = activeServer === 'p2p' ? getAbsoluteStreamUrl() : currentEmbedUrl;
    if (!url) return;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 3000);
    });
  };

  const currentLangObj =
    LANGUAGE_OPTIONS.find((l) => l.id === selectedLanguage) || LANGUAGE_OPTIONS[0];

  const activeServerLabel =
    activeServer === 'p2p'
      ? `P2P (${selectedP2PStream?.resolution || 'HD'})`
      : activeServer === 'trailer'
      ? 'Tráiler Oficial 4K'
      : currentEmbedServerObj?.name || 'Cloud HD';

  return (
    <div
      id="smart-player-container"
      onMouseMove={triggerHudVisibility}
      onClick={() => {
        if (activeDrawer) setActiveDrawer(null);
      }}
      className="fixed inset-0 z-50 bg-black overflow-hidden select-none font-netflix animate-fadeIn"
    >
      {/* Sensor invisible en el borde superior para despertar el HUD cuando se está viendo en un iframe */}
      <div
        onMouseEnter={triggerHudVisibility}
        className="absolute top-0 left-0 right-0 h-12 z-30 pointer-events-auto"
        style={{ background: 'transparent' }}
      />

      {/* HUD SUPERIOR FLOTANTE ULTRA-LIMPIO (NO INVASIVO) */}
      <div
        onClick={(e) => e.stopPropagation()}
        className={`absolute top-4 left-4 right-4 z-40 flex items-center justify-between gap-3 pointer-events-none transition-all duration-500 ${
          showHud || activeDrawer
            ? 'opacity-100 translate-y-0'
            : 'opacity-0 -translate-y-4 pointer-events-none'
        }`}
      >
        {/* Cápsula Izquierda: Volver + Título + Banner de Reanudación */}
        <div className="pointer-events-auto flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2.5 bg-black/75 hover:bg-black/90 backdrop-blur-xl border border-white/15 pl-2 pr-4 py-1.5 rounded-full shadow-[0_10px_30px_rgba(0,0,0,0.8)] transition-all">
            <button
              onClick={handleSafeClose}
              className="w-8 h-8 rounded-full bg-white/10 hover:bg-[#E50914] text-white flex items-center justify-center transition-all hover:scale-105"
              title="Guardar progreso y volver (ESC)"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2 max-w-[180px] sm:max-w-md truncate">
              <span className="text-xs sm:text-sm font-extrabold text-white truncate">
                {title}
              </span>
              {isSeries && (
                <span className="px-2 py-0.5 bg-[#E50914] text-white text-[10px] rounded-full font-black shrink-0">
                  T{currentSeason}:E{currentEpisode}
                </span>
              )}
              {isClassicTitle && (
                <span className="hidden md:inline-block px-2 py-0.5 bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[10px] rounded-full font-bold shrink-0">
                  Clásico {releaseYear}
                </span>
              )}
            </div>
          </div>

          {/* Píldora de Reanudación ("Continuar Viendo") con botón para reiniciar desde 00:00 */}
          {showResumeBanner && resumeOffset > 10 && (
            <div className="flex items-center gap-2 bg-emerald-950/90 backdrop-blur-xl border border-emerald-500/40 px-3 py-1.5 rounded-full text-xs text-emerald-200 shadow-lg animate-fadeIn">
              <span>▶ Reanudado en {formatTime(resumeOffset)}</span>
              <button
                onClick={handleRestartFromZero}
                className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/15 hover:bg-white/25 text-white text-[10px] font-bold transition"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Desde 00:00</span>
              </button>
            </div>
          )}
        </div>

        {/* Cápsula Derecha: Controles Flotantes Compactos */}
        <div className="pointer-events-auto flex items-center gap-2">
          {isSeries && (
            <>
              <button
                onClick={() => {
                  if (onPlayNextEpisode) {
                    onPlayNextEpisode({
                      item,
                      season: currentSeason,
                      episode: currentEpisode + 1,
                      initialTime: 0,
                      language: selectedLanguage,
                    });
                  }
                }}
                className="hidden sm:flex items-center gap-1.5 bg-black/75 hover:bg-white hover:text-black text-white backdrop-blur-xl border border-white/15 px-3 py-2 rounded-full text-xs font-bold transition-all shadow-lg"
              >
                <SkipForward className="w-3.5 h-3.5 fill-current" />
                <span>Sig. Ep</span>
              </button>

              <button
                onClick={() =>
                  setActiveDrawer(activeDrawer === 'episodes' ? null : 'episodes')
                }
                className={`flex items-center gap-1.5 backdrop-blur-xl border px-3.5 py-2 rounded-full text-xs font-bold transition-all shadow-lg ${
                  activeDrawer === 'episodes'
                    ? 'bg-[#E50914] text-white border-red-400'
                    : 'bg-black/75 hover:bg-black/90 text-white border-white/15'
                }`}
              >
                <Tv className="w-3.5 h-3.5 text-sky-400" />
                <span className="hidden md:inline">Episodios</span>
                <ChevronDown className="w-3.5 h-3.5 opacity-75" />
              </button>
            </>
          )}

          <button
            onClick={() =>
              setActiveDrawer(activeDrawer === 'language' ? null : 'language')
            }
            className={`flex items-center gap-1.5 backdrop-blur-xl border px-3.5 py-2 rounded-full text-xs font-bold transition-all shadow-lg ${
              activeDrawer === 'language'
                ? 'bg-[#E50914] text-white border-red-400'
                : 'bg-black/75 hover:bg-black/90 text-white border-white/15'
            }`}
          >
            <span>{currentLangObj.flag}</span>
            <span className="hidden sm:inline">{currentLangObj.shortLabel}</span>
            <ChevronDown className="w-3.5 h-3.5 opacity-75" />
          </button>

          <button
            onClick={() =>
              setActiveDrawer(activeDrawer === 'servers' ? null : 'servers')
            }
            className={`flex items-center gap-1.5 backdrop-blur-xl border px-3.5 py-2 rounded-full text-xs font-bold transition-all shadow-lg ${
              activeDrawer === 'servers'
                ? 'bg-[#E50914] text-white border-red-400'
                : 'bg-black/75 hover:bg-black/90 text-white border-white/15'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-emerald-400" />
            <span>{activeServerLabel}</span>
            <ChevronDown className="w-3.5 h-3.5 opacity-75" />
          </button>
        </div>
      </div>

      {/* CAJÓN A: Selector de Idioma */}
      {activeDrawer === 'language' && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute top-16 right-4 sm:right-28 z-50 w-72 bg-[#141414]/96 backdrop-blur-2xl border border-white/15 rounded-2xl shadow-[0_25px_60px_rgba(0,0,0,0.95)] p-3 space-y-1.5 animate-fadeIn"
        >
          <div className="flex items-center justify-between px-2 pb-2 border-b border-white/10">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-[#E50914]" />
              Idioma de Audio & Subtítulos
            </span>
            <button
              onClick={() => setActiveDrawer(null)}
              className="text-neutral-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {LANGUAGE_OPTIONS.map((opt) => {
            const active = selectedLanguage === opt.id;
            return (
              <button
                key={opt.id}
                onClick={() => handleLanguageChange(opt.id)}
                className={`w-full text-left px-3 py-2.5 rounded-xl transition flex items-center justify-between ${
                  active
                    ? 'bg-[#E50914] text-white font-bold shadow'
                    : 'hover:bg-white/[0.07] text-neutral-300'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-base">{opt.flag}</span>
                  <div>
                    <div className="text-xs font-bold">{opt.label}</div>
                    <div
                      className={`text-[10px] ${
                        active ? 'text-red-100' : 'text-neutral-400'
                      }`}
                    >
                      {opt.badge}
                    </div>
                  </div>
                </div>
                {active && <Check className="w-4 h-4 text-white" />}
              </button>
            );
          })}
        </div>
      )}

      {/* CAJÓN B: Centro Unificado de Servidores Cloud, Espejos y Fuentes P2P */}
      {activeDrawer === 'servers' && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute top-16 right-4 z-50 w-[360px] sm:w-[420px] max-w-[94vw] max-h-[82vh] overflow-y-auto bg-[#141414]/96 backdrop-blur-2xl border border-white/15 rounded-2xl shadow-[0_25px_70px_rgba(0,0,0,0.95)] p-4 space-y-4 animate-fadeIn"
        >
          <div className="flex items-center justify-between pb-2.5 border-b border-white/10">
            <div>
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-white flex items-center gap-1.5">
                <Server className="w-3.5 h-3.5 text-[#E50914]" />
                Centro de Servidores & Espejos
              </h3>
              <p className="text-[10px] text-neutral-400 mt-0.5">
                6 Motores Cloud (18 espejos) + P2P Torrentio
              </p>
            </div>
            <button
              onClick={() => setActiveDrawer(null)}
              className="text-neutral-400 hover:text-white p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-2">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-400 block">
              ☁️ Motores Cloud Instantáneos (Películas y Clásicos 30+ Años)
            </span>

            <div className="grid grid-cols-2 gap-1.5">
              {embedServersList.map((srv) => {
                const isSelected = activeServer === srv.id;
                return (
                  <button
                    key={srv.id}
                    onClick={() => {
                      setActiveServer(srv.id);
                      setActiveMirrorIdx(0);
                    }}
                    className={`p-2.5 rounded-xl border text-left transition-all ${
                      isSelected
                        ? 'bg-[#E50914]/25 border-[#E50914] text-white shadow'
                        : 'bg-neutral-900/80 hover:bg-neutral-800 border-white/10 text-neutral-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold truncate">{srv.name}</span>
                      {isSelected && <Check className="w-3.5 h-3.5 text-[#E50914] shrink-0" />}
                    </div>
                    <span className="inline-block mt-1 text-[9px] px-1.5 py-0.2 rounded bg-white/10 text-neutral-300 font-semibold">
                      {srv.badge}
                    </span>
                  </button>
                );
              })}
            </div>

            {activeServer !== 'p2p' &&
              activeServer !== 'trailer' &&
              currentEmbedServerObj?.mirrors?.length > 1 && (
                <div className="p-2.5 rounded-xl bg-black/50 border border-white/10 space-y-2">
                  <span className="text-[10px] font-bold text-neutral-400 block">
                    Espejos disponibles en {currentEmbedServerObj.name}:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {currentEmbedServerObj.mirrors.map((m, idx) => (
                      <button
                        key={m.id}
                        onClick={() => setActiveMirrorIdx(idx)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition ${
                          activeMirrorIdx === idx
                            ? 'bg-emerald-600/30 text-emerald-300 border-emerald-500'
                            : 'bg-neutral-900 hover:bg-neutral-800 text-neutral-300 border-white/10'
                        }`}
                      >
                        {m.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
          </div>

          <div className="pt-2 border-t border-white/10 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-400">
                ⚡ Streaming P2P Torrentio ({
                  resolvingP2P
                    ? 'buscando...'
                    : `${resolutionData?.streams?.length || 0} fuentes`
                })
              </span>
              {torrentStatus?.hasFfmpeg && (
                <button
                  onClick={() => setForceTranscode(!forceTranscode)}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold border flex items-center gap-1 ${
                    forceTranscode
                      ? 'bg-purple-600/30 text-purple-300 border-purple-500'
                      : 'bg-neutral-900 text-neutral-400 border-white/10'
                  }`}
                >
                  <Cpu className="w-3 h-3" />
                  <span>FFmpeg Remux {forceTranscode ? 'ON' : 'OFF'}</span>
                </button>
              )}
            </div>

            {resolutionData?.streams?.length > 0 ? (
              <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                {resolutionData.streams.slice(0, 15).map((s, idx) => {
                  const isCurrentP2P =
                    activeServer === 'p2p' && selectedP2PStream?.infoHash === s.infoHash;
                  return (
                    <div
                      key={`${s.infoHash}-${idx}`}
                      onClick={() => {
                        setSelectedP2PStream(s);
                        hasSeekedVideoRef.current = false;
                        setActiveServer('p2p');
                        setVideoError(false);
                        setActiveDrawer(null);
                      }}
                      className={`p-2 rounded-xl text-xs cursor-pointer transition flex items-center justify-between gap-2 border ${
                        isCurrentP2P
                          ? 'bg-[#E50914]/25 border-[#E50914] text-white'
                          : 'bg-neutral-900/70 hover:bg-neutral-800 border-white/5 text-neutral-300'
                      }`}
                    >
                      <div className="truncate">
                        <div className="font-bold truncate flex items-center gap-1.5">
                          <span>{s.resolution}</span>
                          <span>•</span>
                          <span className="text-sky-400">{s.language}</span>
                          {s.browserNative ? (
                            <span className="px-1 py-0.1 bg-emerald-500/20 text-emerald-300 text-[9px] rounded">
                              Web MP4
                            </span>
                          ) : (
                            <span className="px-1 py-0.1 bg-amber-500/20 text-amber-300 text-[9px] rounded">
                              MKV/VLC
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-neutral-500 truncate mt-0.5">
                          {s.cleanTitle}
                        </p>
                      </div>
                      <span className="text-[10px] text-emerald-400 font-mono font-bold shrink-0">
                        👤 {s.seeders}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-[11px] text-neutral-500 italic">
                {resolvingP2P
                  ? 'Consultando trackers P2P en segundo plano...'
                  : 'Reproducción servida directamente por el clúster Cloud HD.'}
              </p>
            )}
          </div>

          <div className="pt-2 border-t border-white/10 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              {selectedP2PStream && (
                <>
                  <button
                    onClick={() => handleLaunchExternal('vlc')}
                    className="px-2.5 py-1.5 bg-orange-600 hover:bg-orange-500 text-white rounded-lg text-[11px] font-extrabold transition"
                  >
                    Abrir en VLC
                  </button>
                  <button
                    onClick={() => handleLaunchExternal('mpv')}
                    className="px-2.5 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-white border border-white/15 rounded-lg text-[11px] font-bold transition"
                  >
                    MPV
                  </button>
                </>
              )}
              {trailerFallbackKey && (
                <button
                  onClick={() => {
                    setActiveServer('trailer');
                    setActiveDrawer(null);
                  }}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition flex items-center gap-1 ${
                    activeServer === 'trailer'
                      ? 'bg-[#E50914] text-white border-red-500'
                      : 'bg-neutral-900 hover:bg-neutral-800 text-neutral-300 border-white/10'
                  }`}
                >
                  <Film className="w-3 h-3" />
                  <span>Tráiler</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              {activeServer !== 'p2p' && activeServer !== 'trailer' && (
                <>
                  <button
                    onClick={() => setUseSandboxOnEmbed(!useSandboxOnEmbed)}
                    className={`px-2 py-1.5 rounded-lg text-[10px] font-bold border transition flex items-center gap-1 ${
                      !useSandboxOnEmbed
                        ? 'bg-emerald-950/60 text-emerald-300 border-emerald-600/40'
                        : 'bg-amber-950/60 text-amber-300 border-amber-600/40'
                    }`}
                  >
                    <Shield className="w-3 h-3" />
                    <span>{!useSandboxOnEmbed ? 'Sin Bloqueos' : 'Sandbox ON'}</span>
                  </button>

                  <a
                    href={currentEmbedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-white/10"
                    title="Abrir en nueva pestaña"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* CAJÓN C: Selector de Episodios Dentro del Reproductor */}
      {activeDrawer === 'episodes' && isSeries && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute top-16 right-4 sm:right-16 z-50 w-[350px] sm:w-[410px] max-w-[94vw] max-h-[80vh] flex flex-col bg-[#141414]/96 backdrop-blur-2xl border border-white/15 rounded-2xl shadow-[0_25px_70px_rgba(0,0,0,0.95)] p-4 animate-fadeIn"
        >
          <div className="flex items-center justify-between pb-3 border-b border-white/10">
            <div className="flex items-center gap-2">
              <Tv className="w-4 h-4 text-[#E50914]" />
              <span className="text-xs font-extrabold uppercase tracking-wider text-white">
                Episodios
              </span>
            </div>

            <div className="flex items-center gap-2">
              {totalSeasons > 1 && (
                <select
                  value={drawerSeason}
                  onChange={(e) => setDrawerSeason(Number(e.target.value))}
                  className="bg-neutral-800 text-white border border-white/15 rounded-lg px-2.5 py-1 text-xs font-bold focus:outline-none"
                >
                  {Array.from({ length: totalSeasons }, (_, i) => i + 1).map((s) => (
                    <option key={s} value={s}>
                      Temporada {s}
                    </option>
                  ))}
                </select>
              )}
              <button
                onClick={() => setActiveDrawer(null)}
                className="text-neutral-400 hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pt-3 pr-1">
            {loadingDrawerEps ? (
              <div className="py-12 text-center text-xs text-neutral-400">
                Cargando episodios de la Temporada {drawerSeason}...
              </div>
            ) : drawerEpisodes.length === 0 ? (
              <div className="py-12 text-center text-xs text-neutral-400">
                No se encontraron episodios listados.
              </div>
            ) : (
              drawerEpisodes.map((ep) => {
                const isCurrent =
                  drawerSeason === Number(currentSeason) &&
                  ep.episode_number === Number(currentEpisode);
                return (
                  <button
                    key={ep.id}
                    onClick={() => {
                      setActiveDrawer(null);
                      if (onPlayNextEpisode) {
                        onPlayNextEpisode({
                          item,
                          season: drawerSeason,
                          episode: ep.episode_number,
                          initialTime: 0,
                          language: selectedLanguage,
                        });
                      }
                    }}
                    className={`w-full text-left p-2.5 rounded-xl border transition flex items-center gap-3 ${
                      isCurrent
                        ? 'bg-[#E50914]/25 border-[#E50914] text-white'
                        : 'bg-neutral-900/70 hover:bg-neutral-800 border-white/5 text-neutral-300'
                    }`}
                  >
                    <span className="text-sm font-black text-neutral-400 w-6 text-center shrink-0">
                      {ep.episode_number}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-white truncate">
                        {ep.name || `Episodio ${ep.episode_number}`}
                      </p>
                      <p className="text-[10px] text-neutral-400 line-clamp-1 mt-0.5">
                        {ep.overview || 'Reproducir episodio'}
                      </p>
                    </div>
                    <Play className="w-3.5 h-3.5 fill-current shrink-0 text-[#E50914]" />
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Toast Informativo Flotante */}
      {launchMessage && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-50 pointer-events-none animate-fadeIn">
          <div className="px-4 py-2 rounded-full bg-black/85 backdrop-blur-xl border border-white/20 text-xs font-bold text-white shadow-2xl">
            {launchMessage.text}
          </div>
        </div>
      )}

      {/* LIENZO DE VIDEO 100% PANTALLA COMPLETA (ARRANQUE EN 0.0 SEGUNDOS) */}
      <div className="relative w-full h-full bg-black flex items-center justify-center">
        {activeServer === 'trailer' && trailerFallbackKey ? (
          <iframe
            key={`trailer-${trailerFallbackKey}`}
            src={`https://www.youtube.com/embed/${trailerFallbackKey}?autoplay=1&rel=0&modestbranding=1`}
            title={`Tráiler ${title}`}
            className="w-full h-full border-0"
            allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        ) : activeServer === 'p2p' && selectedP2PStream ? (
          <div className="relative w-full h-full flex items-center justify-center">
            <video
              key={`${selectedP2PStream.infoHash}-${selectedP2PStream.fileIdx ?? 0}-${forceTranscode}`}
              ref={videoRef}
              crossOrigin="anonymous"
              src={getP2PRelativeUrl()}
              className="w-full h-full object-contain cursor-pointer"
              onClick={togglePlay}
              onLoadedMetadata={(e) => applyInitialVideoSeek(e.currentTarget)}
              onCanPlay={(e) => {
                applyInitialVideoSeek(e.currentTarget);
                setIsBuffering(false);
                setVideoError(false);
              }}
              onTimeUpdate={handleTimeUpdate}
              onWaiting={() => setIsBuffering(true)}
              onError={() => {
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
              {subtitles.map((sub) => (
                <track
                  key={sub.id}
                  kind="subtitles"
                  src={sub.vttUrl}
                  srcLang={sub.lang}
                  label={sub.label}
                  default={sub.id === selectedSubId}
                />
              ))}
            </video>

            {isBuffering && !videoError && (
              <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center bg-black/40 z-20 space-y-3 animate-fadeIn">
                <div className="w-11 h-11 border-4 border-[#E50914]/30 border-t-[#E50914] rounded-full animate-spin" />
                <span className="text-xs font-bold text-neutral-200 bg-black/75 px-4 py-1.5 rounded-full backdrop-blur-md border border-white/10">
                  Sincronizando P2P ({selectedP2PStream.language} • {selectedP2PStream.resolution})...
                </span>
              </div>
            )}

            {videoError && (
              <div className="absolute inset-0 z-30 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center space-y-4">
                <div className="w-12 h-12 rounded-full bg-red-600/20 border border-red-500/40 flex items-center justify-center text-red-500">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div className="max-w-md space-y-1.5">
                  <h3 className="text-base font-extrabold text-white">
                    Stream P2P en formato MKV / Dolby AC3 de escritorio
                  </h3>
                  <p className="text-xs text-neutral-300">
                    Reprodúcelo al instante aquí mismo cambiando a Cloud HD o ábrelo en VLC Media Player.
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2.5">
                  <button
                    onClick={() => setActiveServer('vidlink')}
                    className="px-5 py-2.5 bg-[#E50914] hover:bg-red-700 text-white rounded-full text-xs font-extrabold transition shadow-lg"
                  >
                    ▶ Reproducir Ahora en Cloud 4K
                  </button>
                  <button
                    onClick={() => setActiveServer('vidsrc')}
                    className="px-4 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-white border border-white/15 rounded-full text-xs font-bold transition"
                  >
                    VidSrc Pro (Multi-Idioma)
                  </button>
                  <button
                    onClick={() => handleLaunchExternal('vlc')}
                    className="px-4 py-2.5 bg-orange-600 hover:bg-orange-500 text-white rounded-full text-xs font-extrabold transition"
                  >
                    Abrir en VLC
                  </button>
                </div>
              </div>
            )}

            {/* Barra de Controles Inferior Flotante (Solo para P2P HTML5) */}
            <div
              onClick={(e) => e.stopPropagation()}
              className={`absolute bottom-4 left-4 right-4 bg-black/75 backdrop-blur-2xl border border-white/15 rounded-2xl px-4 py-3 space-y-2 z-30 transition-all duration-500 ${
                showHud || !isPlaying
                  ? 'opacity-100 translate-y-0'
                  : 'opacity-0 translate-y-4 pointer-events-none'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono text-neutral-200 min-w-[44px]">
                  {formatTime(currentTime)}
                </span>
                <input
                  type="range"
                  min={0}
                  max={duration || 100}
                  value={currentTime}
                  onChange={handleSeek}
                  className="w-full h-1.5 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-[#E50914]"
                />
                <span className="text-xs font-mono text-neutral-400 min-w-[44px]">
                  {formatTime(duration)}
                </span>
              </div>

              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-3">
                  <button
                    onClick={togglePlay}
                    className="p-1.5 text-white hover:text-[#E50914] transition"
                  >
                    {isPlaying ? (
                      <Pause className="w-5 h-5 fill-current" />
                    ) : (
                      <Play className="w-5 h-5 fill-current" />
                    )}
                  </button>

                  <div className="flex items-center gap-2">
                    <button onClick={toggleMute} className="text-neutral-300 hover:text-white">
                      {isMuted ? (
                        <VolumeX className="w-4 h-4 text-[#E50914]" />
                      ) : (
                        <Volume2 className="w-4 h-4" />
                      )}
                    </button>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={isMuted ? 0 : volume}
                      onChange={handleVolumeChange}
                      className="w-16 h-1 bg-neutral-600 rounded cursor-pointer accent-[#E50914]"
                    />
                  </div>

                  <div className="relative">
                    <button
                      onClick={() =>
                        setActiveDrawer(activeDrawer === 'subtitles' ? null : 'subtitles')
                      }
                      className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/10 hover:bg-white/15 text-xs font-bold text-white"
                    >
                      <Subtitles className="w-3.5 h-3.5 text-amber-400" />
                      <span>Subtítulos ({subtitles.length})</span>
                    </button>

                    {activeDrawer === 'subtitles' && (
                      <div className="absolute bottom-10 left-0 bg-[#161616] border border-white/15 rounded-xl shadow-2xl p-2 w-60 max-h-56 overflow-y-auto z-50 space-y-1">
                        <button
                          onClick={() => {
                            setSelectedSubId('off');
                            setActiveDrawer(null);
                          }}
                          className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold ${
                            selectedSubId === 'off'
                              ? 'bg-[#E50914] text-white'
                              : 'text-neutral-300 hover:bg-neutral-800'
                          }`}
                        >
                          ✕ Desactivados
                        </button>
                        {subtitles.map((sub) => (
                          <button
                            key={sub.id}
                            onClick={() => {
                              setSelectedSubId(sub.id);
                              setActiveDrawer(null);
                            }}
                            className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs truncate ${
                              selectedSubId === sub.id
                                ? 'bg-[#E50914] text-white font-bold'
                                : 'text-neutral-300 hover:bg-neutral-800'
                            }`}
                          >
                            {sub.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {selectedSubId !== 'off' && (
                    <div className="hidden sm:flex items-center gap-1 bg-white/5 px-2 py-0.5 rounded-full text-[10px]">
                      <button
                        onClick={() => adjustSubtitleOffset(-0.5)}
                        className="px-1 text-neutral-300 hover:text-white font-mono"
                      >
                        -0.5s
                      </button>
                      <span className="font-mono text-amber-300">{subtitleOffset}s</span>
                      <button
                        onClick={() => adjustSubtitleOffset(0.5)}
                        className="px-1 text-neutral-300 hover:text-white font-mono"
                      >
                        +0.5s
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <span className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 text-neutral-300 text-[11px]">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span>👤 {torrentStatus?.numPeers ?? selectedP2PStream.seeders}</span>
                    {torrentStatus?.downloadSpeed > 0 && (
                      <span className="text-emerald-400 font-mono">
                        • {(torrentStatus.downloadSpeed / (1024 * 1024)).toFixed(1)} MB/s
                      </span>
                    )}
                  </span>

                  <button
                    onClick={handleCopyStreamUrl}
                    className="p-1.5 text-neutral-300 hover:text-white"
                    title="Copiar enlace de stream"
                  >
                    {copiedUrl ? (
                      <Check className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>

                  <button
                    onClick={toggleFullscreen}
                    className="p-1.5 text-neutral-300 hover:text-white"
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
        ) : (
          /* MODO SERVIDORES CLOUD 100% PANTALLA COMPLETA CON REANUDACIÓN `startAt` */
          <iframe
            key={`${activeServer}-${activeMirrorIdx}-${selectedLanguage}-${useSandboxOnEmbed}-${resumeOffset}`}
            src={currentEmbedUrl}
            title={`Reproductor ${activeServer}`}
            className="w-full h-full border-0"
            allow="autoplay; fullscreen; encrypted-media; picture-in-picture; clipboard-write"
            referrerPolicy="origin"
            {...(useSandboxOnEmbed
              ? {
                  sandbox:
                    'allow-scripts allow-same-origin allow-forms allow-presentation allow-popups',
                }
              : {})}
            allowFullScreen
          />
        )}
      </div>
    </div>
  );
}
