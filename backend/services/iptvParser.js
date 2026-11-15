import axios from 'axios';

// -------------------------------------------------------------
// 1. Fuentes Oficiales Públicas y Canales FAST 24/7
// -------------------------------------------------------------
export const DEFAULT_M3U_SOURCES = [
  { name: 'Español Global', url: 'https://iptv-org.github.io/iptv/languages/spa.m3u', country: 'es-global' },
  { name: 'Colombia', url: 'https://iptv-org.github.io/iptv/countries/co.m3u', country: 'co' },
  { name: 'México', url: 'https://iptv-org.github.io/iptv/countries/mx.m3u', country: 'mx' },
  { name: 'Argentina', url: 'https://iptv-org.github.io/iptv/countries/ar.m3u', country: 'ar' },
  { name: 'España', url: 'https://iptv-org.github.io/iptv/countries/es.m3u', country: 'es' },
  { name: 'USA', url: 'https://iptv-org.github.io/iptv/countries/us.m3u', country: 'us' },
  { name: 'Deportes', url: 'https://iptv-org.github.io/iptv/categories/sports.m3u', country: 'global' },
  { name: 'Películas', url: 'https://iptv-org.github.io/iptv/categories/movies.m3u', country: 'global' },
  { name: 'Animación', url: 'https://iptv-org.github.io/iptv/categories/animation.m3u', country: 'global' },
  { name: 'Pluto TV', url: 'https://raw.githubusercontent.com/HelmerLuzo/PlutoTV_HL/main/tv/m3u/PlutoTV_tv_es.m3u', country: 'latam' },
];

export const COUNTRY_NAMES = {
  co: 'Colombia',
  mx: 'México',
  ar: 'Argentina',
  es: 'España',
  us: 'Estados Unidos',
  latam: 'Latinoamérica',
  'es-global': 'Internacional',
};

let aggregatedCache = null;
let lastCacheTime = 0;
const CACHE_TTL = 30 * 60 * 1000;

export function normalizeCategory(rawGroup = '', channelName = '', channelUrl = '', sourceName = '') {
  const text = `${rawGroup} ${channelName} ${channelUrl} ${sourceName}`.toLowerCase();

  if (
    text.includes('pluto.tv') ||
    text.includes('jmp2.uk/plu-') ||
    text.includes('plutotv') ||
    sourceName === 'Pluto TV'
  ) {
    return 'Pluto TV 24/7';
  }

  if (
    text.includes('sport') ||
    text.includes('deporte') ||
    text.includes('futbol') ||
    text.includes('fútbol') ||
    text.includes('espn') ||
    text.includes('fox sports') ||
    text.includes('tnt sports') ||
    text.includes('directv sports') ||
    text.includes('win sports') ||
    text.includes('gol') ||
    text.includes('liga')
  ) {
    return 'Deportes';
  }

  if (
    text.includes('movie') ||
    text.includes('cinema') ||
    text.includes('cine') ||
    text.includes('pelicula') ||
    text.includes('película') ||
    text.includes('series') ||
    text.includes('hbo') ||
    text.includes('paramount') ||
    text.includes('universal') ||
    text.includes('warner') ||
    text.includes('tnt')
  ) {
    return 'Películas y Series';
  }

  if (
    text.includes('news') ||
    text.includes('noticia') ||
    text.includes('informacion') ||
    text.includes('cnn') ||
    text.includes('24 horas') ||
    text.includes('24h') ||
    text.includes('bbc') ||
    text.includes('dw') ||
    text.includes('euronews')
  ) {
    return 'Noticias';
  }

  if (
    text.includes('kid') ||
    text.includes('infantil') ||
    text.includes('anime') ||
    text.includes('animation') ||
    text.includes('animacion') ||
    text.includes('cartoon') ||
    text.includes('disney') ||
    text.includes('nickelodeon') ||
    text.includes('cartoon network') ||
    text.includes('discovery kids') ||
    text.includes('toons')
  ) {
    return 'Infantil y Anime';
  }

  if (
    text.includes('music') ||
    text.includes('música') ||
    text.includes('mtv') ||
    text.includes('vh1') ||
    text.includes('hit') ||
    text.includes('radio')
  ) {
    return 'Música';
  }

  if (sourceName === 'Colombia' || text.includes('colombia')) return 'Colombia';
  if (sourceName === 'México' || text.includes('méxico') || text.includes('mexico')) return 'México';
  if (sourceName === 'Argentina' || text.includes('argentina')) return 'Argentina';
  if (sourceName === 'España' || text.includes('españa') || text.includes('spain')) return 'España';

  return 'Entretenimiento';
}

