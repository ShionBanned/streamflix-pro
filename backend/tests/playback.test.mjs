import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { buildEmbedServers } from '../../shared/cloudProviders.mjs';
import { readPlayerMessage, parseByteRange, shiftSubtitleCues, nextCloudMirror } from '../../shared/playerUtils.mjs';
import { toWebVtt } from '../../shared/subtitleUtils.mjs';
import { probeMirror } from '../services/cloudHealth.js';
import { parseMediaInfo, selectAudioTrack, probeMedia, streamFfmpeg, waitForTorrent } from '../services/mediaTools.js';
import { hasGuaranteedBrowserAudio, isBrowserNativeCompatible } from '../services/torrentio.js';
import { proxyStream } from '../services/iptvParser.js';

test('providers use validated IDs, never substitute an unrelated title, and deduplicate mirrors', () => {
  assert.deepEqual(buildEmbedServers({}), []); assert.deepEqual(buildEmbedServers({ tmdbId: '../550' }), []);
  const servers = buildEmbedServers({ tmdbId: 2734, isSeries: true, season: 2, episode: 3 });
  assert.equal(servers.length, 8);
  for (const server of servers) assert.equal(new Set(server.mirrors.map(mirror => mirror.url)).size, server.mirrors.length);
  assert(servers[0].url.includes('/2734/2-3'));
  const attempted = new Set([servers[0].mirrors[0].url]);
  const next = nextCloudMirror(servers, servers[0].id, 0, attempted, [{ url: servers[0].mirrors[1].url, status: 'unavailable' }]);
  assert.notEqual(next.url, servers[0].mirrors[1].url);
  const all = new Set(servers.flatMap(server => server.mirrors.map(mirror => mirror.url)));
  assert.equal(nextCloudMirror(servers, servers[0].id, 0, all), null);
});

test('iframe messages require both the active window and its exact origin and never accept invented progress', () => {
  const frame = { contentWindow: {} }; const expected = 'https://vidsrcme.ru/embed/movie/10';
  const message = { source: frame.contentWindow, origin: 'https://vidsrcme.ru', data: { type: 'PLAYER_EVENT', data: { currentTime: 123, duration: 500 } } };
  assert.equal(readPlayerMessage(message, frame, expected).currentTime, 123);
  assert.equal(readPlayerMessage({ ...message, source: {} }, frame, expected), null);
  assert.equal(readPlayerMessage({ ...message, origin: 'https://evil.example' }, frame, expected), null);
  assert.equal(readPlayerMessage({ ...message, data: { time: Infinity } }, frame, expected), null);
  assert.equal(readPlayerMessage({ ...message, data: 'not JSON' }, frame, expected), null);
});

test('HTTP byte ranges accept suffixes and clamp oversized ends while rejecting malformed ranges', () => {
  assert.deepEqual(parseByteRange('bytes=0-999', 50), { status: 206, start: 0, end: 49, length: 50 });
  assert.deepEqual(parseByteRange('bytes=-10', 50), { status: 206, start: 40, end: 49, length: 10 });
  assert.deepEqual(parseByteRange('bytes=20-', 50), { status: 206, start: 20, end: 49, length: 30 });
  for (const range of ['bytes=-0', 'bytes=99-', 'bytes=4-2', 'bytes=-1-9', 'bytes=0-2,5-8', 'bytes=-']) assert.equal(parseByteRange(range, 50).status, 416);
});

test('subtitle conversion and synchronization preserve original timestamps and handle reloading or seeking', () => {
  const vtt = toWebVtt('\uFEFF1\r\n00:00:01,250 --> 00:00:02,500\r\nHola <i>mundo</i>');
  assert(vtt.startsWith('WEBVTT\n')); assert(vtt.includes('00:00:01.250 --> 00:00:02.500')); assert(vtt.includes('<i>mundo</i>'));
  assert.throws(() => toWebVtt('<html>server error</html>'));
  const originals = new WeakMap(); const cue = { startTime: 30, endTime: 33 };
  shiftSubtitleCues([cue], -20, originals); shiftSubtitleCues([cue], -20, originals); assert.equal(cue.startTime, 10);
  shiftSubtitleCues([cue], 0.5, originals); assert.equal(cue.startTime, 30.5);
  shiftSubtitleCues([cue], -100, originals); assert.equal(cue.startTime, 0); assert.equal(cue.endTime, 0.001);
});

