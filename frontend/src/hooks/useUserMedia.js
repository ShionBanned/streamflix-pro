import { useState, useEffect, useCallback } from 'react';

const CONTINUE_WATCHING_KEY = 'streamflix_continue_watching';
const WATCHLIST_KEY = 'streamflix_watchlist';

export function useUserMedia() {
  const [continueWatching, setContinueWatching] = useState(() => {
    try {
      const saved = localStorage.getItem(CONTINUE_WATCHING_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  const [watchlist, setWatchlist] = useState(() => {
    try {
      const saved = localStorage.getItem(WATCHLIST_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  // Guardar en localStorage cuando cambie continueWatching
  useEffect(() => {
    try {
      localStorage.setItem(CONTINUE_WATCHING_KEY, JSON.stringify(continueWatching));
    } catch (e) {
      console.warn('Error guardando continueWatching en localStorage:', e);
    }
  }, [continueWatching]);

  // Guardar en localStorage cuando cambie watchlist
  useEffect(() => {
    try {
      localStorage.setItem(WATCHLIST_KEY, JSON.stringify(watchlist));
    } catch (e) {
      console.warn('Error guardando watchlist en localStorage:', e);
    }
  }, [watchlist]);

  /**
   * Guarda o actualiza el progreso de visualización de un título
   */
  const saveProgress = useCallback(
    ({ item, season = null, episode = null, currentTime, duration }) => {
      if (!item || !duration || duration < 10) return;

      const tmdbId = item.id;
      const title = item.title || item.name || 'Sin título';
      const type = item.media_type || (item.first_air_date ? 'tv' : 'movie');
      const progressPercent = (currentTime / duration) * 100;

      // Si ya vio más del 94% del contenido, marcar como finalizado y remover de Continuar Viendo
      if (progressPercent > 94) {
        setContinueWatching((prev) =>
          prev.filter(
            (entry) =>
              !(entry.tmdbId === tmdbId && entry.season === season && entry.episode === episode)
          )
        );
        return;
      }

      // Si vio menos de 15 segundos, no saturar la lista
      if (currentTime < 15) return;

      setContinueWatching((prev) => {
        const remaining = prev.filter(
          (entry) =>
            !(entry.tmdbId === tmdbId && entry.season === season && entry.episode === episode)
        );

        const newEntry = {
          tmdbId,
          imdbId: item.imdb_id || null,
          title,
          poster_path: item.poster_path,
          backdrop_path: item.backdrop_path,
          poster_url: item.poster_url || (item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : null),
          backdrop_url: item.backdrop_url || (item.backdrop_path ? `https://image.tmdb.org/t/p/original${item.backdrop_path}` : null),
          type,
          season,
          episode,
          currentTime,
          duration,
          progressPercent: Math.round(progressPercent),
          updatedAt: Date.now(),
        };

        // Mantener como primer elemento el más recientemente visto (máximo 25 elementos)
        return [newEntry, ...remaining].slice(0, 25);
      });
    },
    []
  );

  /**
   * Remueve un título de Continuar Viendo (botón X)
   */
  const removeFromContinueWatching = useCallback((tmdbId, season = null, episode = null) => {
    setContinueWatching((prev) =>
      prev.filter(
        (entry) =>
          !(entry.tmdbId === tmdbId && entry.season === season && entry.episode === episode)
      )
    );
  }, []);

  /**
   * Obtiene el tiempo guardado para reanudar
   */
  const getSavedProgress = useCallback(
    (tmdbId, season = null, episode = null) => {
      const match = continueWatching.find(
        (entry) =>
          entry.tmdbId === tmdbId && entry.season === season && entry.episode === episode
      );
      return match ? match.currentTime : 0;
    },
    [continueWatching]
  );

  /**
   * Alterna añadir / remover de Mi Lista
   */
  const toggleWatchlist = useCallback((item) => {
    if (!item || !item.id) return;
    setWatchlist((prev) => {
      const exists = prev.some((i) => i.id === item.id);
      if (exists) {
        return prev.filter((i) => i.id !== item.id);
      } else {
        return [item, ...prev];
      }
    });
  }, []);

  /**
   * Verifica si un título está en Mi Lista
   */
  const isInWatchlist = useCallback(
    (id) => {
      return watchlist.some((i) => i.id === id);
    },
    [watchlist]
  );

  return {
    continueWatching,
    watchlist,
    saveProgress,
    removeFromContinueWatching,
    getSavedProgress,
    toggleWatchlist,
    isInWatchlist,
  };
}

export default useUserMedia;
