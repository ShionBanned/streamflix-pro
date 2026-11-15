import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import axios from 'axios';
import { readPlayerMessage, shiftSubtitleCues, nextCloudMirror } from '../../../shared/playerUtils.mjs';
import { toWebVtt } from '../../../shared/subtitleUtils.mjs';
import { buildEmbedServers } from '../../../shared/cloudProviders.mjs';
import api from '../services/api.js';
import CustomSelect from './CustomSelect.jsx';
import AiSubtitleControl from './AiSubtitleControl.jsx';
import ExternalAudio from './ExternalAudio.jsx';
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
  Subtitles,
  Copy,
  Check,
  SkipForward,
  Shield,
  Layers,
  Tv,
  ArrowLeft,
  Cpu,
  Film,
  RotateCcw,
  Headphones,
  Sliders,
} from 'lucide-react';
import { LANGUAGE_OPTIONS, AUDIO_ENGINE_PRESETS } from '../hooks/useUserMedia.js';

const DirectPlayer = React.lazy(() => import('./DirectPlayer.jsx'));

/**
 * Construye siempre en el cliente las 8 Familias Cloud (25 Espejos Activos)
 * para que funcionen al 100% incluso si el backend tiene una respuesta en caché anterior.
 */
export default function SmartPlayer({
  item,
  season = null,
  episode = null,
  initialTime = 0,
  initialLanguage = 'latino',
  audioEnginePreset = 'latino-aac',
  onChangeAudioPreset = null,
  onClose,
  onSaveProgress = null,
  onPlayNextEpisode = null,
  onChangeLanguage = null,
}) {
  const [resolutionData, setResolutionData] = useState(null);
  const [directInput, setDirectInput] = useState('');
  const [directUrl, setDirectUrl] = useState('');
  const [savedDirectSources, setSavedDirectSources] = useState([]);
  const [resolvingP2P, setResolvingP2P] = useState(true);

  const [selectedLanguage, setSelectedLanguage] = useState(initialLanguage || 'latino');
  const [activeAudioPreset, setActiveAudioPreset] = useState(audioEnginePreset || 'latino-aac');

  // Nodos y controles DSP WebAudio API (GainNode hasta 250% + BiquadFilterNode a 2.6 kHz + DynamicsCompressorNode)
  const [audioGainPercent, setAudioGainPercent] = useState(100);
  const [dialogueBoostDb, setDialogueBoostDb] = useState(0);
  const [nightCompressorEnabled, setNightCompressorEnabled] = useState(false);
  const [selectedAudioTrackIdx, setSelectedAudioTrackIdx] = useState(0);

  const audioCtxRef = useRef(null);
  const mediaSourceNodeRef = useRef(null);
  const gainNodeRef = useRef(null);
  const biquadNodeRef = useRef(null);
  const compressorNodeRef = useRef(null);
  const connectedVideoElRef = useRef(null);

  const isSeries =
    Boolean(season && episode) ||
    item?.media_type === 'tv' ||
    item?.type === 'tv' ||
    Boolean(item?.first_air_date);
  const currentSeason = season || 1;
  const currentEpisode = episode || 1;
  const mediaType = isSeries ? 'tv' : 'movie';
  const directStorageKey = `streamflix:direct:${mediaType}:${item?.id || item?.tmdbId}:${currentSeason}:${currentEpisode}`;
  const originalLanguage = item?.original_language || null;

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(directStorageKey) || '[]');
      setSavedDirectSources(Array.isArray(stored) ? stored.filter(value => typeof value === 'string' && /^https?:\/\//.test(value)).slice(0, 20) : []);
    } catch { setSavedDirectSources([]); }
  }, [directStorageKey]);

  // Arranque inmediato en el servidor Cloud más compatible según el idioma elegido
  const [activeServer, setActiveServer] = useState(() => {
    if (item?.server && item.server !== 'p2p') return item.server;
    if (initialLanguage === 'latino' || initialLanguage === 'castellano') {
      return 'vidsrc';
    }
    return 'vidsrc';
  });
  const [activeMirrorIdx, setActiveMirrorIdx] = useState(0);

  // Los iframes ajenos permanecen aislados: no tienen permiso para abrir ventanas ni navegar la página superior.

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
  // Por defecto false para que WebTorrent use HTTP 206 Range nativo de inmediato y no demore el inicio
  const [forceTranscode, setForceTranscode] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [trailerFallbackKey, setTrailerFallbackKey] = useState(null);

  const [activeDrawer, setActiveDrawer] = useState(null); // null | 'servers' | 'audio' | 'episodes' | 'subtitles'

  const [drawerSeason, setDrawerSeason] = useState(currentSeason);
  const [drawerEpisodes, setDrawerEpisodes] = useState([]);
  const [loadingDrawerEps, setLoadingDrawerEps] = useState(false);
  const [totalSeasons, setTotalSeasons] = useState(item?.number_of_seasons || 1);

  const [subtitles, setSubtitles] = useState([]);
  const [selectedSubId, setSelectedSubId] = useState('off');
  const embedFrameRef = useRef(null);
  const cloudProgressConfirmedRef = useRef(false);
  const cloudLastSavedRef = useRef(null);
  const attemptedCloudRef = useRef(new Set());
  const subtitleOriginalsRef = useRef(new WeakMap());
  const localSubtitleRef = useRef(null);
  const audioTrackManualRef = useRef(false);
  const [cloudStatus, setCloudStatus] = useState('loading');
  const [cloudHealth, setCloudHealth] = useState([]);
  const [checkingCloud, setCheckingCloud] = useState(false);
  const [transcodeStart, setTranscodeStart] = useState(Math.max(0, Number(initialTime) || 0));
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
  const silentAudioWatchdogRef = useRef(null);

  const title = item?.title || item?.name || 'Reproduciendo Contenido';

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
    }, 2600);
  }, [activeDrawer]);

  useEffect(() => {
    triggerHudVisibility();
    return () => {
      if (hudTimeoutRef.current) clearTimeout(hudTimeoutRef.current);
    };
  }, [triggerHudVisibility]);

  // Cadena de Audio DSP WebAudio API (GainNode + BiquadFilterNode 2.6 kHz + DynamicsCompressorNode)
  const ensureWebAudioChain = useCallback(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;

      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioCtx();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }

      if (connectedVideoElRef.current !== videoEl) {
        if (mediaSourceNodeRef.current) {
          try {
            mediaSourceNodeRef.current.disconnect();
          } catch {
            // Ignore
          }
        }
        const source = ctx.createMediaElementSource(videoEl);

        const biquad = ctx.createBiquadFilter();
        biquad.type = 'peaking';
        biquad.frequency.value = 2600;
        biquad.Q.value = 1.15;
        biquad.gain.value = dialogueBoostDb;

        const compressor = ctx.createDynamicsCompressor();
        compressor.threshold.value = nightCompressorEnabled ? -24 : 0;
        compressor.knee.value = 30;
        compressor.ratio.value = nightCompressorEnabled ? 8 : 1;
        compressor.attack.value = 0.003;
        compressor.release.value = 0.25;

        const gain = ctx.createGain();
        gain.gain.value = audioGainPercent / 100;

        source.connect(biquad);
        biquad.connect(compressor);
        compressor.connect(gain);
        gain.connect(ctx.destination);

        mediaSourceNodeRef.current = source;
        biquadNodeRef.current = biquad;
        compressorNodeRef.current = compressor;
        gainNodeRef.current = gain;
        connectedVideoElRef.current = videoEl;
      } else {
        if (biquadNodeRef.current) {
          biquadNodeRef.current.gain.value = dialogueBoostDb;
        }
        if (compressorNodeRef.current) {
          compressorNodeRef.current.threshold.value = nightCompressorEnabled ? -24 : 0;
          compressorNodeRef.current.ratio.value = nightCompressorEnabled ? 8 : 1;
        }
        if (gainNodeRef.current) {
          gainNodeRef.current.gain.value = audioGainPercent / 100;
        }
      }
    } catch {
      // Continuar reproducción normal
    }
  }, [audioGainPercent, dialogueBoostDb, nightCompressorEnabled]);

  useEffect(() => {
    if (biquadNodeRef.current) {
      biquadNodeRef.current.gain.value = dialogueBoostDb;
    }
    if (compressorNodeRef.current) {
      compressorNodeRef.current.threshold.value = nightCompressorEnabled ? -24 : 0;
      compressorNodeRef.current.ratio.value = nightCompressorEnabled ? 8 : 1;
    }
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = audioGainPercent / 100;
    }
  }, [audioGainPercent, dialogueBoostDb, nightCompressorEnabled]);

  // Seleccionar pista de audio nativa HTML5 si el archivo contiene múltiples pistas
  const syncNativeVideoAudioTrack = useCallback((langId, trackIdx) => {
    const vid = videoRef.current;
    if (!vid || !vid.audioTracks || vid.audioTracks.length <= 1) return;

    const tracks = vid.audioTracks;
    let chosenIndex = Math.max(0, Math.min(trackIdx, tracks.length - 1));

    for (let i = 0; !audioTrackManualRef.current && i < tracks.length; i++) {
      const tLang = (tracks[i].language || '').toLowerCase();
      const tLabel = (tracks[i].label || '').toLowerCase();
      if (
        (langId === 'latino' || langId === 'castellano') &&
        (tLang.includes('es') || tLang.includes('spa') || tLabel.includes('esp') || tLabel.includes('lat'))
      ) {
        chosenIndex = i;
        break;
      }
      if (
        (langId === 'en' || langId === 'vose') &&
        (tLang.includes('en') || tLang.includes('ja') || tLabel.includes('orig'))
      ) {
        chosenIndex = i;
        break;
      }
    }

    for (let i = 0; i < tracks.length; i++) {
      tracks[i].enabled = i === chosenIndex;
    }
  }, []);

  // Aplicar un preset de 1 clic del Motor de Audio Pre-Preparado (funciona tanto en P2P como en Cloud)
  const handleSelectAudioPreset = (presetId) => {
    setActiveAudioPreset(presetId);
    if (onChangeAudioPreset) onChangeAudioPreset(presetId);

    const preset =
      AUDIO_ENGINE_PRESETS.find((p) => p.id === presetId) || AUDIO_ENGINE_PRESETS[0];

    const targetLang = preset.langId || selectedLanguage;
    if (preset.langId) {
      setSelectedLanguage(preset.langId);
      if (onChangeLanguage) onChangeLanguage(preset.langId);
    }

    setDialogueBoostDb(preset.voiceBoostDb ?? 6);
    setAudioGainPercent(Math.round((preset.gainMultiplier || 1.4) * 100));

    if (presetId === 'live-aac') {
      setForceTranscode(true);
    }

    // Si estamos en P2P, buscar el mejor stream para ese idioma o aplicar pista
    if (activeServer === 'p2p' && resolutionData?.streams?.length > 0) {
      const matchingStream =
        resolutionData.streams.find(
          (s) =>
            (s.languageCode === targetLang || s.languageCode === 'multi') &&
            (s.audioGuaranteed || s.browserNative)
        ) ||
        resolutionData.streams.find(
          (s) => s.languageCode === targetLang || s.languageCode === 'multi'
        ) ||
        selectedP2PStream;

      if (matchingStream && matchingStream.infoHash !== selectedP2PStream?.infoHash) {
        setSelectedP2PStream(matchingStream);
      }
      syncNativeVideoAudioTrack(targetLang, selectedAudioTrackIdx);
    }

    // Si elige Original + Subtítulos ES, activar subtítulos automáticamente
    if (targetLang === 'vose' && subtitles.length > 0) {
      const esSub = subtitles.find((s) => s.langGroup !== 'en') || subtitles[0];
      if (esSub) setSelectedSubId(esSub.id);
    }

    setLaunchMessage({
      type: 'info',
      text: activeServer === 'p2p' ? `${preset.flag} Preferencia guardada; se usará si la fuente ofrece esa pista.` : 'Preferencia guardada. En Cloud, selecciona el audio dentro del reproductor del proveedor.',
    });
    setTimeout(() => setLaunchMessage(null), 3200);
  };

  // 1. Resolver fuentes P2P y subtítulos en segundo plano
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
            const preferredStream =
              data.streams.find(
                (s) =>
                  (s.languageCode === selectedLanguage || s.languageCode === 'multi') &&
                  (s.audioGuaranteed || s.browserNative)
              ) ||
              data.streams.find((s) => s.audioGuaranteed || s.browserNative) ||
              data.bestStream ||
              data.streams[0];
            setSelectedP2PStream(preferredStream);
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
                setSubtitles([...subs, ...(localSubtitleRef.current ? [localSubtitleRef.current] : [])]);
                if (localSubtitleRef.current) { setSelectedSubId(localSubtitleRef.current.id); } else if (selectedLanguage === 'vose' || activeAudioPreset === 'vose-sub') {
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
    activeAudioPreset,
    item.is_unreleased,
  ]);

  useEffect(() => {
    const onMessage = event => {
      const progress = readPlayerMessage(event, embedFrameRef.current, embedFrameRef.current?.src);
      if (!progress) return;
      cloudProgressConfirmedRef.current = true;
      trackedTimeRef.current = Math.floor(progress.currentTime);
      setCurrentTime(progress.currentTime); setCloudStatus('playing');
      if (progress.duration) { trackedDurationRef.current = progress.duration; setDuration(progress.duration); }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // 3. Guardado continuo de progreso cada 5 segundos
  useEffect(() => {
    if (!onSaveProgress) return;

    const interval = setInterval(() => {
      if (activeServer === 'p2p') {
        if (videoRef.current && !videoRef.current.paused && videoRef.current.currentTime > 5) {
          const cur = Math.floor(videoRef.current.currentTime + (forceTranscode ? transcodeStart : 0));
          const dur = Math.floor(forceTranscode ? torrentStatus?.mediaDuration || trackedDurationRef.current : videoRef.current.duration || trackedDurationRef.current);
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
      } else if (activeServer !== 'trailer' && cloudProgressConfirmedRef.current && cloudLastSavedRef.current !== trackedTimeRef.current) {
        cloudLastSavedRef.current = trackedTimeRef.current;
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
    selectedLanguage, forceTranscode, transcodeStart, torrentStatus?.mediaDuration,
  ]);

  // 4. Watchdog Anti-Audio Mudo (webkitAudioDecodedByteCount):
  // IMPORTANTE: NUNCA saca al usuario de P2P hacia Cloud automáticamente.
  // Solo verifica cuando el video P2P YA está avanzando (>1.8s) si la pista de audio es AC-3/DTS muda (0 bytes decodificados)
  // y en ese caso activa el remuxer FFmpeg AAC 2.0 en vivo.
  useEffect(() => {
    if (silentAudioWatchdogRef.current) clearInterval(silentAudioWatchdogRef.current);
    if (activeServer !== 'p2p') return;

    silentAudioWatchdogRef.current = setInterval(() => {
      const vid = videoRef.current;
      if (!vid || vid.paused || vid.currentTime < 1.8) return;

      const decodedAudioBytes = vid.webkitAudioDecodedByteCount;
      const hasZeroAudioDecoded =
        typeof decodedAudioBytes === 'number' && decodedAudioBytes === 0;

      if (hasZeroAudioDecoded && !forceTranscode && torrentStatus?.hasFfmpeg) {
        setTranscodeStart(trackedTimeRef.current);
        setForceTranscode(true);
        setLaunchMessage({
          type: 'info',
          text: 'No se detectó audio decodificado. Probando conversión AAC con FFmpeg.',
        });
        setTimeout(() => setLaunchMessage(null), 4000);
      }
    }, 3200);

    return () => {
      if (silentAudioWatchdogRef.current) clearInterval(silentAudioWatchdogRef.current);
    };
  }, [activeServer, forceTranscode, torrentStatus?.hasFfmpeg]);

  // Cargar episodios en el cajón integrado
  useEffect(() => {
    if (!isSeries || activeDrawer !== 'episodes') return;
    let isMounted = true;
    setLoadingDrawerEps(true);

    const tmdbId = item.id || item.tmdbId;
    Promise.all([api.getTvDetails(tmdbId), api.getSeasonDetails(tmdbId, drawerSeason)])
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
    syncNativeVideoAudioTrack(newLang, selectedAudioTrackIdx);
    const langObj = LANGUAGE_OPTIONS.find((l) => l.id === newLang);
    setLaunchMessage({
      type: 'info',
      text: `${langObj?.flag || '🌐'} Idioma ajustado a ${langObj?.label || newLang}`,
    });
    setTimeout(() => setLaunchMessage(null), 2800);
  };

  useEffect(() => {
    if (activeServer !== 'p2p' || !selectedP2PStream?.infoHash) return;

    const interval = setInterval(async () => {
      try {
        const res = await axios.get(`/api/stream/${selectedP2PStream.infoHash}/status`, { params: { fileIdx: selectedP2PStream.fileIdx, s: currentSeason, e: currentEpisode } });
        setTorrentStatus(res.data);
      } catch {
        // Ignorar
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [activeServer, selectedP2PStream?.infoHash, selectedP2PStream?.fileIdx, currentSeason, currentEpisode]);

  const handleSafeClose = useCallback(() => {
    if (onSaveProgress && trackedTimeRef.current > 5) {
      onSaveProgress({
        item,
        season: isSeries ? currentSeason : null,
        episode: isSeries ? currentEpisode : null,
        currentTime:
          activeServer === 'p2p' && videoRef.current?.currentTime > 5
            ? Math.floor(videoRef.current.currentTime + (forceTranscode ? transcodeStart : 0))
            : trackedTimeRef.current,
        duration:
          activeServer === 'p2p' && !forceTranscode && videoRef.current?.duration > 60
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
    activeServer, forceTranscode, transcodeStart,
  ]);

  const handleRestartFromZero = () => {
    setResumeOffset(0); setTranscodeStart(0); hasSeekedVideoRef.current = false;
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
      if (activeServer !== 'p2p' || !videoRef.current || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(e.target.tagName)) return;

      if (e.key === ' ' || e.key.toLowerCase() === 'k') {
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        const target = Math.min(duration || 0, trackedTimeRef.current + 10);
        if (forceTranscode) setTranscodeStart(target); else videoRef.current.currentTime = target; trackedTimeRef.current = target;
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const target = Math.max(0, trackedTimeRef.current - 10);
        if (forceTranscode) setTranscodeStart(target); else videoRef.current.currentTime = target; trackedTimeRef.current = target;
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
  }, [activeServer, activeDrawer, handleSafeClose, forceTranscode, duration]);

  const syncSubtitleTracks = useCallback(() => {
    const video = videoRef.current; if (!video) return;
    const selected = subtitles.find(sub => sub.id === selectedSubId);
    for (const element of video.querySelectorAll('track')) {
      element.track.mode = selected && element.dataset.subtitleId === selected.id ? 'showing' : 'disabled';
      shiftSubtitleCues(element.track.cues, subtitleOffset - (forceTranscode ? transcodeStart : 0), subtitleOriginalsRef.current);
    }
  }, [subtitles, selectedSubId, subtitleOffset, forceTranscode, transcodeStart]);
  useEffect(() => { syncSubtitleTracks(); }, [syncSubtitleTracks, selectedP2PStream?.infoHash, forceTranscode]);
  const adjustSubtitleOffset = delta => setSubtitleOffset(value => Math.max(-120, Math.min(120, Math.round((value + delta) * 10) / 10)));
  const importSubtitle = async event => {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error('El subtítulo no puede superar 2 MB.');
      const vtt = toWebVtt(await file.text());
      if (localSubtitleRef.current) URL.revokeObjectURL(localSubtitleRef.current.vttUrl);
      const sub = { id: 'local-subtitle', label: file.name, lang: 'und', vttUrl: URL.createObjectURL(new Blob([vtt], { type: 'text/vtt' })) };
      localSubtitleRef.current = sub; setSubtitles(current => [...current.filter(entry => entry.id !== sub.id), sub]); setSelectedSubId(sub.id);
    } catch (error) { setLaunchMessage({ type: 'error', text: error.message }); }
  };
  useEffect(() => {
    setSubtitles([]); setSelectedSubId('off'); setSubtitleOffset(0); setCloudHealth([]); attemptedCloudRef.current.clear(); audioTrackManualRef.current = false;
    return () => { if (localSubtitleRef.current) { URL.revokeObjectURL(localSubtitleRef.current.vttUrl); localSubtitleRef.current = null; } };
  }, [item.id, currentSeason, currentEpisode]);
  useEffect(() => {
    const time = Math.max(0, trackedTimeRef.current || 0); hasSeekedVideoRef.current = false;
    if (forceTranscode) setTranscodeStart(time); else setResumeOffset(time);
  }, [selectedP2PStream?.infoHash, selectedP2PStream?.fileIdx, forceTranscode, selectedAudioTrackIdx]);
  useEffect(() => () => {
    for (const node of [mediaSourceNodeRef, gainNodeRef, biquadNodeRef, compressorNodeRef]) { try { node.current?.disconnect(); } catch {} }
    audioCtxRef.current?.close().catch(() => {});
  }, []);

  const applyInitialVideoSeek = (videoEl) => {
    if (!videoEl || hasSeekedVideoRef.current || forceTranscode) return;
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

    const cur = videoRef.current.currentTime + (forceTranscode ? transcodeStart : 0);
    const dur = forceTranscode ? torrentStatus?.mediaDuration || trackedDurationRef.current : videoRef.current.duration || 0;
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
    qs.set('audioLang', selectedLanguage);
    qs.set('audioTrack', String(selectedAudioTrackIdx));
    qs.set('manualAudio', audioTrackManualRef.current ? '1' : '0');
    qs.set('originalLanguage', originalLanguage || '');
    if (forceTranscode) {
      qs.set('audioEngine', 'aac');
      qs.set('transcode', '1');
      qs.set('startTime', String(transcodeStart));
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
      text: `Abriendo ${playerType.toUpperCase()} con audio completo...`,
    });

    try {
      const res = await axios.post('/api/player/launch', {
        player: playerType,
        streamUrl,
        subtitleUrl: activeSub?.id === 'local-subtitle' ? null : subtitleUrl,
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
    ensureWebAudioChain();
    if (videoRef.current.paused) {
      videoRef.current.play().catch(() => {});
      setIsPlaying(true);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const handleSeek = (e) => {
    const newTime = parseFloat(e.target.value);
    if (videoRef.current) {
      if (forceTranscode) setTranscodeStart(newTime); else videoRef.current.currentTime = newTime;
      setCurrentTime(newTime);
      trackedTimeRef.current = Math.floor(newTime);
    }
  };

  const handleVolumeChange = (e) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (videoRef.current) {
      videoRef.current.volume = val;
      videoRef.current.muted = val === 0; setIsMuted(val === 0);
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

  // Siempre usar nuestro clúster completo de 8 Familias Cloud (25 espejos) sin bloqueo de sandbox
  const embedServersList = useMemo(() => {
    return buildEmbedServers({
      tmdbId: item.id || item.tmdbId,
      imdbId: resolutionData?.imdbId || item.imdb_id || item.imdbId,
      isSeries,
      season: currentSeason,
      episode: currentEpisode,
      preferredLanguage: selectedLanguage,
    });
  }, [
    item.id,
    item.tmdbId,
    item.imdb_id,
    item.imdbId,
    resolutionData?.imdbId,
    isSeries,
    currentSeason,
    currentEpisode,
    selectedLanguage,
  ]);

  const currentEmbedServerObj = useMemo(() => {
    return embedServersList.find((s) => s.id === activeServer) || embedServersList[0];
  }, [embedServersList, activeServer]);

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

  const cloudHealthControllerRef = useRef(null);
  const switchCloud = (serverId, index = 0) => {
    setResumeOffset(Math.max(0, Math.floor(trackedTimeRef.current || 0)));
    setActiveServer(serverId); setActiveMirrorIdx(index);
  };
  const openDirectSource = () => {
    try { const url = new URL(directInput.trim()); if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error(); setDirectUrl(url.href); setActiveServer('direct'); setActiveDrawer(null); const next = [url.href, ...savedDirectSources.filter(value => value !== url.href)].slice(0, 20); localStorage.setItem(directStorageKey, JSON.stringify(next)); setSavedDirectSources(next); }
    catch { setLaunchMessage({ type: 'error', text: 'Introduce la URL HTTP/HTTPS de un archivo HLS, MP4 o WebM disponible para ti.' }); }
  };
  const tryNextCloud = () => {
    const next = nextCloudMirror(embedServersList, activeServer, activeMirrorIdx, attemptedCloudRef.current, cloudHealth);
    if (next) switchCloud(next.serverId, next.index);
    else { setCloudStatus('exhausted'); setActiveDrawer('servers'); setLaunchMessage({ type: 'error', text: 'No quedan espejos sin probar. Revisa el diagnóstico o elige otra fuente.' }); }
  };
  const diagnoseCloud = async () => {
    cloudHealthControllerRef.current?.abort(); const controller = new AbortController(); cloudHealthControllerRef.current = controller;
    setCheckingCloud(true);
    try {
      const response = await axios.get('/api/cloud/health', { params: { tmdbId: item.id || item.tmdbId, imdbId: resolutionData?.imdbId || item.imdb_id || item.imdbId, type: mediaType, season: currentSeason, episode: currentEpisode }, timeout: 45000, signal: controller.signal });
      if (!controller.signal.aborted) setCloudHealth(response.data.results || []);
    } catch (error) { if (!controller.signal.aborted) setLaunchMessage({ type: 'error', text: 'No se pudo completar el diagnóstico. Comprueba que el backend esté actualizado.' }); }
    finally { if (!controller.signal.aborted) setCheckingCloud(false); }
  };
  useEffect(() => () => cloudHealthControllerRef.current?.abort(), [item.id, currentSeason, currentEpisode]);
  useEffect(() => {
    cloudProgressConfirmedRef.current = false; cloudLastSavedRef.current = null;
    if (['p2p', 'direct', 'trailer'].includes(activeServer)) return;
    setCloudStatus('loading'); attemptedCloudRef.current.add(currentEmbedServerObj?.mirrors?.[activeMirrorIdx]?.url || currentEmbedUrl);
    const timer = setTimeout(() => setCloudStatus(current => current === 'playing' ? current : 'unconfirmed'), 25000);
    return () => clearTimeout(timer);
  }, [currentEmbedUrl, activeServer]);
  const healthLabels = { reachable: 'Página accesible', unavailable: 'No disponible', 'frame-blocked': 'Bloquea iframe', challenge: 'Requiere verificación', 'invalid-certificate': 'Certificado inválido', redirected: 'Dominio cambió' };

  const drawerSeasonOptions = useMemo(() => {
    return Array.from({ length: totalSeasons }, (_, i) => ({
      value: i + 1,
      label: `Temporada ${i + 1}`,
      icon: '📺',
    }));
  }, [totalSeasons]);

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
      ? `Torrentio P2P (${selectedP2PStream?.resolution || 'HD'})`
      : activeServer === 'trailer'
      ? 'Tráiler'
      : currentEmbedServerObj?.name || 'VidSrcMe Ultra (#1)';

  return (
    <div
      id="smart-player-container"
      onMouseMove={triggerHudVisibility}
      onClick={() => {
        if (activeDrawer) setActiveDrawer(null);
      }}
      className="fixed inset-0 z-50 bg-black overflow-hidden select-none font-netflix animate-fadeIn"
    >
      <div
        onMouseEnter={triggerHudVisibility}
        className="absolute top-0 left-0 right-0 h-12 z-30 pointer-events-auto"
        style={{ background: 'transparent' }}
      />

      {/* HUD SUPERIOR FLOTANTE ULTRA-LIMPIO */}
      <div
        onClick={(e) => e.stopPropagation()}
        className={`absolute top-4 left-4 right-4 z-40 flex items-center justify-between gap-3 pointer-events-none transition-all duration-500 ${
          showHud || activeDrawer
            ? 'opacity-100 translate-y-0'
            : 'opacity-0 -translate-y-4 pointer-events-none'
        }`}
      >
        <div className="pointer-events-auto flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2.5 bg-black/80 hover:bg-black/95 backdrop-blur-xl border border-white/15 pl-2 pr-4 py-1.5 rounded-full shadow-[0_10px_30px_rgba(0,0,0,0.85)] transition-all">
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
            </div>
          </div>

          {activeServer !== 'p2p' && activeServer !== 'trailer' && activeServer !== 'direct' && <span className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold border bg-emerald-950/85 text-emerald-300 border-emerald-500/45"><Shield className="w-3.5 h-3.5" /> Iframe aislado</span>}

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

        {/* Controles Derecha: Episodios + 🎧 Motor de Audio + 8 Familias Cloud / Torrentio */}
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
                className="hidden sm:flex items-center gap-1.5 bg-black/80 hover:bg-white hover:text-black text-white backdrop-blur-xl border border-white/15 px-3 py-2 rounded-full text-xs font-bold transition-all shadow-lg"
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
                    : 'bg-black/80 hover:bg-black/95 text-white border-white/15'
                }`}
              >
                <Tv className="w-3.5 h-3.5 text-sky-400" />
                <span className="hidden md:inline">Episodios</span>
                <ChevronDown className="w-3.5 h-3.5 opacity-75" />
              </button>
            </>
          )}

          {/* Botón Dedicado: 🎧 Motor de Audio Pre-Preparado + DSP */}
          <button
            onClick={() => setActiveDrawer(activeDrawer === 'audio' ? null : 'audio')}
            className={`flex items-center gap-1.5 backdrop-blur-xl border px-3.5 py-2 rounded-full text-xs font-extrabold transition-all shadow-lg ${
              activeDrawer === 'audio'
                ? 'bg-[#E50914] text-white border-red-400 shadow-[0_0_20px_rgba(229,9,20,0.4)]'
                : 'bg-black/80 hover:bg-black/95 text-white border-white/15'
            }`}
          >
            <Headphones className="w-3.5 h-3.5 text-[#E50914]" />
            <span>{currentLangObj.flag}</span>
            <span className="hidden sm:inline">Motor de Audio</span>
            <ChevronDown className="w-3.5 h-3.5 opacity-75" />
          </button>

          <button
            onClick={() =>
              setActiveDrawer(activeDrawer === 'servers' ? null : 'servers')
            }
            className={`flex items-center gap-1.5 backdrop-blur-xl border px-3.5 py-2 rounded-full text-xs font-bold transition-all shadow-lg ${
              activeDrawer === 'servers'
                ? 'bg-[#E50914] text-white border-red-400'
                : 'bg-black/80 hover:bg-black/95 text-white border-white/15'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-emerald-400" />
            <span>{activeServerLabel}</span>
            <ChevronDown className="w-3.5 h-3.5 opacity-75" />
          </button>
        </div>
      </div>

      {/* CAJÓN A: 🎧 Panel de Motor de Audio Pre-Preparado con Presets de 1 Clic y DSP WebAudio API */}
      {(
        <div
          onClick={(e) => e.stopPropagation()}
          className={`absolute top-16 right-4 sm:right-24 z-50 w-[355px] sm:w-[410px] max-w-[94vw] max-h-[82vh] overflow-y-auto bg-[#121212]/98 backdrop-blur-3xl border border-white/15 ring-1 ring-[#E50914]/30 rounded-2xl shadow-[0_25px_70px_rgba(0,0,0,0.95)] p-4 space-y-4 animate-fadeIn ${activeDrawer === 'audio' ? '' : 'hidden'}`}
        >
          <div className="flex items-center justify-between pb-2.5 border-b border-white/10">
            <div>
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-white flex items-center gap-1.5">
                <Headphones className="w-4 h-4 text-[#E50914]" />
                <span>🎧 Motor de Audio Pre-Preparado & DSP</span>
              </h3>
              <p className="text-[10px] text-neutral-400 mt-0.5">
                Preferencias de idioma y controles de audio para fuentes locales
              </p>
            </div>
            <button
              onClick={() => setActiveDrawer(null)}
              className="text-neutral-400 hover:text-white p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-1.5">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-red-400 block">
              Motores de Audio Listos (1 Clic):
            </span>
            {AUDIO_ENGINE_PRESETS.map((preset) => {
              const active = activeAudioPreset === preset.id;
              return (
                <button
                  key={preset.id}
                  onClick={() => handleSelectAudioPreset(preset.id)}
                  className={`w-full text-left p-2.5 rounded-xl border transition-all flex items-start justify-between gap-2 ${
                    active
                      ? 'bg-[#E50914]/25 border-[#E50914] text-white shadow-[0_0_15px_rgba(229,9,20,0.25)]'
                      : 'bg-neutral-900/80 hover:bg-neutral-800 border-white/10 text-neutral-300'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <span className="text-base leading-none mt-0.5">{preset.flag}</span>
                    <div>
                      <div className="text-xs font-extrabold flex items-center gap-1.5">
                        <span>{preset.label}</span>
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-white/10 text-neutral-200 font-bold">
                          {preset.badge}
                        </span>
                      </div>
                      <p className="text-[10px] text-neutral-400 mt-0.5 leading-snug">
                        {preset.description}
                      </p>
                    </div>
                  </div>
                  {active && <Check className="w-4 h-4 text-[#E50914] shrink-0 mt-1" />}
                </button>
              );
            })}
          </div>

          {/* Amplificador DSP WebAudio API */}
          <fieldset disabled={activeServer !== 'p2p'} className="p-3 rounded-xl bg-black/60 border border-white/10 space-y-3 disabled:opacity-50">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5" />
                <span>Consola DSP · solo reproducción local</span>
              </span>
              <button
                onClick={() => setNightCompressorEnabled((p) => !p)}
                className={`px-2 py-0.5 rounded text-[9px] font-black uppercase border transition ${
                  nightCompressorEnabled
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                    : 'bg-neutral-900 text-neutral-400 border-white/10'
                }`}
              >
                Nivelador Vocal {nightCompressorEnabled ? 'ON' : 'OFF'}
              </button>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-neutral-300 font-semibold">
                  Potencia de Volumen (GainNode):
                </span>
                <span className="text-emerald-400 font-mono font-extrabold">
                  {audioGainPercent}%
                </span>
              </div>
              <input
                type="range"
                min={100}
                max={250}
                step={5}
                value={audioGainPercent}
                onChange={(e) => {
                  ensureWebAudioChain();
                  setAudioGainPercent(Number(e.target.value));
                }}
                className="w-full h-1.5 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-[#E50914]"
              />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-neutral-300 font-semibold">
                  Claridad de Diálogos (2.6 kHz EQ):
                </span>
                <span className="text-amber-300 font-mono font-extrabold">
                  +{dialogueBoostDb} dB
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={12}
                step={1}
                value={dialogueBoostDb}
                onChange={(e) => {
                  ensureWebAudioChain();
                  setDialogueBoostDb(Number(e.target.value));
                }}
                className="w-full h-1.5 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-[#E50914]"
              />
            </div>

            <div className="pt-2 border-t border-white/10 flex items-center justify-between gap-2">
              <button
                onClick={() => setForceTranscode((prev) => !prev)}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-extrabold border flex items-center gap-1.5 transition ${
                  forceTranscode
                    ? 'bg-[#E50914]/25 text-red-200 border-[#E50914]'
                    : 'bg-neutral-900 text-neutral-300 border-white/10 hover:border-white/30'
                }`}
                title="Convierte pistas Dolby AC-3 / DTS a AAC 2.0 en tiempo real con FFmpeg"
              >
                <Cpu className="w-3.5 h-3.5" />
                <span>Forzar FFmpeg AAC: {forceTranscode ? 'SÍ' : 'AUTO'}</span>
              </button>

              <div className="flex flex-wrap items-center gap-1">
                {!torrentStatus?.audioTracks?.length && <span className="text-[10px] text-neutral-400">Las pistas se detectan al convertir la fuente.</span>}
                {(torrentStatus?.audioTracks || []).map((track, tIdx) => (
                  <button
                    key={tIdx}
                    onClick={() => {
                      audioTrackManualRef.current = true; setSelectedAudioTrackIdx(tIdx);
                      syncNativeVideoAudioTrack(selectedLanguage, tIdx);
                    }}
                    className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold border transition ${
                      selectedAudioTrackIdx === tIdx
                        ? 'bg-emerald-600/30 text-emerald-300 border-emerald-500'
                        : 'bg-neutral-900 text-neutral-400 border-white/10'
                    }`}
                  >
                    {track.label}
                  </button>
                ))}
              </div>
            </div>
          </fieldset>

          {activeServer === 'p2p' && selectedP2PStream && <div className="p-3 rounded-xl bg-black/60 border border-white/10 space-y-2"><p className="text-xs text-white font-semibold">Audio externo sincronizado</p><ExternalAudio videoRef={videoRef} videoKey={`${selectedP2PStream.infoHash}-${selectedP2PStream.fileIdx ?? 0}-${forceTranscode}-${selectedAudioTrackIdx}`} /><p className="text-[10px] text-neutral-400">El audio original se silencia. Ajusta el desfase si el archivo tiene una introducción distinta.</p></div>}

          <div className="pt-1 border-t border-white/10">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-neutral-400 block mb-1.5">
              Idioma de Fuentes & Subtítulos:
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              {LANGUAGE_OPTIONS.map((opt) => {
                const active = selectedLanguage === opt.id;
                return (
                  <button
                    key={opt.id}
                    onClick={() => handleLanguageChange(opt.id)}
                    className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-2 border transition ${
                      active
                        ? 'bg-[#E50914] text-white border-red-400 shadow'
                        : 'bg-neutral-900 hover:bg-neutral-800 text-neutral-300 border-white/10'
                    }`}
                  >
                    <span>{opt.flag}</span>
                    <span className="truncate">{opt.shortLabel}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* CAJÓN B: Centro de 8 Familias Cloud (25 Espejos Sin Error Sandbox) y Torrentio Persistente */}
      {activeDrawer === 'servers' && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute top-16 right-4 z-50 w-[370px] sm:w-[445px] max-w-[94vw] max-h-[82vh] overflow-y-auto bg-[#121212]/98 backdrop-blur-3xl border border-white/15 ring-1 ring-[#E50914]/30 rounded-2xl shadow-[0_25px_70px_rgba(0,0,0,0.95)] p-4 space-y-4 animate-fadeIn"
        >
          <div className="flex items-center justify-between pb-2.5 border-b border-white/10">
            <div>
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-white flex items-center gap-1.5">
                <Server className="w-3.5 h-3.5 text-[#E50914]" />
                {embedServersList.length} proveedores Cloud & P2P
              </h3>
              <p className="text-[10px] text-neutral-400 mt-0.5">Los proveedores externos se abren aislados. Algunos pueden no funcionar con esta protección.</p>
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
              ☁️ Fuentes Cloud · Diagnóstico de disponibilidad
            </span>

            <div className="flex gap-2 text-xs">
              <button disabled={checkingCloud} onClick={diagnoseCloud} className="px-3 py-2 bg-neutral-800 rounded-lg disabled:opacity-50">{checkingCloud ? 'Comprobando…' : 'Diagnosticar espejos'}</button>
              <button onClick={tryNextCloud} className="px-3 py-2 bg-red-700 rounded-lg">Probar siguiente</button>
            </div>
            {cloudHealth.length > 0 && <p className="text-[11px] text-neutral-400">{cloudHealth.filter(result => result.status === 'reachable').length} páginas accesibles de {cloudHealth.length}. Una página accesible todavía puede fallar al reproducir el video.</p>}
            <div className="grid grid-cols-2 gap-1.5">
              {embedServersList.map((srv) => {
                const isSelected = activeServer === srv.id;
                return (
                  <button
                    key={srv.id}
                    onClick={() => {
                      switchCloud(srv.id, 0);
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
                <div className="p-2.5 rounded-xl bg-black/55 border border-white/10 space-y-2">
                  <span className="text-[10px] font-bold text-neutral-400 block">
                    Espejos de {currentEmbedServerObj.name}:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {currentEmbedServerObj.mirrors.map((m, idx) => (
                      <button
                        key={m.id}
                        onClick={() => switchCloud(activeServer, idx)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition ${
                          activeMirrorIdx === idx
                            ? 'bg-emerald-600/30 text-emerald-300 border-emerald-500'
                            : 'bg-neutral-900 hover:bg-neutral-800 text-neutral-300 border-white/10'
                        }`}
                      >
                        {m.name} · {healthLabels[cloudHealth.find(result => result.url === m.url)?.status] || 'Sin comprobar'}
                      </button>
                    ))}
                  </div>
                </div>
              )}
          </div>

          <div className="pt-3 border-t border-white/10 space-y-2">
            <label className="text-xs text-neutral-300 block">Fuente directa · HLS / MP4 / WebM<input type="url" aria-label="URL de fuente directa" value={directInput} onChange={event => setDirectInput(event.target.value)} placeholder="https://tu-servidor/video.m3u8" className="w-full mt-2 p-2 rounded bg-neutral-900 border border-white/20 text-white" /></label>
            <button onClick={openDirectSource} disabled={!directInput.trim()} className="px-3 py-2 text-xs rounded bg-emerald-700 disabled:opacity-50">Abrir fuente directa</button>
            {savedDirectSources.length > 0 && <div className="space-y-1"><span className="text-[10px] text-neutral-400">Fuentes guardadas para este título</span>{savedDirectSources.map(url => <div key={url} className="flex gap-1 items-center"><button className="min-w-0 flex-1 truncate rounded bg-neutral-800 px-2 py-1 text-left text-[10px]" title={url} onClick={() => { setDirectUrl(url); setActiveServer('direct'); setActiveDrawer(null); }}>{new URL(url).hostname} · {new URL(url).pathname.split('/').pop() || 'video'}</button><button className="rounded bg-neutral-800 px-2 py-1 text-[10px]" aria-label="Eliminar fuente guardada" onClick={() => { const next = savedDirectSources.filter(value => value !== url); localStorage.setItem(directStorageKey, JSON.stringify(next)); setSavedDirectSources(next); }}>✕</button></div>)}</div>}
            <p className="text-[10px] text-neutral-400">Para archivos y emisiones a los que tengas acceso. El audio y los subtítulos se controlan en el reproductor local.</p>
          </div>
          <div className="pt-2 border-t border-white/10 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-400">
                ⚡ YTS MP4/AAC + Torrentio ({
                  resolvingP2P
                    ? 'buscando...'
                    : `${resolutionData?.streams?.length || 0} fuentes`
                })
              </span>
              <button
                onClick={() => setForceTranscode(!forceTranscode)}
                className={`px-2 py-0.5 rounded text-[10px] font-bold border flex items-center gap-1 ${
                  forceTranscode
                    ? 'bg-emerald-600/30 text-emerald-300 border-emerald-500'
                    : 'bg-neutral-900 text-neutral-400 border-white/10'
                }`}
              >
                <Cpu className="w-3 h-3" />
                <span>FFmpeg Remux {forceTranscode ? 'ON' : 'AUTO'}</span>
              </button>
            </div>

            {resolutionData?.streams?.length > 0 ? (
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {resolutionData.streams.slice(0, 20).map((s, idx) => {
                  const isCurrentP2P =
                    activeServer === 'p2p' && selectedP2PStream?.infoHash === s.infoHash;
                  return (
                    <div
                      key={`${s.infoHash}-${idx}`}
                      onClick={() => {
                        setSelectedP2PStream(s);
                        setForceTranscode(false);
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
                          {s.audioGuaranteed || s.browserNative ? (
                            <span className="px-1.5 py-0.2 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[9px] rounded font-extrabold">
                              🔊 Audio según metadatos
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.2 bg-purple-500/20 border border-purple-500/40 text-purple-300 text-[9px] rounded font-bold">
                              ⚡ MKV / Dual Audio
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
                  ? 'Consultando YTS Direct MP4 y trackers P2P en segundo plano...'
                  : 'Puedes probar una fuente cloud o añadir una fuente directa.'}
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
              {activeServer !== 'p2p' && activeServer !== 'trailer' && activeServer !== 'direct' && <span className="text-[10px] text-emerald-300"><Shield className="inline w-3 h-3" /> Ventanas emergentes bloqueadas por el iframe</span>}
            </div>
          </div>
        </div>
      )}

      {/* CAJÓN C: Selector de Episodios con CustomSelect */}
      {activeDrawer === 'episodes' && isSeries && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute top-16 right-4 sm:right-16 z-50 w-[350px] sm:w-[420px] max-w-[94vw] max-h-[80vh] flex flex-col bg-[#121212]/98 backdrop-blur-3xl border border-white/15 ring-1 ring-[#E50914]/30 rounded-2xl shadow-[0_25px_70px_rgba(0,0,0,0.95)] p-4 animate-fadeIn"
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
                <CustomSelect
                  options={drawerSeasonOptions}
                  value={drawerSeason}
                  onChange={(val) => setDrawerSeason(Number(val))}
                  size="sm"
                  align="right"
                />
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

      {launchMessage && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-50 pointer-events-none animate-fadeIn">
          <div className="px-4 py-2 rounded-full bg-black/90 backdrop-blur-xl border border-[#E50914]/50 text-xs font-bold text-white shadow-2xl">
            {launchMessage.text}
          </div>
        </div>
      )}

      {/* LIENZO DE VIDEO 100% PANTALLA COMPLETA */}
      <div className="relative w-full h-full bg-black flex items-center justify-center">
        {activeServer !== 'p2p' && activeServer !== 'direct' && activeServer !== 'trailer' && ['unconfirmed', 'error', 'exhausted'].includes(cloudStatus) && <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-40 max-w-[94vw] bg-neutral-950/95 border border-white/20 rounded-xl px-4 py-3 text-xs text-center space-y-2">
          <p>Si el video no inicia, prueba otro espejo o revisa su disponibilidad.</p>
          <div className="flex justify-center gap-2"><button onClick={tryNextCloud} className="px-3 py-2 rounded bg-red-700">Probar siguiente espejo</button><button onClick={() => { setActiveDrawer('servers'); diagnoseCloud(); }} className="px-3 py-2 rounded bg-neutral-800">Diagnosticar fuentes</button><button onClick={() => setCloudStatus('dismissed')} className="px-2 py-1" aria-label="Ocultar aviso">✕</button></div>
        </div>}
        {activeServer === 'direct' && directUrl ? (
          <React.Suspense fallback={<p className="text-white text-sm">Preparando reproductor directo…</p>}><DirectPlayer url={directUrl} initialTime={resumeOffset} onProgress={progress => { cloudProgressConfirmedRef.current = true; trackedTimeRef.current = progress.currentTime; trackedDurationRef.current = progress.duration; }} /></React.Suspense>
        ) : activeServer === 'trailer' && trailerFallbackKey ? (
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
              key={`${selectedP2PStream.infoHash}-${selectedP2PStream.fileIdx ?? 0}-${forceTranscode}-${selectedAudioTrackIdx}`}
              ref={videoRef}
              crossOrigin="anonymous"
              src={getP2PRelativeUrl()}
              className="w-full h-full object-contain cursor-pointer"
              onClick={togglePlay}
              onLoadedMetadata={(e) => {
                syncSubtitleTracks();
                applyInitialVideoSeek(e.currentTarget);
                ensureWebAudioChain();
                syncNativeVideoAudioTrack(selectedLanguage, selectedAudioTrackIdx);
              }}
              onCanPlay={(e) => {
                applyInitialVideoSeek(e.currentTarget);
                ensureWebAudioChain();
                setIsBuffering(false);
                setVideoError(false);
              }}
              onTimeUpdate={handleTimeUpdate}
              onWaiting={() => setIsBuffering(true)}
              onError={() => {
                // Si falló en modo nativo y FFmpeg está disponible, activar FFmpeg antes de mostrar error
                if (!forceTranscode && torrentStatus?.hasFfmpeg) {
                  setTranscodeStart(trackedTimeRef.current); setForceTranscode(true);
                  setVideoError(false);
                } else {
                  setVideoError(true);
                  setIsBuffering(false);
                }
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
                ensureWebAudioChain();
              }}
              onPause={() => setIsPlaying(false)}
              autoPlay
              playsInline
            >
              {subtitles.map((sub) => (
                <track
                  key={sub.id}
                  kind="subtitles"
                  data-subtitle-id={sub.id}
                  onLoad={syncSubtitleTracks}
                  onError={() => setLaunchMessage({ type: 'error', text: 'No se pudo cargar esa pista. Prueba otra versión o un archivo SRT/VTT.' })}
                  src={sub.vttUrl}
                  srcLang={sub.lang}
                  label={sub.label}
                  default={sub.id === selectedSubId}
                />
              ))}
            </video>

            {/* Indicador de Buffering P2P Persistente (NO te saca de Torrentio automáticamente) */}
            {isBuffering && !videoError && (
              <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center bg-black/50 z-20 space-y-3 animate-fadeIn">
                <div className="w-12 h-12 border-4 border-[#E50914]/30 border-t-[#E50914] rounded-full animate-spin" />
                <div className="bg-black/85 px-5 py-3 rounded-2xl backdrop-blur-xl border border-white/15 text-center space-y-1.5 pointer-events-auto">
                  <p className="text-xs sm:text-sm font-extrabold text-white">
                    Conectando P2P Torrentio ({selectedP2PStream.language} • {selectedP2PStream.resolution})
                  </p>
                  <p className="text-[11px] text-emerald-400 font-mono font-bold">
                    👤 {torrentStatus?.numPeers ?? selectedP2PStream.seeders} peers activos
                    {torrentStatus?.downloadSpeed > 0
                      ? ` • ${(torrentStatus.downloadSpeed / (1024 * 1024)).toFixed(2)} MB/s`
                      : ' • Recibiendo metadatos del enjambre...'}
                  </p>
                  <div className="pt-1 flex items-center justify-center gap-2">
                    <button
                      onClick={() => handleLaunchExternal('vlc')}
                      className="px-3 py-1 rounded-full bg-orange-600 hover:bg-orange-500 text-white text-[10px] font-extrabold transition"
                    >
                      Abrir directo en VLC
                    </button>
                    <button
                      onClick={() => setActiveServer('vidsrc')}
                      className="px-3 py-1 rounded-full bg-white/10 hover:bg-white/20 text-neutral-200 text-[10px] font-bold transition"
                    >
                      Cambiar a Cloud HD
                    </button>
                  </div>
                </div>
              </div>
            )}

            {videoError && (
              <div className="absolute inset-0 z-30 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center space-y-4">
                <div className="w-12 h-12 rounded-full bg-red-600/20 border border-red-500/40 flex items-center justify-center text-red-500">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div className="max-w-md space-y-1.5">
                  <h3 className="text-base font-extrabold text-white">
                    Este torrent usa códec HEVC / MKV de escritorio
                  </h3>
                  <p className="text-xs text-neutral-300">
                    Puedes abrirlo directamente con todas sus pistas de audio en VLC Media Player, elegir otra fuente MP4 en el panel o usar Cloud HD.
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2.5">
                  <button
                    onClick={() => handleLaunchExternal('vlc')}
                    className="px-5 py-2.5 bg-orange-600 hover:bg-orange-500 text-white rounded-full text-xs font-extrabold transition shadow-lg"
                  >
                    ▶ Reproducir este Torrent en VLC
                  </button>
                  <button
                    onClick={() => setActiveDrawer('servers')}
                    className="px-4 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-white border border-white/15 rounded-full text-xs font-bold transition"
                  >
                    Elegir otra fuente Torrentio
                  </button>
                  <button
                    onClick={() => setActiveServer('vidsrc')}
                    className="px-4 py-2.5 bg-[#E50914] hover:bg-red-700 text-white rounded-full text-xs font-extrabold transition"
                  >
                    Cambiar a Cloud HD
                  </button>
                </div>
              </div>
            )}

            {/* Barra de Controles Inferior Flotante (Modo P2P HTML5 + Motor DSP) */}
            <div
              onClick={(e) => e.stopPropagation()}
              className={`absolute bottom-4 left-4 right-4 bg-black/80 backdrop-blur-2xl border border-white/15 rounded-2xl px-4 py-3 space-y-2 z-30 transition-all duration-500 ${
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

                  <button
                    onClick={() =>
                      setActiveDrawer(activeDrawer === 'audio' ? null : 'audio')
                    }
                    className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#E50914]/20 border border-[#E50914]/50 text-xs font-extrabold text-red-200"
                  >
                    <Headphones className="w-3.5 h-3.5 text-[#E50914]" />
                    <span>DSP {audioGainPercent}%</span>
                  </button>

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
                        <label className="block text-xs p-2 cursor-pointer text-amber-300">Cargar SRT/VTT<input type="file" accept=".srt,.vtt" onChange={importSubtitle} className="block w-full mt-1 text-[10px]" /></label>
                        <AiSubtitleControl p2p={selectedP2PStream ? { infoHash: selectedP2PStream.infoHash, fileIdx: selectedP2PStream.fileIdx ?? 0, audioTrack: selectedAudioTrackIdx, audioLang: selectedLanguage, originalLanguage, manualAudio: audioTrackManualRef.current } : null} onReady={({ id, url, label }) => { const sub = { id: `ai-${id}`, label, lang: 'und', vttUrl: url }; setSubtitles(current => [...current.filter(entry => !entry.id.startsWith('ai-')), sub]); setSelectedSubId(sub.id); }} />
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
          /* El proveedor conserva sus scripts, pero no puede abrir ventanas ni navegar el nivel superior. */
          <iframe
            ref={embedFrameRef}
            key={`${activeServer}-${activeMirrorIdx}-${selectedLanguage}-${resumeOffset}`}
            onLoad={() => setCloudStatus(current => current === 'playing' ? current : 'loaded')}
            onError={() => setCloudStatus('error')}
            src={currentEmbedUrl}
            title={`Reproductor ${activeServer}`}
            className="w-full h-full border-0"
            allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
            referrerPolicy="no-referrer"
            sandbox="allow-scripts allow-presentation"
            allowFullScreen
          />
        )}
      </div>
    </div>
  );
}
