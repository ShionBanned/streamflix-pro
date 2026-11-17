import { buildEmbedServers } from '../../shared/cloudProviders.mjs';
import axios from 'axios';
import https from 'https';
import { queryAddonSources } from './addonSources.js';

const TORRENTIO_EXTENDED_BASE =
  'https://torrentio.strem.fun/providers=yts,eztv,rarbg,1337x,thepiratebay,kickasstorrents,torrentgalaxy,magnetdl,horriblesubs,nyaasi,tokyotosho,anidex,mejortorrent,wolfmax4k,cinecalidad,pelisenhd,spanish,besttorrents|language=latino,spanish/stream';

const YTS_API_ENDPOINTS = [
  'https://yts.mx/api/v2/list_movies.json',
  'https://yts.lt/api/v2/list_movies.json',
];

const SEEDER_THRESHOLD = 12;

const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 32,
});

// Caché de resoluciones de Torrentio + YTS en memoria (TTL 15 minutos)
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

/**
 * Detecta si el stream tiene audio AAC / MP4 nativo garantizado en Chromium
 * (evitando el problema de pistas mudas por códecs Dolby AC-3 / E-AC-3 / DTS en contenedores .mkv).
 */
export function hasGuaranteedBrowserAudio(stream) {
  const fullText = `${stream.name || ''} ${stream.title || ''} ${stream.behaviorHints?.filename || ''}`.toLowerCase();

  const hasIncompatibleAudioCodec =
    fullText.includes('eac3') ||
    fullText.includes('e-ac-3') ||
    fullText.includes('ac3') ||
    fullText.includes('ac-3') ||
    fullText.includes('ddp5.1') ||
    fullText.includes('dd5.1') ||
    fullText.includes('dts') ||
    fullText.includes('truehd') ||
    fullText.includes('atmos');

  if (hasIncompatibleAudioCodec) return false;

  if (
    /\baac(?:\b|\d)/.test(fullText) ||
    /\bopus\b/.test(fullText)
  ) {
    return true;
  }

  return false;
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
    fullText.includes('.avi') || fullText.includes('.mkv') || fullText.includes('truehd') || fullText.includes('atmos');

  if (isHevcOrAc3) return false;
  if (hasGuaranteedBrowserAudio(stream) && (fullText.includes('.mp4') || fullText.includes('.webm'))) return true;
  if (fullText.includes('.mp4') || fullText.includes('yts') || fullText.includes('h264') || fullText.includes('x264')) {
    return true;
  }
  return !fullText.includes('.mkv');
}

export function extractSize(title = '') {
  const match = title.match(/💾\s*([\d\.]+\s*(?:GB|MB|TB))/i);
  return match ? match[1] : null;
}

/**
 * Consulta directa a la API oficial de YTS para inyectar streams MP4 con audio AAC 2.0 garantizado.
 */
async function fetchYtsDirectStreams(imdbId) {
  if (!imdbId || !String(imdbId).startsWith('tt')) return [];

  for (const endpoint of YTS_API_ENDPOINTS) {
    try {
      const res = await axios.get(endpoint, {
        params: { query_term: imdbId },
        timeout: 4200,
        httpsAgent,
      });

      const movies = res.data?.data?.movies;
      if (!Array.isArray(movies) || movies.length === 0) return [];

      const movie = movies[0];
      const torrents = movie.torrents || [];

      return torrents
        .filter((t) => t.hash)
        .map((t) => {
          const quality = t.quality || '1080p';
          const typeLabel = (t.type || 'web').toUpperCase();
          const seeds = Number(t.seeds || 0);
          const sizeStr = t.size || '1.8 GB';
          const audioChannels = t.audio_channels || '2.0';

          return {
            infoHash: String(t.hash).toLowerCase(),
            name: `YTS ${quality} AAC`,
            title: `${movie.title_long || movie.title} (${quality} ${typeLabel} MP4 • Audio AAC ${audioChannels})\n👤 ${seeds} 💾 ${sizeStr} 🌐 YTS Direct MP4`,
            behaviorHints: {
              filename: `${(movie.slug || 'movie')}.${quality}.YTS.MP4.AAC.mp4`,
            },
            isYtsDirect: true,
          };
        });
    } catch {
      // Intentar siguiente espejo YTS
    }
  }
  return [];
}

