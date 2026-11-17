import { pipeline } from 'node:stream/promises';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import axios from 'axios';
import { IPTV_CACHE_FILE as DISK_CACHE_FILE } from '../config/paths.js';

// Agentes HTTP/HTTPS con Keep-Alive para acelerar descargas M3U y proxy de segmentos HLS/TS
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 64, timeout: 10000 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 64, timeout: 10000 });

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

// Ruta centralizada en DATA_DIR (paths.js)
const CACHE_TTL = 20 * 60 * 1000; // 20 minutos de frescura en memoria
const DISK_CACHE_MAX_AGE = 24 * 60 * 60 * 1000; // Hasta 24h válido para arranque instantáneo SWR
const SOURCE_FETCH_TIMEOUT = 6500; // Reducido de 15s a 6.5s para que ninguna lista lenta bloquee

let aggregatedCache = null; // Canales base ya deduplicados y agrupados por groupDuplicateChannels
let lastCacheTime = 0;
let refreshInFlight = null;
let diskCacheLoaded = false;
let diskCacheWrite = Promise.resolve();
const sourceChannelCache = new Map();
const manifestProxyCache = new Map(); // Caché ultrarrápida de manifiestos HLS reescritos (TTL 2s)

export function normalizeCategory(rawGroup = '', channelName = '', channelUrl = '', sourceName = '') {
  const text = `${rawGroup} ${channelName} ${channelUrl} ${sourceName}`.toLowerCase();

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
    /24\s*\/?\s*7|forensic|misterios|naturaleza|wildlife|animal|cartoonito|nick jr/i.test(
      `${rawGroup} ${channelName}`
    ) &&
    !/not 24\s*\/?\s*7/i.test(channelName)
  ) {
    return 'Temáticos 24/7';
  }

  if (
    /kids|infantil|anime|animation|animaci[oó]n|cartoon|nickelodeon|discovery kids|toons/i.test(
      `${rawGroup} ${channelName}`
    )
  ) {
    return 'Infantil y Anime';
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

  if (
    text.includes('pluto.tv') ||
    text.includes('jmp2.uk/plu-') ||
    text.includes('plutotv') ||
    sourceName === 'Pluto TV'
  ) {
    return 'Pluto TV 24/7';
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
      const idCountry = /\.([a-z]{2})(?:@|$)/i.exec(idMatch?.[1] || '')?.[1]?.toLowerCase();
      const countryCode =
        countryMatch?.[1].split(/[;,]/)[0].toLowerCase() || idCountry || sourceInfo.country || 'global';

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
        isGeoBlocked: /geo-blocked/i.test(rawName),
        isLimitedSchedule: /not 24\/7/i.test(rawName),
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

export function groupDuplicateChannels(channels) {
  const grouped = new Map();
  for (const channel of channels) {
    if (!channel?.url || !channel?.name) continue;
    const name = channel.name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\b(?:4k|2160p|1080p|720p|576p|480p|fhd|uhd|hd|sd|hevc|h265|opci[oó]n\s*\d+|opc\s*\d+)\b/gi, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
    const id = String(channel.id || '').replace(/@(?:HD|SD|FHD|UHD|4K|\d+p)$/i, '').toLowerCase();
    const identity = id && !id.startsWith('ch-') ? `id:${id}` : `name:${name}`;
    const key = `${channel.country || ''}:${channel.category || ''}:${identity}`;
    if (!name) continue;
    if (!grouped.has(key)) grouped.set(key, { ...channel, sources: [] });
    const entry = grouped.get(key);
    const existingSources = Array.isArray(channel.sources) && channel.sources.length
      ? channel.sources
      : [
          {
            url: channel.url,
            quality: channel.quality || 'Auto',
            source: channel.source || 'M3U',
            userAgent: channel.userAgent || null,
            referrer: channel.referrer || null,
            isHevcHint: Boolean(channel.isHevcHint),
          },
        ];
    for (const src of existingSources) {
      if (src?.url && !entry.sources.some((s) => s.url === src.url)) {
        entry.sources.push({
          url: src.url,
          quality: src.quality || 'Auto',
          source: src.source || 'M3U',
          userAgent: src.userAgent || null,
          referrer: src.referrer || null,
          isHevcHint: Boolean(src.isHevcHint),
        });
      }
    }
    if ((!entry.logo || entry.logo.includes('ui-avatars.com')) && channel.logo) {
      entry.logo = channel.logo;
    }
  }
  return [...grouped.values()].map((channel) => {
    channel.sources.sort((a, b) => Number(a.isHevcHint) - Number(b.isHevcHint));
    channel.url = channel.sources[0].url;
    channel.isHevcHint = channel.sources[0].isHevcHint;
    return channel;
  });
}

async function loadDiskCacheIfAvailable() {
  if (diskCacheLoaded) return;
  diskCacheLoaded = true;
  try {
    const raw = await fs.readFile(DISK_CACHE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (
      Array.isArray(parsed?.channels) &&
      parsed.channels.length > 0 &&
      Date.now() - (parsed.updatedAt || 0) < DISK_CACHE_MAX_AGE
    ) {
      aggregatedCache = parsed.channels;
      lastCacheTime = parsed.updatedAt || Date.now() - CACHE_TTL + 60_000;
    }
  } catch {
    // Sin caché previo en disco
  }
}

async function saveDiskCache(channels, updatedAt) {
  diskCacheWrite = diskCacheWrite.catch(() => {}).then(async () => {
    await fs.mkdir(path.dirname(DISK_CACHE_FILE), { recursive: true });
    const tmp = `${DISK_CACHE_FILE}.tmp`;
    await fs.writeFile(tmp, JSON.stringify({ updatedAt, channels }), 'utf8');
    await fs.rename(tmp, DISK_CACHE_FILE);
  });
  try { await diskCacheWrite; } catch { /* La caché se reconstruye desde las listas. */ }
}

function rebuildAggregatedCache(now = Date.now(), isComplete = false) {
  const seenUrls = new Set();
  const merged = [];
  for (const src of DEFAULT_M3U_SOURCES) {
    const entry = sourceChannelCache.get(src.url);
    if (entry && Array.isArray(entry.channels)) {
      for (const channel of entry.channels) {
        const normUrl = channel.url.toLowerCase().trim();
        if (!seenUrls.has(normUrl)) {
          seenUrls.add(normUrl);
          merged.push(channel);
        }
      }
    }
  }
  if (merged.length > 0) {
    merged.sort((a, b) => Number(Boolean(a.isHevcHint)) - Number(Boolean(b.isHevcHint)));
    const groupedBase = groupDuplicateChannels(merged);
    aggregatedCache = groupedBase;
    lastCacheTime = isComplete ? now : now - CACHE_TTL + 60_000;
    if (isComplete || groupedBase.length >= 80) {
      void saveDiskCache(groupedBase, lastCacheTime);
    }
  }
  return aggregatedCache || [];
}

async function refreshBaseChannelsInBackground(forceRefresh = false) {
  if (refreshInFlight && !forceRefresh) return refreshInFlight;

  let resolveFirstWave;
  const firstWavePromise = new Promise((resolve) => {
    resolveFirstWave = resolve;
  });
  let settledCount = 0;
  let firstWaveResolved = false;

  const task = (async () => {
    const now = Date.now();
    const fetchPromises = DEFAULT_M3U_SOURCES.map(async (src) => {
      const saved = sourceChannelCache.get(src.url);
      if (!forceRefresh && saved && now - saved.at < CACHE_TTL) {
        settledCount++;
        if (!firstWaveResolved && settledCount >= 2 && aggregatedCache?.length) {
          firstWaveResolved = true;
          resolveFirstWave(aggregatedCache);
        }
        return saved.channels;
      }
      try {
        const res = await axios.get(src.url, {
          timeout: SOURCE_FETCH_TIMEOUT,
          httpAgent,
          httpsAgent,
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          },
        });
        const parsed = parseM3UContent(res.data, src);
        if (!parsed.length) throw new Error('Lista sin canales');
        sourceChannelCache.set(src.url, { channels: parsed, at: now });
        // Actualizar caché incrementalmente apenas llega una lista rápida (ej. Colombia o Español)
        const partial = rebuildAggregatedCache(now, false);
        if (!firstWaveResolved && partial.length >= 30) {
          firstWaveResolved = true;
          resolveFirstWave(partial);
        }
        return parsed;
      } catch (err) {
        console.warn(`[IPTV Aggregator] Fuente omitida (${src.name}):`, err.message);
        return saved?.channels || [];
      } finally {
        settledCount++;
        if (!firstWaveResolved && settledCount >= DEFAULT_M3U_SOURCES.length) {
          firstWaveResolved = true;
          resolveFirstWave(aggregatedCache || []);
        }
      }
    });

    await Promise.allSettled(fetchPromises);
    const finalGrouped = rebuildAggregatedCache(
      now,
      sourceChannelCache.size === DEFAULT_M3U_SOURCES.length
    );
    if (!firstWaveResolved) {
      firstWaveResolved = true;
      resolveFirstWave(finalGrouped);
    }
    console.log(
      `[IPTV Aggregator] Fusión y agrupación completada: ${finalGrouped.length} canales únicos listos.`
    );
    return finalGrouped;
  })();

  refreshInFlight = task.finally(() => {
    if (refreshInFlight === task) refreshInFlight = null;
  });

  // Si aún no hay caché en memoria/disco, resolver en cuanto llegue la primera oleada (<= 1.2s) sin esperar a las 9 listas
  if (!forceRefresh) {
    return Promise.race([
      firstWavePromise,
      new Promise((resolve) => setTimeout(() => resolve(aggregatedCache || []), 1800)),
    ]).then((wave) => (wave && wave.length > 0 ? wave : task));
  }
  return refreshInFlight;
}

export async function prewarmChannels() {
  await loadDiskCacheIfAvailable();
  const now = Date.now();
  if (!aggregatedCache || now - lastCacheTime >= CACHE_TTL) {
    void refreshBaseChannelsInBackground(false);
  }
}

export async function fetchXtreamChannels({ server, username, password }) {
  if (!server || !username || !password) return [];

  const cleanServer = server.replace(/\/+$/, '');
  const apiUrl = `${cleanServer}/player_api.php?username=${encodeURIComponent(
    username
  )}&password=${encodeURIComponent(password)}&action=get_live_streams`;

  try {
    const res = await axios.get(apiUrl, {
      timeout: 7000,
      httpAgent,
      httpsAgent,
      headers: {
        'User-Agent': 'IPTVSmarters/2.2.1 (Windows NT 10.0; Win64; x64)',
      },
    });

    const streams = Array.isArray(res.data) ? res.data : [];
    return streams.map((s) => ({
      id: `xtream-${s.stream_id}`,
      name: s.name || `Canal ${s.stream_id}`,
      fullName: s.name || `Canal ${s.stream_id}`,
      logo:
        s.stream_icon ||
        `https://ui-avatars.com/api/?name=${encodeURIComponent(
          s.name || 'XC'
        )}&background=002BE7&color=fff&bold=true`,
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
  const { forceRefresh = false, customUrls = [], xtream = null } = options;

  await loadDiskCacheIfAvailable();
  const now = Date.now();

  let baseChannels;
  if (!forceRefresh && aggregatedCache && aggregatedCache.length > 0) {
    // Stale-While-Revalidate (SWR): devolver en 0ms y actualizar en segundo plano si expiró
    baseChannels = aggregatedCache;
    if (now - lastCacheTime >= CACHE_TTL) {
      void refreshBaseChannelsInBackground(false);
    }
  } else {
    baseChannels = await refreshBaseChannelsInBackground(forceRefresh);
  }

  let customChannels = [];

  if (Array.isArray(customUrls) && customUrls.length > 0) {
    const customPromises = customUrls.filter(Boolean).map(async (url) => {
      try {
        const res = await axios.get(url, {
          timeout: 6500,
          httpAgent,
          httpsAgent,
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

  if (customChannels.length === 0) {
    // baseChannels ya está agrupado y deduplicado en caché, retorno instantáneo
    return baseChannels;
  }

  const seen = new Set(customChannels.map((c) => c.url.toLowerCase().trim()));
  const remainingBase = baseChannels.filter((c) => !seen.has(c.url.toLowerCase().trim()));
  return groupDuplicateChannels([...customChannels, ...remainingBase]);
}

/**
 * Proxy Inteligente de Streaming HLS/M3U8 y Segmentos TS/fMP4 con Keep-Alive y caché corta de manifiesto
 */
export async function proxyStream(streamUrl, req, res) {
  const controller = new AbortController();
  let upstream;
  const stop = () => {
    controller.abort();
    upstream?.destroy();
  };
  res.once('close', stop);
  req.once('aborted', stop);
  try {
    const target = new URL(streamUrl);
    if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password) {
      return res.status(400).json({ error: 'Se requiere una URL HTTP o HTTPS de medios' });
    }

    // Si es una petición GET sin rango a un manifiesto .m3u8 conocido en caché (< 1.8s), responder al instante
    const cacheKey = `${target.href}|${req.query?.ref || ''}|${req.query?.ua || ''}`;
    if (req.method === 'GET' && !req.headers.range) {
      const cachedManifest = manifestProxyCache.get(cacheKey);
      if (cachedManifest && Date.now() - cachedManifest.at < 1800) {
        res.setHeader('Cache-Control', 'no-store');
        return res.type('application/vnd.apple.mpegurl').send(cachedManifest.body);
      }
    }

    const response = await axios({
      method: req.method === 'HEAD' ? 'head' : 'get',
      url: target.href,
      responseType: 'stream',
      timeout: 9000,
      maxRedirects: 5,
      httpAgent,
      httpsAgent,
      signal: controller.signal,
      validateStatus: (status) => (status >= 200 && status < 300) || status === 416,
      headers: {
        'User-Agent': req.query.ua || 'StreamFlix/5.3',
        Referer: req.query.ref || target.origin + '/',
        Origin: target.origin,
        Accept: '*/*',
        'Accept-Encoding': 'identity',
        ...(req.headers.range ? { Range: req.headers.range } : {}),
      },
    });
    upstream = response.data;
    res.setHeader('Cache-Control', 'no-store');
    const contentType = response.headers['content-type'] || 'application/octet-stream';
    if (response.status === 416 || req.method === 'HEAD') {
      for (const header of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
        if (response.headers[header]) res.setHeader(header, response.headers[header]);
      }
      upstream.destroy();
      return res.status(response.status).end();
    }
    const first = await new Promise((resolve, reject) => {
      upstream.once('data', (chunk) => {
        upstream.pause();
        resolve(chunk);
      });
      upstream.once('end', () => resolve(Buffer.alloc(0)));
      upstream.once('error', reject);
    });
    const isManifest =
      /mpegurl/i.test(contentType) ||
      first.subarray(0, 64).toString('utf8').trimStart().startsWith('#EXTM3U');
    if (isManifest) {
      let size = first.length;
      const chunks = [first];
      for await (const chunk of upstream) {
        size += chunk.length;
        if (size > 2 * 1024 * 1024) throw new Error('Manifiesto demasiado grande');
        chunks.push(chunk);
      }
      if (size > 2 * 1024 * 1024) throw new Error('Manifiesto demasiado grande');
      const finalUrl = response.request?.res?.responseUrl || target.href;
      const proxied = (value) => {
        const resolved = new URL(value.trim(), finalUrl);
        if (!['http:', 'https:'].includes(resolved.protocol)) throw new Error('URI no admitida');
        const params = new URLSearchParams({ url: resolved.href });
        if (req.query.ref) params.set('ref', req.query.ref);
        if (req.query.ua) params.set('ua', req.query.ua);
        return '/api/iptv/proxy?' + params;
      };
      const result = Buffer.concat(chunks)
        .toString('utf8')
        .split(/\r?\n/)
        .map((line) =>
          !line.trim()
            ? line
            : line.startsWith('#')
            ? line.replace(/\bURI="([^"]+)"/g, (_, value) => 'URI="' + proxied(value) + '"')
            : proxied(line)
        )
        .join('\n');
      if (manifestProxyCache.size >= 150) {
        manifestProxyCache.delete(manifestProxyCache.keys().next().value);
      }
      manifestProxyCache.set(cacheKey, { body: result, at: Date.now() });
      return res.type('application/vnd.apple.mpegurl').send(result);
    }
    if (/text\/html|application\/(json|xhtml)/i.test(contentType)) {
      throw new Error('El servidor devolvió una página de error en lugar de video');
    }
    res.status(response.status).type(contentType);
    for (const header of ['content-length', 'content-range', 'accept-ranges']) {
      if (response.headers[header]) res.setHeader(header, response.headers[header]);
    }
    res.write(first);
    await pipeline(upstream, res);
  } catch (error) {
    upstream?.destroy();
    if (res.destroyed || req.aborted) return;
    if (!res.headersSent) {
      res
        .status([403, 404, 410, 429, 416].includes(error.response?.status) ? error.response.status : 502)
        .json({ error: 'La fuente no respondió o no entregó un archivo multimedia' });
    } else {
      res.destroy();
    }
  } finally {
    res.off('close', stop);
    req.off('aborted', stop);
  }
}

export const iptvService = {
  DEFAULT_M3U_SOURCES,
  COUNTRY_NAMES,
  getChannels: getAggregatedChannels,
  prewarmChannels,
  fetchXtreamChannels,
  proxyStream,
};

export default iptvService;
