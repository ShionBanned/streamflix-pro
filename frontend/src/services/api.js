import axios from 'axios';

const BASE_URL = '/api';
const DIRECT_BACKEND_URL = 'http://127.0.0.1:4000/api';

const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 12000,
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

/**
 * Mezcla de forma pasiva y orgánica títulos icónicos de distintas décadas dentro del mismo género
 */
function blendPassiveItems(primary = [], secondary = []) {
  const seen = new Set();
  const out = [];
  const max = Math.max(primary.length, secondary.length);
  for (let i = 0; i < max; i++) {
    if (primary[i]?.id && !seen.has(primary[i].id)) {
      seen.add(primary[i].id);
      out.push(primary[i]);
    }
    if (i % 4 === 3 && secondary[Math.floor(i / 4)]?.id) {
      const s = secondary[Math.floor(i / 4)];
      if (!seen.has(s.id)) {
        seen.add(s.id);
        out.push(s);
      }
    }
  }
  for (const s of secondary) {
    if (out.length >= 24) break;
    if (s?.id && !seen.has(s.id)) {
      seen.add(s.id);
      out.push(s);
    }
  }
  return out;
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

  /**
   * Explorador universal con respaldo inteligente en cliente:
   * Garantiza que cualquier género de Películas, Series o Anime devuelva siempre resultados,
   * mezclando pasivamente títulos actuales con clásicos icónicos del mismo género.
   */
  async discoverCatalog({
    type = 'movie',
    genre = 'all',
    decade = 'all',
    network = 'all',
    originalLanguage = null,
    sortBy = 'popularity.desc',
    page = 1,
    lang = 'es-MX',
  } = {}) {
    try {
      const params = { type, sortBy, page, lang };
      if (genre && genre !== 'all') params.genre = genre;
      if (decade && decade !== 'all') params.decade = decade;
      if (network && network !== 'all') params.network = network;
      if (originalLanguage) params.originalLanguage = originalLanguage;

      const [mainRes, iconicRes] = await Promise.allSettled([
        cachedGet('/tmdb/discover', params),
        sortBy === 'popularity.desc' && (!decade || decade === 'all')
          ? cachedGet('/tmdb/discover', { ...params, sortBy: 'vote_count.desc' })
          : Promise.resolve({ results: [] }),
      ]);

      let primaryList =
        mainRes.status === 'fulfilled' ? mainRes.value?.results || [] : [];
      const iconicList =
        iconicRes.status === 'fulfilled' ? iconicRes.value?.results || [] : [];

      let combined = blendPassiveItems(primaryList, iconicList);

      // Si es una subcategoría de Anime y el backend antiguo ignoró originalLanguage='ja',
      // filtrar y complementar con el catálogo de Anime de páginas 1 y 2
      if (originalLanguage === 'ja' || (combined.length === 0 && String(genre).includes('16'))) {
        const [aniP1, aniP2] = await Promise.allSettled([
          this.getAnime(1, lang),
          this.getAnime(2, lang),
        ]);
        const animePool = [
          ...(aniP1.status === 'fulfilled' ? aniP1.value : []),
          ...(aniP2.status === 'fulfilled' ? aniP2.value : []),
        ];

        const subGenreIds = String(genre)
          .split(/[,|]/)
          .map((g) => Number(g.trim()))
          .filter((n) => !isNaN(n) && n !== 16);

        const filteredPool =
          subGenreIds.length > 0
            ? animePool.filter(
                (item) =>
                  Array.isArray(item.genre_ids) &&
                  item.genre_ids.some((id) => subGenreIds.includes(Number(id)))
              )
            : animePool;

        const japaneseCombined = combined.filter(
          (item) => !item.original_language || item.original_language === 'ja'
        );

        combined = blendPassiveItems(
          japaneseCombined.length >= 6 ? japaneseCombined : filteredPool,
          animePool
        );
      }

      return combined;
    } catch (e) {
      console.warn('Error en discoverCatalog:', e.message);
      return [];
    }
  },

  async getMovieSections(lang = 'es-MX') {
    let base = {};
    try {
      base = (await cachedGet('/tmdb/movie-sections', { lang })) || {};
    } catch {
      base = {};
    }

    // Garantizar que todas las filas de géneros de películas estén pobladas (con clásicos integrados pasivamente)
    const [
      actionFallback,
      scifiFallback,
      thrillerFallback,
      horrorFallback,
      comedyFallback,
      romanceFallback,
      animationFallback,
    ] = await Promise.all([
      base.action?.length >= 6
        ? Promise.resolve(base.action)
        : this.discoverCatalog({ type: 'movie', genre: '28', lang }),
      base.scifi?.length >= 6
        ? Promise.resolve(base.scifi)
        : this.discoverCatalog({ type: 'movie', genre: '878', lang }),
      base.thrillerMystery?.length >= 6
        ? Promise.resolve(base.thrillerMystery)
        : this.discoverCatalog({ type: 'movie', genre: '53', lang }),
      base.horror?.length >= 6
        ? Promise.resolve(base.horror)
        : this.discoverCatalog({ type: 'movie', genre: '27', lang }),
      base.comedy?.length >= 6
        ? Promise.resolve(base.comedy)
        : this.discoverCatalog({ type: 'movie', genre: '35', lang }),
      base.romanceDrama?.length >= 6
        ? Promise.resolve(base.romanceDrama)
        : this.discoverCatalog({ type: 'movie', genre: '10749', lang }),
      base.animation?.length >= 6
        ? Promise.resolve(base.animation)
        : this.discoverCatalog({ type: 'movie', genre: '16', lang }),
    ]);

    return {
      ...base,
      action: blendPassiveItems(actionFallback, base.classics90s || []),
      scifi: scifiFallback,
      thrillerMystery: thrillerFallback,
      horror: horrorFallback,
      comedy: comedyFallback,
      romanceDrama: romanceFallback,
      animation: animationFallback,
    };
  },

  async getSeriesSections(lang = 'es-MX') {
    let base = {};
    try {
      base = (await cachedGet('/tmdb/series-sections', { lang })) || {};
    } catch {
      base = {};
    }

    const [
      actionAdv,
      scifiFan,
      crimeMys,
      sitcomsRow,
      dramaRow,
      cartoonsRow,
    ] = await Promise.all([
      base.actionAdventure?.length >= 6
        ? Promise.resolve(base.actionAdventure)
        : this.discoverCatalog({ type: 'tv', genre: '10759', lang }),
      base.scifiFantasy?.length >= 6
        ? Promise.resolve(base.scifiFantasy)
        : this.discoverCatalog({ type: 'tv', genre: '10765', lang }),
      base.crimeMystery?.length >= 6
        ? Promise.resolve(base.crimeMystery)
        : this.discoverCatalog({ type: 'tv', genre: '80', lang }),
      base.sitcoms?.length >= 6
        ? Promise.resolve(base.sitcoms)
        : this.discoverCatalog({ type: 'tv', genre: '35', lang }),
      base.drama?.length >= 6
        ? Promise.resolve(base.drama)
        : this.discoverCatalog({ type: 'tv', genre: '18', lang }),
      base.cartoons?.length >= 6
        ? Promise.resolve(base.cartoons)
        : this.discoverCatalog({ type: 'tv', genre: '16', lang }),
    ]);

    return {
      ...base,
      topRated: blendPassiveItems(base.topRated || [], base.classics90s || []),
      actionAdventure: actionAdv,
      scifiFantasy: scifiFan,
      crimeMystery: crimeMys,
      sitcoms: blendPassiveItems(sitcomsRow, base.classics90s || []),
      drama: dramaRow,
      cartoons: blendPassiveItems(cartoonsRow, base.retro80s || []),
    };
  },

  /**
   * Obtiene todas las secciones de Anime garantizando carga 100% incluso si el backend no fue reiniciado.
   */
  async getAnimeSections(lang = 'es-MX') {
    let base = {};
    try {
      base = (await cachedGet('/tmdb/anime-sections', { lang })) || {};
    } catch {
      base = {};
    }

    const [page1, page2, page3] = await Promise.all([
      this.getAnime(1, lang),
      this.getAnime(2, lang),
      this.getAnime(3, lang),
    ]);

    const fullAnimePool = blendPassiveItems([...page1, ...page2], page3);

    const filterByGenre = (gIds, fallbackSliceStart = 0) => {
      const matched = fullAnimePool.filter(
        (item) =>
          Array.isArray(item.genre_ids) &&
          item.genre_ids.some((id) => gIds.includes(Number(id)))
      );
      if (matched.length >= 8) return matched;
      return blendPassiveItems(
        matched,
        fullAnimePool.slice(fallbackSliceStart, fallbackSliceStart + 16)
      );
    };

    const animeMoviesList = fullAnimePool.filter((i) => i.media_type === 'movie');

    return {
      trending: base.trending?.length >= 6 ? base.trending : fullAnimePool.slice(0, 18),
      shonenAction:
        base.shonenAction?.length >= 6
          ? base.shonenAction
          : filterByGenre([10759, 28, 12], 0),
      fantasyIsekai:
        base.fantasyIsekai?.length >= 6
          ? base.fantasyIsekai
          : filterByGenre([10765, 14, 878], 6),
      seinenMystery:
        base.seinenMystery?.length >= 6
          ? base.seinenMystery
          : filterByGenre([9648, 80, 18, 53], 12),
      romanceSlice:
        base.romanceSlice?.length >= 6
          ? base.romanceSlice
          : filterByGenre([35, 10749], 16),
      animeMovies:
        base.animeMovies?.length >= 6
          ? base.animeMovies
          : animeMoviesList.length >= 4
          ? animeMoviesList
          : fullAnimePool.slice(8, 24),
    };
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
