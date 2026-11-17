import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import api from '../services/api.js';
import Hls from 'hls.js';
import CustomSelect from './CustomSelect.jsx';
import CinemaControls from './CinemaControls.jsx';
import PlaybackFeedback from './PlaybackFeedback.jsx';
import usePlaybackShortcuts from '../hooks/usePlaybackShortcuts.js';
import { ChannelRowCarousel, NetflixChannelCard } from './LiveChannelCards.jsx';
import { getCuratedChannelMix } from '../utils/channelMix.js';
import {
  Radio,
  Search,
  Tv,
  Play,
  Pause,
  Maximize,
  Minimize,
  RefreshCw,
  AlertCircle,
  Star,
  PlusCircle,
  X,
  Trash2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  SkipForward,
  SkipBack,
  PictureInPicture2,
  Layers,
} from 'lucide-react';

// Géneros y Regiones de TV organizados estilo Netflix Live
const TV_GENRE_OPTIONS = [
  {
    id: 'Todos',
    value: 'Todos',
    label: 'Todos los Géneros (Inicio Live)',
    icon: '✨',
    badge: 'NETFLIX LIVE',
    description: 'Explorador curado por filas temáticas y canales estrella en directo',
  },
  {
    id: 'Favoritos',
    value: 'Favoritos',
    label: 'Mi Lista de Canales',
    icon: '⭐',
    description: 'Tus señales favoritas guardadas para sintonizar con 1 clic',
  },
  {
    id: 'CineSeries',
    value: 'CineSeries',
    label: 'Cine & Series 24/7 (Maratones)',
    icon: '🍿',
    badge: 'CINE 24/7',
    description: 'Canales continuos de películas, acción, suspenso y series de Pluto TV & cable',
  },
  {
    id: 'Deportes',
    value: 'Deportes',
    label: 'Deportes en Directo',
    icon: '⚽',
    badge: 'LIVE SPORTS',
    description: 'Fútbol en vivo, torneos internacionales y análisis deportivo 24h',
  },
  {
    id: 'Temáticos 24/7',
    value: 'Temáticos 24/7',
    label: 'Temáticos 24/7',
    icon: '🌿',
    description: 'Señales temáticas continuas presentes en tus listas disponibles',
  },
  {
    id: 'Colombia',
    value: 'Colombia',
    label: 'Televisión de Colombia',
    icon: '🇨🇴',
    badge: 'LOCAL',
    description: 'Canales nacionales y regionales de Colombia en alta definición',
  },
  {
    id: 'Latam',
    value: 'Latam',
    label: 'México, Argentina & Latinoamérica',
    icon: '🇲🇽',
    description: 'Señales abiertas y de entretenimiento de México, Argentina y toda Latam',
  },
  {
    id: 'España',
    value: 'España',
    label: 'Televisión de España',
    icon: '🇪🇸',
    description: 'Canales generales y temáticos de España en vivo',
  },
  {
    id: 'Infantil y Anime',
    value: 'Infantil y Anime',
    label: 'Anime 24/7, Gaming & Animación',
    icon: '🎌',
    badge: 'ANIME',
    description: 'Transmisión continua de anime, cultura geek y animación clásica',
  },
  {
    id: 'Noticias',
    value: 'Noticias',
    label: 'Noticias & Actualidad Global',
    icon: '📰',
    description: 'Cobertura informativa internacional en tiempo real',
  },
  {
    id: 'MúsicaEntretenimiento',
    value: 'MúsicaEntretenimiento',
    label: 'Música, Conciertos & Variedades',
    icon: '🎵',
    description: 'Canales musicales 24/7, conciertos y estilo de vida',
  },
];

const INITIAL_BATCH_SIZE = 60;
const BATCH_INCREMENT = 60;