test('cloud diagnostics distinguish reachable pages, challenges, iframe blocks, DNS failure and TLS errors', async () => {
  const mirror = { id: 'main', serverId: 'vidsrc', url: 'https://vidsrcme.ru/embed/movie/10' };
  const check = (response) => probeMirror(mirror, { fetchImpl: async () => response });
  assert.equal((await check(new Response('<html>player</html>'))).status, 'reachable');
  assert.equal((await check(new Response('<html>Just a moment</html>'))).status, 'challenge');
  assert.equal((await check(new Response('blocked', { headers: { 'x-frame-options': 'SAMEORIGIN' } }))).status, 'frame-blocked');
  assert.equal((await check(new Response('not found', { status: 404 }))).status, 'unavailable');
  assert.equal((await check(new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/private' } }))).status, 'redirected');
  for (const [code, status] of [['ENOTFOUND', 'unavailable'], ['ERR_TLS_CERT_ALTNAME_INVALID', 'invalid-certificate']]) {
    const result = await probeMirror(mirror, { fetchImpl: async () => { throw Object.assign(new Error(), { cause: { code } }); } });
    assert.equal(result.status, status); assert.equal(result.playbackVerified, false);
  }
});

test('media metadata selects a real audio track by language or explicit manual index', () => {
  const info = parseMediaInfo('Duration: 01:02:03.50\n  Stream #0:0: Video: h264 (High)\n  Stream #0:1(eng): Audio: ac3, 48000 Hz\n  Stream #0:2(spa): Audio: aac, 48000 Hz');
  assert.equal(info.duration, 3723.5); assert.equal(info.videoCodec, 'h264'); assert.equal(info.audioTracks.length, 2);
  assert.equal(selectAudioTrack(info.audioTracks, { audioLang: 'latino' }), 1);
  assert.equal(selectAudioTrack(info.audioTracks, { audioLang: 'latino', manualAudio: true, audioTrack: 0 }), 0);
  assert.equal(selectAudioTrack(info.audioTracks, { manualAudio: true, audioTrack: 99 }), 0);
});

test('AAC hints do not override incompatible video codecs or imply MP4 audio has been verified', () => {
  assert.equal(hasGuaranteedBrowserAudio({ title: 'movie.mp4' }), false);
  assert.equal(hasGuaranteedBrowserAudio({ title: 'movie.AAC.mp4' }), true);
  assert.equal(isBrowserNativeCompatible({ title: 'movie.x265.AAC.mkv' }), false);
  assert.equal(isBrowserNativeCompatible({ title: 'movie.H264.DTS.mp4' }), false);
  assert.equal(isBrowserNativeCompatible({ title: 'movie.H264.AAC.mp4' }), true);
});

test('unresponsive torrent metadata is bounded and readiness listeners are cleaned up', async () => {
  const stalled = new EventEmitter(); await assert.rejects(waitForTorrent(stalled, { timeoutMs: 15 }), /metadatos/); assert.equal(stalled.listenerCount('ready'), 0);
  const ready = new EventEmitter(); const pending = waitForTorrent(ready); ready.ready = true; ready.emit('ready'); assert.equal(await pending, ready); assert.equal(ready.listenerCount('error'), 0);
});

async function listen(server) { await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); return `http://127.0.0.1:${server.address().port}`; }
async function close(server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
function expressResponse(res) {
  res.status = code => { res.statusCode = code; return res; }; res.type = value => { res.setHeader('content-type', value.includes('/') ? value : `text/${value}`); return res; };
  res.json = value => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(value)); }; res.send = value => res.end(value);
  return res;
}

test('direct media proxy forwards Range and HEAD, keeps nested audio and required referrer, and streams unknown binary paths', async t => {
  const upstreamCalls = [];
  const source = createServer((req, res) => {
    upstreamCalls.push({ url: req.url, range: req.headers.range, method: req.method, ref: req.headers.referer });
    if (req.url === '/master.m3u8') { res.setHeader('content-type', 'application/vnd.apple.mpegurl'); return res.end('#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,URI="audio.m3u8"\n#EXT-X-STREAM-INF:BANDWIDTH=100000\nvideo.m3u8'); }
    if (req.headers.range === 'bytes=0-2') { res.writeHead(206, { 'content-type': 'video/mp4', 'content-length': 3, 'content-range': 'bytes 0-2/6' }); return res.end(req.method === 'HEAD' ? undefined : 'abc'); }
    res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': 6 }); res.end(req.method === 'HEAD' ? undefined : 'abcdef');
  });
  const sourceOrigin = await listen(source);
  const gateway = createServer((req, res) => { const url = new URL(req.url, 'http://localhost'); req.query = Object.fromEntries(url.searchParams); proxyStream(req.query.url, req, expressResponse(res)); });
  const origin = await listen(gateway); t.after(async () => { await close(gateway); await close(source); });
  const url = `${origin}/?url=${encodeURIComponent(sourceOrigin + '/binary')}`;
  const ranged = await fetch(url, { headers: { Range: 'bytes=0-2' } }); assert.equal(ranged.status, 206); assert.equal(await ranged.text(), 'abc'); assert.equal(ranged.headers.get('content-range'), 'bytes 0-2/6');
  const head = await fetch(url, { method: 'HEAD' }); assert.equal(await head.text(), ''); assert.equal(head.headers.get('content-length'), '6');
  assert.equal(await (await fetch(url)).text(), 'abcdef');
  const manifest = await (await fetch(`${origin}/?url=${encodeURIComponent(sourceOrigin + '/master.m3u8')}&ref=${encodeURIComponent('https://media.example/')}`)).text();
  const audio = /URI="([^"]+)"/.exec(manifest)[1]; assert(audio.includes('ref=')); assert(!audio.includes(sourceOrigin));
  assert(upstreamCalls.some(call => call.range === 'bytes=0-2'));
});