function scoreStream(stream, isAnime = false, preferredLanguage = 'latino') {
  const title = `${stream.name || ''} ${stream.title || ''}`;
  const lowerTitle = title.toLowerCase();
  const seeders = extractSeeders(stream.title);
  const res = extractResolution(title);
  const langCode = detectLanguageCode(title);
  const browserNative = isBrowserNativeCompatible(stream);
  const audioGuaranteed = hasGuaranteedBrowserAudio(stream);

  let score = 0;

  if (preferredLanguage === 'latino') {
    if (langCode === 'latino') score += 950;
    else if (langCode === 'multi') score += 700;
    else if (langCode === 'castellano') score += 310;
    else score += 140;
  } else if (preferredLanguage === 'castellano') {
    if (langCode === 'castellano') score += 950;
    else if (langCode === 'multi') score += 700;
    else if (langCode === 'latino') score += 320;
    else score += 140;
  } else {
    if (langCode === 'vose') score += 900;
    else if (langCode === 'multi') score += 720;
    else score += 220;
  }

  if (
    isAnime &&
    (lowerTitle.includes('erai-raws') ||
      lowerTitle.includes('subsplease') ||
      lowerTitle.includes('multi-subs') ||
      lowerTitle.includes('horriblesubs'))
  ) {
    score += 460;
  }

  // Priorizar fuentes con audio AAC 2.0 / MP4 garantizado que nunca quedan mudas en el navegador
  if (audioGuaranteed) {
    score += 480;
  } else if (browserNative) {
    score += 300;
  }

  if (res === '1080p') score += 250;
  else if (res === '4K') score += 180;
  else if (res === '720p') score += 130;

  score += Math.min(seeders * 3, 620);
  if (seeders >= SEEDER_THRESHOLD) score += 300;
  if (seeders >= 30) score += 200; // Bonus enjambre ultra saludable (velocidad garantizada)
  if (seeders < 5) score -= 350; // Penalización para fuentes moribundas que causan tirones y cortes frecuentes

  return score;
}

/**
 * Construye el Clúster de 8 Familias Cloud (25 Espejos Activos):
 * - Servidor #1 Principal: VidSrcMe Ultra (vidsrcme.ru + espejos vidsrc.in, vidsrc.net, vidsrc.pm, vidsrc.xyz)
 * - Servidor #2: Embed.su 4K (Embed.su + MoviesAPI Club + AutoEmbed Watch-V2)
 * - Servidor #3: NontonGo HD (NontonGo Multi-Server + Player AutoEmbed)
 * - Servidor #4: SuperEmbed VIP (Doblaje Español Latino / Castellano vía multiembed.mov/directstream.php)
 * - Servidor #5: VidSrc.cc / ICU (Doble índice TMDB + IMDb)
 * - Servidor #6: SmashyStream Retro (Especializado en series de hace 30+ años y clásicos de archivo)
 * - Servidor #7: 2Embed Cloud (Respaldo internacional TMDB + IMDb + Skin)
 * - Servidor #8: VidLink Respaldo (vidlink.pro Principal + JWPlayer)
 */
