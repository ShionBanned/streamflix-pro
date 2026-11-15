import axios from 'axios';

// -------------------------------------------------------------
// 1. Fuentes Oficiales Públicas y Canales FAST 24/7
// -------------------------------------------------------------
export const DEFAULT_M3U_SOURCES = [
  // 1. Todos los canales en idioma Español a nivel mundial (+1,500 canales)
  { name: 'Español Global', url: 'https://iptv-org.github.io/iptv/languages/spa.m3u', country: 'es-global' },
  // 2. Países clave de habla hispana y deportes
  { name: 'Colombia', url: 'https://iptv-org.github.io/iptv/countries/co.m3u', country: 'co' },
  { name: 'México', url: 'https://iptv-org.github.io/iptv/countries/mx.m3u', country: 'mx' },
  { name: 'Argentina', url: 'https://iptv-org.github.io/iptv/countries/ar.m3u', country: 'ar' },
  { name: 'España', url: 'https://iptv-org.github.io/iptv/countries/es.m3u', country: 'es' },
  { name: 'USA', url: 'https://iptv-org.github.io/iptv/countries/us.m3u', country: 'us' },
  // 3. Categorías globales clave (Deportes, Cine, Música, Animación)
  { name: 'Deportes', url: 'https://iptv-org.github.io/iptv/categories/sports.m3u', country: 'global' },
  { name: 'Películas', url: 'https://iptv-org.github.io/iptv/categories/movies.m3u', country: 'global' },
  { name: 'Animación', url: 'https://iptv-org.github.io/iptv/categories/animation.m3u', country: 'global' },
  // 4. Canales FAST 24/7 de Pluto TV (Español / Latam)
  { name: 'Pluto TV', url: 'https://raw.githubusercontent.com/HelmerLuzo/PlutoTV_HL/main/tv/m3u/PlutoTV_tv_es.m3u', country: 'latam' },
];

// Países mapeados para filtros rápidos
export const COUNTRY_NAMES = {
  co: 'Colombia',
  mx: 'México',
  ar: 'Argentina',
  es: 'España',
  us: 'Estados Unidos',
  latam: 'Latinoamérica',
  'es-global': 'Internacional',
};

// -------------------------------------------------------------
// 2. Caché en Memoria con TTL de 30 minutos
// -------------------------------------------------------------
let aggregatedCache = null;
let lastCacheTime = 0;
const CACHE_TTL = 30 * 60 * 1000; // 30 minutos

/**
 * Normaliza las categorías del tag group-title o metadatos a categorías limpias en español
 */
export function normalizeCategory(rawGroup = '', channelName = '', channelUrl = '', sourceName = '') {
  const text = `${rawGroup} ${channelName} ${channelUrl} ${sourceName}`.toLowerCase();

  // 1. Canales Pluto TV 24/7
  if (
    text.includes('pluto.tv') ||
    text.includes('jmp2.uk/plu-') ||
    text.includes('plutotv') ||
    sourceName === 'Pluto TV'
  ) {
    return 'Pluto TV 24/7';
  }

  // 2. Deportes
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

  // 3. Películas y Series
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

  // 4. Noticias
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

  // 5. Infantil y Anime
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

  // 6. Música
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

  // 7. Países específicos si vienen de sus listas dedicadas
  if (sourceName === 'Colombia' || text.includes('colombia')) return 'Colombia';
  if (sourceName === 'México' || text.includes('méxico') || text.includes('mexico')) return 'México';
  if (sourceName === 'Argentina' || text.includes('argentina')) return 'Argentina';
  if (sourceName === 'España' || text.includes('españa') || text.includes('spain')) return 'España';

  // 8. Entretenimiento general
  return 'Entretenimiento';
}

/**
 * Parsea el texto M3U/M3U8 extrayendo metadatos limpios
 */
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

      const commaIndex = line.lastIndexOf(',');
      const rawName = commaIndex !== -1 ? line.substring(commaIndex + 1).trim() : 'Canal sin nombre';
      const cleanName = rawName.replace(/\s*\[.*?\]|\s*\(.*?\)/g, '').trim() || rawName;

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
        url: '',
      };
    } else if (!line.startsWith('#') && current) {
      current.url = line;

      // Normalizar categoría
      current.category = normalizeCategory(
        current.rawCategory,
        current.name,
        current.url,
        sourceInfo.name
      );

      // Logo fallback elegante
      if (!current.logo) {
        current.logo = `https://ui-avatars.com/api/?name=${encodeURIComponent(
          current.name
        )}&background=E50914&color=fff&size=128&bold=true`;
      }

      // Validar que sea un enlace HTTP/HTTPS
      if (current.url.startsWith('http://') || current.url.startsWith('https://')) {
        channels.push(current);
      }
      current = null;
    }
  }

  return channels;
}

