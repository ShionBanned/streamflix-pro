import { useState, useEffect, useCallback } from 'react';

const CONTINUE_WATCHING_KEY = 'streamflix_continue_watching';
const WATCHLIST_KEY = 'streamflix_watchlist';
const PREFERRED_LANGUAGE_KEY = 'streamflix_preferred_language';
const TASTE_HISTORY_KEY = 'streamflix_taste_history';
const AUDIO_ENGINE_PRESET_KEY = 'streamflix_audio_engine_preset';

export const LANGUAGE_OPTIONS = [
  {
    id: 'latino',
    label: 'Preferir Español Latino',
    shortLabel: 'Pref. Latino',
    flag: '🇲🇽',
    tmdbLang: 'es-MX',
    subLang: 'es',
    badge: 'Preferencia LAT',
    description: 'Prioriza pistas marcadas como español latino cuando la fuente las ofrece',
  },
  {
    id: 'castellano',
    label: 'Preferir Castellano (España)',
    shortLabel: 'Pref. Castellano',
    flag: '🇪🇸',
    tmdbLang: 'es-ES',
    subLang: 'es',
    badge: 'Preferencia ESP',
    description: 'Prioriza pistas marcadas como castellano cuando la fuente las ofrece',
  },
  {
    id: 'vose',
    label: 'Original + Subtítulos ES',
    shortLabel: 'Subtitulado',
    flag: '💬',
    tmdbLang: 'es-MX',
    subLang: 'es',
    badge: 'VOSE + Sub ES',
    description: 'Prioriza el audio original y busca subtítulos en español; disponibilidad según fuente',
  },
  {
    id: 'en',
    label: 'English (Original + CC)',
    shortLabel: 'English',
    flag: '🇺🇸',
    tmdbLang: 'en-US',
    subLang: 'en',
    badge: 'Original EN',
    description: 'Prioritizes English tracks and captions when the source offers them',
  },
];

export const AUDIO_ENGINE_PRESETS = [
  {
    id: 'latino-aac',
    langId: 'latino',
    label: 'Motor Audio Español Latino',
    shortLabel: 'Preferencia Latino',
    flag: '🇲🇽',
    badge: 'Priorizar LAT',
    forceAacRemux: true,
    voiceBoostDb: 5,
    gainMultiplier: 1.35,
    description: 'Prioriza fuentes etiquetadas en español latino; conversión AAC disponible con FFmpeg para reproducción local',
  },
  {
    id: 'castellano-aac',
    langId: 'castellano',
    label: 'Motor Audio Castellano',
    shortLabel: 'Preferencia Castellano',
    flag: '🇪🇸',
    badge: 'Priorizar ESP',
    forceAacRemux: true,
    voiceBoostDb: 5,
    gainMultiplier: 1.35,
    description: 'Prioriza pistas marcadas como castellano; AAC local disponible si se convierte la fuente',
  },
  {
    id: 'live-aac',
    langId: null,
    label: 'Transcodificador Live AAC 2.0',
    shortLabel: 'Live AAC Remux',
    flag: '⚡',
    badge: 'Anti-Mudo MKV/AC3',
    forceAacRemux: true,
    voiceBoostDb: 6,
    gainMultiplier: 1.6,
    description: 'Convierte audio local a AAC estéreo con FFmpeg; algunos códecs de video también requieren conversión',
  },
  {
    id: 'vose-sub',
    langId: 'vose',
    label: 'Audio Original + Subtítulos ES',
    shortLabel: 'Original + Sub ES',
    flag: '💬',
    badge: 'YTS MP4 + Sub ES',
    forceAacRemux: false,
    voiceBoostDb: 3,
    gainMultiplier: 1.2,
    description: 'Prioriza streams MP4/AAC nativos en idioma original con subtítulos en Español sincronizados',
  },
];

const GENRE_NAMES = {
  28: 'Acción',
  12: 'Aventura',
  16: 'Animación y Anime',
  35: 'Comedia',
  80: 'Crimen',
  99: 'Documental',
  18: 'Drama',
  10751: 'Familia',
  14: 'Fantasía',
  36: 'Historia',
  27: 'Terror',
  10402: 'Música',
  9648: 'Misterio',
  10749: 'Romance',
  878: 'Ciencia Ficción',
  53: 'Suspenso',
  10752: 'Bélica',
  37: 'Western',
  10759: 'Acción y Aventura',
  10765: 'Sci-Fi y Fantasía',
};

