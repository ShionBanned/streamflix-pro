import axios from 'axios';

const BASE_URL = '/api';
const DIRECT_BACKEND_URL = 'http://localhost:4000/api';

const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
});

// Caché en memoria del cliente (Frontend) para transiciones de pestaña en 0ms
const clientCache = new Map();
const CLIENT_CACHE_TTL = 10 * 60 * 1000;

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (
      originalRequest &&
      !originalRequest._retry &&
      (error.code === 'ECONNREFUSED' || error.response?.status >= 500 || !error.response)
    ) {
      originalRequest._retry = true;
      originalRequest.baseURL = DIRECT_BACKEND_URL;
      return axios(originalRequest);
    }
    return Promise.reject(error);
  }
);

async function cachedGet(url, params = {}) {
  const key = `${url}?${JSON.stringify(params)}`;
  const cached = clientCache.get(key);
  const now = Date.now();
  if (cached && now - cached.time < CLIENT_CACHE_TTL) {
    return cached.data;
  }
  const res = await apiClient.get(url, { params });
  clientCache.set(key, { data: res.data, time: now });
  return res.data;
}

export const api = {
  async getTrending(type = 'all', page = 1, lang = 'es-MX') {
    try {
      const data = await cachedGet('/tmdb/trending', { type, page, lang });
      return data?.results || [];
    } catch (e) {
      console.warn('Error en getTrending:', e.message);
      return [];
    }
  },

  async getNowPlaying(page = 1, lang = 'es-MX') {
    try {
      const data = await cachedGet('/tmdb/now-playing', { page, lang });
      return data?.results || [];
    } catch (e) {
      console.warn('Error en getNowPlaying:', e.message);
      return [];
    }
  },

  async getPopularMovies(page = 1, lang = 'es-MX') {
    try {
      const data = await cachedGet('/tmdb/popular-movies', { page, lang });
      return data?.results || [];
    } catch (e) {
      console.warn('Error en getPopularMovies:', e.message);
      return [];
    }
  },

  async getPopularSeries(page = 1, lang = 'es-MX') {
    try {
      const data = await cachedGet('/tmdb/popular-series', { page, lang });
      return data?.results || [];
    } catch (e) {
      console.warn('Error en getPopularSeries:', e.message);
      return [];
    }
  },

  async getTopRated(page = 1, lang = 'es-MX') {
    try {
      const data = await cachedGet('/tmdb/top-rated', { page, lang });
      return data?.results || [];
    } catch (e) {
      console.warn('Error en getTopRated:', e.message);
      return [];
    }
  },

  async discoverCatalog({
    type = 'movie',
    genre = 'all',
    decade = 'all',
    network = 'all',
    sortBy = 'popularity.desc',
    page = 1,
    lang = 'es-MX',
  } = {}) {
    try {
      const params = { type, sortBy, page, lang };
      if (genre && genre !== 'all') params.genre = genre;
      if (decade && decade !== 'all') params.decade = decade;
      if (network && network !== 'all') params.network = network;
      const data = await cachedGet('/tmdb/discover', params);
      return data?.results || [];
    } catch (e) {
      console.warn('Error en discoverCatalog:', e.message);
      return [];
    }
  },

  async getMovieSections(lang = 'es-MX') {
    try {
      return (await cachedGet('/tmdb/movie-sections', { lang })) || {};
    } catch (e) {
      console.warn('Error en getMovieSections:', e.message);
      return {};
    }
  },

  async getSeriesSections(lang = 'es-MX') {
    try {
      return (await cachedGet('/tmdb/series-sections', { lang })) || {};
    } catch (e) {
      console.warn('Error en getSeriesSections:', e.message);
      return {};
    }
  },

  async searchMulti(query, page = 1, lang = 'es-MX') {
    try {
      const res = await apiClient.get('/tmdb/search', { params: { query, page, lang } });
      return res.data?.results || [];
    } catch (e) {
      console.warn('Error en searchMulti:', e.message);
      return [];
    }
  },

  async getMovieDetails(id, lang = 'es-MX') {
    return await cachedGet(`/tmdb/movie/${id}`, { lang });
  },

  async getTvDetails(id, lang = 'es-MX') {
    return await cachedGet(`/tmdb/tv/${id}`, { lang });
  },

  async getSeasonDetails(tvId, seasonNumber, lang = 'es-MX') {
    return await cachedGet(`/tmdb/tv/${tvId}/season/${seasonNumber}`, { lang });
  },

  async getAnime(page = 1, lang = 'es-MX') {
    try {
      const data = await cachedGet('/catalog/anime', { page, lang });
      return data?.results || [];
    } catch (e) {
      console.warn('Error en getAnime:', e.message);
      return [];
    }
  },

  async getByProvider(providerId, page = 1, lang = 'es-MX') {
    try {
      const data = await cachedGet(`/catalog/provider/${providerId}`, { page, lang });
      return data?.results || [];
    } catch (e) {
      console.warn('Error en getByProvider:', e.message);
      return [];
    }
  },

  async getTrailers(type, tmdbId, lang = 'es-MX') {
    try {
      const data = await cachedGet(`/catalog/${type}/${tmdbId}/videos`, { lang });
      return data?.trailer || null;
    } catch {
      return null;
    }
  },

  async resolveSource({
    tmdbId,
    imdbId,
    type = 'movie',
    season,
    episode,
    originalLanguage,
    preferredLanguage = 'latino',
  }) {
    const params = {
      tmdbId,
      imdbId,
      type,
      season,
      episode,
      originalLanguage,
      preferredLanguage,
    };
    return await cachedGet('/resolve', params);
  },

  /**
   * Pre-carga silenciosa al pasar el ratón sobre una tarjeta para que abrir el modal o reproducir tome 0ms
   */
  prefetchTitle(item, lang = 'es-MX') {
    if (!item || !item.id) return;
    const isTv =
      item.media_type === 'tv' || item.type === 'tv' || Boolean(item.first_air_date);
    if (isTv) {
      cachedGet(`/tmdb/tv/${item.id}`, { lang }).catch(() => {});
    } else {
      cachedGet(`/tmdb/movie/${item.id}`, { lang }).catch(() => {});
    }
  },

  async getSubtitles(type, imdbId, season, episode) {
    const params = { season, episode };
    const res = await apiClient.get(`/subtitles/${type}/${imdbId}`, { params });
    return res.data?.subtitles || [];
  },

  async getIptvChannels({ country, category, refresh = false, customUrls = [], xtream = null } = {}) {
    const params = {};
    if (country) params.country = country;
    if (category) params.category = category;
    if (refresh) params.refresh = 'true';
    if (customUrls.length > 0) params.customUrls = JSON.stringify(customUrls);
    if (xtream?.server) {
      params.server = xtream.server;
      params.username = xtream.username;
      params.password = xtream.password;
    }

    const res = await apiClient.get('/iptv/channels', { params });
    return res.data;
  },

  async launchExternalPlayer({ player, streamUrl, subtitleUrl, title }) {
    const res = await apiClient.post('/player/launch', { player, streamUrl, subtitleUrl, title });
    return res.data;
  },

  async closeStream(infoHash) {
    if (!infoHash) return;
    try {
      await apiClient.post('/stream/close', { infoHash });
    } catch (err) {
      console.debug('[StreamEngine Cleanup]:', err.message);
    }
  },
};

export default api;