/**
 * Consulta la API estándar de Xtream Codes y la convierte a canales compatibles
 */
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
      url: `${cleanServer}/live/${username}/${password}/${s.stream_id}.m3u8`,
    }));
  } catch (err) {
    console.warn('[Xtream Codes Parser Error]:', err.message);
    return [];
  }
}

/**
 * Agregador Multi-Fuente: Descarga en paralelo y fusiona todas las fuentes M3U
 */
export async function getAggregatedChannels(options = {}) {
  const {
    forceRefresh = false,
    customUrls = [],
    xtream = null,
  } = options;

  const now = Date.now();

  // 1. Verificar si el catálogo base en memoria sigue fresco
  let baseChannels = [];
  if (!forceRefresh && aggregatedCache && now - lastCacheTime < CACHE_TTL) {
    baseChannels = aggregatedCache;
  } else {
    console.log('[IPTV Aggregator] Descargando y fusionando fuentes M3U en paralelo...');

    // Descarga en paralelo con axios y Promise.allSettled
    const fetchPromises = DEFAULT_M3U_SOURCES.map(async (src) => {
      try {
        const res = await axios.get(src.url, {
          timeout: 9000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          },
        });
        return parseM3UContent(res.data, src);
      } catch (err) {
        console.warn(`[IPTV Aggregator] Fuente omitida o no disponible (${src.name}):`, err.message);
        return [];
      }
    });

    const results = await Promise.allSettled(fetchPromises);

    // Fusión y deduplicación por URL de streaming
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

    aggregatedCache = merged;
    lastCacheTime = now;
    baseChannels = merged;
    console.log(`[IPTV Aggregator] Fusión completada: ${baseChannels.length} canales únicos listos en memoria.`);
  }

  // 2. Procesar listas personalizadas del usuario si existen
  let customChannels = [];

  // M3U externos adicionales
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

  // Canales Xtream Codes
  if (xtream?.server && xtream?.username && xtream?.password) {
    const xtreamList = await fetchXtreamChannels(xtream);
    customChannels.push(...xtreamList);
  }

  // Si hay canales personalizados, colocarlos arriba con prioridad
  let finalChannels = baseChannels;
  if (customChannels.length > 0) {
    const seen = new Set(customChannels.map((c) => c.url.toLowerCase().trim()));
    const remainingBase = baseChannels.filter((c) => !seen.has(c.url.toLowerCase().trim()));
    finalChannels = [...customChannels, ...remainingBase];
  }

  return finalChannels;
}

/**
 * Proxy de streaming para evitar bloqueos CORS y cabeceras estrictas en navegadores
 */
export async function proxyStream(streamUrl, req, res) {
  try {
    const isM3U8 = streamUrl.includes('.m3u8') || streamUrl.includes('m3u');

    const response = await axios({
      method: 'get',
      url: streamUrl,
      responseType: isM3U8 ? 'text' : 'stream',
      timeout: 12000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Referer: streamUrl,
      },
    });

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');

    const contentType = response.headers['content-type'] || '';

    // Si es un playlist M3U8, reescribir URIs relativas y absolutas para que pasen por el proxy
    if (typeof response.data === 'string' && (response.data.includes('#EXTM3U') || contentType.includes('mpegurl') || isM3U8)) {
      const finalUrl = response.request?.res?.responseUrl || streamUrl;
      const baseUrl = finalUrl.substring(0, finalUrl.lastIndexOf('/') + 1);

      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');

      // Reescribir líneas de segmentos y atributos URI="..."
      let rewritten = response.data;

      // 1. Reescribir URI="..." en #EXT-X-MEDIA y llaves
      rewritten = rewritten.replace(/URI="([^"]+)"/g, (match, uri) => {
        const absoluteUri = uri.startsWith('http') ? uri : new URL(uri, baseUrl).href;
        return `URI="/api/iptv/proxy?url=${encodeURIComponent(absoluteUri)}"`;
      });

      // 2. Reescribir líneas de segmentos y sub-playlists
      const lines = rewritten.split(/\r?\n/);
      const modifiedLines = lines.map((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return line;
        const absoluteUri = trimmed.startsWith('http') ? trimmed : new URL(trimmed, baseUrl).href;
        return `/api/iptv/proxy?url=${encodeURIComponent(absoluteUri)}`;
      });

      return res.send(modifiedLines.join('\n'));
    }

    // Para segmentos binarios (.ts, .aac, .m4s, etc.)
    if (contentType) {
      res.setHeader('Content-Type', contentType);
    }

    req.on('close', () => {
      if (response.data && typeof response.data.destroy === 'function') {
        response.data.destroy();
      }
    });

    response.data.pipe(res);
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