const isSameMediaEntry = (entry, tmdbId, season = null, episode = null) => {
  const entryId = String(entry.tmdbId ?? entry.id ?? '');
  const targetId = String(tmdbId ?? '');
  if (!entryId || entryId !== targetId) return false;

  const entrySeason = entry.season ? Number(entry.season) : null;
  const targetSeason = season ? Number(season) : null;
  const entryEpisode = entry.episode ? Number(entry.episode) : null;
  const targetEpisode = episode ? Number(episode) : null;

  return entrySeason === targetSeason && entryEpisode === targetEpisode;
};

/**
 * Motor algorítmico estilo Netflix ("computePersonalizedPool"):
 * Analiza las reproducciones en curso (continueWatching), Mi Lista (watchlist) y el historial de gustos (tasteHistory)
 * y los cruza con las películas que están estallando en taquilla (nowPlaying) y tendencias globales (trending).
 */
export function computePersonalizedPool({
  continueWatching = [],
  watchlist = [],
  tasteHistory = [],
  nowPlaying = [],
  trending = [],
  sectionItems = [],
  preferredGenreIds = [],
  maxItems = 8,
} = {}) {
  const genreWeights = {};
  const referenceTitles = {};

  const registerItemTaste = (item, baseWeight = 2) => {
    if (!item) return;
    const itemTitle = item.title || item.name;
    const ids =
      Array.isArray(item.genre_ids) && item.genre_ids.length > 0
        ? item.genre_ids
        : Array.isArray(item.genres)
        ? item.genres.map((g) => g.id)
        : [];

    ids.forEach((gid) => {
      genreWeights[gid] = (genreWeights[gid] || 0) + baseWeight;
      if (itemTitle && !referenceTitles[gid]) {
        referenceTitles[gid] = itemTitle;
      }
    });
  };

  continueWatching.slice(0, 10).forEach((item) => registerItemTaste(item, 4));
  watchlist.slice(0, 12).forEach((item) => registerItemTaste(item, 3));
  tasteHistory.slice(0, 15).forEach((item) => registerItemTaste(item, 2));
  preferredGenreIds.forEach((id) => { genreWeights[id] = (genreWeights[id] || 0) + 5; });

  const nowPlayingIds = new Set((nowPlaying || []).slice(0, 12).map((i) => i.id));
  const trendingIds = new Set((trending || []).slice(0, 12).map((i) => i.id));

  const rawCandidates = [
    ...(sectionItems || []),
    ...(nowPlaying || []).slice(0, 10),
    ...(trending || []).slice(0, 12),
  ];

  const seenIds = new Set();
  const candidates = [];

  for (const item of rawCandidates) {
    if (!item || !item.id || seenIds.has(item.id)) continue;
    if (!item.backdrop_path && !item.backdrop_url) continue;
    seenIds.add(item.id);

    const ids =
      Array.isArray(item.genre_ids) && item.genre_ids.length > 0
        ? item.genre_ids
        : Array.isArray(item.genres)
        ? item.genres.map((g) => g.id)
        : [];

    let affinityScore = 0;
    let topGenreId = null;
    let topGenreScore = 0;

    ids.forEach((gid) => {
      const w = genreWeights[gid] || 0;
      affinityScore += w;
      if (w > topGenreScore) {
        topGenreScore = w;
        topGenreId = gid;
      }
    });

    const isBoxOfficeHit = nowPlayingIds.has(item.id);
    const isTrendingHit = trendingIds.has(item.id);
    const voteAvg = Number(item.vote_average || 7.8);
    const popularityBonus = Math.min(25, (Number(item.popularity || 100) / 120));

    const totalScore =
      affinityScore * 12 +
      (isBoxOfficeHit ? 38 : 0) +
      (isTrendingHit ? 28 : 0) +
      voteAvg * 4 +
      popularityBonus;

    const matchScore = Math.min(
      99,
      Math.max(88, Math.round(78 + Math.min(14, affinityScore * 2) + voteAvg * 1.1))
    );

    let heroReasonTag = '🔥 En Tendencia Global Hoy';
    if (topGenreId && referenceTitles[topGenreId]) {
      heroReasonTag = `🎯 Por tu interés en "${referenceTitles[topGenreId]}" • ${matchScore}% para ti`;
    } else if (topGenreId && GENRE_NAMES[topGenreId]) {
      heroReasonTag = `🎯 Recomendado en ${GENRE_NAMES[topGenreId]} • ${matchScore}% para ti`;
    } else if (isBoxOfficeHit) {
      heroReasonTag = `🍿 Estallando en Taquilla • ${matchScore}% de coincidencia`;
    } else if (voteAvg >= 8.1) {
      heroReasonTag = `🏆 Aclamada por la Crítica (${voteAvg.toFixed(1)} ★)`;
    }

    candidates.push({
      ...item,
      totalScore,
      matchScore,
      heroReasonTag,
      isBoxOfficeHit,
    });
  }

  candidates.sort((a, b) => b.totalScore - a.totalScore);
  return candidates.slice(0, maxItems);
}

