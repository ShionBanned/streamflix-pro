import axios from 'axios';
import https from 'https';
import dotenv from 'dotenv';
dotenv.config();

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const DEFAULT_KEY = '520a42415ce10d3f6e1d41d4010771f5';

const POSTER_BASE = 'https://image.tmdb.org/t/p/w342';
const POSTER_HD_BASE = 'https://image.tmdb.org/t/p/w500';
const BACKDROP_BASE = 'https://image.tmdb.org/t/p/w1280';

const getApiKey = () => process.env.TMDB_API_KEY || DEFAULT_KEY;
const getReadToken = () => process.env.TMDB_READ_TOKEN || null;

const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 64,
  keepAliveMsecs: 30000,
});

const tmdbClient = axios.create({
  baseURL: TMDB_BASE_URL,
  timeout: 11000,
  httpsAgent,
});

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

/**
 * Mezcla pasivamente joyas de culto (vote_count.desc) dentro de las listas actuales
 * sin crear secciones de "viejos" aisladas, logrando el balance natural de Netflix.
 */
const blendPassiveClassics = (modernList = [], classicList = [], mediaType = 'movie') => {
  const seen = new Set();
  const result = [];
  const maxLen = Math.max(modernList.length, classicList.length);

  for (let i = 0; i < maxLen; i++) {
    if (modernList[i] && modernList[i].id && !seen.has(modernList[i].id)) {
      seen.add(modernList[i].id);
      result.push({ ...modernList[i], media_type: modernList[i].media_type || mediaType });
    }
    // Insertar 1 clásico icónico por cada 4 títulos actuales del mismo género
    if (i % 4 === 2 && classicList[Math.floor(i / 4)]) {
      const cl = classicList[Math.floor(i / 4)];
      if (cl && cl.id && !seen.has(cl.id)) {
        seen.add(cl.id);
        result.push({ ...cl, media_type: cl.media_type || mediaType });
      }
    }
  }

  for (const cl of classicList) {
    if (result.length >= 24) break;
    if (cl && cl.id && !seen.has(cl.id)) {
      seen.add(cl.id);
      result.push({ ...cl, media_type: cl.media_type || mediaType });
    }
  }

  return result;
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
    originalLanguage = null,
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
      'vote_count.gte': originalLanguage ? 8 : 15,
    };

    if (genre && genre !== 'all') {
      // Si no es anime (donde 16 debe combinarse con subgénero), convertir comas múltiples en OR (|) para garantizar amplios resultados
      const gStr = String(genre).trim();
      if (originalLanguage === 'ja' && gStr.startsWith('16,')) {
        params.with_genres = gStr;
      } else {
        params.with_genres = gStr.replace(/,/g, '|');
      }
    }

    if (network && network !== 'all' && isTv) {
      params.with_networks = network;
    }

    if (originalLanguage) {
      params.with_original_language = originalLanguage;
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
      params[dateFieldLte] = '2002-12-31';
      params.sort_by = 'vote_count.desc';
    } else {
      params[dateFieldLte] = todayStr;
    }

    const data = await tmdbGet(endpoint, params);
    let results = Array.isArray(data?.results)
      ? data.results.map((i) => ({
          ...i,
          media_type: isTv ? 'tv' : 'movie',
        }))
      : [];

    // Integración pasiva: mezclar algunos títulos históricos mejor valorados del mismo género
    if (results.length > 0 && (!decade || decade === 'all') && sortBy === 'popularity.desc') {
      try {
        const iconicParams = {
          ...params,
          sort_by: 'vote_count.desc',
          page: 1,
        };
        const iconicData = await tmdbGet(endpoint, iconicParams);
        const iconicResults = (iconicData?.results || []).map((i) => ({
          ...i,
          media_type: isTv ? 'tv' : 'movie',
        }));
        results = blendPassiveClassics(results, iconicResults, isTv ? 'tv' : 'movie');
      } catch {
        // Conservar lista principal
      }
    }

    return {
      ...data,
      results,
    };
  },

  async getMovieSections(language = 'es-MX') {
    const [
      blockbusters,
      action,
      scifi,
      thrillerMystery,
      horror,
      comedy,
      romanceDrama,
      animation,
    ] = await Promise.allSettled([
      this.getNowPlaying(1, language),
      this.discoverCatalog({ type: 'movie', genre: '28|12', language }),
      this.discoverCatalog({ type: 'movie', genre: '878', language }),
      this.discoverCatalog({ type: 'movie', genre: '53|80|9648', language }),
      this.discoverCatalog({ type: 'movie', genre: '27', language }),
      this.discoverCatalog({ type: 'movie', genre: '35', language }),
      this.discoverCatalog({ type: 'movie', genre: '18|10749', language }),
      this.discoverCatalog({ type: 'movie', genre: '16|10751', language }),
    ]);

    return {
      blockbusters: blockbusters.status === 'fulfilled' ? blockbusters.value?.results || [] : [],
      action: action.status === 'fulfilled' ? action.value?.results || [] : [],
      scifi: scifi.status === 'fulfilled' ? scifi.value?.results || [] : [],
      thrillerMystery:
        thrillerMystery.status === 'fulfilled' ? thrillerMystery.value?.results || [] : [],
      horror: horror.status === 'fulfilled' ? horror.value?.results || [] : [],
      comedy: comedy.status === 'fulfilled' ? comedy.value?.results || [] : [],
      romanceDrama: romanceDrama.status === 'fulfilled' ? romanceDrama.value?.results || [] : [],
      animation: animation.status === 'fulfilled' ? animation.value?.results || [] : [],
    };
  },

  async getSeriesSections(language = 'es-MX') {
    const [
      topRated,
      actionAdventure,
      scifiFantasy,
      crimeMystery,
      kdramas,
      sitcoms,
      cartoons,
    ] = await Promise.allSettled([
      this.getTopRatedSeries(1, language),
      this.discoverCatalog({ type: 'tv', genre: '10759', language }),
      this.discoverCatalog({ type: 'tv', genre: '10765', language }),
      this.discoverCatalog({ type: 'tv', genre: '80|9648', language }),
      this.discoverCatalog({
        type: 'tv',
        originalLanguage: 'ko',
        sortBy: 'popularity.desc',
        language,
      }),
      this.discoverCatalog({ type: 'tv', genre: '35', language }),
      this.discoverCatalog({ type: 'tv', genre: '16', language }),
    ]);

    return {
      topRated: topRated.status === 'fulfilled' ? topRated.value?.results || [] : [],
      actionAdventure:
        actionAdventure.status === 'fulfilled' ? actionAdventure.value?.results || [] : [],
      scifiFantasy: scifiFantasy.status === 'fulfilled' ? scifiFantasy.value?.results || [] : [],
      crimeMystery: crimeMystery.status === 'fulfilled' ? crimeMystery.value?.results || [] : [],
      kdramas: kdramas.status === 'fulfilled' ? kdramas.value?.results || [] : [],
      sitcoms: sitcoms.status === 'fulfilled' ? sitcoms.value?.results || [] : [],
      cartoons: cartoons.status === 'fulfilled' ? cartoons.value?.results || [] : [],
    };
  },

  async getAnimeSections(language = 'es-MX') {
    const [
      trending,
      shonenAction,
      fantasyIsekai,
      seinenMystery,
      romanceSlice,
      animeMovies,
    ] = await Promise.allSettled([
      this.getAnime(1, language),
      this.discoverCatalog({
        type: 'tv',
        genre: '16,10759',
        originalLanguage: 'ja',
        sortBy: 'popularity.desc',
        language,
      }),
      this.discoverCatalog({
        type: 'tv',
        genre: '16,10765',
        originalLanguage: 'ja',
        sortBy: 'popularity.desc',
        language,
      }),
      this.discoverCatalog({
        type: 'tv',
        genre: '16,9648|80|18',
        originalLanguage: 'ja',
        sortBy: 'vote_count.desc',
        language,
      }),
      this.discoverCatalog({
        type: 'tv',
        genre: '16,35|10749',
        originalLanguage: 'ja',
        sortBy: 'popularity.desc',
        language,
      }),
      this.discoverCatalog({
        type: 'movie',
        genre: '16',
        originalLanguage: 'ja',
        sortBy: 'popularity.desc',
        language,
      }),
    ]);

    return {
      trending: trending.status === 'fulfilled' ? trending.value?.results || [] : [],
      shonenAction: shonenAction.status === 'fulfilled' ? shonenAction.value?.results || [] : [],
      fantasyIsekai: fantasyIsekai.status === 'fulfilled' ? fantasyIsekai.value?.results || [] : [],
      seinenMystery: seinenMystery.status === 'fulfilled' ? seinenMystery.value?.results || [] : [],
      romanceSlice: romanceSlice.status === 'fulfilled' ? romanceSlice.value?.results || [] : [],
      animeMovies: animeMovies.status === 'fulfilled' ? animeMovies.value?.results || [] : [],
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
    if (!data?.episodes) return data;

    let episodes = data.episodes.map((ep) => ({
      ...ep,
      still_url: ep.still_path ? `https://image.tmdb.org/t/p/w300${ep.still_path}` : null,
    }));

    const missingOverview = () => episodes.some((ep) => !ep.overview || !ep.overview.trim());

    // Motor adicional 1: respaldo TMDB es-ES y en-US si faltan sinopsis en es-MX
    if (missingOverview()) {
      const fallbacks = language === 'es-MX' ? ['es-ES', 'en-US'] : language !== 'en-US' ? ['en-US'] : [];
      const resList = await Promise.allSettled(
        fallbacks.map((fbLang) => tmdbGet(`/tv/${tvId}/season/${seasonNumber}`, { language: fbLang }))
      );
      for (const r of resList) {
        if (r.status !== 'fulfilled' || !r.value?.episodes) continue;
        const byNum = new Map(r.value.episodes.map((e) => [e.episode_number, e]));
        episodes = episodes.map((ep) => {
          const fb = byNum.get(ep.episode_number);
          if (!fb) return ep;
          return {
            ...ep,
            overview: ep.overview?.trim() ? ep.overview : fb.overview || '',
            name: (!ep.name || /^Episodio\s+\d+$/i.test(ep.name)) && fb.name ? fb.name : ep.name,
            runtime: ep.runtime || fb.runtime || null,
          };
        });
      }
    }

    // Motor adicional 2: respaldo TVMaze por IMDb ID si aún faltan sinopsis
    if (missingOverview()) {
      try {
        const imdbId = await this.getImdbId('tv', tvId);
        if (imdbId) {
          const showRes = await axios.get(`https://api.tvmaze.com/lookup/shows?imdb=${encodeURIComponent(imdbId)}`, { timeout: 4000 });
          const mazeId = showRes.data?.id;
          if (mazeId) {
            const epRes = await axios.get(`https://api.tvmaze.com/shows/${mazeId}/episodes`, { timeout: 4500 });
            const mazeEps = Array.isArray(epRes.data) ? epRes.data : [];
            const mazeMap = new Map(
              mazeEps
                .filter((m) => Number(m.season) === Number(seasonNumber))
                .map((m) => [Number(m.number), m])
            );
            episodes = episodes.map((ep) => {
              if (ep.overview?.trim()) return ep;
              const m = mazeMap.get(Number(ep.episode_number));
              if (!m?.summary) return ep;
              const cleanSummary = String(m.summary).replace(/<[^>]+>/g, '').trim();
              return {
                ...ep,
                overview: cleanSummary,
                runtime: ep.runtime || m.runtime || null,
              };
            });
          }
        }
      } catch {
        // Ignorar si TVMaze no tiene el título o no responde
      }
    }

    return { ...data, episodes };
  },

  async getAnime(page = 1, language = 'es-MX') {
    try {
      const [tvRes, movieRes, iconicTvRes] = await Promise.all([
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
        tmdbGet('/discover/tv', {
          with_genres: 16,
          with_original_language: 'ja',
          sort_by: 'vote_count.desc',
          page,
          language,
        }),
      ]);

      const tvList = (tvRes.results || []).map((i) => ({ ...i, media_type: 'tv' }));
      const movieList = (movieRes.results || []).map((i) => ({ ...i, media_type: 'movie' }));
      const iconicList = (iconicTvRes.results || []).map((i) => ({ ...i, media_type: 'tv' }));
      const combined = blendPassiveClassics(
        [...tvList, ...movieList].sort((a, b) => (b.popularity || 0) - (a.popularity || 0)),
        iconicList,
        'tv'
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

  async getCollection(collectionId, lang = 'es-MX') {
    const id = Number(collectionId);
    if (!Number.isInteger(id) || id < 1) return null;
    try {
      const data = await tmdbGet(`/collection/${id}`, { language: lang });
      return {
        id: data.id,
        name: data.name,
        overview: data.overview || '',
        parts: Array.isArray(data.parts)
          ? data.parts
              .filter((p) => p && (p.backdrop_path || p.poster_path))
              .sort((a, b) => (a.release_date || '9999').localeCompare(b.release_date || '9999'))
              .map((p) => ({ ...p, media_type: 'movie', type: 'movie' }))
          : [],
      };
    } catch (err) {
      console.error(`[TMDB Collection Error #${collectionId}]:`, err.message);
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

  warmUpCache() {
    Promise.allSettled([
      this.getTrending('all', 'week', 1, 'es-MX'),
      this.getNowPlaying(1, 'es-MX'),
      this.getPopularMovies(1, 'es-MX'),
      this.getPopularSeries(1, 'es-MX'),
      this.getTopRated(1, 'es-MX'),
      this.getAnime(1, 'es-MX'),
    ]).then(() => {
      console.log('⚡ [TMDB Cache] Catálogos principales pre-cargados en RAM.');
    });
  },
};

setTimeout(() => tmdbService.warmUpCache(), 100);

export default tmdbService;
