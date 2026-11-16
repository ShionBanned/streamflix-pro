const SOURCES = {
  cuevana: { hostnames: ['cuevana3w.pro', 'cuevana3t.pro'], path: /^\/(?:pelicula\/[a-z0-9-]+|serie\/[a-z0-9-]+\/episodio-\d+x\d+)\/?$/i },
  animeav1: { hostnames: ['animeav1.com'], path: /^\/media\/[a-z0-9-]+\/\d+\/?$/i },
};
const cache = new Map();
const searchCache = new Map();
const REQUEST_HEADERS = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36', Accept: 'text/html' };

export function validateSiteTitle(source, input) {
  const site = SOURCES[source];
  if (!site || typeof input !== 'string' || input.length > 500) throw new Error('Fuente o enlace no válido.');
  let url;
  try { url = new URL(input); } catch { throw new Error('Introduce una URL completa.'); }
  const path = source === 'cuevana' ? /^\/(?:pelicula|serie)\/[a-z0-9-]+\/?$/i : /^\/media\/[a-z0-9-]+\/?$/i;
  if (url.protocol !== 'https:' || !site.hostnames.includes(url.hostname) || url.port || url.username || url.password || !path.test(url.pathname)) throw new Error('La página del título no pertenece a esta fuente.');
  return `${url.origin}${url.pathname.replace(/\/$/, '')}`;
}

function titleFromPage(source, pageUrl) {
  const url = new URL(pageUrl);
  const path = source === 'cuevana' ? url.pathname.replace(/\/episodio-\d+x\d+\/?$/i, '') : url.pathname.replace(/\/\d+\/?$/, '');
  return validateSiteTitle(source, `${url.origin}${path}`);
}

async function readHtml(response) {
  if (!response.ok || response.status >= 300) throw new Error(`La página no respondió (HTTP ${response.status}).`);
  if (!(response.headers.get('content-type') || '').includes('text/html')) throw new Error('La fuente no devolvió una página HTML.');
  if (Number(response.headers.get('content-length')) > 1_000_000) throw new Error('La página es demasiado grande.');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('No se pudo leer la página.');
  const chunks = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 1_000_000) throw new Error('La página es demasiado grande.');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

function normalizedTitle(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function titleScore(query, candidate) {
  const a = normalizedTitle(query); const b = normalizedTitle(candidate);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const x = new Set(a.split(' ')); const y = new Set(b.split(' '));
  const common = [...x].filter(word => y.has(word)).length;
  return Math.round((common / new Set([...x, ...y]).size) * 90) / 100;
}

export function parseSiteSearchResults(source, html, query) {
  const candidates = []; const seen = new Set();
  if (source === 'cuevana') {
    const pattern = /<a\b[^>]*href="(https:\/\/cuevana3t\.pro\/(?:pelicula|serie)\/[a-z0-9-]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    for (const match of html.matchAll(pattern)) {
      const name = /class="item-detail"[^>]*>\s*<p>([^<]+)<\/p>/i.exec(match[2])?.[1];
      if (!name || seen.has(match[1])) continue;
      seen.add(match[1]);
      const year = /class="year[^>]*>\s*(\d{4})/i.exec(match[2])?.[1] || null;
      candidates.push({ title: decodeHtml(name.trim()), titleUrl: validateSiteTitle(source, match[1]), type: match[1].includes('/serie/') ? 'tv' : 'movie', year });
    }
  } else {
    const pattern = /<h3\b[^>]*>([^<]+)<\/h3>\s*<\/header>\s*<a\b[^>]*href="(\/media\/[a-z0-9-]+)"/gi;
    for (const match of html.matchAll(pattern)) {
      const titleUrl = validateSiteTitle(source, `https://animeav1.com${match[2]}`);
      if (seen.has(titleUrl)) continue;
      seen.add(titleUrl);
      candidates.push({ title: decodeHtml(match[1].trim()), titleUrl, type: 'anime', year: null });
    }
  }
  return candidates.map(candidate => ({ ...candidate, score: titleScore(query, candidate.title) })).sort((a, b) => b.score - a.score).slice(0, 20);
}

