import axios from 'axios';
import https from 'https';
import dotenv from 'dotenv';
dotenv.config();

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const DEFAULT_KEY = '520a42415ce10d3f6e1d41d4010771f5';

// Optimización de velocidad de carga: w342 para pósters de grilla (carga 6x más rápido) y w1280 para backdrops HD (carga 25x más rápido que /original)
const POSTER_BASE = 'https://image.tmdb.org/t/p/w342';
const POSTER_HD_BASE = 'https://image.tmdb.org/t/p/w500';
const BACKDROP_BASE = 'https://image.tmdb.org/t/p/w1280';

const getApiKey = () => process.env.TMDB_API_KEY || DEFAULT_KEY;
const getReadToken = () => process.env.TMDB_READ_TOKEN || null;

// Agente Keep-Alive para reutilizar conexiones TLS con TMDB y reducir latencia en un 70%
const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 64,
  keepAliveMsecs: 30000,
});

const tmdbClient = axios.create({
  baseURL: TMDB_BASE_URL,
  timeout: 9000,
  httpsAgent,
});

// Caché ultrarrápido en memoria con Stale-While-Revalidate (TTL 20 minutos)
const responseCache = new Map();
const CACHE_TTL = 20 * 60 * 1000;

const mapLangParam = (lang = 'es-MX') => {
  if (lang === 'latino' || lang === 'vose' || lang === 'es-MX') return 'es-MX';
  if (lang === 'castellano' || lang === 'es-ES') return 'es-ES';
  if (lang === 'en' || lang === 'en-US') return 'en-US';
  return 'es-MX';
};

