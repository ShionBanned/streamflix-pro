import axios from 'axios';

// URL extendida de Torrentio con proveedores en español (Cinecalidad, PelisenHD, Spanish) y anime (Nyaa, Tokyotosho, Anidex, HorribleSubs)
const TORRENTIO_EXTENDED_BASE =
  'https://torrentio.strem.fun/providers=yts,eztv,rarbg,1337x,thepiratebay,kickasstorrents,torrentgalaxy,magnetdl,horriblesubs,nyaasi,tokyotosho,anidex,spanish,cinecalidad,pelisenhd|language=latino,spanish/stream';

// Umbral de semillas óptimo para reproducción P2P instantánea
const SEEDER_THRESHOLD = 15;

/**
 * Extrae número de semillas del campo title mediante regex: /👤\s*(\d+)/
 */
export function extractSeeders(title = '') {
  const match = title.match(/👤\s*(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * Detecta resolución del título o nombre
 */
export function extractResolution(text = '') {
  const lower = text.toLowerCase();
  if (lower.includes('2160p') || lower.includes('4k') || lower.includes('4320p')) return '4K';
  if (lower.includes('1080p')) return '1080p';
  if (lower.includes('720p')) return '720p';
  if (lower.includes('480p')) return '480p';
  return 'HD';
}

/**
 * Detecta preferencia de idioma
 */
export function detectLanguage(text = '') {
  const lower = text.toLowerCase();
  if (text.includes('🇲🇽') || lower.includes('latino') || lower.includes('cinecalidad') || lower.includes('mex')) {
    return 'Latino';
  }
  if (text.includes('🇪🇸') || lower.includes('castellano') || lower.includes('spa') || lower.includes('spanish')) {
    return 'Castellano';
  }
  if (lower.includes('dual') || lower.includes('multi')) {
    return 'Multi/Dual';
  }
  return 'Original / VOSE';
}

/**
 * Extrae tamaño en disco si está disponible
 */
export function extractSize(title = '') {
  const match = title.match(/💾\s*([\d\.]+\s*(?:GB|MB|TB))/i);
  return match ? match[1] : null;
}

/**
 * Nuevo Algoritmo de Puntuación Pro V2.0
 */
function scoreStream(stream, isAnime = false) {
  const title = `${stream.name || ''} ${stream.title || ''}`;
  const lowerTitle = title.toLowerCase();
  const seeders = extractSeeders(stream.title);
  const res = extractResolution(title);

  let score = 0;

  // 1. Idioma Latino/Español
  if (
    title.includes('🇲🇽') ||
    lowerTitle.includes('latino') ||
    lowerTitle.includes('cinecalidad') ||
    lowerTitle.includes('dual') ||
    lowerTitle.includes('multi')
  ) {
    score += 500;
  } else if (
    title.includes('🇪🇸') ||
    lowerTitle.includes('castellano') ||
    lowerTitle.includes('spa') ||
    lowerTitle.includes('spanish')
  ) {
    score += 300;
  }

  // 2. Especial Anime: Si es anime y contiene trackers oficiales con subtítulos integrados
  if (
    isAnime &&
    (lowerTitle.includes('erai-raws') ||
      lowerTitle.includes('subsplease') ||
      lowerTitle.includes('multi-subs') ||
      lowerTitle.includes('horriblesubs'))
  ) {
    score += 400; // Garantiza subtítulos oficiales de Crunchyroll en el MKV
  }

  // 3. Resolución
  if (res === '1080p') {
    score += 200; // Prioridad por velocidad y compatibilidad de carga
  } else if (res === '4K') {
    score += 150;
  } else if (res === '720p') {
    score += 80;
  }

  // 4. Semillas: Suma seeders * 2 al puntaje total
  score += seeders * 2;

  // Bonus extra si supera el umbral de 15 semillas
  if (seeders >= SEEDER_THRESHOLD) {
    score += 300;
  }

  return score;
}

/**
 * Construye URLs de fallback para los 3 servidores Auto-Embed
 */
export function buildEmbedServers(imdbId, season = null, episode = null) {
  const isSeries = Boolean(season && episode);

  const vidsrcUrl = isSeries
    ? `https://vidsrc.to/embed/tv/${imdbId}/${season}/${episode}`
    : `https://vidsrc.to/embed/movie/${imdbId}`;

  const superembedUrl = isSeries
    ? `https://multiembed.mov/?video_id=${imdbId}&s=${season}&e=${episode}`
    : `https://multiembed.mov/?video_id=${imdbId}`;

  const autoembedUrl = isSeries
    ? `https://autoembed.co/tv/imdb/${imdbId}-${season}-${episode}`
    : `https://autoembed.co/movie/imdb/${imdbId}`;

  const twoEmbedUrl = isSeries
    ? `https://2embed.cc/embedtv/${imdbId}&s=${season}&e=${episode}`
    : `https://2embed.cc/embed/${imdbId}`;

  return [
    {
      id: 'vidsrc',
      name: 'VidSrc (Servidor 1)',
      url: vidsrcUrl,
      description: 'Servidor global rápido con reproductor HTML5',
      badge: 'Recomendado',
    },
    {
      id: 'superembed',
      name: 'SuperEmbed (Servidor 2)',
      url: superembedUrl,
      description: 'Soporte con audio latino y múltiples subtítulos',
      badge: 'Multi-idioma',
    },
    {
      id: 'autoembed',
      name: 'AutoEmbed (Servidor 3)',
      url: autoembedUrl,
      description: 'Servidor de alta disponibilidad de respaldo',
      badge: 'Respaldo',
    },
    {
      id: 'twoembed',
      name: '2Embed (Servidor 4)',
      url: twoEmbedUrl,
      description: 'Servidor alternativo de ultra respaldo',
      badge: 'Alternativo',
    },
  ];
}

/**
 * Consulta la API de Torrentio con trackers extendidos y clasifica resultados
 */
export async function getTorrentioStreams({
  imdbId,
  type = 'movie',
  season = null,
  episode = null,
  originalLanguage = null,
}) {
  if (!imdbId) {
    throw new Error('imdbId es requerido para consultar Torrentio');
  }

  const isSeries = type === 'series' || type === 'tv' || Boolean(season && episode);
  const isAnime = originalLanguage === 'ja';
  const queryId = isSeries ? `${imdbId}:${season || 1}:${episode || 1}` : imdbId;

  // Endpoint extendido con proveedores latino, castellano y anime
  const endpoint = `${TORRENTIO_EXTENDED_BASE}/${isSeries ? 'series' : 'movie'}/${queryId}.json`;

  try {
    const response = await axios.get(endpoint, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    const rawStreams = response.data?.streams || [];

    const parsedStreams = rawStreams
      .filter((s) => s.infoHash)
      .map((s) => {
        const seeders = extractSeeders(s.title);
        const resolution = extractResolution(`${s.name || ''} ${s.title || ''}`);
        const language = detectLanguage(s.title);
        const size = extractSize(s.title);
        const score = scoreStream(s, isAnime);

        // Formato amigable para el selector manual en UI
        const firstLine = s.title.split('\n')[0];
        const displayLabel = `${resolution} ${language} (${seeders} 👤)${size ? ' - ' + size : ''}`;

        return {
          infoHash: s.infoHash,
          title: s.title,
          cleanTitle: firstLine,
          displayLabel,
          name: s.name,
          fileIdx: s.fileIdx ?? 0,
          filename: s.behaviorHints?.filename || null,
          seeders,
          resolution,
          language,
          size,
          score,
          streamUrl: `/api/stream/${s.infoHash}`,
        };
      })
      .sort((a, b) => b.score - a.score);

    // Regla de decisión: ¿Existe algún stream con seeders >= 15?
    const bestStream = parsedStreams[0] || null;
    const meetsP2PThreshold = Boolean(bestStream && bestStream.seeders >= SEEDER_THRESHOLD);

    return {
      imdbId,
      decision: meetsP2PThreshold ? 'p2p' : 'embed',
      bestStream,
      streams: parsedStreams,
      embedServers: buildEmbedServers(imdbId, season, episode),
      threshold: SEEDER_THRESHOLD,
    };
  } catch (err) {
    console.warn(`[Torrentio Extended] Error o sin streams para ${imdbId}:`, err.message);
    return {
      imdbId,
      decision: 'embed',
      bestStream: null,
      streams: [],
      embedServers: buildEmbedServers(imdbId, season, episode),
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
};
