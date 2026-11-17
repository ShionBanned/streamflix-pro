const ADDONS = [
  { id: 'knightcrawler', name: 'KnightCrawler', env: 'KNIGHTCRAWLER_MANIFEST_URL', setupUrl: 'https://github.com/knightcrawler-stremio/knightcrawler' },
  { id: 'mediafusion', name: 'MediaFusion', env: 'MEDIAFUSION_MANIFEST_URL', setupUrl: 'https://mediafusion.elfhosted.com/configure' },
  { id: 'comet', name: 'Comet', env: 'COMET_MANIFEST_URL', setupUrl: 'https://comet.elfhosted.com/configure' },
  { id: 'annatar', name: 'Annatar', env: 'ANNATAR_MANIFEST_URL', setupUrl: 'https://github.com/g0ldyy/annatar' },
];

export function addonStreamUrl(manifestUrl, type, id) {
  const url = new URL(manifestUrl);
  if (!['https:', 'http:'].includes(url.protocol) || (url.protocol === 'http:' && !['127.0.0.1', 'localhost'].includes(url.hostname)) || url.username || url.password || !url.pathname.endsWith('/manifest.json') || url.search || url.hash) throw new Error('URL de manifiesto inválida.');
  if (!['movie', 'series'].includes(type) || !/^tt\d{7,10}(?::[1-9]\d{0,2}:[1-9]\d{0,3})?$/.test(id)) throw new Error('Identificador IMDb inválido.');
  url.pathname = `${url.pathname.slice(0, -'/manifest.json'.length)}/stream/${type}/${id}.json`;
  return url.href;
}

function mediaUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.href.length > 2500 || ['localhost', '127.0.0.1'].includes(url.hostname)) return null;
    return url.href;
  } catch { return null; }
}

export function normalizeAddonStreams(source, data) {
  if (!Array.isArray(data?.streams)) return [];
  const out = []; const seen = new Set();
  for (const stream of data.streams.slice(0, 80)) {
    const hash = /^[0-9a-f]{40}$/i.test(stream?.infoHash || '') ? stream.infoHash.toLowerCase() : null;
    const url = !hash ? mediaUrl(stream?.url) : null;
    if (!hash && !url) continue;
    const fileIdx = Number.isSafeInteger(stream.fileIdx) && stream.fileIdx >= 0 && stream.fileIdx < 10000 ? stream.fileIdx : null;
    const key = hash ? `${hash}:${fileIdx ?? ''}` : url;
    if (seen.has(key)) continue; seen.add(key);
    out.push({ infoHash: hash, url, fileIdx, name: `${source.name} · ${String(stream.name || '').slice(0, 80)}`, title: String(stream.title || stream.description || stream.name || '').slice(0, 500), behaviorHints: { filename: String(stream.behaviorHints?.filename || '').slice(0, 200) }, addonSource: source.id });
  }
  return out;
}

async function readJson(response) {
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  if (!(response.headers.get('content-type') || '').includes('json')) throw new Error('Respuesta no JSON');
  if (Number(response.headers.get('content-length')) > 1_000_000) throw new Error('Respuesta demasiado grande');
  const body = await response.text();
  if (body.length > 1_000_000) throw new Error('Respuesta demasiado grande');
  return JSON.parse(body);
}

export function supportsAddonStream(manifest, type) {
  if (!manifest || !Array.isArray(manifest.resources) || !Array.isArray(manifest.types)) return false;
  if (!manifest.types.includes(type) || /obsolete configuration|re-?configure/i.test(`${manifest.name || ''} ${manifest.description || ''}`)) return false;
  return manifest.resources.some(resource => resource === 'stream' || (resource?.name === 'stream' && (!resource.types || resource.types.includes(type)) && (!resource.idPrefixes || resource.idPrefixes.includes('tt'))));
}

export async function queryAddonSources({ imdbId, isSeries = false, season = 1, episode = 1, fetchImpl = fetch, env = process.env } = {}) {
  if (!/^tt\d{7,10}$/.test(String(imdbId || ''))) return { streams: [], statuses: [] };
  const type = isSeries ? 'series' : 'movie';
  const id = isSeries ? `${imdbId}:${season}:${episode}` : imdbId;
  const results = await Promise.all(ADDONS.map(async source => {
    const manifestUrl = env[source.env];
    if (!manifestUrl) return { status: { id: source.id, name: source.name, state: 'not-configured', count: 0, setupUrl: source.setupUrl }, streams: [] };
    try {
      const endpoint = addonStreamUrl(manifestUrl, type, id);
      const manifestResponse = await fetchImpl(manifestUrl, { redirect: 'manual', signal: AbortSignal.timeout(5500), headers: { Accept: 'application/json' } });
      const manifest = await readJson(manifestResponse);
      if (!supportsAddonStream(manifest, type)) return { status: { id: source.id, name: source.name, state: 'invalid-manifest', count: 0, setupUrl: source.setupUrl }, streams: [] };
      const response = await fetchImpl(endpoint, { redirect: 'manual', signal: AbortSignal.timeout(5500), headers: { Accept: 'application/json' } });
      const streams = normalizeAddonStreams(source, await readJson(response));
      return { status: { id: source.id, name: source.name, state: streams.length ? 'available' : 'empty', count: streams.length, setupUrl: source.setupUrl }, streams };
    } catch (error) { return { status: { id: source.id, name: source.name, state: 'unavailable', count: 0, reason: String(error.message || 'No respondió').slice(0, 100), setupUrl: source.setupUrl }, streams: [] }; }
  }));
  return { streams: results.flatMap(result => result.streams), statuses: results.map(result => result.status) };
}
