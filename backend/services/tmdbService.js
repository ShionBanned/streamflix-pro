import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const DEFAULT_KEY = '520a42415ce10d3f6e1d41d4010771f5';

const POSTER_BASE = 'https://image.tmdb.org/t/p/w500';
const BACKDROP_BASE = 'https://image.tmdb.org/t/p/original';

const getApiKey = () => process.env.TMDB_API_KEY || DEFAULT_KEY;
const getReadToken = () => process.env.TMDB_READ_TOKEN || null;

const tmdbClient = axios.create({
  baseURL: TMDB_BASE_URL,
  timeout: 12000,
});

/**
 * Enriquecer objetos de TMDB con URLs completas de poster y backdrop
 */
const enrichItem = (item) => {
  if (!item || typeof item !== 'object') return item;
  return {
    ...item,
    poster_url: item.poster_path ? `${POSTER_BASE}${item.poster_path}` : null,
    backdrop_url: item.backdrop_path ? `${BACKDROP_BASE}${item.backdrop_path}` : null,
  };
};

const enrichResults = (data) => {
  if (!data) return data;
  if (Array.isArray(data.results)) {
    return {
      ...data,
      results: data.results.map(enrichItem),
    };
  }
  return enrichItem(data);
};

// Helper to make authenticated requests with Bearer Token or api_key
const tmdbGet = async (endpoint, params = {}) => {
  const readToken = getReadToken();
  const apiKey = getApiKey();

  const headers = {};
  const queryParams = {
    language: 'es-MX',
    ...params,
  };

  if (readToken) {
    headers['Authorization'] = `Bearer ${readToken}`;
  } else {
    queryParams.api_key = apiKey;
  }

  const response = await tmdbClient.get(endpoint, {
    params: queryParams,
    headers,
  });

  return enrichResults(response.data);
};