test('FFmpeg probes a seekable MP4 and streams AAC after the HTTP request has completed; no torrent is downloaded', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'streamflix-test-'));
  t.after(async () => { const absolute = resolve(dir); assert(absolute.startsWith(resolve(tmpdir()) + sep)); await rm(absolute, { recursive: true, force: true }); });
  const input = join(dir, 'input.mp4');
  const generate = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=160x90:r=10:d=3', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3', '-f', 'lavfi', '-i', 'sine=frequency=880:duration=3', '-map', '0:v', '-map', '1:a', '-map', '2:a', '-c:v', 'libx264', '-c:a', 'aac', '-metadata:s:a:0', 'language=eng', '-metadata:s:a:1', 'language=spa', '-y', input], { windowsHide: true, timeout: 15000 });
  assert.equal(generate.status, 0, generate.stderr?.toString());
  const bytes = await readFile(input);
  const source = createServer((req, res) => {
    const range = parseByteRange(req.headers.range, bytes.length);
    if (range?.status === 416) return res.writeHead(416).end();
    const body = range ? bytes.subarray(range.start, range.end + 1) : bytes;
    res.writeHead(range ? 206 : 200, { 'content-type': 'video/mp4', 'content-length': body.length, 'accept-ranges': 'bytes', ...(range ? { 'content-range': `bytes ${range.start}-${range.end}/${bytes.length}` } : {}) }); res.end(body);
  });
  const sourceOrigin = await listen(source); t.after(() => close(source));
  const info = await probeMedia(sourceOrigin + '/input.mp4'); assert.equal(info.audioTracks.length, 2); assert(info.duration >= 3);
  const output = createServer((req, res) => streamFfmpeg(sourceOrigin + '/input.mp4', req, expressResponse(res), { startTime: 1, audioTrack: 1 }));
  const outputOrigin = await listen(output); t.after(() => close(output));
  const response = await fetch(outputOrigin); assert.equal(response.status, 200); assert.equal(response.headers.get('x-stream-start'), '1');
  const converted = Buffer.from(await response.arrayBuffer()); assert(converted.length > 1000); assert(converted.includes(Buffer.from('ftyp')));
  const outputFile = join(dir, 'output.mp4'); await writeFile(outputFile, converted);
  const verified = await probeMedia(outputFile); assert.equal(verified.audioTracks[0].codec, 'aac'); assert.equal(verified.audioTracks.length, 1);
});