export function parseM3UContent(content = '', sourceInfo = {}) {
  const lines = content.split(/\r?\n/);
  const channels = [];
  let current = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (line.startsWith('#EXTINF:')) {
      const logoMatch = line.match(/tvg-logo="([^"]*)"/i);
      const groupMatch = line.match(/group-title="([^"]*)"/i);
      const idMatch = line.match(/tvg-id="([^"]*)"/i);
      const countryMatch = line.match(/tvg-country="([^"]*)"/i);
      const userAgentMatch = line.match(/http-user-agent="([^"]*)"/i);
      const referrerMatch = line.match(/http-referrer="([^"]*)"/i);

      const commaIndex = line.lastIndexOf(',');
      const rawName = commaIndex !== -1 ? line.substring(commaIndex + 1).trim() : 'Canal sin nombre';
      const cleanName = rawName.replace(/\s*\[.*?\]|\s*\(.*?\)/g, '').trim() || rawName;

      // Detectar si el nombre menciona HEVC / H265 o baja compatibilidad
      const isHevcHint = /hevc|h\.?265/i.test(rawName);
      const resolutionMatch = rawName.match(/\b(4K|2160p|1080p|720p|576p|480p)\b/i);

      const rawCategory = groupMatch ? groupMatch[1].trim() : '';
      const countryCode = (countryMatch ? countryMatch[1].toLowerCase() : sourceInfo.country) || 'global';

      current = {
        id: idMatch ? idMatch[1] : `ch-${Math.random().toString(36).substring(2, 9)}`,
        name: cleanName,
        fullName: rawName,
        logo: logoMatch ? logoMatch[1] : null,
        rawCategory,
        country: countryCode,
        countryName: COUNTRY_NAMES[countryCode] || sourceInfo.name || 'Internacional',
        source: sourceInfo.name || 'M3U',
        quality: resolutionMatch ? resolutionMatch[1].toUpperCase() : 'HD',
        isHevcHint,
        userAgent: userAgentMatch ? userAgentMatch[1] : null,
        referrer: referrerMatch ? referrerMatch[1] : null,
        url: '',
      };
    } else if (line.startsWith('#EXTVLCOPT:') && current) {
      if (line.includes('http-user-agent=')) {
        current.userAgent = line.split('http-user-agent=')[1]?.trim() || current.userAgent;
      }
      if (line.includes('http-referrer=')) {
        current.referrer = line.split('http-referrer=')[1]?.trim() || current.referrer;
      }
    } else if (!line.startsWith('#') && current) {
      current.url = line;

      current.category = normalizeCategory(
        current.rawCategory,
        current.name,
        current.url,
        sourceInfo.name
      );

      if (!current.logo) {
        current.logo = `https://ui-avatars.com/api/?name=${encodeURIComponent(
          current.name
        )}&background=E50914&color=fff&size=128&bold=true`;
      }

      if (current.url.startsWith('http://') || current.url.startsWith('https://')) {
        channels.push(current);
      }
      current = null;
    }
  }

  return channels;
}