export async function searchSiteTitles(source, query, { fetchImpl = fetch } = {}) {
  if (!SOURCES[source] || typeof query !== 'string' || query.trim().length < 2 || query.length > 120) throw new Error('Escribe un título de 2 a 120 caracteres.');
  const key = `${source}:${normalizedTitle(query)}`;
  const cached = searchCache.get(key);
  if (cached && Date.now() - cached.at < 5 * 60_000) return cached.value;
  const base = source === 'cuevana' ? 'https://cuevana3t.pro/explorar?s=' : 'https://animeav1.com/catalogo?search=';
  const terms = normalizedTitle(query).split(' ').filter(word => word.length > 3 && !['para', 'the', 'with', 'from', 'temporada'].includes(word));
  const fallback = terms.sort((a, b) => b.length - a.length)[0];
  const searches = [query.trim(), fallback].filter((value, index, list) => value && list.indexOf(value) === index);
  let candidates = [];
  for (const term of searches) {
    const response = await fetchImpl(`${base}${encodeURIComponent(term)}`, { redirect: 'manual', signal: AbortSignal.timeout(10000), headers: REQUEST_HEADERS });
    if (response.status === 404) continue;
    const html = await readHtml(response);
    candidates = parseSiteSearchResults(source, html, query);
    if (candidates.length) break;
  }
  const value = { source, query: query.trim(), candidates, checkedAt: Date.now() };
  if (searchCache.size >= 50) searchCache.delete(searchCache.keys().next().value);
  searchCache.set(key, { at: Date.now(), value });
  return value;
}

export async function resolveSitePage(source, input, season, episode, { fetchImpl = fetch } = {}) {
  const titleUrl = validateSiteTitle(source, input);
  const s = Number(season); const e = Number(episode);
  if (!Number.isSafeInteger(s) || s < 1 || s > 100 || !Number.isSafeInteger(e) || e < 1 || e > 1000) throw new Error('Temporada o episodio inválido.');
  if (source === 'cuevana' && new URL(titleUrl).pathname.startsWith('/pelicula/')) return { titleUrl, pageUrl: titleUrl };
  if (source === 'animeav1' && s !== 1) throw new Error('AnimeAV1 cataloga otras temporadas como títulos separados. Busca y selecciona esa temporada.');
  const listingUrl = source === 'cuevana' ? `${titleUrl}/temporada-${s}` : titleUrl;
  const response = await fetchImpl(listingUrl, { redirect: 'manual', signal: AbortSignal.timeout(10000), headers: REQUEST_HEADERS });
  const html = await readHtml(response);
  const expectedPath = source === 'cuevana' ? `${new URL(titleUrl).pathname}/episodio-${s}x${e}` : `${new URL(titleUrl).pathname}/${e}`;
  const links = /href="(https:\/\/[^" ]+|\/media\/[a-z0-9-]+\/\d+)"/gi;
  for (const match of html.matchAll(links)) {
    let link;
    try { link = validateSitePage(source, new URL(decodeHtml(match[1]), listingUrl).href); } catch { continue; }
    if (new URL(link).pathname === expectedPath) return { titleUrl, pageUrl: link };
  }
  throw new Error('Este episodio no aparece en la página seleccionada.');
}

export async function getResolvedSiteServers(source, input, season, episode, options = {}) {
  const { titleUrl, pageUrl } = await resolveSitePage(source, input, season, episode, options);
  return { ...await getSiteServers(source, pageUrl, options), titleUrl };
}

export function validateSitePage(source, input) {
  const site = SOURCES[source];
  if (!site || typeof input !== 'string' || input.length > 500) throw new Error('Fuente o enlace no válido.');
  let url;
  try { url = new URL(input); } catch { throw new Error('Introduce la URL completa de la página del título.'); }
  if (url.protocol !== 'https:' || !site.hostnames.includes(url.hostname) || url.port || url.username || url.password || !site.path.test(url.pathname)) {
    throw new Error(`La URL debe ser una página de película o episodio de ${site.hostnames.join(' o ')}.`);
  }
  return `${url.origin}${url.pathname}`;
}

function decodeHtml(value) {
  return value.replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&#x27;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>');
}

function cleanEmbed(input) {
  try {
    const url = new URL(decodeHtml(input).trim());
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.href.length > 2000) return null;
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(url.hostname) || /(?:^|\.)(?:localhost|local|internal|test)$/.test(url.hostname)) return null;
    return url.href;
  } catch { return null; }
}

function fromCuevanaWrapper(input) {
  const url = cleanEmbed(input);
  if (!url) return null;
  const parsed = new URL(url);
  if (!['cuevana3w.pro', 'cuevana3t.pro'].some(host => parsed.hostname.endsWith(`.${host}`))) return url;
  const encoded = parsed.searchParams.get('v');
  if (!encoded) return parsed.searchParams.has('token') ? url : null;
  try { return cleanEmbed(Buffer.from(encoded, 'base64').toString('utf8')); } catch { return null; }
}

