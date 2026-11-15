import axios from 'axios';

// Base URL con fallback automático a localhost:4000 si el proxy de Vite no responde
const BASE_URL = '/api';
const DIRECT_BACKEND_URL = 'http://localhost:4000/api';

const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
});

// Interceptor para reintentar directamente contra el puerto 4000 si el proxy falla
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (!originalRequest._retry && (error.code === 'ECONNREFUSED' || error.response?.status >= 500 || !error.response)) {
      originalRequest._retry = true;
      originalRequest.baseURL = DIRECT_BACKEND_URL;
      return axios(originalRequest);
    }
    return Promise.reject(error);
  }
);

export const api = {
  // Catálogo TMDB
  async getTrending(type = 'all', page = 1) {
    try {
      const res = await apiClient.get('/tmdb/trending', { params: { type, page } });
      return res.data?.results || [];
    } catch (e) {
      console.warn('Error en getTrending:', e.message);
      return [];
    }
  },

  async getNowPlaying(page = 1) {
    try {
      const res = await apiClient.get('/tmdb/now-playing', { params: { page } });
      return res.data?.results || [];
    } catch (e) {
      console.warn('Error en getNowPlaying:', e.message);
      return [];
    }
  },

  async getPopularMovies(page = 1) {
    try {
      const res = await apiClient.get('/tmdb/popular-movies', { params: { page } });
      return res.data?.results || [];
    } catch (e) {
      console.warn('Error en getPopularMovies:', e.message);
      return [];
    }
  },

  async getPopularSeries(page = 1) {
    try {
      const res = await apiClient.get('/tmdb/popular-series', { params: { page } });
      return res.data?.results || [];
    } catch (e) {
      console.warn('Error en getPopularSeries:', e.message);
      return [];
    }
  },

  async getTopRated(page = 1) {
    try {
      const res = await apiClient.get('/tmdb/top-rated', { params: { page } });
      return res.data?.results || [];
    } catch (e) {
      console.warn('Error en getTopRated:', e.message);
      return [];
    }
  },

  async searchMulti(query, page = 1) {
    try {
      const res = await apiClient.get('/tmdb/search', { params: { query, page } });
      return res.data?.results || [];
    } catch (e) {
      console.warn('Error en searchMulti:', e.message);
      return [];
    }
  },

  async getMovieDetails(id) {
    const res = await apiClient.get(`/tmdb/movie/${id}`);
    return res.data;
  },

  async getTvDetails(id) {
    const res = await apiClient.get(`/tmdb/tv/${id}`);
    return res.data;
  },

  async getSeasonDetails(tvId, seasonNumber) {
    const res = await apiClient.get(`/tmdb/tv/${tvId}/season/${seasonNumber}`);
    return res.data;
  },

  // Anime
  async getAnime(page = 1) {
    try {
      const res = await apiClient.get('/catalog/anime', { params: { page } });
      return res.data?.results || [];
    } catch (e) {
      console.warn('Error en getAnime:', e.message);
      return [];
    }
  },

  // Hubs de plataformas
  async getByProvider(providerId, page = 1) {
    try {
      const res = await apiClient.get(`/catalog/provider/${providerId}`, { params: { page } });
      return res.data?.results || [];
    } catch (e) {
      console.warn('Error en getByProvider:', e.message);
      return [];
    }
  },

  // Tráilers
  async getTrailers(type, tmdbId) {
    try {
      const res = await apiClient.get(`/catalog/${type}/${tmdbId}/videos`);
      return res.data?.trailer || null;
    } catch (e) {
      return null;
    }
  },

  // Resolución de fuentes de streaming
  async resolveSource({ tmdbId, imdbId, type = 'movie', season, episode, originalLanguage }) {
    const params = { tmdbId, imdbId, type, season, episode, originalLanguage };
    const res = await apiClient.get('/resolve', { params });
    return res.data;
  },

  // Subtítulos
  async getSubtitles(type, imdbId, season, episode) {
    const params = { season, episode };
    const res = await apiClient.get(`/subtitles/${type}/${imdbId}`, { params });
    return res.data?.subtitles || [];
  },

  // IPTV Canales
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

  // Lanzar reproductor de escritorio
  async launchExternalPlayer({ player, streamUrl, subtitleUrl, title }) {
    const res = await apiClient.post('/player/launch', { player, streamUrl, subtitleUrl, title });
    return res.data;
  },

  // Limpiar almacenamiento de stream
  async closeStream(infoHash) {
    if (!infoHash) return;
    try {
      await apiClient.post('/stream/close', { infoHash });
    } catch (err) {
      // Best-effort cleanup notification; does not disrupt UI unmounting
      console.debug('[StreamEngine Cleanup]:', err.message);
    }
  },
};

export default api;
