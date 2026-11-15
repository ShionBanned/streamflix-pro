import { useState, useEffect, useCallback } from 'react';

const CONTINUE_WATCHING_KEY = 'streamflix_continue_watching';
const WATCHLIST_KEY = 'streamflix_watchlist';
const PREFERRED_LANGUAGE_KEY = 'streamflix_preferred_language';

export const LANGUAGE_OPTIONS = [
  {
    id: 'latino',
    label: 'Español Latino',
    shortLabel: 'Latino',
    flag: '🇲🇽',
    tmdbLang: 'es-MX',
    subLang: 'es',
    badge: 'Audio LAT / Dual',
    description: 'Prioriza audio Español Latino y subtítulos ES-MX',
  },
  {
    id: 'castellano',
    label: 'Castellano (España)',
    shortLabel: 'Castellano',
    flag: '🇪🇸',
    tmdbLang: 'es-ES',
    subLang: 'es',
    badge: 'Audio ESP',
    description: 'Prioriza doblaje Castellano y metadatos de España',
  },
  {
    id: 'vose',
    label: 'Original + Subtítulos ES',
    shortLabel: 'Subtitulado',
    flag: '💬',
    tmdbLang: 'es-MX',
    subLang: 'es',
    badge: 'VOSE 1080p/4K',
    description: 'Audio en idioma original con subtítulos en Español activados',
  },
  {
    id: 'en',
    label: 'English (Original + CC)',
    shortLabel: 'English',
    flag: '🇺🇸',
    tmdbLang: 'en-US',
    subLang: 'en',
    badge: 'Original EN',
    description: 'Original English audio, interface metadata & English CC',
  },
];

// Normalizador de IDs y episodios para coincidencias exactas en Continuar Viendo
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

export function useUserMedia() {
  const [continueWatching, setContinueWatching] = useState(() => {
    try {
      const saved = localStorage.getItem(CONTINUE_WATCHING_KEY);
      if (!saved) return [];
      const parsed = JSON.parse(saved);
      // Asegurar que cada entrada antigua tenga tanto `id` como `tmdbId`
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

  const [preferredLanguage, setPreferredLanguage] = useState(() => {
    try {
      return localStorage.getItem(PREFERRED_LANGUAGE_KEY) || 'latino';
    } catch {
      return 'latino';
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
      localStorage.setItem(PREFERRED_LANGUAGE_KEY, preferredLanguage);
    } catch (e) {
      console.warn('Error guardando preferredLanguage:', e);
    }
  }, [preferredLanguage]);

  /**
   * Guarda o actualiza el progreso de visualización tanto en modo P2P como en servidores Cloud
   */
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
      const safeDuration = duration && duration > 30 ? duration : 5400; // 90 min default para embeds
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

      // Si ya vio más del 95% del título, remover de Continuar Viendo
      if (progressPercent > 95) {
        setContinueWatching((prev) =>
          prev.filter((entry) => !isSameMediaEntry(entry, tmdbId, normSeason, normEpisode))
        );
        return;
      }

      // Guardar a partir de los 5 segundos de reproducción
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

  /**
   * Obtiene el segundo exacto guardado para reanudar cualquier película o episodio
   */
  const getSavedProgress = useCallback(
    (tmdbId, season = null, episode = null) => {
      if (!tmdbId) return 0;
      // Primero buscar coincidencia exacta de temporada y episodio
      const exactMatch = continueWatching.find((entry) =>
        isSameMediaEntry(entry, tmdbId, season, episode)
      );
      if (exactMatch && exactMatch.currentTime > 5) {
        return exactMatch.currentTime;
      }
      // Si es película (sin temporada), buscar por ID
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

  /**
   * Obtiene la entrada completa guardada en Continuar Viendo para un título
   */
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

  const currentLanguageObj =
    LANGUAGE_OPTIONS.find((l) => l.id === preferredLanguage) || LANGUAGE_OPTIONS[0];

  return {
    continueWatching,
    watchlist,
    preferredLanguage,
    setPreferredLanguage,
    currentLanguageObj,
    languageOptions: LANGUAGE_OPTIONS,
    saveProgress,
    removeFromContinueWatching,
    getSavedProgress,
    getSavedEntry,
    toggleWatchlist,
    isInWatchlist,
  };
}

export default useUserMedia;