export function parseCuevanaServers(html) {
  const servers = []; const seen = new Set();
  const pattern = /<li\b([^>]*\bdata-server\s*=\s*["']([^"']+)["'][^>]*)>([\s\S]*?)<\/li>/gi;
  for (const match of html.matchAll(pattern)) {
    const url = fromCuevanaWrapper(match[2]);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const label = decodeHtml(match[3].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());
    const groupStart = html.lastIndexOf('class="tab-video-item"', match.index);
    const groupLabel = groupStart < 0 ? '' : /class="tab-item-name"[^>]*>\s*([^<]+)/i.exec(html.slice(groupStart, match.index))?.[1]?.trim() || '';
    const host = new URL(url).hostname.replace(/^www\./, '');
    const language = `${groupLabel} ${label}`;
    const languageCode = /latino/i.test(language) ? 'latino' : /subtitulado/i.test(language) ? 'subtitulado' : /multilenguaje/i.test(language) ? 'multi' : 'unknown';
    const audioLabel = languageCode === 'latino' ? 'Latino (indicado por Cuevana)' : languageCode === 'subtitulado' ? 'Subtitulado (indicado por Cuevana)' : languageCode === 'multi' ? 'Multilenguaje (indicado por Cuevana)' : 'Idioma sin confirmar';
    servers.push({ id: `cuevana-${servers.length}`, name: label.slice(0, 65) || host, url, audioLabel, languageCode });
    if (servers.length >= 30) break;
  }
  return servers;
}

function parseJsString(value) {
  try { return JSON.parse(value); } catch { return null; }
}

export function parseAnimeAv1Servers(html) {
  const start = html.search(/\bembeds\s*:\s*\{/i);
  if (start < 0) return [];
  const section = html.slice(start, start + 35000).split(/\bdownloads\s*:/i)[0];
  const servers = []; const seen = new Set();
  const groups = /\b([A-Z]{2,12})\s*:\s*\[([\s\S]*?)\]/g;
  for (const group of section.matchAll(groups)) {
    const language = group[1];
    const entries = /\{[^{}]*\bserver\s*:\s*("(?:\\.|[^"\\])*")[^{}]*\burl\s*:\s*("(?:\\.|[^"\\])*")[^{}]*\}/g;
    for (const entry of group[2].matchAll(entries)) {
      const name = parseJsString(entry[1]);
      const url = cleanEmbed(parseJsString(entry[2]) || '');
      if (!url || seen.has(url)) continue;
      seen.add(url);
      const languageCode = /^(LAT|LATINO)$/.test(language) ? 'latino' : /^(DUB|DOB|ES)$/.test(language) ? 'doblado' : language === 'SUB' ? 'subtitulado' : language.toLowerCase();
      const audioLabel = languageCode === 'latino' ? 'Latino (indicado por AnimeAV1)' : languageCode === 'doblado' ? 'Doblado (indicado por AnimeAV1)' : languageCode === 'subtitulado' ? 'Subtitulado (indicado por AnimeAV1)' : `${language} (indicado por AnimeAV1)`;
      servers.push({ id: `animeav1-${servers.length}`, name: String(name || new URL(url).hostname).slice(0, 65), url, audioLabel, languageCode });
      if (servers.length >= 30) return servers;
    }
  }
  return servers;
}

export async function getSiteServers(source, input, { fetchImpl = fetch } = {}) {
  let pageUrl = validateSitePage(source, input);
  const key = `${source}:${pageUrl}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < 5 * 60_000) return cached.value;
  let response;
  for (let redirects = 0; redirects < 3; redirects++) {
    response = await fetchImpl(pageUrl, {
      redirect: 'manual', signal: AbortSignal.timeout(10000),
      headers: REQUEST_HEADERS,
    });
    if (![301, 302, 307, 308].includes(response.status)) break;
    const location = response.headers.get('location');
    if (!location) throw new Error('La fuente redirigió sin destino.');
    const next = validateSitePage(source, new URL(location, pageUrl).href);
    if (new URL(next).pathname !== new URL(pageUrl).pathname) throw new Error('La fuente cambió de título al redirigir.');
    pageUrl = next;
  }
  const html = await readHtml(response);
  const servers = source === 'cuevana' ? parseCuevanaServers(html) : parseAnimeAv1Servers(html);
  const value = { source, pageUrl, titleUrl: titleFromPage(source, pageUrl), servers, checkedAt: Date.now(), note: 'Los idiomas y la reproducción dependen del proveedor externo.' };
  if (cache.size >= 50) cache.delete(cache.keys().next().value);
  cache.set(key, { at: Date.now(), value });
  return value;
}
