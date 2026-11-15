import axios from 'axios';
import https from 'https';

const TORRENTIO_EXTENDED_BASE =
  'https://torrentio.strem.fun/providers=yts,eztv,rarbg,1337x,thepiratebay,kickasstorrents,torrentgalaxy,magnetdl,horriblesubs,nyaasi,tokyotosho,anidex,mejortorrent,wolfmax4k,cinecalidad,pelisenhd,spanish,besttorrents|language=latino,spanish/stream';

const SEEDER_THRESHOLD = 15;

const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 32,
});

// Caché de resoluciones de Torrentio en memoria (TTL 15 minutos) para carga instantánea al reabrir o cambiar idioma
const torrentioCache = new Map();
const CACHE_TTL = 15 * 60 * 1000;

export function extractSeeders(title = '') {
  const match = title.match(/👤\s*(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

export function extractResolution(text = '') {
  const lower = text.toLowerCase();
  if (lower.includes('2160p') || lower.includes('4k') || lower.includes('4320p') || lower.includes('uhd')) return '4K';
  if (lower.includes('1080p') || lower.includes('fhd')) return '1080p';
  if (lower.includes('720p') || lower.includes('hd')) return '720p';
  if (lower.includes('480p')) return '480p';
  return 'HD';
}

export function detectLanguage(text = '') {
  const lower = text.toLowerCase();
  const isLatino =
    text.includes('🇲🇽') ||
    lower.includes('latino') ||
    lower.includes('cinecalidad') ||
    lower.includes('pelisenhd') ||
    lower.includes('lat-');
  const isCastellano =
    text.includes('🇪🇸') ||
    lower.includes('castellano') ||
    lower.includes('mejortorrent') ||
    lower.includes('wolfmax') ||
    lower.includes('español') ||
    (lower.includes('spanish') && !isLatino);
  const isMulti = lower.includes('dual') || lower.includes('multi');

  if (isLatino && isMulti) return 'Latino / Dual';
  if (isLatino) return 'Español Latino';
  if (isCastellano) return 'Castellano';
  if (isMulti) return 'Multi / Dual';
  return 'Original (VOSE)';
}

export function detectLanguageCode(text = '') {
  const label = detectLanguage(text);
  if (label.includes('Latino')) return 'latino';
  if (label.includes('Castellano')) return 'castellano';
  if (label.includes('Multi')) return 'multi';
  return 'vose';
}

export function isBrowserNativeCompatible(stream) {
  const fullText = `${stream.name || ''} ${stream.title || ''} ${stream.behaviorHints?.filename || ''}`.toLowerCase();
  const isHevcOrAc3 =
    fullText.includes('hevc') ||
    fullText.includes('x265') ||
    fullText.includes('h265') ||
    fullText.includes('h.265') ||
    fullText.includes('eac3') ||
    fullText.includes('ac3') ||
    fullText.includes('dts') ||
    fullText.includes('.avi');

  if (isHevcOrAc3) return false;
  if (fullText.includes('.mp4') || fullText.includes('yts') || fullText.includes('h264') || fullText.includes('x264')) {
    return true;
  }
  return !fullText.includes('.mkv');
}

export function extractSize(title = '') {
  const match = title.match(/💾\s*([\d\.]+\s*(?:GB|MB|TB))/i);
  return match ? match[1] : null;
}

function scoreStream(stream, isAnime = false, preferredLanguage = 'latino') {
  const title = `${stream.name || ''} ${stream.title || ''}`;
  const lowerTitle = title.toLowerCase();
  const seeders = extractSeeders(stream.title);
  const res = extractResolution(title);
  const langCode = detectLanguageCode(title);
  const browserNative = isBrowserNativeCompatible(stream);

  let score = 0;

  if (preferredLanguage === 'latino') {
    if (langCode === 'latino') score += 900;
    else if (langCode === 'multi') score += 650;
    else if (langCode === 'castellano') score += 280;
    else score += 100;
  } else if (preferredLanguage === 'castellano') {
    if (langCode === 'castellano') score += 900;
    else if (langCode === 'multi') score += 650;
    else if (langCode === 'latino') score += 300;
    else score += 100;
  } else {
    if (langCode === 'vose') score += 850;
    else if (langCode === 'multi') score += 700;
    else score += 200;
  }

  if (
    isAnime &&
    (lowerTitle.includes('erai-raws') ||
      lowerTitle.includes('subsplease') ||
      lowerTitle.includes('multi-subs') ||
      lowerTitle.includes('horriblesubs'))
  ) {
    score += 450;
  }

  if (browserNative) {
    score += 320;
  }

  if (res === '1080p') score += 240;
  else if (res === '4K') score += 160;
  else if (res === '720p') score += 120;

  score += Math.min(seeders * 3, 600);
  if (seeders >= SEEDER_THRESHOLD) score += 300;

  return score;
}

export function buildEmbedServers({
  imdbId,
  tmdbId,
  season = null,
  episode = null,
  preferredLanguage = 'latino',
}) {
  const isSeries = Boolean(season && episode);
  const s = season || 1;
  const e = episode || 1;

  const hasValidImdb = Boolean(imdbId && String(imdbId).startsWith('tt'));
  const cleanImdb = hasValidImdb ? String(imdbId).trim() : null;
  const cleanTmdb = tmdbId ? String(tmdbId).trim() : cleanImdb;
  const primaryIdForDual = cleanImdb || cleanTmdb;

  const subLang = preferredLanguage === 'en' ? 'en' : 'es';

  const vidlinkMainUrl = isSeries
    ? `https://vidlink.pro/tv/${cleanTmdb}/${s}/${e}?primaryColor=E50914&secondaryColor=141414&iconColor=ffffff&autoplay=true&nextbutton=true`
    : `https://vidlink.pro/movie/${cleanTmdb}?primaryColor=E50914&secondaryColor=141414&iconColor=ffffff&autoplay=true`;

  const vidlinkJwUrl = `${vidlinkMainUrl}&player=jw`;

  const vidsrcCcTmdbUrl = isSeries
    ? `https://vidsrc.cc/v2/embed/tv/${cleanTmdb}/${s}/${e}?autoPlay=true`
    : `https://vidsrc.cc/v2/embed/movie/${cleanTmdb}?autoPlay=true`;

  const vidsrcCcImdbUrl = isSeries
    ? `https://vidsrc.cc/v2/embed/tv/${primaryIdForDual}/${s}/${e}?autoPlay=true`
    : `https://vidsrc.cc/v2/embed/movie/${primaryIdForDual}?autoPlay=true`;

  const vidsrcMeRuUrl = isSeries
    ? `https://vidsrcme.ru/embed/tv/${cleanTmdb}/${s}-${e}?ds_lang=${subLang}&autoplay=1`
    : `https://vidsrcme.ru/embed/movie/${cleanTmdb}?ds_lang=${subLang}&autoplay=1`;

  const vidsrcIcuUrl = isSeries
    ? `https://vidsrc.icu/embed/tv/${primaryIdForDual}/${s}/${e}`
    : `https://vidsrc.icu/embed/movie/${primaryIdForDual}`;

  const vidsrcPmUrl = isSeries
    ? `https://vidsrc.pm/embed/tv/${primaryIdForDual}/${s}/${e}?ds_lang=${subLang}`
    : `https://vidsrc.pm/embed/movie/${primaryIdForDual}?ds_lang=${subLang}`;

  const superembedDirectImdb = cleanImdb
    ? isSeries
      ? `https://multiembed.mov/directstream.php?video_id=${cleanImdb}&s=${s}&e=${e}`
      : `https://multiembed.mov/directstream.php?video_id=${cleanImdb}`
    : null;

  const superembedDirectTmdb = isSeries
    ? `https://multiembed.mov/directstream.php?video_id=${cleanTmdb}&tmdb=1&s=${s}&e=${e}`
    : `https://multiembed.mov/directstream.php?video_id=${cleanTmdb}&tmdb=1`;

  const superembedStandardUrl = cleanImdb
    ? isSeries
      ? `https://multiembed.mov/?video_id=${cleanImdb}&s=${s}&e=${e}`
      : `https://multiembed.mov/?video_id=${cleanImdb}`
    : superembedDirectTmdb;

  const embedSuUrl = isSeries
    ? `https://embed.su/embed/tv/${cleanTmdb}/${s}/${e}`
    : `https://embed.su/embed/movie/${cleanTmdb}`;

  const moviesApiUrl = isSeries
    ? `https://moviesapi.club/tv/${cleanTmdb}-${s}-${e}`
    : `https://moviesapi.club/movie/${cleanTmdb}`;

  const autoembedV2Url = isSeries
    ? `https://watch-v2.autoembed.cc/tv/${cleanTmdb}/${s}/${e}?lang=${subLang}`
    : `https://watch-v2.autoembed.cc/movie/${cleanTmdb}?lang=${subLang}`;

  const smashyPlayerUrl = isSeries
    ? `https://player.smashy.stream/tv/${cleanTmdb}?s=${s}&e=${e}`
    : `https://player.smashy.stream/movie/${cleanTmdb}`;

  const smashyEmbedUrl = isSeries
    ? `https://embed.smashystream.com/playere.php?tmdb=${cleanTmdb}&season=${s}&episode=${e}`
    : `https://embed.smashystream.com/playere.php?tmdb=${cleanTmdb}`;

  const videasyUrl = isSeries
    ? `https://player.videasy.net/tv/${cleanTmdb}/${s}/${e}?color=E50914&nextEpisode=true&autoplayNextEpisode=true`
    : `https://player.videasy.net/movie/${cleanTmdb}?color=E50914`;

  const twoEmbedTmdbUrl = isSeries
    ? `https://www.2embed.cc/embedtv/${cleanTmdb}&s=${s}&e=${e}`
    : `https://www.2embed.cc/embed/${cleanTmdb}`;

  const twoEmbedImdbUrl = cleanImdb
    ? isSeries
      ? `https://www.2embed.cc/embedtv/${cleanImdb}&s=${s}&e=${e}`
      : `https://www.2embed.cc/embed/${cleanImdb}`
    : twoEmbedTmdbUrl;

  const twoEmbedSkinUrl = isSeries
    ? `https://www.2embed.skin/embedtv/${primaryIdForDual}&s=${s}&e=${e}`
    : `https://www.2embed.skin/embed/${primaryIdForDual}`;

  return [
    {
      id: 'vidlink',
      name: 'VidLink 4K',
      url: vidlinkMainUrl,
      mirrors: [
        { id: 'main', name: 'VidLink 4K (Principal)', url: vidlinkMainUrl },
        { id: 'jw', name: 'VidLink JWPlayer Engine', url: vidlinkJwUrl },
      ],
      description: 'Motor principal sin anuncios molestos con carga instantánea 1080p/4K',
      badge: 'Ultra Rápido',
      supportsLanguages: ['latino', 'vose', 'en'],
    },
    {
      id: 'vidsrc',
      name: 'VidSrc Pro',
      url: vidsrcCcTmdbUrl,
      mirrors: [
        { id: 'cc-tmdb', name: 'VidSrc.cc v2 (TMDB)', url: vidsrcCcTmdbUrl },
        { id: 'me-ru', name: 'VidSrcMe (Sub ES Auto)', url: vidsrcMeRuUrl },
        { id: 'icu', name: 'VidSrc.icu (Global)', url: vidsrcIcuUrl },
        { id: 'pm', name: 'VidSrc.pm (Mirror ES)', url: vidsrcPmUrl },
        ...(cleanImdb ? [{ id: 'cc-imdb', name: 'VidSrc.cc (IMDb)', url: vidsrcCcImdbUrl }] : []),
      ],
      description: 'Clúster con 5 espejos TMDB + IMDb y subtítulos automáticos en Español',
      badge: '5 Espejos',
      supportsLanguages: ['latino', 'castellano', 'vose', 'en'],
    },
    {
      id: 'superembed',
      name: 'SuperEmbed VIP',
      url: superembedDirectImdb || superembedDirectTmdb,
      mirrors: [
        ...(superembedDirectImdb
          ? [{ id: 'direct-imdb', name: 'DirectStream VIP (IMDb)', url: superembedDirectImdb }]
          : []),
        { id: 'direct-tmdb', name: 'DirectStream VIP (TMDB)', url: superembedDirectTmdb },
        { id: 'standard', name: 'MultiEmbed Estándar', url: superembedStandardUrl },
      ],
      description: 'Multi-Audio (Español Latino / Castellano / Subtitulado) sin bloqueo sandbox',
      badge: 'Multi-Audio ES',
      supportsLanguages: ['latino', 'castellano', 'vose'],
    },
    {
      id: 'autoembed',
      name: 'Embed.su / MoviesAPI',
      url: embedSuUrl,
      mirrors: [
        { id: 'embedsu', name: 'Embed.su Cloud HD', url: embedSuUrl },
        { id: 'moviesapi', name: 'MoviesAPI Club (+32k títulos)', url: moviesApiUrl },
        { id: 'autoembed-v2', name: 'AutoEmbed Watch-V2', url: autoembedV2Url },
      ],
      description: 'Alta disponibilidad para cine de catálogo, anime y series completas',
      badge: 'Catálogo Masivo',
      supportsLanguages: ['latino', 'vose', 'en'],
    },
    {
      id: 'retro',
      name: 'Retro & Clásicos (80s/90s)',
      url: smashyPlayerUrl,
      mirrors: [
        { id: 'smashy-player', name: 'SmashyStream Player (Clásicos)', url: smashyPlayerUrl },
        { id: 'videasy', name: 'Videasy Cloud (Multi-Región)', url: videasyUrl },
        { id: 'smashy-embed', name: 'Smashy Mirror 2 (PHP)', url: smashyEmbedUrl },
      ],
      description: 'Especializado en series de hace 20 a 40 años, clásicos de culto y películas raras',
      badge: 'Especial 30+ Años',
      supportsLanguages: ['latino', 'castellano', 'vose', 'en'],
    },
    {
      id: 'twoembed',
      name: '2Embed Cloud',
      url: twoEmbedTmdbUrl,
      mirrors: [
        { id: 'tmdb', name: '2Embed (Índice TMDB)', url: twoEmbedTmdbUrl },
        { id: 'imdb', name: '2Embed (Índice IMDb)', url: twoEmbedImdbUrl },
        { id: 'skin', name: '2Embed.skin (Mirror)', url: twoEmbedSkinUrl },
      ],
      description: 'Respaldo internacional con doble índice TMDB/IMDb',
      badge: 'Respaldo Dual',
      supportsLanguages: ['vose', 'en'],
    },
  ];
}

export async function getTorrentioStreams({
  imdbId,
  tmdbId = null,
  type = 'movie',
  season = null,
  episode = null,
  originalLanguage = null,
  preferredLanguage = 'latino',
}) {
  const isSeries = type === 'series' || type === 'tv' || Boolean(season && episode);
  const isAnime = originalLanguage === 'ja';
  const hasValidImdb = Boolean(imdbId && String(imdbId).startsWith('tt'));

  const embedServers = buildEmbedServers({
    imdbId: hasValidImdb ? imdbId : null,
    tmdbId,
    season,
    episode,
    preferredLanguage,
  });

  if (!hasValidImdb) {
    return {
      imdbId: null,
      tmdbId,
      preferredLanguage,
      decision: 'embed',
      recommendedServer: 'vidlink',
      bestStream: null,
      streams: [],
      languageSummary: { latino: 0, castellano: 0, vose: 0, total: 0 },
      embedServers,
      threshold: SEEDER_THRESHOLD,
    };
  }

  const queryId = isSeries ? `${imdbId}:${season || 1}:${episode || 1}` : imdbId;
  const cacheKey = `${isSeries ? 'series' : 'movie'}:${queryId}`;
  const now = Date.now();

  try {
    let rawStreams = [];
    const cached = torrentioCache.get(cacheKey);

    if (cached && now - cached.timestamp < CACHE_TTL) {
      rawStreams = cached.streams;
    } else {
      const endpoint = `${TORRENTIO_EXTENDED_BASE}/${isSeries ? 'series' : 'movie'}/${queryId}.json`;
      const response = await axios.get(endpoint, {
        timeout: 6500,
        httpsAgent,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });
      rawStreams = response.data?.streams || [];
      torrentioCache.set(cacheKey, { streams: rawStreams, timestamp: now });
    }

    const parsedStreams = rawStreams
      .filter((s) => s.infoHash)
      .map((s) => {
        const seeders = extractSeeders(s.title);
        const resolution = extractResolution(`${s.name || ''} ${s.title || ''}`);
        const language = detectLanguage(s.title);
        const languageCode = detectLanguageCode(s.title);
        const size = extractSize(s.title);
        const browserNative = isBrowserNativeCompatible(s);
        const score = scoreStream(s, isAnime, preferredLanguage);
        const fileIdx = s.fileIdx ?? null;

        const firstLine = s.title.split('\n')[0];
        const displayLabel = `${resolution} • ${language} (${seeders} 👤)${size ? ' — ' + size : ''}`;

        const queryParams = new URLSearchParams();
        if (fileIdx !== null && fileIdx !== undefined) queryParams.set('fileIdx', fileIdx);
        if (season) queryParams.set('s', season);
        if (episode) queryParams.set('e', episode);
        const qs = queryParams.toString();

        return {
          infoHash: s.infoHash,
          title: s.title,
          cleanTitle: firstLine,
          displayLabel,
          name: s.name,
          fileIdx,
          filename: s.behaviorHints?.filename || null,
          seeders,
          resolution,
          language,
          languageCode,
          size,
          browserNative,
          score,
          streamUrl: `/api/stream/${s.infoHash}${qs ? `?${qs}` : ''}`,
        };
      })
      .sort((a, b) => b.score - a.score);

    const bestNativeStream = parsedStreams.find(
      (s) => s.browserNative && s.seeders >= SEEDER_THRESHOLD
    );
    const bestStream = bestNativeStream || parsedStreams[0] || null;
    const shouldStartWithP2P = Boolean(bestNativeStream && bestNativeStream.seeders >= 35);

    const languageSummary = {
      latino: parsedStreams.filter((s) => s.languageCode === 'latino' || s.languageCode === 'multi').length,
      castellano: parsedStreams.filter((s) => s.languageCode === 'castellano' || s.languageCode === 'multi').length,
      vose: parsedStreams.filter((s) => s.languageCode === 'vose').length,
      total: parsedStreams.length,
    };

    return {
      imdbId,
      tmdbId,
      preferredLanguage,
      decision: shouldStartWithP2P ? 'p2p' : 'embed',
      recommendedServer:
        preferredLanguage === 'latino' || preferredLanguage === 'castellano'
          ? 'vidsrc'
          : 'vidlink',
      bestStream,
      streams: parsedStreams,
      languageSummary,
      embedServers,
      threshold: SEEDER_THRESHOLD,
    };
  } catch (err) {
    console.warn(`[Torrentio Extended] Error o sin streams para ${imdbId}:`, err.message);
    return {
      imdbId,
      tmdbId,
      preferredLanguage,
      decision: 'embed',
      recommendedServer: 'vidlink',
      bestStream: null,
      streams: [],
      languageSummary: { latino: 0, castellano: 0, vose: 0, total: 0 },
      embedServers,
      threshold: SEEDER_THRESHOLD,
    };
  }
}

export default {
  getTorrentioStreams,
  buildEmbedServers,
  extractSeeders,
  extractResolution,
  detectLanguage,
  detectLanguageCode,
  isBrowserNativeCompatible,
};
