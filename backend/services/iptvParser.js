import { pipeline } from 'node:stream/promises';
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
  const controller = new AbortController(); let upstream;
  const stop = () => { controller.abort(); upstream?.destroy(); };
  res.once('close', stop); req.once('aborted', stop);
  try {
    const target = new URL(streamUrl);
    if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password) return res.status(400).json({ error: 'Se requiere una URL HTTP o HTTPS de medios' });
    const response = await axios({ method: req.method === 'HEAD' ? 'head' : 'get', url: target.href, responseType: 'stream', timeout: 14000, maxRedirects: 5, signal: controller.signal,
      validateStatus: status => status >= 200 && status < 300 || status === 416,
      headers: { 'User-Agent': req.query.ua || 'StreamFlix/5.2', Referer: req.query.ref || target.origin + '/', Origin: target.origin, Accept: '*/*', 'Accept-Encoding': 'identity', ...(req.headers.range ? { Range: req.headers.range } : {}) },
    });
    upstream = response.data;
    res.setHeader('Cache-Control', 'no-store');
    const contentType = response.headers['content-type'] || 'application/octet-stream';
    if (response.status === 416 || req.method === 'HEAD') {
      for (const header of ['content-type', 'content-length', 'content-range', 'accept-ranges']) if (response.headers[header]) res.setHeader(header, response.headers[header]);
      upstream.destroy(); return res.status(response.status).end();
    }
    const first = await new Promise((resolve, reject) => {
      upstream.once('data', chunk => { upstream.pause(); resolve(chunk); });
      upstream.once('end', () => resolve(Buffer.alloc(0))); upstream.once('error', reject);
    });
    const isManifest = /mpegurl/i.test(contentType) || first.subarray(0, 64).toString('utf8').trimStart().startsWith('#EXTM3U');
    if (isManifest) {
      let size = first.length; const chunks = [first];
      for await (const chunk of upstream) { size += chunk.length; if (size > 2 * 1024 * 1024) throw new Error('Manifiesto demasiado grande'); chunks.push(chunk); }
      if (size > 2 * 1024 * 1024) throw new Error('Manifiesto demasiado grande');
      const finalUrl = response.request?.res?.responseUrl || target.href;
      const proxied = value => {
        const resolved = new URL(value.trim(), finalUrl); if (!['http:', 'https:'].includes(resolved.protocol)) throw new Error('URI no admitida');
        const params = new URLSearchParams({ url: resolved.href });
        if (req.query.ref) params.set('ref', req.query.ref); if (req.query.ua) params.set('ua', req.query.ua);
        return '/api/iptv/proxy?' + params;
      };
      const result = Buffer.concat(chunks).toString('utf8').split(/\r?\n/).map(line => !line.trim() ? line : line.startsWith('#') ? line.replace(/\bURI="([^"]+)"/g, (_, value) => 'URI="' + proxied(value) + '"') : proxied(line)).join('\n');
      return res.type('application/vnd.apple.mpegurl').send(result);
    }
    if (/text\/html|application\/(json|xhtml)/i.test(contentType)) throw new Error('El servidor devolvió una página de error en lugar de video');
    res.status(response.status).type(contentType);
    for (const header of ['content-length', 'content-range', 'accept-ranges']) if (response.headers[header]) res.setHeader(header, response.headers[header]);
    res.write(first); await pipeline(upstream, res);
  } catch (error) {
    upstream?.destroy();
    if (res.destroyed || req.aborted) return;
    if (!res.headersSent) res.status([403, 404, 410, 429, 416].includes(error.response?.status) ? error.response.status : 502).json({ error: 'La fuente no respondió o no entregó un archivo multimedia' });
    else res.destroy();
  } finally { res.off('close', stop); req.off('aborted', stop); }
}

export const iptvService = {
  DEFAULT_M3U_SOURCES,
  COUNTRY_NAMES,
  getChannels: getAggregatedChannels,
  fetchXtreamChannels,
  proxyStream,
};

export default iptvService;