export { buildEmbedServers } from '../../shared/cloudProviders.mjs';

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
    isSeries,
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
      recommendedServer: 'vidsrc',
      bestStream: null,
      streams: [],
      addonStatuses: [],
      languageSummary: { latino: 0, castellano: 0, vose: 0, aacGuaranteed: 0, total: 0 },
      embedServers,
      threshold: SEEDER_THRESHOLD,
    };
  }

  const queryId = isSeries ? `${imdbId}:${season || 1}:${episode || 1}` : imdbId;
  const cacheKey = `${isSeries ? 'series' : 'movie'}:${queryId}`;
  const now = Date.now();

  try {
    let rawStreams = [];
    let addonStatuses = [];
    const cached = torrentioCache.get(cacheKey);

    if (cached && now - cached.timestamp < CACHE_TTL) {
      rawStreams = cached.streams;
      addonStatuses = cached.addonStatuses || [];
    } else {
      const endpoint = `${TORRENTIO_EXTENDED_BASE}/${isSeries ? 'series' : 'movie'}/${queryId}.json`;

      const [torrentioRes, ytsStreams, addons] = await Promise.all([
        axios
          .get(endpoint, {
            timeout: 6500,
            httpsAgent,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
          })
          .then((r) => r.data?.streams || [])
          .catch(() => []),
        !isSeries ? fetchYtsDirectStreams(imdbId) : Promise.resolve([]),
        queryAddonSources({ imdbId, isSeries, season: season || 1, episode: episode || 1 }),
      ]);
      addonStatuses = addons.statuses;

      // Combinar streams de YTS Direct MP4/AAC con Torrentio sin duplicar infoHash
      const seenStreams = new Set();
      rawStreams = [];

      for (const s of [...ytsStreams, ...torrentioRes, ...addons.streams]) {
        if (!s?.infoHash && !s?.url) continue;
        const key = s.infoHash ? `${String(s.infoHash).toLowerCase()}:${s.fileIdx ?? ''}` : s.url;
        if (seenStreams.has(key)) continue;
        seenStreams.add(key);
        rawStreams.push(s);
      }

      torrentioCache.set(cacheKey, { streams: rawStreams, addonStatuses, timestamp: now });
    }

    const parsedStreams = rawStreams
      .filter((s) => s.infoHash || s.url)
      .map((s) => {
        const seeders = extractSeeders(s.title);
        const resolution = extractResolution(`${s.name || ''} ${s.title || ''}`);
        const language = detectLanguage(s.title);
        const languageCode = detectLanguageCode(s.title);
        const size = extractSize(s.title);
        const audioGuaranteed = hasGuaranteedBrowserAudio(s);
        const browserNative = isBrowserNativeCompatible(s);
        const score = scoreStream(s, isAnime, preferredLanguage);
        const fileIdx = s.fileIdx ?? null;

        const firstLine = (s.title || '').split('\n')[0];
        const audioBadge = audioGuaranteed
          ? '🔊 Audio AAC Garantizado'
          : '⚡ Compatible con Motor AAC Live';
        const displayLabel = `${resolution} • ${language} • ${audioBadge} (${seeders} 👤)${
          size ? ' — ' + size : ''
        }`;

        const queryParams = new URLSearchParams();
        if (fileIdx !== null && fileIdx !== undefined) queryParams.set('fileIdx', fileIdx);
        if (season) queryParams.set('s', season);
        if (episode) queryParams.set('e', episode);
        queryParams.set('audioLang', preferredLanguage);
        if (!audioGuaranteed) {
          queryParams.set('audioEngine', 'aac');
        }
        const qs = queryParams.toString();

        return {
          infoHash: s.infoHash ? String(s.infoHash).toLowerCase() : null,
          url: s.url || null,
          source: s.addonSource || (s.isYtsDirect ? 'yts' : 'torrentio'),
          title: s.title,
          cleanTitle: firstLine,
          displayLabel,
          audioBadge,
          audioGuaranteed,
          isYtsDirect: Boolean(s.isYtsDirect),
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
          streamUrl: s.infoHash ? `/api/stream/${String(s.infoHash).toLowerCase()}${qs ? `?${qs}` : ''}` : s.url,
        };
      })
      .sort((a, b) => b.score - a.score);

    const bestGuaranteedStream = parsedStreams.find(
      (s) => s.infoHash && s.audioGuaranteed && s.seeders >= SEEDER_THRESHOLD
    );
    const bestNativeStream =
      bestGuaranteedStream ||
      parsedStreams.find((s) => s.infoHash && s.browserNative && s.seeders >= SEEDER_THRESHOLD);
    const bestStream = bestNativeStream || parsedStreams.find(s => s.infoHash) || parsedStreams[0] || null;
    const shouldStartWithP2P = Boolean(bestGuaranteedStream && bestGuaranteedStream.seeders >= 25);

    const languageSummary = {
      latino: parsedStreams.filter((s) => s.languageCode === 'latino' || s.languageCode === 'multi')
        .length,
      castellano: parsedStreams.filter(
        (s) => s.languageCode === 'castellano' || s.languageCode === 'multi'
      ).length,
      vose: parsedStreams.filter((s) => s.languageCode === 'vose').length,
      aacGuaranteed: parsedStreams.filter((s) => s.audioGuaranteed).length,
      total: parsedStreams.length,
    };

    return {
      imdbId,
      tmdbId,
      preferredLanguage,
      decision: shouldStartWithP2P ? 'p2p' : 'embed',
      recommendedServer: 'vidsrc',
      bestStream,
      streams: parsedStreams,
      addonStatuses,
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
      recommendedServer: 'vidsrc',
      bestStream: null,
      streams: [],
      addonStatuses: [],
      languageSummary: { latino: 0, castellano: 0, vose: 0, aacGuaranteed: 0, total: 0 },
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
  hasGuaranteedBrowserAudio,
  isBrowserNativeCompatible,
};