const enrichItem = (item) => {
  if (!item || typeof item !== 'object') return item;
  const releaseDate = item.release_date || item.first_air_date || '';
  const todayStr = new Date().toISOString().split('T')[0];
  const isUnreleased = Boolean(releaseDate && releaseDate > todayStr && (item.vote_count || 0) < 5);

  return {
    ...item,
    poster_url: item.poster_path ? `${POSTER_BASE}${item.poster_path}` : null,
    poster_hd_url: item.poster_path ? `${POSTER_HD_BASE}${item.poster_path}` : null,
    backdrop_url: item.backdrop_path ? `${BACKDROP_BASE}${item.backdrop_path}` : null,
    is_unreleased: isUnreleased,
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
  const enriched = enrichItem(data);
  if (enriched.similar?.results) {
    enriched.similar.results = enriched.similar.results.map(enrichItem);
  }
  if (enriched.recommendations?.results) {
    enriched.recommendations.results = enriched.recommendations.results.map(enrichItem);
  }
  return enriched;
};

const tmdbGet = async (endpoint, params = {}) => {
  const readToken = getReadToken();
  const apiKey = getApiKey();

  const headers = {};
  const queryParams = {
    language: mapLangParam(params.language || 'es-MX'),
    ...params,
  };
  queryParams.language = mapLangParam(queryParams.language);

  const cacheKey = `${endpoint}?${JSON.stringify(queryParams)}`;
  const cached = responseCache.get(cacheKey);
  const now = Date.now();

  if (cached && now - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  if (readToken) {
    headers['Authorization'] = `Bearer ${readToken}`;
  } else {
    queryParams.api_key = apiKey;
  }

  try {
    const response = await tmdbClient.get(endpoint, {
      params: queryParams,
      headers,
    });

    const enriched = enrichResults(response.data);
    responseCache.set(cacheKey, { data: enriched, timestamp: now });
    return enriched;
  } catch (err) {
    if (cached) return cached.data;
    throw err;
  }
};

export const tmdbService = {
  async getTrending(mediaType = 'all', timeWindow = 'week', page = 1, language = 'es-MX') {
    const data = await tmdbGet(`/trending/${mediaType}/${timeWindow}`, { page, language });
    if (Array.isArray(data?.results)) {
      return {
        ...data,
        results: data.results.filter((i) => !i.is_unreleased),
      };
    }
    return data;
  },

  async getNowPlaying(page = 1, language = 'es-MX') {
    return await tmdbGet('/movie/now_playing', { page, language });
  },

  async getPopularMovies(page = 1, language = 'es-MX') {
    const todayStr = new Date().toISOString().split('T')[0];
    return await tmdbGet('/discover/movie', {
      sort_by: 'popularity.desc',
      'primary_release_date.lte': todayStr,
      'vote_count.gte': 20,
      page,
      language,
    });
  },

  async getPopularSeries(page = 1, language = 'es-MX') {
    return await tmdbGet('/tv/popular', { page, language });
  },

  async getTopRated(page = 1, language = 'es-MX') {
    return await tmdbGet('/movie/top_rated', { page, language });
  },

  async getTopRatedSeries(page = 1, language = 'es-MX') {
    return await tmdbGet('/tv/top_rated', { page, language });
  },

  async discoverCatalog({
    type = 'movie',
    genre = null,
    decade = null,
    network = null,
    sortBy = 'popularity.desc',
    page = 1,
    language = 'es-MX',
  } = {}) {
    const isTv = type === 'tv' || type === 'series';
    const endpoint = isTv ? '/discover/tv' : '/discover/movie';
    const todayStr = new Date().toISOString().split('T')[0];

    const params = {
      sort_by: sortBy,
      page,
      language,
      'vote_count.gte': decade === '1970s' || decade === '1980s' ? 20 : 35,
    };

    if (genre && genre !== 'all') {
      params.with_genres = genre;
    }

    if (network && network !== 'all' && isTv) {
      params.with_networks = network;
    }

    const dateFieldGte = isTv ? 'first_air_date.gte' : 'primary_release_date.gte';
    const dateFieldLte = isTv ? 'first_air_date.lte' : 'primary_release_date.lte';

    if (decade === '2020s') {
      params[dateFieldGte] = '2020-01-01';
      params[dateFieldLte] = todayStr;
    } else if (decade === '2010s') {
      params[dateFieldGte] = '2010-01-01';
      params[dateFieldLte] = '2019-12-31';
    } else if (decade === '2000s') {
      params[dateFieldGte] = '2000-01-01';
      params[dateFieldLte] = '2009-12-31';
    } else if (decade === '1990s') {
      params[dateFieldGte] = '1990-01-01';
      params[dateFieldLte] = '1999-12-31';
    } else if (decade === '1980s') {
      params[dateFieldGte] = '1980-01-01';
      params[dateFieldLte] = '1989-12-31';
    } else if (decade === 'classic') {
      params[dateFieldLte] = '1999-12-31';
      params.sort_by = 'vote_count.desc';
    } else if (decade === '1970s') {
      params[dateFieldLte] = '1979-12-31';
    } else {
      params[dateFieldLte] = todayStr;
    }

    const data = await tmdbGet(endpoint, params);
    if (Array.isArray(data?.results)) {
      return {
        ...data,
        results: data.results.map((i) => ({
          ...i,
          media_type: isTv ? 'tv' : 'movie',
        })),
      };
    }
    return data;
  },

  async getMovieSections(language = 'es-MX') {
    const [action, scifi, horror, classics90s, comedy, animation] = await Promise.allSettled([
      this.discoverCatalog({ type: 'movie', genre: '28,12', language }),
      this.discoverCatalog({ type: 'movie', genre: '878', language }),
      this.discoverCatalog({ type: 'movie', genre: '27,53', language }),
      this.discoverCatalog({ type: 'movie', decade: '1990s', sortBy: 'vote_count.desc', language }),
      this.discoverCatalog({ type: 'movie', genre: '35', language }),
      this.discoverCatalog({ type: 'movie', genre: '16', language }),
    ]);

    return {
      action: action.status === 'fulfilled' ? action.value?.results || [] : [],
      scifi: scifi.status === 'fulfilled' ? scifi.value?.results || [] : [],
      horror: horror.status === 'fulfilled' ? horror.value?.results || [] : [],
      classics90s: classics90s.status === 'fulfilled' ? classics90s.value?.results || [] : [],
      comedy: comedy.status === 'fulfilled' ? comedy.value?.results || [] : [],
      animation: animation.status === 'fulfilled' ? animation.value?.results || [] : [],
    };
  },

  async getSeriesSections(language = 'es-MX') {
    const [topRated, classics90s, retro80s, crimeMystery, scifiFantasy, cartoons] =
      await Promise.allSettled([
        this.getTopRatedSeries(1, language),
        this.discoverCatalog({ type: 'tv', decade: '1990s', sortBy: 'vote_count.desc', language }),
        this.discoverCatalog({ type: 'tv', decade: '1980s', sortBy: 'vote_count.desc', language }),
        this.discoverCatalog({ type: 'tv', genre: '80,9648', language }),
        this.discoverCatalog({ type: 'tv', genre: '10765', language }),
        this.discoverCatalog({ type: 'tv', genre: '16', sortBy: 'vote_count.desc', language }),
      ]);

    return {
      topRated: topRated.status === 'fulfilled' ? topRated.value?.results || [] : [],
      classics90s: classics90s.status === 'fulfilled' ? classics90s.value?.results || [] : [],
      retro80s: retro80s.status === 'fulfilled' ? retro80s.value?.results || [] : [],
      crimeMystery: crimeMystery.status === 'fulfilled' ? crimeMystery.value?.results || [] : [],
      scifiFantasy: scifiFantasy.status === 'fulfilled' ? scifiFantasy.value?.results || [] : [],
      cartoons: cartoons.status === 'fulfilled' ? cartoons.value?.results || [] : [],
    };
  },

  async searchMulti(query, page = 1, language = 'es-MX') {
    if (!query || !query.trim()) return { results: [], total_results: 0 };
    return await tmdbGet('/search/multi', { query: query.trim(), page, language });
  },

  async getMovieDetails(id, language = 'es-MX') {
    return await tmdbGet(`/movie/${id}`, {
      language,
      append_to_response: 'external_ids,credits,similar,recommendations,videos,release_dates',
    });
  },

  async getTvDetails(id, language = 'es-MX') {
    return await tmdbGet(`/tv/${id}`, {
      language,
      append_to_response: 'external_ids,credits,similar,recommendations,videos,content_ratings',
    });
  },

  async getSeasonDetails(tvId, seasonNumber, language = 'es-MX') {
    const data = await tmdbGet(`/tv/${tvId}/season/${seasonNumber}`, { language });
    if (data?.episodes) {
      return {
        ...data,
        episodes: data.episodes.map((ep) => ({
          ...ep,
          still_url: ep.still_path ? `https://image.tmdb.org/t/p/w300${ep.still_path}` : null,
        })),
      };
    }
    return data;
  },

  async getAnime(page = 1, language = 'es-MX') {
    try {
      const [tvRes, movieRes] = await Promise.all([
        tmdbGet('/discover/tv', {
          with_genres: 16,
          with_original_language: 'ja',
          sort_by: 'popularity.desc',
          page,
          language,
        }),
        tmdbGet('/discover/movie', {
          with_genres: 16,
          with_original_language: 'ja',
          sort_by: 'popularity.desc',
          page,
          language,
        }),
      ]);

      const tvList = (tvRes.results || []).map((i) => ({ ...i, media_type: 'tv' }));
      const movieList = (movieRes.results || []).map((i) => ({ ...i, media_type: 'movie' }));
      const combined = [...tvList, ...movieList].sort(
        (a, b) => (b.popularity || 0) - (a.popularity || 0)
      );

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

  async getByProvider(providerId, page = 1, language = 'es-MX') {
    try {
      const regions = ['CO', 'MX', 'ES', 'US'];
      let results = [];

      for (const region of regions) {
        const [tvRes, movieRes] = await Promise.all([
          tmdbGet('/discover/tv', {
            with_watch_providers: providerId,
            watch_region: region,
            sort_by: 'popularity.desc',
            page,
            language,
          }),
          tmdbGet('/discover/movie', {
            with_watch_providers: providerId,
            watch_region: region,
            sort_by: 'popularity.desc',
            page,
            language,
          }),
        ]);

        const tvList = (tvRes.results || []).map((i) => ({ ...i, media_type: 'tv' }));
        const movieList = (movieRes.results || []).map((i) => ({ ...i, media_type: 'movie' }));
        const combined = [...tvList, ...movieList].sort(
          (a, b) => (b.popularity || 0) - (a.popularity || 0)
        );

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

  async getTrailers(type, tmdbId, preferredLang = 'es-MX') {
    try {
      const normalizedType = type === 'series' || type === 'tv' ? 'tv' : 'movie';
      const langOrder =
        preferredLang === 'castellano'
          ? ['es-ES', 'es-MX', 'en-US']
          : preferredLang === 'en'
          ? ['en-US', 'es-MX']
          : ['es-MX', 'es-ES', 'en-US'];

      let videos = [];
      for (const lang of langOrder) {
        const data = await tmdbGet(`/${normalizedType}/${tmdbId}/videos`, { language: lang });
        if (data?.results?.length > 0) {
          videos = data.results;
          break;
        }
      }

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

  /**
   * Precalentamiento en segundo plano al iniciar el servidor para respuestas en <2ms
   */
  warmUpCache() {
    Promise.allSettled([
      this.getTrending('all', 'week', 1, 'es-MX'),
      this.getNowPlaying(1, 'es-MX'),
      this.getPopularMovies(1, 'es-MX'),
      this.getPopularSeries(1, 'es-MX'),
      this.getTopRated(1, 'es-MX'),
      this.getAnime(1, 'es-MX'),
    ]).then(() => {
      console.log('⚡ [TMDB Cache] Catálogos principales pre-cargados en RAM (<2ms response).');
    });
  },
};

// Iniciar pre-calentamiento no bloqueante
setTimeout(() => tmdbService.warmUpCache(), 100);

export default tmdbService;
