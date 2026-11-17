import test from 'node:test';
import assert from 'node:assert/strict';
import { addonStreamUrl, normalizeAddonStreams, queryAddonSources, supportsAddonStream } from '../services/addonSources.js';
import { parseExtraSearch, parseExtraServers, resolveExtraSite, validateExtraSiteUrl } from '../services/extraSiteServers.js';

test('PelisPlus and AnimeFLV accept only their own title and episode pages', () => {
  assert.equal(validateExtraSiteUrl('pelisplus', 'https://pelisplushd.la/serie/ejemplo', 'title'), 'https://pelisplushd.la/serie/ejemplo');
  assert.equal(validateExtraSiteUrl('animeflv', 'https://animeflv.or.at/2026/09/27/one-piece-episodio-1180/', 'page'), 'https://animeflv.or.at/2026/09/27/one-piece-episodio-1180/');
  for (const url of ['https://pelisplushd.la.evil.test/serie/ejemplo', 'http://pelisplushd.la/serie/ejemplo', 'https://pelisplushd.la/admin', 'https://pelisplushd.la@127.0.0.1/serie/ejemplo']) assert.throws(() => validateExtraSiteUrl('pelisplus', url, 'title'));
});

test('search results and published embed buttons are parsed without inventing streams', () => {
  const movies = parseExtraSearch('pelisplus', '<a href="/pelicula/mi-pelicula" class="Posters-link"><div class="listing-content"><p>Mi Película</p></div></a>', 'Mi Película');
  assert.equal(movies[0].score, 1);
  assert.equal(movies[0].type, 'movie');
  const anime = parseExtraSearch('animeflv', '<a class="thumbnail-link" href="https://animeflv.or.at/anime/one-piece/"><h2 class="entry-title">One Piece</h2></a>', 'One Piece');
  assert.equal(anime[0].titleUrl, 'https://animeflv.or.at/anime/one-piece/');
  const pelisServers = parseExtraServers('pelisplus', '<li data-url="https://voe.sx/e/abc" data-name="Español Latino" class="playurl"><a href="#option1">voe</a></li><li data-url="http://127.0.0.1/private" data-name="Español Latino" class="playurl"><a href="#option2">bad</a></li>');
  assert.equal(pelisServers.length, 1);
  assert.equal(pelisServers[0].languageCode, 'latino');
  const encoded = Buffer.from('https://player.zilla-networks.com/m3u8/abc').toString('base64');
  const animeServers = parseExtraServers('animeflv', `<span class="tooltip-text">HLS</span><button class="iframe_btn server_btn" data-src="${encoded}" app_type="Sub">OPCIÓN 1</button>`);
  assert.equal(animeServers.length, 1);
  assert.equal(animeServers[0].pageOnly, true);
});

test('episode resolution requires a matching link on the selected title page', async () => {
  const title = 'https://pelisplushd.la/serie/mi-serie';
  const episode = `${title}/temporada/1/capitulo/2`;
  const fetchImpl = async url => new Response(url === title ? '<a href="/serie/mi-serie/temporada/1/capitulo/2">2</a>' : '<span lid="1" url="https://voe.sx/e/abc"></span>', { headers: { 'content-type': 'text/html' } });
  const resolved = await resolveExtraSite('pelisplus', title, 1, 2, { fetchImpl });
  assert.equal(resolved.pageUrl, episode);
  assert.equal(resolved.servers.length, 1);
  await assert.rejects(resolveExtraSite('pelisplus', title, 1, 3, { fetchImpl }), /no aparece/);
  const animeTitle = 'https://animeflv.or.at/anime/one-piece/';
  const animeEpisode = 'https://animeflv.or.at/2026/09/27/one-piece-episodio-2/';
  const animeFetch = async url => new Response(url === animeTitle ? `<script class="animeflv-episodes-data">[{"number":2,"permalink":"${animeEpisode}"}]</script>` : '<div>Sin reproductores</div>', { headers: { 'content-type': 'text/html' } });
  assert.equal((await resolveExtraSite('animeflv', animeTitle, 1, 2, { fetchImpl: animeFetch })).pageUrl, animeEpisode);
  await assert.rejects(resolveExtraSite('animeflv', animeTitle, 2, 2, { fetchImpl: animeFetch }), /temporadas/);
});

test('Stremio addon adapter accepts valid hashes and HTTPS streams and reports each source', async () => {
  assert.equal(addonStreamUrl('https://comet.elfhosted.com/manifest.json', 'movie', 'tt1254207'), 'https://comet.elfhosted.com/stream/movie/tt1254207.json');
  assert.throws(() => addonStreamUrl('http://public.example/manifest.json', 'movie', 'tt1254207'));
  const raw = { streams: [{ infoHash: 'a'.repeat(40), name: '1080p' }, { url: 'https://media.example/video.mp4', name: 'Directo' }, { url: 'http://127.0.0.1/private' }] };
  assert.equal(normalizeAddonStreams({ id: 'sample', name: 'Sample' }, raw).length, 2);
  assert.equal(supportsAddonStream({ resources: [{ name: 'stream', types: ['movie'], idPrefixes: ['tt'] }], types: ['movie'] }, 'movie'), true);
  assert.equal(supportsAddonStream({ name: '❌ Comet', description: 'Obsolete configuration, please re-configure', resources: ['stream'], types: ['movie'] }, 'movie'), false);
  const env = { KNIGHTCRAWLER_MANIFEST_URL: 'http://127.0.0.1:7000/manifest.json', MEDIAFUSION_MANIFEST_URL: 'https://mediafusion.example/configured/manifest.json', ANNATAR_MANIFEST_URL: 'https://annatar.example/manifest.json' };
  const fetchImpl = async url => new Response(JSON.stringify(url.endsWith('manifest.json') ? { resources: ['stream'], types: ['movie', 'series'] } : url.includes('mediafusion') ? raw : { streams: [] }), { headers: { 'content-type': 'application/json' } });
  const result = await queryAddonSources({ imdbId: 'tt1254207', env, fetchImpl });
  assert.equal(result.statuses.length, 4);
  assert.equal(result.streams.length, 2);
  assert.equal(result.statuses.find(item => item.id === 'mediafusion').state, 'available');
  assert.equal(result.statuses.find(item => item.id === 'comet').state, 'not-configured');
});