export async function fetchXtreamChannels({ server, username, password }) {
  if (!server || !username || !password) return [];

  const cleanServer = server.replace(/\/+$/, '');
  const apiUrl = `${cleanServer}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&action=get_live_streams`;

  try {
    const res = await axios.get(apiUrl, {
      timeout: 8000,
      headers: {
        'User-Agent': 'IPTVSmarters/2.2.1 (Windows NT 10.0; Win64; x64)',
      },
    });

    const streams = Array.isArray(res.data) ? res.data : [];
    return streams.map((s) => ({
      id: `xtream-${s.stream_id}`,
      name: s.name || `Canal ${s.stream_id}`,
      fullName: s.name || `Canal ${s.stream_id}`,
      logo: s.stream_icon || `https://ui-avatars.com/api/?name=${encodeURIComponent(s.name || 'XC')}&background=002BE7&color=fff&bold=true`,
      category: s.category_name ? normalizeCategory(s.category_name, s.name) : 'Xtream Privado',
      rawCategory: s.category_name || 'Xtream',
      country: 'custom',
      countryName: 'IPTV Privado',
      source: 'Xtream Codes',
      quality: 'HD',
      url: `${cleanServer}/live/${username}/${password}/${s.stream_id}.m3u8`,
    }));
  } catch (err) {
    console.warn('[Xtream Codes Parser Error]:', err.message);
    return [];
  }
}

export async function getAggregatedChannels(options = {}) {
  const {
    forceRefresh = false,
    customUrls = [],
    xtream = null,
  } = options;

  const now = Date.now();

  let baseChannels = [];
  if (!forceRefresh && aggregatedCache && now - lastCacheTime < CACHE_TTL) {
    baseChannels = aggregatedCache;
  } else {
    console.log('[IPTV Aggregator] Descargando y fusionando fuentes M3U en paralelo...');

    const fetchPromises = DEFAULT_M3U_SOURCES.map(async (src) => {
      try {
        const res = await axios.get(src.url, {
          timeout: 9000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          },
        });
        return parseM3UContent(res.data, src);
      } catch (err) {
        console.warn(`[IPTV Aggregator] Fuente omitida (${src.name}):`, err.message);
        return [];
      }
    });

    const results = await Promise.allSettled(fetchPromises);

    const seenUrls = new Set();
    const merged = [];

    for (const res of results) {
      if (res.status === 'fulfilled' && Array.isArray(res.value)) {
        for (const channel of res.value) {
          const normUrl = channel.url.toLowerCase().trim();
          if (!seenUrls.has(normUrl)) {
            seenUrls.add(normUrl);
            merged.push(channel);
          }
        }
      }
    }

    // Priorizar canales no-HEVC primero para evitar pantallas negras por defecto
    merged.sort((a, b) => Number(Boolean(a.isHevcHint)) - Number(Boolean(b.isHevcHint)));

    aggregatedCache = merged;
    lastCacheTime = now;
    baseChannels = merged;
    console.log(`[IPTV Aggregator] Fusión completada: ${baseChannels.length} canales únicos listos.`);
  }

  let customChannels = [];

  if (Array.isArray(customUrls) && customUrls.length > 0) {
    const customPromises = customUrls.filter(Boolean).map(async (url) => {
      try {
        const res = await axios.get(url, {
          timeout: 8000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          },
        });
        return parseM3UContent(res.data, { name: 'Lista Personalizada', country: 'custom' });
      } catch (e) {
        console.warn(`[IPTV Custom M3U Error] ${url}:`, e.message);
        return [];
      }
    });

    const customResults = await Promise.allSettled(customPromises);
    for (const r of customResults) {
      if (r.status === 'fulfilled' && Array.isArray(r.value)) {
        customChannels.push(...r.value);
      }
    }
  }

  if (xtream?.server && xtream?.username && xtream?.password) {
    const xtreamList = await fetchXtreamChannels(xtream);
    customChannels.push(...xtreamList);
  }

  let finalChannels = baseChannels;
  if (customChannels.length > 0) {
    const seen = new Set(customChannels.map((c) => c.url.toLowerCase().trim()));
    const remainingBase = baseChannels.filter((c) => !seen.has(c.url.toLowerCase().trim()));
    finalChannels = [...customChannels, ...remainingBase];
  }

  return finalChannels;
}

/**
 * Proxy Inteligente de Streaming HLS/M3U8 y Segmentos TS/fMP4
 * Soluciona el bug de "Audio se reproduce pero pantalla negra" causado por:
 * 1. Sub-playlists de video sin extensión .m3u8 explícita que antes no se reescribían.
 * 2. Segmentos de inicialización #EXT-X-MAP:URI="..." y pistas separadas de video/audio.
 * 3. Cabeceras Origin/Referer requeridas por CDNs de Pluto TV, Akamai y Cloudfront.
 */
