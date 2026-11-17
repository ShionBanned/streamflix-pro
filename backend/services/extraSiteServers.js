const HOSTS = { pelisplus: 'pelisplushd.la', animeflv: 'animeflv.or.at' };
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36', Accept: 'text/html' };
const searchCache = new Map();

function decodeHtml(value = '') {
  let str = value.replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&#x27;/gi, "'").replace(/<[^>]+>/g, '').trim();
  try {
    if (/[\u00c0-\u00ff]/.test(str)) {
      const decoded = decodeURIComponent(escape(str));
      if (decoded && !decoded.includes('\ufffd')) str = decoded;
    }
  } catch {
    str = str.replace(/Ã¡/g, 'á').replace(/Ã©/g, 'é').replace(/Ã­/g, 'í').replace(/Ã³/g, 'ó').replace(/Ãº/g, 'ú').replace(/Ã±/g, 'ñ').replace(/Ã/g, 'í');
  }
  return str.trim();
}
function normalized(value) { return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
function score(query, title) {
  const a = normalized(query); const b = normalized(title);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const left = new Set(a.split(' ')); const right = new Set(b.split(' '));
  return Math.round(([...left].filter(word => right.has(word)).length / new Set([...left, ...right]).size) * 90) / 100;
}
function pathAllowed(source, pathname, kind) {
  if (source === 'pelisplus') return kind === 'title' ? /^\/(?:pelicula|serie)\/[a-z0-9-]+\/?$/i.test(pathname) : /^\/(?:pelicula\/[a-z0-9-]+|serie\/[a-z0-9-]+\/temporada\/[1-9]\d*\/capitulo\/[1-9]\d*)\/?$/i.test(pathname);
  return kind === 'title' ? /^\/anime\/[a-z0-9%-]+\/?$/i.test(pathname) : /^\/20\d{2}\/(?:0?[1-9]|1[0-2])\/(?:0?[1-9]|[12]\d|3[01])\/[a-z0-9%-]+-episodio-[1-9]\d*\/?$/i.test(pathname);
}
export function validateExtraSiteUrl(source, input, kind = 'page') {
  if (!HOSTS[source] || typeof input !== 'string' || input.length > 500) throw new Error('Fuente o enlace no válido.');
  let url;
  try { url = new URL(input); } catch { throw new Error('Introduce una URL completa.'); }
  if (url.protocol !== 'https:' || url.hostname !== HOSTS[source] || url.port || url.username || url.password || !pathAllowed(source, url.pathname, kind)) throw new Error('La página no pertenece a esta fuente.');
  return `${url.origin}${source === 'animeflv' ? `${url.pathname.replace(/\/$/, '')}/` : url.pathname.replace(/\/$/, '')}`;
}
async function readPage(source, input, kind, fetchImpl) {
  let url = validateExtraSiteUrl(source, input, kind);
  for (let i = 0; i < 3; i++) {
    const response = await fetchImpl(url, { redirect: 'manual', signal: AbortSignal.timeout(10000), headers: HEADERS });
    if ([301, 302, 307, 308].includes(response.status)) {
      const next = validateExtraSiteUrl(source, new URL(response.headers.get('location') || '', url).href, kind);
      if (new URL(next).pathname.replace(/\/$/, '') !== new URL(url).pathname.replace(/\/$/, '')) throw new Error('La fuente cambió de título al redirigir.');
      url = next; continue;
    }
    if (!response.ok || !(response.headers.get('content-type') || '').includes('text/html')) throw new Error(`La página no respondió como HTML (HTTP ${response.status}).`);
    if (Number(response.headers.get('content-length')) > 1_000_000) throw new Error('La página es demasiado grande.');
    const reader = response.body?.getReader(); if (!reader) throw new Error('No se pudo leer la página.');
    const chunks = []; let size = 0;
    try { while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > 1_000_000) throw new Error('La página es demasiado grande.'); chunks.push(value); } }
    finally { await reader.cancel().catch(() => {}); }
    return { url, html: new TextDecoder().decode(Buffer.concat(chunks)) };
  }
  throw new Error('Demasiadas redirecciones.');
}
function cleanEmbed(value) {
  try { const url = new URL(decodeHtml(value)); if (url.protocol !== 'https:' || url.username || url.password || url.port || url.href.length > 2000 || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(url.hostname)) return null; return url.href; }
  catch { return null; }
}
export function parseExtraSearch(source, html, query) {
  const candidates = []; const seen = new Set();
  if (source === 'pelisplus') {
    const pattern = /<a\b[^>]*href="(\/(?:pelicula|serie)\/[a-z0-9-]+)"[^>]*class="Posters-link"[^>]*>([\s\S]*?)<\/a>/gi;
    for (const match of html.matchAll(pattern)) {
      const title = /<div class="listing-content">\s*<p>([^<]+)<\/p>/i.exec(match[2])?.[1];
      if (!title) continue;
      const titleUrl = validateExtraSiteUrl(source, `https://${HOSTS[source]}${match[1]}`, 'title');
      if (seen.has(titleUrl)) continue; seen.add(titleUrl);
      candidates.push({ title: decodeHtml(title), titleUrl, type: match[1].startsWith('/pelicula/') ? 'movie' : 'tv', year: null });
    }
  } else if (source === 'animeflv') {
    const pattern = /<a\b[^>]*class="thumbnail-link"[^>]*href="(https:\/\/animeflv\.or\.at\/anime\/[a-z0-9%-]+\/?)"[^>]*>([\s\S]*?)<\/a>/gi;
    for (const match of html.matchAll(pattern)) {
      const title = /<h2 class="entry-title">([^<]+)<\/h2>/i.exec(match[2])?.[1];
      if (!title) continue;
      const titleUrl = validateExtraSiteUrl(source, match[1], 'title');
      if (seen.has(titleUrl)) continue; seen.add(titleUrl);
      candidates.push({ title: decodeHtml(title), titleUrl, type: 'anime', year: null });
    }
  }
  return candidates.map(candidate => ({ ...candidate, score: score(query, candidate.title) })).sort((a, b) => b.score - a.score).slice(0, 20);
}
export async function searchExtraSite(source, query, { fetchImpl = fetch } = {}) {
  if (!HOSTS[source] || typeof query !== 'string' || query.trim().length < 2 || query.length > 120) throw new Error('Escribe un título de 2 a 120 caracteres.');
  const key = `${source}:${normalized(query)}`;
  const cached = searchCache.get(key);
  if (cached && Date.now() - cached.at < 5 * 60_000) return cached.value;

  const base = source === 'pelisplus' ? `https://${HOSTS[source]}/search?s=` : `https://${HOSTS[source]}/?s=`;
  const clean = query.replace(/[:\-–—]/g, ' ').replace(/\s+/g, ' ').trim();
  const mainPart = query.split(/[:\-–—]/)[0].trim();
  const terms = normalized(query).split(' ').filter(word => word.length > 3 && !['para', 'the', 'with', 'from', 'temporada'].includes(word));
  const longestWord = terms.sort((a, b) => b.length - a.length)[0];

  const searches = [query.trim(), clean, mainPart, longestWord].filter((value, index, list) => value && value.length >= 2 && list.indexOf(value) === index);

  let candidates = [];
  for (const term of searches) {
    try {
      const response = await fetchImpl(`${base}${encodeURIComponent(term)}`, { redirect: 'manual', signal: AbortSignal.timeout(10000), headers: HEADERS });
      if (!response.ok || !(response.headers.get('content-type') || '').includes('text/html')) continue;
      const body = await response.text();
      if (body.length > 1_000_000) continue;
      candidates = parseExtraSearch(source, body, query);
      if (candidates.length) break;
    } catch { /* Try next fallback search */ }
  }

  const value = { source, query: query.trim(), candidates, checkedAt: Date.now() };
  if (searchCache.size >= 50) searchCache.delete(searchCache.keys().next().value);
  searchCache.set(key, { at: Date.now(), value });
  return value;
}
export async function resolveExtraSite(source, input, season, episode, { fetchImpl = fetch } = {}) {
  const titleUrl = validateExtraSiteUrl(source, input, 'title');
  const s = Number(season); const e = Number(episode);
  if (!Number.isSafeInteger(s) || s < 1 || s > 100 || !Number.isSafeInteger(e) || e < 1 || e > 2000) throw new Error('Temporada o episodio inválido.');
  if (source === 'pelisplus' && new URL(titleUrl).pathname.startsWith('/pelicula/')) return getExtraSiteServers(source, titleUrl, { fetchImpl });
  if (source === 'animeflv' && s !== 1) throw new Error('AnimeFLV cataloga las temporadas como títulos separados. Selecciona la temporada correcta.');
  const { html } = await readPage(source, titleUrl, 'title', fetchImpl);
  let pageUrl = null;
  if (source === 'pelisplus') {
    const expected = `${new URL(titleUrl).pathname}/temporada/${s}/capitulo/${e}`;
    if (html.includes(`href="${expected}"`)) pageUrl = `https://${HOSTS[source]}${expected}`;
  } else {
    const raw = /<script[^>]*class="animeflv-episodes-data"[^>]*>([\s\S]*?)<\/script>/i.exec(html)?.[1];
    if (raw) {
      const data = JSON.parse(raw);
      const match = Array.isArray(data) ? data.find(entry => Number(entry.number) === e) : null;
      if (match?.permalink) pageUrl = validateExtraSiteUrl(source, match.permalink, 'page');
    }
  }
  if (!pageUrl) throw new Error('Este episodio no aparece en la página seleccionada.');
  return getExtraSiteServers(source, pageUrl, { fetchImpl, titleUrl });
}
export function parseExtraServers(source, html) {
  const servers = []; const seen = new Set();
  const add = (name, rawUrl, languageCode, pageOnly = false) => {
    const url = cleanEmbed(rawUrl); if (!url || seen.has(url)) return;
    seen.add(url); servers.push({ id: `${source}-${servers.length}`, name: decodeHtml(name).slice(0, 65) || new URL(url).hostname, url, languageCode, audioLabel: `${languageCode === 'latino' ? 'Latino' : languageCode === 'subtitulado' ? 'Subtitulado' : 'Idioma sin confirmar'} (indicado por ${source === 'pelisplus' ? 'PelisPlus' : 'AnimeFLV'})`, pageOnly });
  };
  if (source === 'pelisplus') {
    for (const match of html.matchAll(/<li\b[^>]*data-url="([^"]+)"[^>]*data-name="([^"]*)"[^>]*class="playurl"[^>]*>\s*<a[^>]*>([^<]+)<\/a>/gi)) add(match[3], match[1], /latino/i.test(match[2]) ? 'latino' : 'unknown');
    const names = new Map([...html.matchAll(/<li\b[^>]*data-id="(\d+)"[^>]*>\s*<a[^>]*>([^<]+)<\/a>/gi)].map(m => [m[1], m[2]]));
    for (const match of html.matchAll(/<span\b[^>]*lid="(\d+)"[^>]*url="([^"]+)"[^>]*><\/span>/gi)) add(names.get(match[1]) || 'Servidor', match[2], 'latino');
  } else if (source === 'animeflv') {
    const pattern = /<span class="tooltip-text">([^<]+)<\/span>\s*<button\b[^>]*class="[^"]*iframe_btn[^"]*"[^>]*data-src="([A-Za-z0-9+/=]+)"[^>]*app_type="([^"]+)"/gi;
    for (const match of html.matchAll(pattern)) {
      let decoded; try { decoded = Buffer.from(match[2], 'base64').toString('utf8'); } catch { continue; }
      const host = cleanEmbed(decoded) ? new URL(decoded).hostname : '';
      add(match[1], decoded, /sub/i.test(match[3]) ? 'subtitulado' : 'unknown', host === 'player.zilla-networks.com');
    }
  }
  return servers.slice(0, 30);
}
export async function getExtraSiteServers(source, input, { fetchImpl = fetch, titleUrl = null } = {}) {
  const { url, html } = await readPage(source, input, 'page', fetchImpl);
  const canonicalTitle = titleUrl || (source === 'pelisplus' ? url.replace(/\/temporada\/\d+\/capitulo\/\d+$/, '') : null);
  return { source, pageUrl: url, titleUrl: canonicalTitle, servers: parseExtraServers(source, html), checkedAt: Date.now(), note: 'El idioma y la reproducción dependen del proveedor externo.' };
}