export const tmdbService = {
  // Tendencias de la semana (películas y series combinadas)
  async getTrending(mediaType = 'all', timeWindow = 'week', page = 1) {
    return await tmdbGet(`/trending/${mediaType}/${timeWindow}`, { page });
  },

  // Películas en cartelera / recientes
  async getNowPlaying(page = 1) {
    return await tmdbGet('/movie/now_playing', { page });
  },

  // Películas populares
  async getPopularMovies(page = 1) {
    return await tmdbGet('/movie/popular', { page });
  },

  // Series populares
  async getPopularSeries(page = 1) {
    return await tmdbGet('/tv/popular', { page });
  },

  // Mejor valoradas
  async getTopRated(page = 1) {
    return await tmdbGet('/movie/top_rated', { page });
  },

  // Buscador universal (películas y series)
  async searchMulti(query, page = 1) {
    if (!query || !query.trim()) return { results: [], total_results: 0 };
    return await tmdbGet('/search/multi', { query: query.trim(), page });
  },

  // Detalle completo de película (con external_ids para imdb_id, créditos, etc.)
  async getMovieDetails(id) {
    return await tmdbGet(`/movie/${id}`, {
      append_to_response: 'external_ids,credits,similar,videos,release_dates',
    });
  },

  // Detalle completo de serie (con temporadas y external_ids)
  async getTvDetails(id) {
    return await tmdbGet(`/tv/${id}`, {
      append_to_response: 'external_ids,credits,similar,videos',
    });
  },

  // Detalle de temporada específica de una serie (episodios con títulos, descripción y stills)
  async getSeasonDetails(tvId, seasonNumber) {
    const data = await tmdbGet(`/tv/${tvId}/season/${seasonNumber}`);
    if (data?.episodes) {
      data.episodes = data.episodes.map((ep) => ({
        ...ep,
        still_url: ep.still_path ? `https://image.tmdb.org/t/p/w300${ep.still_path}` : null,
      }));
    }
    return data;
  },

  // MÓDULO ANIME: Descubrimiento de anime japonés (series y películas populares)
  async getAnime(page = 1) {
    try {
      const [tvRes, movieRes] = await Promise.all([
        tmdbGet('/discover/tv', {
          with_genres: 16,
          with_original_language: 'ja',
          sort_by: 'popularity.desc',
          page,
        }),
        tmdbGet('/discover/movie', {
          with_genres: 16,
          with_original_language: 'ja',
          sort_by: 'popularity.desc',
          page,
        }),
      ]);

      const tvList = (tvRes.results || []).map((i) => ({ ...i, media_type: 'tv' }));
      const movieList = (movieRes.results || []).map((i) => ({ ...i, media_type: 'movie' }));

      // Combinar y ordenar por popularidad descendente
      const combined = [...tvList, ...movieList].sort((a, b) => (b.popularity || 0) - (a.popularity || 0));

      return {
        page,
        results: combined,
        total_results: (tvRes.total_results || 0) + (movieRes.total_results || 0),
      };
    } catch (err) {
      console.error('[TMDB Anime Error]:', err.message);
      return { page, results: [], total_results: 0 };
    }
  },

  // MÓDULO HUBS DE PLATAFORMAS: Filtrar catálogo por proveedor de streaming
  // Netflix (8), Prime Video (119), Disney+ (337), Max (1899), Apple TV+ (350), Crunchyroll (283)
  async getByProvider(providerId, page = 1) {
    try {
      const regions = ['CO', 'MX', 'US'];
      let results = [];

      for (const region of regions) {
        const [tvRes, movieRes] = await Promise.all([
          tmdbGet('/discover/tv', {
            with_watch_providers: providerId,
            watch_region: region,
            sort_by: 'popularity.desc',
            page,
          }),
          tmdbGet('/discover/movie', {
            with_watch_providers: providerId,
            watch_region: region,
            sort_by: 'popularity.desc',
            page,
          }),
        ]);

        const tvList = (tvRes.results || []).map((i) => ({ ...i, media_type: 'tv' }));
        const movieList = (movieRes.results || []).map((i) => ({ ...i, media_type: 'movie' }));
        const combined = [...tvList, ...movieList].sort((a, b) => (b.popularity || 0) - (a.popularity || 0));

        if (combined.length > 5) {
          results = combined;
          break;
        }
      }

      return {
        providerId,
        page,
        results,
      };
    } catch (err) {
      console.error(`[TMDB Provider #${providerId} Error]:`, err.message);
      return { providerId, page, results: [] };
    }
  },

  // MÓDULO TRÁILERS: Obtener el tráiler oficial de YouTube en español o inglés
  async getTrailers(type, tmdbId) {
    try {
      const normalizedType = type === 'series' || type === 'tv' ? 'tv' : 'movie';

      // 1. Intentar primero en español
      let data = await tmdbGet(`/${normalizedType}/${tmdbId}/videos`, { language: 'es-MX' });
      let videos = data?.results || [];

      // 2. Si no hay videos en español, consultar en inglés
      if (videos.length === 0) {
        data = await tmdbGet(`/${normalizedType}/${tmdbId}/videos`, { language: 'en-US' });
        videos = data?.results || [];
      }

      // Buscar tráiler de YouTube
      const trailer =
        videos.find((v) => v.site === 'YouTube' && v.type === 'Trailer') ||
        videos.find((v) => v.site === 'YouTube' && v.type === 'Teaser') ||
        videos.find((v) => v.site === 'YouTube');

      return trailer
        ? {
            key: trailer.key,
            name: trailer.name,
            site: trailer.site,
            type: trailer.type,
            youtubeUrl: `https://www.youtube.com/watch?v=${trailer.key}`,
          }
        : null;
    } catch (err) {
      console.error(`[TMDB Trailer Error #${tmdbId}]:`, err.message);
      return null;
    }
  },

  // Puente Crítico: Extraer IMDB ID a partir del TMDB ID
  async getImdbId(type, tmdbId) {
    try {
      const normalizedType = type === 'series' || type === 'tv' ? 'tv' : 'movie';
      const data = await tmdbGet(`/${normalizedType}/${tmdbId}/external_ids`);
      return data.imdb_id || null;
    } catch (err) {
      console.error(`Error resolviendo imdb_id para TMDB ${type} #${tmdbId}:`, err.message);
      return null;
    }
  },
};

export default tmdbService;