export function useUserMedia() {
  const [continueWatching, setContinueWatching] = useState(() => {
    try {
      const saved = localStorage.getItem(CONTINUE_WATCHING_KEY);
      if (!saved) return [];
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed)
        ? parsed.map((e) => ({ ...e, id: e.id || e.tmdbId, tmdbId: e.tmdbId || e.id }))
        : [];
    } catch {
      return [];
    }
  });

  const [watchlist, setWatchlist] = useState(() => {
    try {
      const saved = localStorage.getItem(WATCHLIST_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [tasteHistory, setTasteHistory] = useState(() => {
    try {
      const saved = localStorage.getItem(TASTE_HISTORY_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [preferredLanguage, setPreferredLanguage] = useState(() => {
    try {
      return localStorage.getItem(PREFERRED_LANGUAGE_KEY) || 'latino';
    } catch {
      return 'latino';
    }
  });

  const [audioEnginePreset, setAudioEnginePreset] = useState(() => {
    try {
      return localStorage.getItem(AUDIO_ENGINE_PRESET_KEY) || 'latino-aac';
    } catch {
      return 'latino-aac';
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(CONTINUE_WATCHING_KEY, JSON.stringify(continueWatching));
    } catch (e) {
      console.warn('Error guardando continueWatching:', e);
    }
  }, [continueWatching]);

  useEffect(() => {
    try {
      localStorage.setItem(WATCHLIST_KEY, JSON.stringify(watchlist));
    } catch (e) {
      console.warn('Error guardando watchlist:', e);
    }
  }, [watchlist]);

  useEffect(() => {
    try {
      localStorage.setItem(TASTE_HISTORY_KEY, JSON.stringify(tasteHistory));
    } catch (e) {
      console.warn('Error guardando tasteHistory:', e);
    }
  }, [tasteHistory]);

  useEffect(() => {
    try {
      localStorage.setItem(PREFERRED_LANGUAGE_KEY, preferredLanguage);
    } catch (e) {
      console.warn('Error guardando preferredLanguage:', e);
    }
  }, [preferredLanguage]);

  useEffect(() => {
    try {
      localStorage.setItem(AUDIO_ENGINE_PRESET_KEY, audioEnginePreset);
    } catch (e) {
      console.warn('Error guardando audioEnginePreset:', e);
    }
  }, [audioEnginePreset]);

  const recordTasteInteraction = useCallback((item) => {
    if (!item || (!item.id && !item.tmdbId)) return;
    const targetId = item.id || item.tmdbId;
    setTasteHistory((prev) => {
      const filtered = prev.filter((i) => String(i.id || i.tmdbId) !== String(targetId));
      const compact = {
        id: targetId,
        tmdbId: targetId,
        title: item.title || item.name || '',
        genre_ids:
          item.genre_ids ||
          (Array.isArray(item.genres) ? item.genres.map((g) => g.id) : []),
        media_type: item.media_type || (item.first_air_date ? 'tv' : 'movie'),
        timestamp: Date.now(),
      };
      return [compact, ...filtered].slice(0, 30);
    });
  }, []);

  const saveProgress = useCallback(
    ({
      item,
      season = null,
      episode = null,
      currentTime,
      duration,
      language = null,
      server = null,
    }) => {
      if (!item) return;
      const safeDuration = duration && duration > 30 ? duration : 5400;
      const safeCurrentTime = Math.floor(Number(currentTime) || 0);

      const tmdbId = item.id || item.tmdbId;
      if (!tmdbId) return;

      const title = item.title || item.name || 'Sin título';
      const isTv =
        Boolean(season && episode) ||
        item.media_type === 'tv' ||
        item.type === 'tv' ||
        Boolean(item.first_air_date);
      const type = isTv ? 'tv' : 'movie';
      const normSeason = isTv ? Number(season || 1) : null;
      const normEpisode = isTv ? Number(episode || 1) : null;

      const progressPercent = Math.min(99, Math.max(2, (safeCurrentTime / safeDuration) * 100));

      if (progressPercent > 95) {
        setContinueWatching((prev) =>
          prev.filter((entry) => !isSameMediaEntry(entry, tmdbId, normSeason, normEpisode))
        );
        return;
      }

      if (safeCurrentTime < 5) return;

      setContinueWatching((prev) => {
        const remaining = prev.filter(
          (entry) => !isSameMediaEntry(entry, tmdbId, normSeason, normEpisode)
        );

        const newEntry = {
          ...item,
          id: tmdbId,
          tmdbId,
          imdbId: item.imdb_id || item.imdbId || null,
          title,
          poster_path: item.poster_path,
          backdrop_path: item.backdrop_path,
          poster_url:
            item.poster_url ||
            (item.poster_path ? `https://image.tmdb.org/t/p/w342${item.poster_path}` : null),
          backdrop_url:
            item.backdrop_url ||
            (item.backdrop_path ? `https://image.tmdb.org/t/p/w1280${item.backdrop_path}` : null),
          type,
          media_type: type,
          season: normSeason,
          episode: normEpisode,
          language: language || preferredLanguage,
          server: server || item.server || null,
          currentTime: safeCurrentTime,
          duration: Math.floor(safeDuration),
          progressPercent: Math.round(progressPercent),
          updatedAt: Date.now(),
        };

        return [newEntry, ...remaining].slice(0, 25);
      });
    },
    [preferredLanguage]
  );

  const removeFromContinueWatching = useCallback((tmdbId, season = null, episode = null) => {
    setContinueWatching((prev) =>
      prev.filter((entry) => !isSameMediaEntry(entry, tmdbId, season, episode))
    );
  }, []);

  const getSavedProgress = useCallback(
    (tmdbId, season = null, episode = null) => {
      if (!tmdbId) return 0;
      const exactMatch = continueWatching.find((entry) =>
        isSameMediaEntry(entry, tmdbId, season, episode)
      );
      if (exactMatch && exactMatch.currentTime > 5) {
        return exactMatch.currentTime;
      }
      if (!season && !episode) {
        const anyMatch = continueWatching.find(
          (entry) => String(entry.tmdbId ?? entry.id) === String(tmdbId)
        );
        return anyMatch?.currentTime || 0;
      }
      return 0;
    },
    [continueWatching]
  );

  const getSavedEntry = useCallback(
    (tmdbId) => {
      if (!tmdbId) return null;
      return (
        continueWatching.find((entry) => String(entry.tmdbId ?? entry.id) === String(tmdbId)) ||
        null
      );
    },
    [continueWatching]
  );

  const toggleWatchlist = useCallback((item) => {
    const id = item?.id || item?.tmdbId;
    if (!id) return;
    setWatchlist((prev) => {
      const exists = prev.some((i) => String(i.id || i.tmdbId) === String(id));
      if (exists) {
        return prev.filter((i) => String(i.id || i.tmdbId) !== String(id));
      } else {
        return [{ ...item, id }, ...prev];
      }
    });
  }, []);

  const isInWatchlist = useCallback(
    (id) => {
      if (!id) return false;
      return watchlist.some((i) => String(i.id || i.tmdbId) === String(id));
    },
    [watchlist]
  );

  const applyAudioEnginePreset = useCallback((presetId) => {
    setAudioEnginePreset(presetId);
    const preset = AUDIO_ENGINE_PRESETS.find((p) => p.id === presetId);
    if (preset && preset.langId) {
      setPreferredLanguage(preset.langId);
    }
  }, []);

  const currentLanguageObj =
    LANGUAGE_OPTIONS.find((l) => l.id === preferredLanguage) || LANGUAGE_OPTIONS[0];

  const currentAudioPresetObj =
    AUDIO_ENGINE_PRESETS.find((p) => p.id === audioEnginePreset) || AUDIO_ENGINE_PRESETS[0];

  return {
    continueWatching,
    watchlist,
    tasteHistory,
    preferredLanguage,
    setPreferredLanguage,
    audioEnginePreset,
    setAudioEnginePreset: applyAudioEnginePreset,
    currentLanguageObj,
    currentAudioPresetObj,
    languageOptions: LANGUAGE_OPTIONS,
    audioEnginePresets: AUDIO_ENGINE_PRESETS,
    recordTasteInteraction,
    saveProgress,
    removeFromContinueWatching,
    getSavedProgress,
    getSavedEntry,
    toggleWatchlist,
    isInWatchlist,
  };
}

export default useUserMedia;
