import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import axios from 'axios';
import { readPlayerMessage, shiftSubtitleCues, nextCloudMirror } from '../../../shared/playerUtils.mjs';
import { toWebVtt, parseWebVttCues } from '../../../shared/subtitleUtils.mjs';
import { buildEmbedServers } from '../../../shared/cloudProviders.mjs';
import api from '../services/api.js';
import CustomSelect from './CustomSelect.jsx';
import AiSubtitleControl from './AiSubtitleControl.jsx';
import SubtitleOverlay from './SubtitleOverlay.jsx';
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
const SITE_SOURCES = [
  { id: 'cuevana', name: 'Cuevana', example: 'https://cuevana3w.pro/pelicula/... o /serie/.../episodio-1x1' },
  { id: 'animeav1', name: 'AnimeAV1', example: 'https://animeav1.com/media/.../1' },
];
const SOURCE_LANGUAGE_LABELS = { latino: 'Latino', castellano: 'Castellano', subtitulado: 'Subtitulado', doblado: 'Doblado', multi: 'Multilenguaje', vose: 'Original / VOSE', unknown: 'Sin confirmar' };

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
  const siteStorageKey = `streamflix:site-pages:${mediaType}:${item?.id || item?.tmdbId}:${currentSeason}:${currentEpisode}`;
  const siteTitleStorageKey = `streamflix:site-titles:${mediaType}:${item?.id || item?.tmdbId}`;
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
  const [sitePageInputs, setSitePageInputs] = useState({ cuevana: '', animeav1: '' });
  const [siteServers, setSiteServers] = useState({ cuevana: [], animeav1: [] });
  const [siteTitlePages, setSiteTitlePages] = useState({ cuevana: '', animeav1: '' });
  const [siteSearchQueries, setSiteSearchQueries] = useState({ cuevana: item?.title || item?.name || '', animeav1: item?.original_name || item?.name || item?.title || '' });
  const [siteCandidates, setSiteCandidates] = useState({ cuevana: [], animeav1: [] });
  const [siteLanguageFilter, setSiteLanguageFilter] = useState({ cuevana: 'all', animeav1: 'all' });
  const [torrentLanguageFilter, setTorrentLanguageFilter] = useState('all');
  const [siteLoading, setSiteLoading] = useState({});
  const [siteErrors, setSiteErrors] = useState({});
  const [openSiteCategory, setOpenSiteCategory] = useState(null);
  const [compatibilityUrl, setCompatibilityUrl] = useState(null);
  const [showCompatibilityPrompt, setShowCompatibilityPrompt] = useState(false);

  useEffect(() => {
    let saved = {}; let titles = {};
    try { saved = JSON.parse(localStorage.getItem(siteStorageKey) || '{}') || {}; } catch { saved = {}; }
    try { titles = JSON.parse(localStorage.getItem(siteTitleStorageKey) || '{}') || {}; } catch { titles = {}; }
    const inputs = { cuevana: saved.cuevana || '', animeav1: saved.animeav1 || '' };
    setSiteTitlePages({ cuevana: titles.cuevana || '', animeav1: titles.animeav1 || '' });
    setSiteSearchQueries({ cuevana: item?.title || item?.name || '', animeav1: item?.original_name || item?.name || item?.title || '' });
    setSitePageInputs(inputs);
    setSiteServers({ cuevana: [], animeav1: [] });
    setSiteCandidates({ cuevana: [], animeav1: [] });
    setSiteErrors({});
    const controller = new AbortController();
    for (const source of SITE_SOURCES) {
      const titleUrl = titles[source.id];
      if (!titleUrl && !inputs[source.id]) continue;
      const endpoint = titleUrl ? '/api/site-resolve' : '/api/site-servers';
      const params = titleUrl ? { source: source.id, titleUrl, season: currentSeason, episode: currentEpisode } : { source: source.id, url: inputs[source.id] };
      setSiteLoading(current => ({ ...current, [source.id]: true }));
      axios.get(endpoint, { params, timeout: 20000, signal: controller.signal })
        .then(({ data }) => {
          if (controller.signal.aborted) return;
          setSiteServers(current => ({ ...current, [source.id]: data.servers || [] }));
          setSitePageInputs(current => ({ ...current, [source.id]: data.pageUrl || '' }));
        })
        .catch(error => { if (!controller.signal.aborted) setSiteErrors(current => ({ ...current, [source.id]: error.response?.data?.error || 'No se pudieron actualizar los servidores guardados.' })); })
        .finally(() => { if (!controller.signal.aborted) setSiteLoading(current => ({ ...current, [source.id]: false })); });
    }
    return () => controller.abort();
  }, [siteStorageKey, siteTitleStorageKey, currentSeason, currentEpisode, item?.title, item?.name, item?.original_name]);

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
  const [activeSubtitleCues, setActiveSubtitleCues] = useState([]);
  const [subtitleRate, setSubtitleRate] = useState(1);
  const [subtitleSize, setSubtitleSize] = useState(() => localStorage.getItem('sf_sub_size') || 'large');
  const [subtitlePosition, setSubtitlePosition] = useState(() => localStorage.getItem('sf_sub_pos') || 'raised');
  const [subtitleBackdrop, setSubtitleBackdrop] = useState(() => localStorage.getItem('sf_sub_bg') === '1');
  const [subMenuTab, setSubMenuTab] = useState('tracks'); // 'tracks' | 'sync' | 'style'
  const [showAiSubPanel, setShowAiSubPanel] = useState(false);
  const [cuePreviewIdx, setCuePreviewIdx] = useState(null);
  const manualSubRef = useRef(false);
  const embedFrameRef = useRef(null);
  const cloudProgressConfirmedRef = useRef(false);
  const cloudLastSavedRef = useRef(null);
  const attemptedCloudRef = useRef(new Set());
  const subtitleOriginalsRef = useRef(new WeakMap());
  const localSubtitleRef = useRef(null);
  const audioTrackManualRef = useRef(false);
  const [cloudStatus, setCloudStatus] = useState('loading');
  const [cloudProbe, setCloudProbe] = useState({ status: 'checking', reason: '' });
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

          let preferredStream = null;
          if (data.streams?.length > 0) {
            preferredStream =
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
              const activeRelease = preferredStream?.title || data.bestStream?.title || '';
              const subs = await api.getSubtitles(
                isSeries ? 'series' : 'movie',
                data.imdbId,
                isSeries ? currentSeason : null,
                isSeries ? currentEpisode : null,
                activeRelease
              );
              if (isMounted && subs) {
                setSubtitles((prev) => {
                  const embedded = prev.filter((entry) => entry.matching === 'embedded');
                  return [...embedded, ...subs, ...(localSubtitleRef.current ? [localSubtitleRef.current] : [])];
                });
                if (localSubtitleRef.current) {
                  setSelectedSubId(localSubtitleRef.current.id);
                } else if (selectedLanguage === 'vose' || activeAudioPreset === 'vose-sub') {
                  const esSub =
                    subs.find((s) => s.langGroup === 'latino' && s.matching === 'release-matched') ||
                    subs.find((s) => s.langGroup !== 'en' && s.matching === 'release-matched') ||
                    subs.find((s) => s.langGroup !== 'en') ||
                    subs[0];
                  setSelectedSubId(esSub ? esSub.id : 'off');
                } else if (selectedLanguage === 'en') {
                  const enSub =
                    subs.find((s) => s.langGroup === 'en' && s.matching === 'release-matched') ||
                    subs.find((s) => s.langGroup === 'en') ||
                    subs[0];
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

  const syncSubtitleTracks = useCallback(() => {}, []);
  const subSyncKey = selectedSubId !== 'off'
    ? `sf_sub_sync:${item.id}:${currentSeason || 0}:${currentEpisode || 0}:${selectedSubId}`
    : null;

  const updateSubtitleSync = useCallback((nextOffset, nextRate = subtitleRate) => {
    const clamped = Math.max(-120, Math.min(120, Math.round(nextOffset * 10) / 10));
    setSubtitleOffset(clamped);
    setSubtitleRate(nextRate);
    if (subSyncKey) {
      try { localStorage.setItem(subSyncKey, JSON.stringify({ offset: clamped, rate: nextRate })); } catch {}
    }
  }, [subSyncKey, subtitleRate]);

  const adjustSubtitleOffset = (delta) => updateSubtitleSync(subtitleOffset + delta, subtitleRate);

  useEffect(() => {
    try { localStorage.setItem('sf_sub_size', subtitleSize); } catch {}
  }, [subtitleSize]);
  useEffect(() => {
    try { localStorage.setItem('sf_sub_pos', subtitlePosition); } catch {}
  }, [subtitlePosition]);
  useEffect(() => {
    try { localStorage.setItem('sf_sub_bg', subtitleBackdrop ? '1' : '0'); } catch {}
  }, [subtitleBackdrop]);

  // Integrar pistas de subtítulos embebidas en el MKV/MP4 (100% sincronizadas)
  useEffect(() => {
    const embeddedTracks = (torrentStatus?.subtitleTracks || []).filter((t) => t.textBased);
    if (!selectedP2PStream?.infoHash || !embeddedTracks.length) return;
    const fileIdx = selectedP2PStream.fileIdx ?? 0;
    const mapped = embeddedTracks.map((t) => {
      const l = (t.lang || '').toLowerCase();
      const langGroup = ['spa', 'es', 'es-mx', 'es-la'].includes(l) ? 'latino' : ['eng', 'en'].includes(l) ? 'en' : 'other';
      return {
        id: `embedded-${selectedP2PStream.infoHash}-${t.index}`,
        lang: t.lang || 'und',
        langGroup,
        label: t.label,
        matching: 'embedded',
        vttUrl: `/api/stream/${selectedP2PStream.infoHash}/subtitle/${t.index}?fileIdx=${fileIdx}`,
      };
    });
    setSubtitles((prev) => {
      const prevEmb = prev.filter((entry) => entry.matching === 'embedded').map((e) => e.id).join(',');
      const nextEmb = mapped.map((e) => e.id).join(',');
      if (prevEmb === nextEmb) return prev;
      const rest = prev.filter((entry) => entry.matching !== 'embedded');
      return [...mapped, ...rest];
    });
    if (!manualSubRef.current && (selectedLanguage === 'vose' || activeAudioPreset === 'vose-sub')) {
      const embeddedEs = mapped.find((m) => m.langGroup === 'latino');
      if (embeddedEs) {
        setSelectedSubId((currentId) => {
          const current = subtitles.find((s) => s.id === currentId);
          return !current || current.matching === 'unverified' ? embeddedEs.id : currentId;
        });
      }
    }
  }, [torrentStatus?.subtitleTracks, selectedP2PStream?.infoHash, selectedP2PStream?.fileIdx, selectedLanguage, activeAudioPreset]);

  const selectedSubUrl = useMemo(
    () => (selectedSubId === 'off' ? '' : subtitles.find((sub) => sub.id === selectedSubId)?.vttUrl || ''),
    [subtitles, selectedSubId]
  );

  // Cargar y parsear cues WebVTT del subtítulo activo
  useEffect(() => {
    if (selectedSubId === 'off' || !selectedSubUrl) {
      setActiveSubtitleCues([]);
      return;
    }
    if (subSyncKey) {
      try {
        const saved = JSON.parse(localStorage.getItem(subSyncKey) || 'null');
        if (saved && Number.isFinite(saved.offset)) setSubtitleOffset(saved.offset);
        else setSubtitleOffset(0);
        if (saved && Number.isFinite(saved.rate)) setSubtitleRate(saved.rate);
        else setSubtitleRate(1);
      } catch {
        setSubtitleOffset(0);
        setSubtitleRate(1);
      }
    }
    let cancelled = false;
    fetch(selectedSubUrl)
      .then((res) => {
        if (!res.ok) throw new Error('No se pudo cargar esa pista de subtítulos.');
        return res.text();
      })
      .then((text) => {
        if (cancelled) return;
        const vtt = /^WEBVTT(?:\s|$)/.test(text.trim()) ? text : toWebVtt(text);
        setActiveSubtitleCues(parseWebVttCues(vtt)); setCuePreviewIdx(null);
      })
      .catch(() => {
        if (!cancelled) {
          setActiveSubtitleCues([]);
          setLaunchMessage({ type: 'error', text: 'No se pudo cargar esa pista. Prueba otra versión o un archivo SRT/VTT.' });
        }
      });
    return () => { cancelled = true; };
  }, [selectedSubId, selectedSubUrl, subSyncKey]);

  const importSubtitle = async event => {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error('El subtítulo no puede superar 2 MB.');
      const vtt = toWebVtt(await file.text());
      if (localSubtitleRef.current) URL.revokeObjectURL(localSubtitleRef.current.vttUrl);
      const sub = { id: 'local-subtitle', label: `📄 ${file.name}`, lang: 'und', matching: 'local', vttUrl: URL.createObjectURL(new Blob([vtt], { type: 'text/vtt' })) };
      manualSubRef.current = true;
      localSubtitleRef.current = sub; setSubtitles(current => [...current.filter(entry => entry.id !== sub.id), sub]); setSelectedSubId(sub.id);
    } catch (error) { setLaunchMessage({ type: 'error', text: error.message }); }
  };
  useEffect(() => {
    manualSubRef.current = false;
    setSubtitles([]); setSelectedSubId('off'); setActiveSubtitleCues([]); setSubtitleOffset(0); setSubtitleRate(1); setCloudHealth([]); attemptedCloudRef.current.clear(); audioTrackManualRef.current = false;
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

  // Los enlaces de cada página se obtienen del servidor local y se agrupan por sitio.
  const embedServersList = useMemo(() => {
    const built = buildEmbedServers({
      tmdbId: item.id || item.tmdbId,
      imdbId: resolutionData?.imdbId || item.imdb_id || item.imdbId,
      isSeries,
      season: currentSeason,
      episode: currentEpisode,
      preferredLanguage: selectedLanguage,
    });
    const sites = SITE_SOURCES.filter(source => siteServers[source.id]?.length).map(source => ({
      id: source.id, name: source.name, badge: 'Página del título', siteSource: true,
      mirrors: siteServers[source.id].map(server => ({ id: server.id, name: server.name, url: server.url, audioLabel: server.audioLabel })),
      url: siteServers[source.id][0].url,
    }));
    return [...built, ...sites];
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
    siteServers,
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

    if (resumeOffset > 10 && base && !currentEmbedServerObj.siteSource) {
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

  useEffect(() => {
    if (['p2p', 'direct', 'trailer'].includes(activeServer) || currentEmbedServerObj?.siteSource) {
      setCloudProbe({ status: 'unknown', reason: '' });
      return;
    }
    const mirror = currentEmbedServerObj?.mirrors?.[activeMirrorIdx];
    if (!mirror || !(item.id || item.tmdbId)) return;
    const controller = new AbortController();
    setCloudProbe({ status: 'checking', reason: '' });
    axios.get('/api/cloud/health', {
      params: { tmdbId: item.id || item.tmdbId, imdbId: resolutionData?.imdbId || item.imdb_id || item.imdbId, type: mediaType, season: currentSeason, episode: currentEpisode, serverId: activeServer, mirrorId: mirror.id },
      timeout: 9000, signal: controller.signal,
    }).then(({ data }) => {
      if (controller.signal.aborted) return;
      const result = data.results?.[0];
      if (!result) { setCloudProbe({ status: 'unknown', reason: 'No se pudo comprobar esta fuente.' }); return; }
      setCloudHealth(current => [...current.filter(entry => entry.url !== result.url), result]);
      setCloudProbe({ status: result.status, reason: result.reason || '' });
    }).catch(() => { if (!controller.signal.aborted) setCloudProbe({ status: 'unknown', reason: 'No se pudo comprobar esta fuente.' }); });
    return () => controller.abort();
  }, [activeServer, activeMirrorIdx, currentEmbedServerObj?.mirrors?.[activeMirrorIdx]?.url, currentEmbedServerObj?.siteSource, item.id, item.tmdbId, item.imdb_id, item.imdbId, resolutionData?.imdbId, mediaType, currentSeason, currentEpisode]);

  const cloudHealthControllerRef = useRef(null);
  const switchCloud = (serverId, index = 0) => {
    setResumeOffset(Math.max(0, Math.floor(trackedTimeRef.current || 0)));
    setCompatibilityUrl(null); setShowCompatibilityPrompt(false);
    setActiveServer(serverId); setActiveMirrorIdx(index);
  };
  const selectSiteTitle = async (source, candidate) => {
    setSiteLoading(current => ({ ...current, [source]: true }));
    setSiteErrors(current => ({ ...current, [source]: '' }));
    try {
      const { data } = await axios.get('/api/site-resolve', { params: { source, titleUrl: candidate.titleUrl, season: currentSeason, episode: currentEpisode }, timeout: 20000 });
      setSiteServers(current => ({ ...current, [source]: data.servers || [] }));
      setSitePageInputs(current => ({ ...current, [source]: data.pageUrl }));
      setSiteTitlePages(current => ({ ...current, [source]: data.titleUrl }));
      setSiteCandidates(current => ({ ...current, [source]: [] }));
      setSiteLanguageFilter(current => ({ ...current, [source]: 'all' }));
      const saved = JSON.parse(localStorage.getItem(siteTitleStorageKey) || '{}') || {};
      saved[source] = data.titleUrl;
      localStorage.setItem(siteTitleStorageKey, JSON.stringify(saved));
    } catch (error) {
      setSiteErrors(current => ({ ...current, [source]: error.response?.data?.error || 'No se pudo localizar el episodio.' }));
    } finally { setSiteLoading(current => ({ ...current, [source]: false })); }
  };
  const searchSiteTitles = async (source) => {
    const query = siteSearchQueries[source]?.trim();
    if (!query) return;
    setSiteLoading(current => ({ ...current, [source]: true }));
    setSiteErrors(current => ({ ...current, [source]: '' }));
    try {
      const { data } = await axios.get('/api/site-search', { params: { source, title: query }, timeout: 20000 });
      const candidates = data.candidates || [];
      setSiteCandidates(current => ({ ...current, [source]: candidates }));
      if (!candidates.length) setSiteErrors(current => ({ ...current, [source]: 'No hubo coincidencias. Prueba con otro nombre o usa el enlace manual.' }));
      else if (candidates[0].score === 1 && (source === 'animeav1' || candidates[0].type === mediaType) && (candidates.length === 1 || candidates[1].score < 1)) {
        await selectSiteTitle(source, candidates[0]);
      }
    } catch (error) {
      setSiteErrors(current => ({ ...current, [source]: error.response?.data?.error || 'No se pudo buscar en esta fuente.' }));
    } finally { setSiteLoading(current => ({ ...current, [source]: false })); }
  };
  const clearSiteTitle = (source) => {
    const titles = JSON.parse(localStorage.getItem(siteTitleStorageKey) || '{}') || {};
    const pages = JSON.parse(localStorage.getItem(siteStorageKey) || '{}') || {};
    delete titles[source]; delete pages[source];
    localStorage.setItem(siteTitleStorageKey, JSON.stringify(titles));
    localStorage.setItem(siteStorageKey, JSON.stringify(pages));
    setSiteTitlePages(current => ({ ...current, [source]: '' }));
    setSitePageInputs(current => ({ ...current, [source]: '' }));
    setSiteServers(current => ({ ...current, [source]: [] }));
    setSiteCandidates(current => ({ ...current, [source]: [] }));
    if (activeServer === source) switchCloud('vidsrc');
  };
  const refreshSiteServers = async (source) => {
    setSiteLoading(current => ({ ...current, [source]: true }));
    setSiteErrors(current => ({ ...current, [source]: '' }));
    try {
      const response = await axios.get('/api/site-servers', { params: { source, url: sitePageInputs[source].trim() }, timeout: 15000 });
      const servers = response.data.servers || [];
      setSiteServers(current => ({ ...current, [source]: servers }));
      if (!servers.length) throw new Error('La página respondió, pero no publicó reproductores compatibles.');
      const saved = JSON.parse(localStorage.getItem(siteStorageKey) || '{}') || {};
      saved[source] = response.data.pageUrl;
      localStorage.setItem(siteStorageKey, JSON.stringify(saved));
      if (response.data.titleUrl) {
        const titles = JSON.parse(localStorage.getItem(siteTitleStorageKey) || '{}') || {};
        titles[source] = response.data.titleUrl;
        localStorage.setItem(siteTitleStorageKey, JSON.stringify(titles));
        setSiteTitlePages(current => ({ ...current, [source]: response.data.titleUrl }));
      }
      setSiteLanguageFilter(current => ({ ...current, [source]: 'all' }));
      setSitePageInputs(current => ({ ...current, [source]: response.data.pageUrl }));
    } catch (error) {
      setSiteErrors(current => ({ ...current, [source]: error.response?.data?.error || error.message || 'No se pudieron obtener los servidores.' }));
    } finally { setSiteLoading(current => ({ ...current, [source]: false })); }
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
  const torrentLanguages = [...new Set((resolutionData?.streams || []).map(stream => stream.languageCode).filter(Boolean))];
  const visibleTorrentStreams = torrentLanguageFilter === 'all' ? (resolutionData?.streams || []) : (resolutionData?.streams || []).filter(stream => stream.languageCode === torrentLanguageFilter);

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
  const cloudSourceBlocked = !['p2p', 'direct', 'trailer'].includes(activeServer) && !currentEmbedServerObj?.siteSource && ['unavailable', 'frame-blocked', 'challenge', 'invalid-certificate', 'redirected'].includes(cloudProbe.status);
  const cloudSourceChecking = !['p2p', 'direct', 'trailer'].includes(activeServer) && !currentEmbedServerObj?.siteSource && cloudProbe.status === 'checking';
  const playerBackdrop = item?.backdrop_url || (item?.backdrop_path ? `https://image.tmdb.org/t/p/w1280${item.backdrop_path}` : null) || item?.poster_url || (item?.poster_path ? `https://image.tmdb.org/t/p/w780${item.poster_path}` : null);

  return (
    <div
      id="smart-player-container"
      onMouseMove={triggerHudVisibility}
      onClick={() => {
        if (activeDrawer) setActiveDrawer(null);
      }}
      className="fixed inset-0 z-50 bg-[#080808] overflow-hidden select-none font-netflix animate-fadeIn"
    >
      <div
        onMouseEnter={triggerHudVisibility}
        className="absolute top-0 left-0 right-0 h-12 z-30 pointer-events-auto"
        style={{ background: 'transparent' }}
      />

      {/* HUD SUPERIOR FLOTANTE ULTRA-LIMPIO */}
      <div
        onClick={(e) => e.stopPropagation()}
        className={`absolute top-0 left-0 right-0 z-40 flex flex-col lg:flex-row lg:items-start justify-between gap-2 px-4 py-4 sm:px-6 sm:py-5 bg-gradient-to-b from-black/90 via-black/55 to-transparent pointer-events-none transition-all duration-300 ${
          showHud || activeDrawer || !['p2p', 'direct', 'trailer'].includes(activeServer)
            ? 'opacity-100 translate-y-0'
            : 'opacity-0 -translate-y-4 pointer-events-none'
        }`}
      >
        <div className="pointer-events-auto flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2.5 bg-black/55 hover:bg-black/75 backdrop-blur-xl border border-white/10 pl-1.5 pr-4 py-1 rounded-full shadow-xl transition-all">
            <button
              onClick={handleSafeClose}
              className="w-8 h-8 rounded-full bg-white/10 hover:bg-[#E50914] text-white flex items-center justify-center transition-all hover:scale-105"
              title="Guardar progreso y volver (ESC)"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2 max-w-[180px] sm:max-w-md truncate">
              <span className="text-xs sm:text-sm font-bold text-white truncate">
                {title}
              </span>
              {isSeries && (
                <span className="px-2 py-0.5 bg-[#E50914] text-white text-[10px] rounded-full font-black shrink-0">
                  T{currentSeason}:E{currentEpisode}
                </span>
              )}
            </div>
          </div>

          {activeServer !== 'p2p' && activeServer !== 'trailer' && activeServer !== 'direct' && <span className={`hidden xl:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium border bg-black/45 ${compatibilityUrl === currentEmbedUrl ? 'text-amber-300 border-amber-500/30' : 'text-neutral-300 border-white/10'}`}><Shield className="w-3.5 h-3.5" /> {compatibilityUrl === currentEmbedUrl ? 'Modo compatible' : 'Reproductor aislado'}</span>}

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
        <div className="pointer-events-auto flex items-center gap-2 justify-end min-w-0">
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
            <Headphones className="w-3.5 h-3.5 text-neutral-200" />
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
            <Layers className="w-3.5 h-3.5 text-neutral-200" />
            <span className="max-w-[115px] sm:max-w-[175px] truncate">{activeServerLabel}</span>
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
                {embedServersList.length} proveedores Cloud y sitios
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
              {embedServersList.filter(srv => !srv.siteSource).map((srv) => {
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

            <div className="space-y-2 pt-2 border-t border-white/10">
              {SITE_SOURCES.map(source => {
                const servers = siteServers[source.id] || [];
                const languages = [...new Set(servers.map(server => server.languageCode).filter(code => code && code !== 'unknown'))];
                const visibleServers = siteLanguageFilter[source.id] === 'all' ? servers : servers.filter(server => server.languageCode === siteLanguageFilter[source.id]);
                const expanded = openSiteCategory === source.id;
                return <div key={source.id} className="rounded-xl border border-white/10 bg-neutral-900/60 overflow-hidden">
                  <button type="button" onClick={() => setOpenSiteCategory(expanded ? null : source.id)} className="w-full p-3 flex items-center justify-between text-left hover:bg-neutral-800/60" aria-expanded={expanded}>
                    <span className="text-xs font-bold text-white">{source.name} <span className="text-neutral-400 font-normal">· {servers.length} servidores</span></span>
                    <ChevronDown className={`w-4 h-4 text-neutral-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                  </button>
                  {expanded && <div className="px-3 pb-3 space-y-2">
                    <p className="text-[10px] text-neutral-400">Busca una vez el título. La temporada y el episodio se resolverán automáticamente.</p>
                    <div className="flex gap-1.5">
                      <input type="search" aria-label={`Buscar título en ${source.name}`} value={siteSearchQueries[source.id]} onChange={event => setSiteSearchQueries(current => ({ ...current, [source.id]: event.target.value }))} onKeyDown={event => { if (event.key === 'Enter') searchSiteTitles(source.id); }} placeholder="Nombre de la serie o película" className="min-w-0 flex-1 p-2 rounded-lg bg-black/70 border border-white/20 text-white text-[11px]" />
                      <button type="button" disabled={siteLoading[source.id] || !siteSearchQueries[source.id]?.trim()} onClick={() => searchSiteTitles(source.id)} className="px-2.5 rounded-lg bg-red-700 text-white text-[11px] font-bold disabled:opacity-50">{siteLoading[source.id] ? 'Buscando…' : 'Buscar'}</button>
                    </div>
                    {siteTitlePages[source.id] && <div className="flex items-center justify-between gap-2 rounded-lg bg-emerald-950/30 border border-emerald-500/20 px-2.5 py-2"><span className="text-[10px] text-emerald-200 truncate">Título vinculado · {siteTitlePages[source.id].split('/').pop()}</span><button type="button" onClick={() => clearSiteTitle(source.id)} className="text-[10px] text-neutral-300 hover:text-white shrink-0">Cambiar</button></div>}
                    {(siteCandidates[source.id] || []).length > 0 && <div className="max-h-40 overflow-y-auto space-y-1">{siteCandidates[source.id].map(candidate => <button key={candidate.titleUrl} type="button" onClick={() => selectSiteTitle(source.id, candidate)} className="w-full rounded-lg border border-white/10 bg-black/45 hover:bg-neutral-800 px-2.5 py-2 text-left"><span className="block text-[11px] font-semibold text-white truncate">{candidate.title}</span><span className="text-[10px] text-neutral-400">{candidate.type === 'movie' ? 'Película' : 'Serie'}{candidate.year ? ` · ${candidate.year}` : ''}</span></button>)}</div>}
                    {siteLoading[source.id] && <p className="text-[10px] text-neutral-400">Localizando la página y sus reproductores…</p>}
                    {siteErrors[source.id] && <p role="alert" className="text-[10px] text-amber-300">{siteErrors[source.id]}</p>}
                    {languages.length > 1 && <label className="flex items-center justify-between text-[10px] text-neutral-300">Idioma anunciado<select value={siteLanguageFilter[source.id]} onChange={event => setSiteLanguageFilter(current => ({ ...current, [source.id]: event.target.value }))} className="rounded bg-black/70 border border-white/20 px-2 py-1 text-white"><option value="all">Todos</option>{languages.map(code => <option key={code} value={code}>{SOURCE_LANGUAGE_LABELS[code] || code}</option>)}</select></label>}
                    {visibleServers.map(server => <button key={server.id} type="button" onClick={() => switchCloud(source.id, servers.indexOf(server))} className={`w-full p-2.5 rounded-lg border text-left ${activeServer === source.id && activeMirrorIdx === servers.indexOf(server) ? 'bg-red-900/35 border-red-500' : 'bg-black/45 border-white/10 hover:bg-neutral-800'}`}>
                      <span className="text-xs font-bold text-white">{server.name}</span>
                      <span className="block text-[10px] text-neutral-400">{server.audioLabel} · {new URL(server.url).hostname}</span>
                    </button>)}
                    {servers.length > 0 && <p className="text-[10px] text-neutral-500">El idioma lo anuncia el sitio; se confirma al reproducir.</p>}
                    <details className="pt-1"><summary className="text-[10px] text-neutral-400 cursor-pointer hover:text-white">Usar enlace manual de episodio o película</summary><div className="flex gap-1.5 mt-2"><input type="url" aria-label={`Página de ${source.name}`} value={sitePageInputs[source.id]} onChange={event => setSitePageInputs(current => ({ ...current, [source.id]: event.target.value }))} placeholder={source.example} className="min-w-0 flex-1 p-2 rounded-lg bg-black/70 border border-white/20 text-white text-[11px]" /><button type="button" disabled={siteLoading[source.id] || !sitePageInputs[source.id]?.trim()} onClick={() => refreshSiteServers(source.id)} className="px-2.5 rounded-lg bg-neutral-700 text-white text-[11px] font-bold disabled:opacity-50">Cargar</button></div></details>
                  </div>}
                </div>;
              })}
            </div>

            {activeServer !== 'p2p' &&
              activeServer !== 'trailer' &&
              !currentEmbedServerObj?.siteSource &&
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

            {torrentLanguages.length > 1 && <label className="flex items-center justify-between text-[10px] text-neutral-300">Idioma de la fuente<select value={torrentLanguageFilter} onChange={event => setTorrentLanguageFilter(event.target.value)} className="rounded bg-black/70 border border-white/20 px-2 py-1 text-white"><option value="all">Todos</option>{torrentLanguages.map(code => <option key={code} value={code}>{SOURCE_LANGUAGE_LABELS[code] || code}</option>)}</select></label>}

            {resolutionData?.streams?.length > 0 ? (
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {visibleTorrentStreams.slice(0, 20).map((s, idx) => {
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
            </video>

            <SubtitleOverlay
              videoRef={videoRef}
              videoKey={`${selectedP2PStream.infoHash}-${selectedP2PStream.fileIdx ?? 0}-${forceTranscode}-${selectedAudioTrackIdx}`}
              cues={activeSubtitleCues}
              offset={subtitleOffset}
              rate={subtitleRate}
              transcodeOffset={forceTranscode ? transcodeStart : 0}
              hudVisible={showHud || !isPlaying}
              size={subtitleSize}
              position={subtitlePosition}
              backdrop={subtitleBackdrop}
            />

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
              className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black via-black/90 to-transparent px-4 sm:px-8 pb-5 pt-10 space-y-3 z-30 transition-all duration-300 ${
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
                  aria-label="Posición del video"
                  min={0}
                  max={duration || 100}
                  value={currentTime}
                  onChange={handleSeek}
                  className="player-progress w-full bg-neutral-600"
                  style={{ background: `linear-gradient(to right, #e50914 ${Math.min(100, (currentTime / (duration || 100)) * 100)}%, #666 ${Math.min(100, (currentTime / (duration || 100)) * 100)}%)` }}
                />
                <span className="text-xs font-mono text-neutral-400 min-w-[44px]">
                  {formatTime(duration)}
                </span>
              </div>

              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-3">
                  <button
                    onClick={togglePlay}
                    aria-label={isPlaying ? 'Pausar' : 'Reproducir'}
                    className="p-1.5 text-white hover:text-[#E50914] transition"
                  >
                    {isPlaying ? (
                      <Pause className="w-5 h-5 fill-current" />
                    ) : (
                      <Play className="w-5 h-5 fill-current" />
                    )}
                  </button>

                  <div className="flex items-center gap-2">
                    <button onClick={toggleMute} aria-label={isMuted ? 'Activar sonido' : 'Silenciar'} className="text-neutral-300 hover:text-white">
                      {isMuted ? (
                        <VolumeX className="w-4 h-4 text-[#E50914]" />
                      ) : (
                        <Volume2 className="w-4 h-4" />
                      )}
                    </button>
                    <input
                      type="range"
                      aria-label="Volumen"
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

                    {activeDrawer === 'subtitles' && (() => {
                      const mediaNow = (videoRef.current?.currentTime || currentTime || 0) + (forceTranscode ? transcodeStart : 0);
                      const nearestIdx = activeSubtitleCues.length
                        ? Math.max(0, activeSubtitleCues.findIndex((c) => c.end * subtitleRate + subtitleOffset >= mediaNow))
                        : 0;
                      const previewIdx = cuePreviewIdx !== null && activeSubtitleCues[cuePreviewIdx] ? cuePreviewIdx : nearestIdx;
                      const previewCue = activeSubtitleCues[previewIdx] || null;
                      return (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="absolute bottom-10 left-0 bg-[#141414]/98 backdrop-blur-xl border border-white/15 rounded-xl shadow-2xl w-80 max-w-[90vw] z-50 overflow-hidden"
                      >
                        <div className="grid grid-cols-3 border-b border-white/10 bg-white/[0.03] text-[11px] font-bold">
                          {[
                            ['tracks', 'Pistas'],
                            ['sync', 'Sincronizar'],
                            ['style', 'Estilo'],
                          ].map(([tabId, tabLabel]) => (
                            <button
                              key={tabId}
                              onClick={() => setSubMenuTab(tabId)}
                              className={`py-2.5 text-center transition ${
                                subMenuTab === tabId
                                  ? 'text-white border-b-2 border-[#E50914] bg-white/[0.05]'
                                  : 'text-neutral-400 hover:text-white'
                              }`}
                            >
                              {tabLabel}
                            </button>
                          ))}
                        </div>

                        <div className="p-3 max-h-[58vh] overflow-y-auto space-y-2.5">
                          {subMenuTab === 'tracks' && (
                            <>
                              <button
                                onClick={() => {
                                  manualSubRef.current = true;
                                  setSelectedSubId('off');
                                  setActiveDrawer(null);
                                }}
                                className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold transition ${
                                  selectedSubId === 'off'
                                    ? 'bg-[#E50914] text-white'
                                    : 'bg-white/5 text-neutral-300 hover:bg-white/10'
                                }`}
                              >
                                ✕ Desactivar subtítulos
                              </button>

                              <div className="space-y-1">
                                {subtitles.length === 0 ? (
                                  <p className="text-[11px] text-neutral-400 px-1 py-2">
                                    No se encontraron subtítulos automáticos. Puedes cargar un archivo .SRT/.VTT o generarlos con IA.
                                  </p>
                                ) : (
                                  subtitles.map((sub) => (
                                    <button
                                      key={sub.id}
                                      onClick={() => {
                                        manualSubRef.current = true;
                                        setSelectedSubId(sub.id);
                                        setActiveDrawer(null);
                                      }}
                                      title={sub.release || sub.label}
                                      className={`w-full text-left px-3 py-2 rounded-lg text-xs flex items-center justify-between gap-2 transition ${
                                        selectedSubId === sub.id
                                          ? 'bg-[#E50914] text-white font-bold'
                                          : 'text-neutral-200 hover:bg-white/10'
                                      }`}
                                    >
                                      <span className="truncate">{sub.label}</span>
                                      {sub.matching === 'embedded' && (
                                        <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">100%</span>
                                      )}
                                    </button>
                                  ))
                                )}
                              </div>

                              <div className="pt-2 border-t border-white/10 space-y-2">
                                <label className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-semibold text-amber-300 cursor-pointer transition">
                                  <span>+ Cargar archivo .SRT / .VTT</span>
                                  <input type="file" accept=".srt,.vtt" onChange={importSubtitle} className="hidden" />
                                </label>

                                <button
                                  onClick={() => setShowAiSubPanel((v) => !v)}
                                  className="w-full text-left px-2 py-1 text-[11px] font-semibold text-neutral-400 hover:text-white flex items-center justify-between"
                                >
                                  <span>Generar subtítulos con IA (Whisper)</span>
                                  <span>{showAiSubPanel ? '▲' : '▼'}</span>
                                </button>
                                {showAiSubPanel && (
                                  <AiSubtitleControl
                                    p2p={selectedP2PStream ? { infoHash: selectedP2PStream.infoHash, fileIdx: selectedP2PStream.fileIdx ?? 0, audioTrack: selectedAudioTrackIdx, audioLang: selectedLanguage, originalLanguage, manualAudio: audioTrackManualRef.current } : null}
                                    onReady={({ id, url, label }) => {
                                      manualSubRef.current = true;
                                      const sub = { id: `ai-${id}`, label, lang: 'und', matching: 'ai', vttUrl: url };
                                      setSubtitles((current) => [...current.filter((entry) => !entry.id.startsWith('ai-')), sub]);
                                      setSelectedSubId(sub.id);
                                    }}
                                  />
                                )}
                              </div>
                            </>
                          )}

                          {subMenuTab === 'sync' && (
                            selectedSubId === 'off' ? (
                              <p className="text-xs text-neutral-400 py-4 text-center">
                                Activa primero una pista en la pestaña <strong>Pistas</strong> para ajustar su sincronía.
                              </p>
                            ) : (
                              <div className="space-y-3">
                                <div className="space-y-1.5">
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-white">Desfase manual</span>
                                    <span className="text-xs font-mono font-bold text-amber-300">{subtitleOffset > 0 ? `+${subtitleOffset}` : subtitleOffset}s</span>
                                  </div>
                                  <p className="text-[11px] text-neutral-400 leading-snug">
                                    Si el texto sale <strong>antes</strong> de la voz, suma (+). Si sale <strong>después</strong>, resta (-).
                                  </p>
                                  <div className="grid grid-cols-5 gap-1 font-mono text-[11px]">
                                    <button onClick={() => adjustSubtitleOffset(-5)} className="py-1.5 rounded bg-white/10 hover:bg-white/20 text-white font-bold">-5s</button>
                                    <button onClick={() => adjustSubtitleOffset(-0.5)} className="py-1.5 rounded bg-white/10 hover:bg-white/20 text-white">-0.5</button>
                                    <button onClick={() => updateSubtitleSync(0, 1)} className="py-1.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-bold" title="Volver a 0s">0s</button>
                                    <button onClick={() => adjustSubtitleOffset(0.5)} className="py-1.5 rounded bg-white/10 hover:bg-white/20 text-white">+0.5</button>
                                    <button onClick={() => adjustSubtitleOffset(5)} className="py-1.5 rounded bg-white/10 hover:bg-white/20 text-white font-bold">+5s</button>
                                  </div>
                                  <div className="grid grid-cols-4 gap-1 font-mono text-[10px]">
                                    <button onClick={() => adjustSubtitleOffset(-30)} className="py-1 rounded bg-white/5 hover:bg-white/15 text-neutral-300">-30s</button>
                                    <button onClick={() => adjustSubtitleOffset(-0.1)} className="py-1 rounded bg-white/5 hover:bg-white/15 text-neutral-300">-0.1s</button>
                                    <button onClick={() => adjustSubtitleOffset(0.1)} className="py-1 rounded bg-white/5 hover:bg-white/15 text-neutral-300">+0.1s</button>
                                    <button onClick={() => adjustSubtitleOffset(30)} className="py-1 rounded bg-white/5 hover:bg-white/15 text-neutral-300">+30s</button>
                                  </div>
                                </div>

                                {previewCue && (
                                  <div className="p-2.5 rounded-lg bg-white/[0.04] border border-white/10 space-y-2">
                                    <div className="flex items-center justify-between text-[11px]">
                                      <span className="font-bold text-white">Alinear con diálogo</span>
                                      <span className="font-mono text-neutral-400">
                                        {formatTime(previewCue.start * subtitleRate + subtitleOffset)}
                                      </span>
                                    </div>
                                    <p className="text-[11px] text-neutral-200 italic line-clamp-2 min-h-[2rem]">
                                      “{previewCue.text.replace(/<[^>]+>/g, '').replace(/\n/g, ' ')}”
                                    </p>
                                    <div className="flex items-center gap-1.5">
                                      <button
                                        onClick={() => setCuePreviewIdx(Math.max(0, previewIdx - 1))}
                                        className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-[11px] text-white"
                                      >
                                        ◀ Ant.
                                      </button>
                                      <button
                                        onClick={() => setCuePreviewIdx(Math.min(activeSubtitleCues.length - 1, previewIdx + 1))}
                                        className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-[11px] text-white"
                                      >
                                        Sig. ▶
                                      </button>
                                      <button
                                        onClick={() => {
                                          const now = (videoRef.current?.currentTime || currentTime || 0) + (forceTranscode ? transcodeStart : 0);
                                          updateSubtitleSync(now - previewCue.start * subtitleRate, subtitleRate);
                                          setCuePreviewIdx(null);
                                        }}
                                        className="ml-auto px-2.5 py-1 rounded bg-[#E50914] hover:bg-red-700 text-[11px] font-bold text-white"
                                      >
                                        Traer aquí
                                      </button>
                                    </div>
                                  </div>
                                )}

                                <div className="space-y-1 pt-1 border-t border-white/10">
                                  <span className="text-[11px] font-bold text-neutral-300 block">Velocidad (si se atrasa poco a poco)</span>
                                  <div className="grid grid-cols-3 gap-1 text-[10px]">
                                    {[
                                      [1, 'Normal'],
                                      [25 / 23.976, 'Más lento'],
                                      [23.976 / 25, 'Más rápido'],
                                    ].map(([r, lbl]) => (
                                      <button
                                        key={lbl}
                                        onClick={() => updateSubtitleSync(subtitleOffset, r)}
                                        className={`py-1.5 rounded font-bold ${
                                          Math.abs(subtitleRate - r) < 0.001
                                            ? 'bg-[#E50914] text-white'
                                            : 'bg-white/10 text-neutral-300 hover:bg-white/20'
                                        }`}
                                      >
                                        {lbl}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            )
                          )}

                          {subMenuTab === 'style' && (
                            <div className="space-y-3">
                              <div className="space-y-1">
                                <span className="text-xs font-bold text-neutral-200 block">Tamaño del texto</span>
                                <div className="grid grid-cols-3 gap-1.5">
                                  {[['normal', 'Normal'], ['large', 'Grande'], ['xlarge', 'Extra']].map(([k, lbl]) => (
                                    <button key={k} onClick={() => setSubtitleSize(k)} className={`py-1.5 rounded-lg text-xs font-bold ${subtitleSize === k ? 'bg-[#E50914] text-white' : 'bg-white/10 text-neutral-300 hover:bg-white/20'}`}>{lbl}</button>
                                  ))}
                                </div>
                              </div>
                              <div className="space-y-1">
                                <span className="text-xs font-bold text-neutral-200 block">Altura en pantalla</span>
                                <div className="grid grid-cols-3 gap-1.5">
                                  {[['low', 'Abajo'], ['raised', 'Elevado'], ['high', 'Alto']].map(([k, lbl]) => (
                                    <button key={k} onClick={() => setSubtitlePosition(k)} className={`py-1.5 rounded-lg text-xs font-bold ${subtitlePosition === k ? 'bg-[#E50914] text-white' : 'bg-white/10 text-neutral-300 hover:bg-white/20'}`}>{lbl}</button>
                                  ))}
                                </div>
                              </div>
                              <div className="space-y-1">
                                <span className="text-xs font-bold text-neutral-200 block">Fondo</span>
                                <div className="grid grid-cols-2 gap-1.5">
                                  <button onClick={() => setSubtitleBackdrop(false)} className={`py-1.5 rounded-lg text-xs font-bold ${!subtitleBackdrop ? 'bg-[#E50914] text-white' : 'bg-white/10 text-neutral-300 hover:bg-white/20'}`}>Sombra Netflix</button>
                                  <button onClick={() => setSubtitleBackdrop(true)} className={`py-1.5 rounded-lg text-xs font-bold ${subtitleBackdrop ? 'bg-[#E50914] text-white' : 'bg-white/10 text-neutral-300 hover:bg-white/20'}`}>Caja oscura</button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                      );
                    })()}
                  </div>


                  {selectedSubId !== 'off' && (
                    <div className="hidden sm:flex items-center gap-1 bg-white/5 px-2 py-0.5 rounded-full text-[10px]">
                      <button
                        onClick={() => adjustSubtitleOffset(-0.5)}
                        className="px-1 text-neutral-300 hover:text-white font-mono"
                        title="Adelantar subtítulos 0.5s"
                      >
                        -0.5s
                      </button>
                      <button
                        onClick={() => adjustSubtitleOffset(-0.1)}
                        className="px-1 text-neutral-400 hover:text-white font-mono"
                        title="Adelantar 0.1s"
                      >
                        -0.1
                      </button>
                      <button
                        onClick={() => updateSubtitleSync(0, 1)}
                        className="font-mono text-amber-300 px-1"
                        title="Reiniciar sincronía a 0s"
                      >
                        {subtitleOffset}s
                      </button>
                      <button
                        onClick={() => adjustSubtitleOffset(0.1)}
                        className="px-1 text-neutral-400 hover:text-white font-mono"
                        title="Retrasar 0.1s"
                      >
                        +0.1
                      </button>
                      <button
                        onClick={() => adjustSubtitleOffset(0.5)}
                        className="px-1 text-neutral-300 hover:text-white font-mono"
                        title="Retrasar subtítulos 0.5s"
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
        ) : cloudSourceChecking || cloudSourceBlocked ? (
          <div className="absolute inset-0 flex items-center justify-center overflow-hidden bg-[#0b0b0b]">
            {playerBackdrop && <img src={playerBackdrop} alt="" className="absolute inset-0 w-full h-full object-cover opacity-25 blur-xl scale-110" />}
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/75 to-black/60" />
            <div role="status" className="relative z-10 max-w-lg mx-5 text-center space-y-4 animate-fadeIn">
              <div className="mx-auto w-14 h-14 rounded-full border border-white/15 bg-white/5 flex items-center justify-center">
                {cloudSourceChecking ? <div className="w-6 h-6 rounded-full border-2 border-red-600/30 border-t-red-500 animate-spin" /> : <AlertTriangle className="w-6 h-6 text-red-400" />}
              </div>
              <div className="space-y-2">
                <p className="text-[11px] uppercase tracking-[0.22em] font-bold text-red-400">{cloudSourceChecking ? 'Comprobando fuente' : 'Fuente no disponible'}</p>
                <h2 className="text-xl sm:text-3xl font-bold text-white">{cloudSourceChecking ? 'Preparando la reproducción' : 'Este servidor no puede reproducirse aquí'}</h2>
                <p className="text-sm text-neutral-300">{cloudSourceChecking ? 'Verificando la página antes de abrir el reproductor.' : cloudProbe.reason || 'Prueba otra fuente para este título.'}</p>
              </div>
              {!cloudSourceChecking && <div className="flex flex-wrap items-center justify-center gap-2">
                <button onClick={tryNextCloud} className="px-5 py-2.5 rounded-md bg-white text-black hover:bg-neutral-200 text-sm font-bold transition">Probar siguiente</button>
                <button onClick={() => setActiveDrawer('servers')} className="px-5 py-2.5 rounded-md bg-white/15 text-white hover:bg-white/25 text-sm font-bold transition">Elegir servidor</button>
              </div>}
            </div>
          </div>
        ) : (
          /* El aislamiento se retira solo para la URL que el usuario autorizó en esta sesión. */
          <iframe
            ref={embedFrameRef}
            key={`${activeServer}-${activeMirrorIdx}-${selectedLanguage}-${resumeOffset}-${compatibilityUrl === currentEmbedUrl ? 'compatible' : 'aislado'}`}
            onLoad={() => setCloudStatus(current => current === 'playing' ? current : 'loaded')}
            onError={() => setCloudStatus('error')}
            src={currentEmbedUrl}
            title={`Reproductor ${activeServer}`}
            className="w-full h-full border-0"
            allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
            referrerPolicy="no-referrer"
            sandbox={compatibilityUrl === currentEmbedUrl ? undefined : 'allow-scripts allow-presentation'}
            allowFullScreen
          />
        )}
        {activeServer !== 'p2p' && activeServer !== 'direct' && activeServer !== 'trailer' && !cloudSourceBlocked && !cloudSourceChecking && <div className="absolute bottom-0 inset-x-0 z-30 px-4 sm:px-7 pt-12 pb-4 sm:pb-6 bg-gradient-to-t from-black/90 via-black/55 to-transparent pointer-events-none">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.2em] text-neutral-400 font-bold">Reproduciendo con {activeServerLabel}</p>
              <p className="text-sm sm:text-lg font-semibold text-white truncate max-w-[65vw]">{title}{isSeries ? ` · T${currentSeason}:E${currentEpisode}` : ''}</p>
              {['unconfirmed', 'error', 'exhausted'].includes(cloudStatus) && <p className="text-[11px] text-amber-300">No se confirmó el video. Puedes cambiar de servidor.</p>}
              {compatibilityUrl === currentEmbedUrl && <p className="text-[11px] text-amber-300">Modo compatible activo: el proveedor puede mostrar anuncios o abrir ventanas.</p>}
            </div>
            <div className="flex items-center gap-2 pointer-events-auto">
              {compatibilityUrl === currentEmbedUrl
                ? <button onClick={() => setCompatibilityUrl(null)} className="px-3 py-2 rounded-md bg-amber-900/45 hover:bg-amber-900/70 border border-amber-500/35 text-amber-100 text-xs font-semibold transition">Volver a aislar</button>
                : <button onClick={() => setShowCompatibilityPrompt(true)} className="px-3 py-2 rounded-md bg-white/15 hover:bg-white/25 border border-white/15 text-white text-xs font-semibold transition">Modo compatible</button>}
              <button onClick={tryNextCloud} className="px-3 py-2 rounded-md bg-white/15 hover:bg-white/25 border border-white/15 text-white text-xs font-semibold transition">Siguiente fuente</button>
              <button onClick={() => setActiveDrawer('servers')} className="px-3 py-2 rounded-md bg-white/15 hover:bg-white/25 border border-white/15 text-white text-xs font-semibold transition">Servidores</button>
            </div>
          </div>
        </div>}
      </div>
      {showCompatibilityPrompt && <div role="dialog" aria-modal="true" aria-labelledby="compatibility-title" onClick={event => event.stopPropagation()} className="absolute inset-0 z-[70] flex items-center justify-center bg-black/85 px-5">
        <div className="w-full max-w-md rounded-2xl border border-amber-500/30 bg-[#1b1b1b] p-6 shadow-2xl space-y-4">
          <div className="flex items-center gap-3 text-amber-300"><AlertTriangle className="h-6 w-6 shrink-0" /><h2 id="compatibility-title" className="text-lg font-bold text-white">Abrir este servidor en modo compatible</h2></div>
          <p className="text-sm leading-relaxed text-neutral-300">Este proveedor rechaza el aislamiento del reproductor. Al continuar podrá mostrar anuncios o abrir ventanas emergentes. Actívalo solo si confías en esta fuente.</p>
          <p className="text-xs text-neutral-400">Se aplicará únicamente a este servidor durante esta sesión.</p>
          <div className="flex justify-end gap-2 pt-2"><button type="button" onClick={() => setShowCompatibilityPrompt(false)} className="rounded-lg px-4 py-2 text-sm text-neutral-200 hover:bg-white/10">Cancelar</button><button type="button" onClick={() => { setCompatibilityUrl(currentEmbedUrl); setShowCompatibilityPrompt(false); }} className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-black hover:bg-amber-500">Abrir este servidor</button></div>
        </div>
      </div>}
    </div>
  );
}