export default function LiveTV() {
  const initialSnapshot = useMemo(() => api.getCachedIptvSnapshot(), []);
  const [channels, setChannels] = useState(() => initialSnapshot?.channels || []);
  const [loading, setLoading] = useState(() => !(initialSnapshot?.channels?.length > 0));
  const [refreshing, setRefreshing] = useState(false);

  const [selectedCategory, setSelectedCategory] = useState('Todos');
  const [searchQuery, setSearchQuery] = useState('');
  const [visibleLimit, setVisibleLimit] = useState(INITIAL_BATCH_SIZE);

  // Cajón flotante de Guía EPG Interactiva
  const [showEpgDrawer, setShowEpgDrawer] = useState(false);

  const [currentChannel, setCurrentChannel] = useState(null);
  const [sourceIndex, setSourceIndex] = useState(0);
  const [showHidden, setShowHidden] = useState(false);
  const [hiddenCount, setHiddenCount] = useState(() => initialSnapshot?.hiddenCount || 0);
  const [recoveredChannel, setRecoveredChannel] = useState('');
  const [playerError, setPlayerError] = useState(false);
  const [audioOnlyWarning, setAudioOnlyWarning] = useState(false);
  const [usingProxy, setUsingProxy] = useState(true);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isFullscreenFallback, setIsFullscreenFallback] = useState(false);
  const [launchMessage, setLaunchMessage] = useState(null);

  const [hlsLevels, setHlsLevels] = useState([]);
  const [currentLevel, setCurrentLevel] = useState(-1);
  const [cinemaBoost, setCinemaBoost] = useState(true);
  const [videoDimensions, setVideoDimensions] = useState({ width: 0, height: 0 });
  const [showHud, setShowHud] = useState(true);
  const [mixRotation, setMixRotation] = useState(0);

  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const playerContainerRef = useRef(null);
  const watchdogTimerRef = useRef(null);
  const hudTimerRef = useRef(null);
  const autoRetriedDirectRef = useRef(false);
  const recoveredRef = useRef(new Set());

  useEffect(() => {
    const syncFullscreen = () => setIsFullscreen(document.fullscreenElement === playerContainerRef.current);
    document.addEventListener('fullscreenchange', syncFullscreen);
    videoRef.current?.addEventListener('webkitendfullscreen', syncFullscreen);
    return () => {
      document.removeEventListener('fullscreenchange', syncFullscreen);
      videoRef.current?.removeEventListener('webkitendfullscreen', syncFullscreen);
    };
  }, [currentChannel?.url]);

  useEffect(() => {
    if (!isFullscreenFallback) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [isFullscreenFallback]);

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
    hudTimerRef.current = setTimeout(() => {
      if (!showEpgDrawer) setShowHud(false);
    }, 3200);
  }, [showEpgDrawer]);

  useEffect(() => {
    triggerHud();
    return () => {
      if (hudTimerRef.current) clearTimeout(hudTimerRef.current);
    };
  }, [triggerHud]);

  const favoritesSet = useMemo(() => new Set(favorites), [favorites]);

  const loadChannels = useCallback(
    async (forceRefresh = false) => {
      if (forceRefresh) setRefreshing(true);
      else if (channels.length === 0) setLoading(true);

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
          includeHidden: showHidden,
          customUrls,
          xtream,
        });

        const list = data?.channels || [];
        setChannels(list);
        setHiddenCount(data?.hiddenCount || 0);
        if (!forceRefresh && list.length > 0 && list.length < 220) {
          window.setTimeout(() => {
            api.getIptvChannels({ refresh: false, includeHidden: showHidden, customUrls, xtream })
              .then((fullData) => {
                if (fullData?.channels?.length > list.length) {
                  setChannels(fullData.channels);
                  setHiddenCount(fullData.hiddenCount || 0);
                }
              })
              .catch(() => {});
          }, 2200);
        }

        setCurrentChannel((prev) => {
          if (prev || list.length === 0) return prev;
          const firstFav = list.find((c) => favoritesSet.has(c.url));
          const firstPluto = list.find((c) => c.category === 'Pluto TV 24/7' && !c.isHevcHint);
          return firstFav || firstPluto || list[0];
        });
      } catch (err) {
        console.error('Error cargando canales IPTV:', err);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [customSources, showHidden, favoritesSet, channels.length]
  );

  useEffect(() => {
    if (!currentChannel && channels.length > 0) {
      const firstFav = channels.find((c) => favoritesSet.has(c.url));
      const firstPluto = channels.find((c) => c.category === 'Pluto TV 24/7' && !c.isHevcHint);
      setCurrentChannel(firstFav || firstPluto || channels[0]);
    }
    loadChannels();
  }, [showHidden]);

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

  const isFavorite = useCallback(
    (channel) => {
      return channel ? favoritesSet.has(channel.url) : false;
    },
    [favoritesSet]
  );

  // Inicializar HLS con selección automática H.264
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

    const sources = currentChannel.sources?.length ? currentChannel.sources : [{ url: currentChannel.url }];
    const source = sources[sourceIndex] || sources[0];
    let stopped = false;
    let backupRequested = false;
    let retryTimer = null;
    let successReported = false;
    const reportNetworkFailure = () => {
      if (source.healthId) api.reportIptvHealth(source.healthId, 'network_error').catch(() => {});
    };
    let progressStart = null;
    const onProgress = () => {
      if (successReported || !source.healthId || video.videoHeight <= 0 || video.paused) return;
      if (progressStart === null) progressStart = video.currentTime;
      if (video.currentTime - progressStart >= 2) {
        successReported = true;
        api.reportIptvHealth(source.healthId, 'playing').then(() => {
          if (currentChannel.hidden && !recoveredRef.current.has(currentChannel.url)) {
            recoveredRef.current.add(currentChannel.url);
            setRecoveredChannel(currentChannel.url);
            setHiddenCount(count => Math.max(0, count - 1));
          }
        }).catch(() => {});
      }
    };
    video.addEventListener('timeupdate', onProgress);
    const tryBackup = () => {
      if (stopped) return false;
      if (backupRequested) return true;
      if (sourceIndex + 1 >= sources.length) return false;
      backupRequested = true;
      autoRetriedDirectRef.current = false;
      setUsingProxy(true);
      setSourceIndex(sourceIndex + 1);
      return true;
    };
    const proxyParams = new URLSearchParams({ url: source.url });
    if (source.referrer || currentChannel.referrer) proxyParams.set("ref", source.referrer || currentChannel.referrer);
    if (source.userAgent || currentChannel.userAgent) proxyParams.set("ua", source.userAgent || currentChannel.userAgent);
    const streamTarget = usingProxy
      ? `/api/iptv/proxy?${proxyParams.toString()}`
      : source.url;

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        startLevel: -1,
        capLevelToPlayerSize: true,
        backBufferLength: 20,
        manifestLoadingTimeOut: 6500,
        manifestLoadingMaxRetry: 1,
        levelLoadingTimeOut: 6500,
        levelLoadingMaxRetry: 1,
        fragLoadingTimeOut: 9000,
        fragLoadingMaxRetry: 2,
        maxBufferLength: 18,
        maxMaxBufferLength: 40,
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
          if (stopped || !videoRef.current) return;
          const vw = videoRef.current.videoWidth;
          const vh = videoRef.current.videoHeight;

          if (vw === 0 && vh === 0 && !videoRef.current.paused) {
            if (hls.levels && hls.levels.length > 1) {
              const nextLvl = (hls.currentLevel + 1) % hls.levels.length;
              hls.currentLevel = nextLvl;
              setCurrentLevel(nextLvl);
            }

            retryTimer = setTimeout(() => {
              if (stopped || !videoRef.current) return;
              if (videoRef.current.videoWidth === 0 && !videoRef.current.paused) {
                if (usingProxy && !autoRetriedDirectRef.current) {
                  autoRetriedDirectRef.current = true;
                  setUsingProxy(false);
                } else {
                  if (!tryBackup()) setAudioOnlyWarning(true);
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
                reportNetworkFailure();
                if (!tryBackup()) setPlayerError(true);
                hls.destroy();
              }
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError();
              break;
            default:
              if (!tryBackup()) setPlayerError(true);
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
      video.onerror = () => { if (video.error?.code === 2) reportNetworkFailure(); if (!tryBackup()) setPlayerError(true); };
    }

    return () => {
      stopped = true;
      video.removeEventListener('timeupdate', onProgress);
      if (watchdogTimerRef.current) clearTimeout(watchdogTimerRef.current);
      if (retryTimer) clearTimeout(retryTimer);
      video.onerror = null;
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [currentChannel, usingProxy, sourceIndex]);

  const handleSelectChannel = (channel) => {
    autoRetriedDirectRef.current = false;
    setSourceIndex(0);
    setUsingProxy(true);
    setPlayerError(false);
    setAudioOnlyWarning(false);
    setCurrentChannel(channel);
    triggerHud();
  };

  // Distribución inteligente de canales por Géneros y Regiones
  const filteredChannels = useMemo(() => {
    let result = channels;

    if (selectedCategory === 'Favoritos') {
      result = result.filter((c) => favoritesSet.has(c.url));
    } else if (selectedCategory === 'CineSeries') {
      result = result.filter(
        (c) => c.category === 'Películas y Series' || (c.category === 'Pluto TV 24/7' && /cine|pel[ií]culas|movie|film|series/i.test(`${c.rawCategory} ${c.name}`))
      );
    } else if (selectedCategory === 'Deportes') {
      result = result.filter((c) => c.category === 'Deportes');
    } else if (selectedCategory === 'Temáticos 24/7') {
      result = result.filter((c) => c.category === 'Temáticos 24/7');
    } else if (selectedCategory === 'Colombia') {
      result = result.filter((c) => c.country === 'co' || c.category === 'Colombia');
    } else if (selectedCategory === 'Latam') {
      result = result.filter(
        (c) =>
          c.country === 'mx' ||
          c.country === 'ar' ||
          c.country === 'cl' ||
          c.country === 'pe' ||
          c.category === 'México' ||
          c.category === 'Argentina'
      );
    } else if (selectedCategory === 'España') {
      result = result.filter((c) => c.country === 'es' || c.category === 'España');
    } else if (selectedCategory === 'Infantil y Anime') {
      result = result.filter((c) => c.category === 'Infantil y Anime');
    } else if (selectedCategory === 'Noticias') {
      result = result.filter((c) => c.category === 'Noticias');
    } else if (selectedCategory === 'MúsicaEntretenimiento') {
      result = result.filter(
        (c) => c.category === 'Música' || c.category === 'Entretenimiento'
      );
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

    return result;
  }, [channels, selectedCategory, searchQuery, favorites]);

  // Carruseles horizontales curados estilo Netflix Live
  const netflixLiveRows = useMemo(() => {
    const favList = channels.filter((c) => favoritesSet.has(c.url));
    const featuredNow = channels
      .filter(
        (c) =>
          !c.isHevcHint &&
          (c.category === 'Pluto TV 24/7' ||
            c.category === 'Películas y Series' ||
            c.category === 'Deportes')
      )
      .slice(0, 28);
    const movies247 = channels.filter(
      (c) => c.category === 'Películas y Series' || (c.category === 'Pluto TV 24/7' && /cine|pel[ií]culas|movie|film|series/i.test(`${c.rawCategory} ${c.name}`))
    );
    const sportsLive = channels.filter((c) => c.category === 'Deportes');
    const colombiaPriority = /^(Señal Colombia|Canal Institucional|Canal 1|Caracol TV|RCN TV|Canal Capital|Teleantioquia|Telecaribe|Telepacífico|Telecafé|Teleislas|Canal TRO|Canal Trece|Telemedellín)/i;
    const colombiaTv = channels.filter((c) => c.country === 'co' || c.category === 'Colombia').sort((a, b) => Number(colombiaPriority.test(b.name)) - Number(colombiaPriority.test(a.name)) || a.name.localeCompare(b.name, 'es'));
    const mexicoLatam = channels.filter(
      (c) =>
        c.country === 'mx' ||
        c.country === 'ar' ||
        c.category === 'México' ||
        c.category === 'Argentina'
    );
    const spainTv = channels.filter((c) => c.country === 'es' || c.category === 'España');
    const animeGaming = channels.filter((c) => c.category === 'Infantil y Anime');
    const newsGlobal = channels.filter((c) => c.category === 'Noticias');
    const musicVariety = channels.filter(
      (c) => c.category === 'Música' || c.category === 'Entretenimiento'
    );
    const curatedMix = getCuratedChannelMix(channels, `${new Date().toISOString().slice(0, 10)}:${mixRotation}`);

    return {
      favList,
      featuredNow,
      movies247,
      sportsLive,
      colombiaTv,
      mexicoLatam,
      spainTv,
      animeGaming,
      newsGlobal,
      musicVariety,
      curatedMix,
    };
  }, [channels, favorites, mixRotation]);

  const hlsSelectOptions = useMemo(() => {
    const base = [{ value: -1, label: 'Auto H.264 HD', icon: '⚡', badge: 'SMART' }];
    hlsLevels.forEach((lvl, idx) => {
      base.push({
        value: idx,
        label: lvl.height ? `${lvl.height}p Full HD` : `Nivel ${idx + 1}`,
        icon: '📺',
      });
    });
    return base;
  }, [hlsLevels]);

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
      // Ignore
    }
  };

  const handleLaunchVLC = async () => {
    if (!currentChannel) return;
    setLaunchMessage({
      type: 'info',
      text: 'Abriendo señal en VLC Media Player...',
    });

    try {
      const res = await api.launchExternalPlayer({
        player: 'vlc',
        streamUrl: currentChannel.sources?.[sourceIndex]?.url || currentChannel.url,
        title: currentChannel.name,
      });

      if (res.success) {
        setLaunchMessage({
          type: 'success',
          text: '✓ Reproduciendo en VLC Media Player',
        });
      } else {
        window.location.href = `vlc://${currentChannel.sources?.[sourceIndex]?.url || currentChannel.url}`;
      }
    } catch {
      window.location.href = `vlc://${currentChannel.sources?.[sourceIndex]?.url || currentChannel.url}`;
    }

    setTimeout(() => setLaunchMessage(null), 4000);
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

  const toggleFullscreen = async () => {
    const container = playerContainerRef.current;
    if (!container) return;
    if (isFullscreenFallback) { setIsFullscreenFallback(false); return; }
    try {
      if (document.fullscreenElement === container) await document.exitFullscreen();
      else if (container.requestFullscreen) await container.requestFullscreen();
      else setIsFullscreenFallback(true);
    } catch { setIsFullscreenFallback(true); }
  };

  const shortcutFeedback = usePlaybackShortcuts({
    enabled: Boolean(currentChannel),
    blocked: showEpgDrawer,
    isActive: () => isFullscreen || isFullscreenFallback || Boolean(playerContainerRef.current?.matches(':hover') || playerContainerRef.current?.contains(document.activeElement)),
    getState: () => ({
      paused: videoRef.current?.paused,
      volume: videoRef.current?.volume,
      muted: videoRef.current?.muted,
    }),
    onPlayPause: togglePlay,
    onVolume: value => handleVolumeChange({ target: { value } }),
    onMute: toggleMute,
    onFullscreen: toggleFullscreen,
    onEscape: showEpgDrawer || isFullscreen || isFullscreenFallback ? () => {
      if (showEpgDrawer) setShowEpgDrawer(false);
      else if (isFullscreenFallback) setIsFullscreenFallback(false);
      else document.exitFullscreen?.();
    } : undefined,
    onActivity: triggerHud,
  });

  const handleLevelChange = (lvlIdx) => {
    const parsed = Number(lvlIdx);
    setCurrentLevel(parsed);
    if (hlsRef.current) {
      hlsRef.current.currentLevel = parsed;
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

  const selectedGenreObj = useMemo(() => {
    return (
      TV_GENRE_OPTIONS.find((g) => g.value === selectedCategory) || TV_GENRE_OPTIONS[0]
    );
  }, [selectedCategory]);

  return (
    <div className="pb-16 font-netflix select-none bg-[#141414]">
      {/* 1. ESCENARIO HERO FULL-BLEED ESTILO PRODUCTO NETFLIX LIVE */}
      {currentChannel && (
        <div
          ref={playerContainerRef}
          onMouseMove={triggerHud}
          onTouchStart={triggerHud}
          onFocusCapture={triggerHud}
          className={`tv-player relative w-full h-[78vh] sm:h-[84vh] lg:h-[88vh] bg-black overflow-hidden select-none ${isFullscreenFallback ? 'tv-fullscreen-fallback' : ''}`}
        >
          <PlaybackFeedback feedback={shortcutFeedback} />
          {/* Video En Directo a Pantalla Completa dentro del Billboard */}
          <video
            ref={videoRef}
            className={`absolute inset-0 w-full h-full object-contain z-10 cursor-pointer bg-black transition-all ${
              cinemaBoost ? 'contrast-[1.06] saturate-[1.08] brightness-[1.02]' : ''
            }`}
            playsInline
            autoPlay
            onClick={togglePlay}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onVolumeChange={event => { setVolume(event.currentTarget.volume); setIsMuted(event.currentTarget.muted); }}
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
          {isFullscreenFallback && <button type="button" className="tv-fullscreen-exit" onClick={() => setIsFullscreenFallback(false)} aria-label="Salir de pantalla completa">✕ Salir</button>}
          <CinemaControls
            live
            visible={showHud || showEpgDrawer}
            playing={isPlaying}
            volume={volume}
            muted={isMuted || volume === 0}
            fullscreen={isFullscreen || isFullscreenFallback}
            onTogglePlay={togglePlay}
            onToggleMute={toggleMute}
            onVolumeChange={value => handleVolumeChange({ target: { value } })}
            onToggleFullscreen={toggleFullscreen}
          >
            <div className="flex min-w-0 items-center gap-2 overflow-x-auto [scrollbar-width:none]">
              <button type="button" onClick={() => setShowEpgDrawer(value => !value)} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold text-white hover:bg-white/20 ${showEpgDrawer ? 'bg-[#E50914]' : 'bg-white/10'}`}>Guía de canales</button>
              {hlsLevels.length > 1 && (
                <div className="shrink-0">
                  <CustomSelect
                    options={hlsSelectOptions}
                    value={currentLevel}
                    onChange={handleLevelChange}
                    size="sm"
                    align="right"
                  />
                </div>
              )}
              <button
                type="button"
                onClick={() => setCinemaBoost(!cinemaBoost)}
                className={`shrink-0 rounded-full border px-3 py-2 text-xs font-extrabold backdrop-blur-xl transition flex items-center gap-1.5 ${
                  cinemaBoost
                    ? 'bg-[#E50914]/30 text-red-200 border-[#E50914]'
                    : 'bg-black/65 text-neutral-300 border-white/20'
                }`}
                title="Realce de contraste y color en vivo"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">HDR Boost</span>
              </button>
              <button type="button" onClick={handleLaunchVLC} className="shrink-0 rounded-full bg-orange-600/90 px-3.5 py-2 text-xs font-extrabold text-white shadow-lg transition hover:bg-orange-500">VLC</button>
              <button type="button" onClick={togglePiP} className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/20 bg-black/70 text-white backdrop-blur-xl transition hover:bg-white/20 sm:flex" title="Picture-in-Picture" aria-label="Picture-in-Picture">
                <PictureInPicture2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={(event) => toggleFavorite(currentChannel, event)}
                className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-bold backdrop-blur-md transition hover:scale-105 ${
                  isFavorite(currentChannel)
                    ? 'bg-amber-500/25 text-amber-300 border-amber-400/50'
                    : 'bg-white/10 hover:bg-white/20 text-white border-white/20'
                }`}
              >
                <Star className={`w-4 h-4 ${isFavorite(currentChannel) ? 'fill-current text-amber-400' : ''}`} />
                <span className="hidden sm:inline">{isFavorite(currentChannel) ? 'En Mi Lista' : 'Mi Lista'}</span>
              </button>
            </div>
          </CinemaControls>

          {/* Degradados Cinemáticos de Netflix (se atenúan cuando el HUD se oculta para ver limpio) */}
          <div
            className={`absolute inset-0 bg-gradient-to-r from-[#141414] via-[#141414]/65 to-transparent w-full md:w-[68%] z-20 pointer-events-none transition-opacity duration-500 ${
              showHud ? 'opacity-100' : 'opacity-25'
            }`}
          />
          <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-[#141414] via-[#141414]/85 to-transparent z-20 pointer-events-none" />
          <div className="absolute top-0 left-0 right-0 h-28 bg-gradient-to-b from-black/80 to-transparent z-20 pointer-events-none" />

          {/* Información Editorial del Canal En Directo Estilo Billboard Netflix */}
          <div
            key={`hero-live-${currentChannel.url}`}
            className={`absolute bottom-[108px] sm:bottom-[92px] left-4 right-4 sm:left-8 sm:right-8 lg:left-12 z-30 space-y-3.5 transition-all duration-500 ${
              showHud
                ? 'opacity-100 translate-y-0'
                : 'opacity-0 translate-y-4 pointer-events-none'
            }`}
          >
            <div className="flex flex-wrap items-center gap-2.5 max-w-xl">
              <div className="flex items-center gap-1.5">
                <span className="text-[#E50914] font-black text-xl leading-none">N</span>
                <span className="text-neutral-200 uppercase tracking-[0.25em] text-[11px] font-extrabold">
                  EN DIRECTO
                </span>
              </div>

              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-[#E50914] text-white text-[10px] font-black uppercase tracking-wider shadow-[0_0_15px_rgba(229,9,20,0.6)]">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                EN VIVO AHORA
              </span>

              {/* Ecualizador animado de señal activa */}
              <div className="flex items-end gap-0.5 h-3.5 px-2 py-0.5 rounded bg-black/50 border border-white/10">
                <span className="w-0.5 h-full bg-emerald-400 animate-eq-1 rounded-full" />
                <span className="w-0.5 h-full bg-emerald-400 animate-eq-2 rounded-full" />
                <span className="w-0.5 h-full bg-emerald-400 animate-eq-3 rounded-full" />
              </div>

              {videoDimensions.height > 0 && (
                <span className="px-2 py-0.5 bg-black/60 border border-emerald-500/40 text-emerald-300 font-mono text-[10px] font-extrabold rounded">
                  {videoDimensions.height}p FULL HD
                </span>
              )}

              {(currentChannel.sources?.length || 0) > 1 && (
                <span className="px-2 py-0.5 bg-black/60 border border-white/20 text-neutral-200 text-[10px] font-bold rounded">
                  Fuente {sourceIndex + 1}/{currentChannel.sources.length}
                </span>
              )}

              {currentChannel.hidden && recoveredChannel !== currentChannel.url && <span className="px-2 py-0.5 bg-amber-500/20 border border-amber-500/40 text-amber-200 text-[10px] font-bold rounded">En revisión</span>}

              <span className="px-2 py-0.5 bg-white/10 border border-white/15 text-neutral-200 text-[10px] font-bold rounded">
                {currentChannel.category} • {currentChannel.countryName || 'Internacional'}
              </span>
            </div>

            <div className="flex items-center gap-4 max-w-xl">
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-black/80 backdrop-blur-xl border border-white/15 p-2 flex items-center justify-center shrink-0 shadow-2xl">
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
              <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight drop-shadow-[0_6px_24px_rgba(0,0,0,0.95)] leading-tight line-clamp-2">
                {currentChannel.name}
              </h1>
            </div>

            <p className="text-xs sm:text-sm text-neutral-200/90 max-w-lg drop-shadow">
              Señal disponible de <strong className="text-white">{currentChannel.name}</strong>.
              Si una fuente falla, probaremos otra opción del mismo canal.
            </p>

            {/* Botones Principales Estilo Netflix */}
            <div className="flex items-center flex-wrap gap-2.5 pt-1">
              <button
                type="button"
                onClick={toggleFullscreen}
                className="flex items-center gap-2 px-6 py-2.5 bg-white hover:bg-neutral-200 text-black font-extrabold text-xs sm:text-sm rounded-md shadow-[0_8px_25px_rgba(255,255,255,0.25)] transition-all hover:scale-105"
              >
                {isFullscreen || isFullscreenFallback ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
                <span>{isFullscreen || isFullscreenFallback ? 'Salir de pantalla completa' : 'Pantalla Completa'}</span>
              </button>

              <button
                type="button"
                onClick={handlePrevChannel}
                className="flex items-center gap-1.5 px-4 py-2.5 bg-neutral-500/40 hover:bg-neutral-500/60 text-white font-bold text-xs sm:text-sm rounded-md backdrop-blur-md border border-white/15 transition-all hover:scale-105"
              >
                <SkipBack className="w-4 h-4" />
                <span>Canal Ant.</span>
              </button>

              <button
                type="button"
                onClick={handleNextChannel}
                className="flex items-center gap-1.5 px-4 py-2.5 bg-neutral-500/40 hover:bg-neutral-500/60 text-white font-bold text-xs sm:text-sm rounded-md backdrop-blur-md border border-white/15 transition-all hover:scale-105"
              >
                <span>Siguiente</span>
                <SkipForward className="w-4 h-4" />
              </button>
            </div>

          </div>

          {/* Cajón Flotante Lateral de Guía EPG Estilo Netflix */}
          {showEpgDrawer && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="absolute top-20 right-4 sm:right-8 bottom-20 w-80 sm:w-96 z-40 bg-[#121212]/96 backdrop-blur-3xl border border-white/15 ring-1 ring-[#E50914]/30 rounded-2xl shadow-[0_25px_70px_rgba(0,0,0,0.95)] flex flex-col overflow-hidden animate-fadeIn"
            >
              <div className="p-3.5 border-b border-white/10 flex items-center justify-between bg-black/60">
                <div className="flex items-center gap-2">
                  <Tv className="w-4 h-4 text-[#E50914]" />
                  <span className="text-xs font-extrabold uppercase tracking-wider text-white">
                    Guía Rápida ({filteredChannels.length} canales)
                  </span>
                </div>
                <button
                  onClick={() => setShowEpgDrawer(false)}
                  className="text-neutral-400 hover:text-white p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto divide-y divide-white/[0.05] p-2">
                {filteredChannels.slice(0, 90).map((ch, idx) => {
                  const active = currentChannel?.url === ch.url;
                  const fav = isFavorite(ch);
                  return (
                    <div
                      key={`epg-${ch.url}`}
                      onClick={() => handleSelectChannel(ch)}
                      className={`flex items-center justify-between gap-2.5 p-2.5 rounded-xl cursor-pointer transition ${
                        active
                          ? 'bg-[#E50914]/25 border border-[#E50914] text-white'
                          : 'hover:bg-white/[0.06] text-neutral-300'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="text-[10px] font-mono text-neutral-500 w-5 text-right shrink-0">
                          {idx + 1}
                        </span>
                        <div className="w-9 h-9 rounded-lg bg-black border border-white/10 flex items-center justify-center p-1 shrink-0">
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
                          <p className="text-[10px] text-neutral-400 truncate">
                            {ch.category} • {ch.countryName || 'Global'}
                          </p>
                        </div>
                      </div>

                      <button
                        onClick={(e) => toggleFavorite(ch, e)}
                        className={`p-1 shrink-0 ${
                          fav ? 'text-amber-400' : 'text-neutral-600 hover:text-amber-400'
                        }`}
                      >
                        <Star className={`w-3.5 h-3.5 ${fav ? 'fill-current' : ''}`} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {launchMessage && (
            <div className="absolute top-20 left-1/2 -translate-x-1/2 z-40 bg-black/90 border border-white/20 text-white px-4 py-2 rounded-full text-xs font-bold shadow-2xl backdrop-blur-xl animate-fadeIn">
              {launchMessage.text}
            </div>
          )}

          {audioOnlyWarning && !playerError && (
            <div className="absolute inset-0 bg-black/85 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center z-30 space-y-3 animate-fadeIn">
              <div className="w-11 h-11 rounded-full bg-amber-500/20 border border-amber-500 flex items-center justify-center text-amber-400">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div className="max-w-md space-y-1">
                <h3 className="text-sm sm:text-base font-black text-white">
                  Señal en códec HEVC / H.265 detectada
                </h3>
                <p className="text-xs text-neutral-300">
                  Ábrela con imagen completa en VLC o pasa al siguiente canal.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  onClick={handleLaunchVLC}
                  className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white font-extrabold text-xs rounded-full shadow"
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
                  onClick={() => setAudioOnlyWarning(false)}
                  className="px-3 py-2 bg-neutral-800 text-neutral-300 text-xs rounded-full"
                >
                  Ocultar aviso
                </button>
              </div>
            </div>
          )}

          {playerError && (
            <div className="absolute inset-0 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center z-30 space-y-3 animate-fadeIn">
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
        </div>
      )}

      {/* 2. SUB-BARRA DE ORGANIZACIÓN DE GÉNEROS Y REGIONES DE TV ESTILO NETFLIX */}
      <div className="relative z-30 -mt-12 sm:-mt-16 px-4 sm:px-8 lg:px-12 max-w-[1480px] mx-auto mb-6 space-y-3.5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-[#141414]/92 backdrop-blur-2xl px-5 py-4 rounded-2xl border border-white/10 shadow-2xl">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2.5">
              <Radio className="w-6 h-6 text-[#E50914] animate-pulse" />
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                TV en Vivo
              </h2>
            </div>

            {/* Selector Desplegable "Géneros de TV" con CustomSelect */}
            <CustomSelect
              icon={Layers}
              options={TV_GENRE_OPTIONS}
              value={selectedCategory}
              onChange={setSelectedCategory}
              label="Géneros y Regiones"
              searchable={true}
            />
          </div>

          <div className="flex items-center flex-wrap gap-2">
            <div className="relative min-w-[210px] sm:w-64">
              <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar canal, deporte, país..."
                className="w-full bg-black/80 border border-white/15 rounded-xl pl-9 pr-8 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-[#E50914] transition"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => setShowModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-[#181818] hover:bg-neutral-800 text-white text-xs font-bold rounded-xl border border-white/15 transition"
            >
              <PlusCircle className="w-4 h-4 text-emerald-400" />
              <span className="hidden sm:inline">+ Lista M3U / Xtream</span>
            </button>

            {hiddenCount > 0 && <button type="button" onClick={() => setShowHidden(value => !value)} className="px-3.5 py-2 bg-[#181818] hover:bg-neutral-800 text-amber-200 text-xs font-bold rounded-xl border border-amber-500/25">{showHidden ? 'Ocultar inactivos' : `Ver ${hiddenCount} en revisión`}</button>}

            <button
              type="button"
              onClick={() => loadChannels(true)}
              disabled={refreshing}
              className="p-2 bg-[#181818] hover:bg-neutral-800 text-neutral-300 hover:text-white rounded-xl border border-white/15 transition"
              title="Actualizar señales en vivo"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-[#E50914]' : ''}`} />
            </button>
          </div>
        </div>

        {/* Barra Rápida de Píldoras de Géneros de TV */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          {TV_GENRE_OPTIONS.map((tab) => {
            const isSelected = selectedCategory === tab.value;
            return (
              <button
                key={tab.id}
                onClick={() => setSelectedCategory(tab.value)}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all duration-200 border ${
                  isSelected
                    ? 'bg-[#E50914] text-white border-red-400 shadow-lg shadow-red-950/50 scale-105'
                    : 'bg-[#181818]/90 hover:bg-neutral-800 text-neutral-300 hover:text-white border-white/[0.08]'
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
      </div>

      {/* 3. DISTRIBUCIÓN ORGANIZADA DE CANALES EN CARRUSELES 16:9 ESTILO NETFLIX */}
      {!loading && selectedCategory === 'Todos' && !searchQuery.trim() ? (
        <div className="space-y-1">
          {netflixLiveRows.favList.length > 0 && (
            <ChannelRowCarousel
              title="⭐ Mi Lista de Canales en Vivo"
              subtitle="Tus señales favoritas listas para sintonizar al instante"
              channels={netflixLiveRows.favList}
              currentChannel={currentChannel}
              onSelectChannel={handleSelectChannel}
              onToggleFavorite={toggleFavorite}
              isFavorite={isFavorite}
            />
          )}

          {netflixLiveRows.curatedMix.length > 0 && <div><div className="max-w-[1480px] mx-auto px-4 sm:px-8 lg:px-12 flex justify-end"><button type="button" onClick={() => setMixRotation((value) => value + 1)} className="text-xs font-bold text-neutral-300 hover:text-white">Otra selección ↻</button></div><ChannelRowCarousel title="🎲 Para cambiar de aire" subtitle="Una mezcla rotativa de cine, animación, noticias y señales colombianas disponibles" channels={netflixLiveRows.curatedMix} currentChannel={currentChannel} onSelectChannel={handleSelectChannel} onToggleFavorite={toggleFavorite} isFavorite={isFavorite} maxItems={28} /></div>}

          <ChannelRowCarousel
            title="🔥 Canales Estrella Más Vistos Ahora"
            subtitle="Las señales en directo más populares en alta definición"
            channels={netflixLiveRows.featuredNow}
            currentChannel={currentChannel}
            onSelectChannel={handleSelectChannel}
            onToggleFavorite={toggleFavorite}
            isFavorite={isFavorite}
          />

          <ChannelRowCarousel
            title="🍿 Cine & Series 24/7 (Maratones Continuos)"
            subtitle="Películas de acción, suspenso, comedia y series las 24 horas"
            channels={netflixLiveRows.movies247}
            currentChannel={currentChannel}
            onSelectChannel={handleSelectChannel}
            onToggleFavorite={toggleFavorite}
            isFavorite={isFavorite}
          />

          <ChannelRowCarousel
            title="⚽ Deportes en Directo"
            subtitle="Fútbol internacional, eventos en vivo y análisis deportivo"
            channels={netflixLiveRows.sportsLive}
            currentChannel={currentChannel}
            onSelectChannel={handleSelectChannel}
            onToggleFavorite={toggleFavorite}
            isFavorite={isFavorite}
          />

          <ChannelRowCarousel
            title="🇨🇴 Televisión de Colombia"
            subtitle="Señales nacionales y regionales de Colombia en vivo"
            channels={netflixLiveRows.colombiaTv}
            maxItems={100}
            onViewAll={() => { setSelectedCategory('Colombia'); window.scrollTo({ top: 600, behavior: 'smooth' }); }}
            currentChannel={currentChannel}
            onSelectChannel={handleSelectChannel}
            onToggleFavorite={toggleFavorite}
            isFavorite={isFavorite}
          />

          <ChannelRowCarousel
            title="🇲🇽 México, Argentina & Latinoamérica"
            subtitle="Los canales líderes de entretenimiento de habla hispana"
            channels={netflixLiveRows.mexicoLatam}
            currentChannel={currentChannel}
            onSelectChannel={handleSelectChannel}
            onToggleFavorite={toggleFavorite}
            isFavorite={isFavorite}
          />

          <ChannelRowCarousel
            title="🎌 Anime 24/7, Gaming & Animación"
            subtitle="Transmisiones continuas de anime, cartoons y cultura geek"
            channels={netflixLiveRows.animeGaming}
            currentChannel={currentChannel}
            onSelectChannel={handleSelectChannel}
            onToggleFavorite={toggleFavorite}
            isFavorite={isFavorite}
          />

          <ChannelRowCarousel
            title="📰 Noticias & Actualidad Internacional"
            subtitle="Cobertura informativa global minuto a minuto"
            channels={netflixLiveRows.newsGlobal}
            currentChannel={currentChannel}
            onSelectChannel={handleSelectChannel}
            onToggleFavorite={toggleFavorite}
            isFavorite={isFavorite}
          />

          <ChannelRowCarousel
            title="🇪🇸 Televisión de España"
            subtitle="Canales generalistas y temáticos de España"
            channels={netflixLiveRows.spainTv}
            currentChannel={currentChannel}
            onSelectChannel={handleSelectChannel}
            onToggleFavorite={toggleFavorite}
            isFavorite={isFavorite}
          />

          <ChannelRowCarousel
            title="🎵 Música, Conciertos & Variedades"
            subtitle="Ritmos latinos, pop, rock y estilo de vida 24/7"
            channels={netflixLiveRows.musicVariety}
            currentChannel={currentChannel}
            onSelectChannel={handleSelectChannel}
            onToggleFavorite={toggleFavorite}
            isFavorite={isFavorite}
          />
        </div>
      ) : (
        /* 4. Vista Filtrada por Género de TV o Búsqueda con Tarjetas Panorámicas 16:9 */
        <div className="px-4 sm:px-8 lg:px-12 max-w-[1480px] mx-auto pt-2 animate-fadeIn">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2.5">
                <span className="w-1.5 h-6 bg-[#E50914] rounded-full inline-block shadow-[0_0_8px_#E50914]" />
                <span>
                  {searchQuery.trim()
                    ? `Resultados en TV para "${searchQuery}"`
                    : selectedGenreObj.label}
                </span>
              </h3>
              <p className="text-xs text-neutral-400 mt-0.5 ml-4">
                {selectedGenreObj.description || `${filteredChannels.length} señales disponibles`}
              </p>
            </div>

            {selectedCategory !== 'Todos' && (
              <button
                onClick={() => setSelectedCategory('Todos')}
                className="px-4 py-1.5 rounded-xl bg-white/10 hover:bg-[#E50914] text-xs font-extrabold text-white transition"
              >
                Volver a todas las filas
              </button>
            )}
          </div>

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 py-4">
              {Array.from({ length: 12 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-2xl aspect-video border border-white/[0.06] netflix-shimmer"
                />
              ))}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {visibleChannels.map((channel) => (
                  <NetflixChannelCard
                    key={channel.url}
                    channel={channel}
                    isActive={currentChannel?.url === channel.url}
                    isFav={isFavorite(channel)}
                    onSelect={handleSelectChannel}
                    onToggleFavorite={toggleFavorite}
                    isFixedWidth={false}
                  />
                ))}
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
        </div>
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