export async function proxyStream(streamUrl, req, res) {
  try {
    const parsedTarget = new URL(streamUrl);
    const originHeader = `${parsedTarget.protocol}//${parsedTarget.host}`;

    // Detectar si es claramente un segmento binario (.ts, .m4s, .aac, .mp4, .cmfv, .cmfa, .key)
    const pathnameLower = parsedTarget.pathname.toLowerCase();
    const isBinarySegment = /\.(ts|m4s|mp4|aac|cmfv|cmfa|mp3|key|vtt)$/i.test(pathnameLower);

    const response = await axios({
      method: 'get',
      url: streamUrl,
      responseType: isBinarySegment ? 'stream' : 'arraybuffer',
      timeout: 14000,
      maxRedirects: 5,
      headers: {
        'User-Agent':
          req.query.ua ||
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Referer: req.query.ref || `${originHeader}/`,
        Origin: originHeader,
        Accept: '*/*',
      },
    });

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

    const contentType = (response.headers['content-type'] || '').toLowerCase();

    // Si se descargó como stream binario directo, hacer pipe inmediato
    if (isBinarySegment) {
      if (contentType) res.setHeader('Content-Type', contentType);
      else if (pathnameLower.endsWith('.ts')) res.setHeader('Content-Type', 'video/mp2t');
      else if (pathnameLower.endsWith('.m4s') || pathnameLower.endsWith('.mp4')) res.setHeader('Content-Type', 'video/iso.segment');

      req.on('close', () => {
        if (response.data && typeof response.data.destroy === 'function') {
          response.data.destroy();
        }
      });
      return response.data.pipe(res);
    }

    // Convertir el buffer a texto para verificar si es un manifiesto #EXTM3U (incluso si la URL no terminaba en .m3u8)
    const buffer = Buffer.from(response.data);
    const firstBytes = buffer.subarray(0, 64).toString('utf8').trimStart();
    const isManifest =
      firstBytes.startsWith('#EXTM3U') ||
      contentType.includes('mpegurl') ||
      pathnameLower.endsWith('.m3u8') ||
      pathnameLower.endsWith('.m3u');

    if (isManifest) {
      const manifestText = buffer.toString('utf8');
      const finalUrl = response.request?.res?.responseUrl || streamUrl;
      const baseUrlObj = new URL(finalUrl);

      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');

      // Función auxiliar para resolver cualquier URI relativa o absoluta preservando tokens de sesión
      const toProxiedUrl = (rawUri) => {
        try {
          const resolved = new URL(rawUri.trim(), baseUrlObj).href;
          return `/api/iptv/proxy?url=${encodeURIComponent(resolved)}`;
        } catch {
          return rawUri;
        }
      };

      // 1. Reescribir cualquier atributo URI="..." (en #EXT-X-MEDIA, #EXT-X-KEY, #EXT-X-MAP, #EXT-X-I-FRAME-STREAM-INF)
      let rewritten = manifestText.replace(/URI="([^"]+)"/gi, (_, uri) => {
        return `URI="${toProxiedUrl(uri)}"`;
      });

      // 2. Reescribir líneas de variantes y segmentos
      const lines = rewritten.split(/\r?\n/);
      const modifiedLines = lines.map((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return line;
        return toProxiedUrl(trimmed);
      });

      return res.send(modifiedLines.join('\n'));
    }

    // Si no era manifiesto sino un segmento binario sin extensión estándar
    if (contentType) {
      res.setHeader('Content-Type', contentType);
    } else {
      res.setHeader('Content-Type', 'video/mp2t');
    }
    return res.send(buffer);
  } catch (err) {
    console.error(`[IPTV Proxy Error]:`, err.message);
    if (!res.headersSent) {
      res.status(502).json({ error: 'Error transmitiendo canal IPTV', details: err.message });
    }
  }
}

export const iptvService = {
  DEFAULT_M3U_SOURCES,
  COUNTRY_NAMES,
  getChannels: getAggregatedChannels,
  fetchXtreamChannels,
  proxyStream,
};

export default iptvService;
