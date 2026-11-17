import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { mkdtemp, readFile, writeFile, copyFile, rm, stat } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { buildHlsRemuxArgs, parseHlsPlaylist } from '../services/hlsOffline.js';
import { downloadHlsVod, validateDownloadUrl } from '../services/downloadService.js';

test('offline HLS selects a self-contained variant and rewrites VOD segments locally', () => {
  const master = '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=100000\nlow.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=300000\nhigh.m3u8\n';
  const selected = parseHlsPlaylist(master, new URL('https://media.example.org/master.m3u8'));
  assert.equal(selected.kind, 'master');
  assert.equal(selected.url.href, 'https://media.example.org/high.m3u8');

  const media = '#EXTM3U\n#EXT-X-TARGETDURATION:4\n#EXTINF:4.0,\na.ts?token=one\n#EXTINF:4.0,\nb.ts\n#EXT-X-ENDLIST\n';
  const parsed = parseHlsPlaylist(media, selected.url);
  assert.equal(parsed.kind, 'media');
  assert.equal(parsed.resources.length, 2);
  assert.equal(parsed.resources[0].url.href, 'https://media.example.org/a.ts?token=one');
  assert(!parsed.localPlaylist.includes('token=one'));
  assert.match(parsed.localPlaylist, /seg00000\.ts/);
  assert.equal(validateDownloadUrl('https://media.example.org/master.m3u8').ext, '.m3u8');
});

test('offline HLS rejects live, encrypted and ranged playlists', () => {
  const base = new URL('https://media.example.org/video.m3u8');
  for (const playlist of [
    '#EXTM3U\n#EXTINF:4,\na.ts\n',
    '#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key.bin"\n#EXTINF:4,\na.ts\n#EXT-X-ENDLIST',
    '#EXTM3U\n#EXT-X-BYTERANGE:100@0\n#EXTINF:4,\na.ts\n#EXT-X-ENDLIST',
  ]) {
    assert.throws(() => parseHlsPlaylist(playlist, base));
  }
  assert.throws(() => validateDownloadUrl('http://media.example.org/video.m3u8'));
});

test('offline HLS remuxes a complete local TS playlist to a playable MP4', async (t) => {
  const parent = resolve(process.cwd(), 'tests');
  const directory = await mkdtemp(join(parent, '.streamflix-hls-'));
  t.after(async () => {
    const absolute = resolve(directory);
    assert(absolute.startsWith(parent + sep));
    await rm(absolute, { recursive: true, force: true });
  });
  const generated = join(directory, 'generated.m3u8');
  const output = join(directory, 'offline.part');
  const creation = spawnSync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=160x90:r=10:d=2',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-c:v', 'libx264', '-c:a', 'aac',
    '-f', 'hls', '-hls_time', '1', '-hls_playlist_type', 'vod', '-hls_segment_filename', join(directory, 'piece%03d.ts'),
    generated,
  ], { windowsHide: true, timeout: 15000 });
  assert.equal(creation.status, 0, creation.stderr?.toString());
  const parsed = parseHlsPlaylist(await readFile(generated, 'utf8'), new URL('https://media.example.org/generated.m3u8'));
  for (const resource of parsed.resources) {
    await copyFile(join(directory, resource.url.pathname.split('/').pop()), join(directory, resource.name));
  }
  const localManifest = join(directory, 'offline.m3u8');
  await writeFile(localManifest, parsed.localPlaylist);
  const remux = spawnSync('ffmpeg', buildHlsRemuxArgs(localManifest, output), { windowsHide: true, timeout: 15000 });
  assert.equal(remux.status, 0, remux.stderr?.toString());
  assert((await stat(output)).size > 1000);

  const manifestText = await readFile(generated, 'utf8');
  const item = { id: 'test-vod', status: 'downloading', bytes: 0 };
  const downloaded = join(directory, 'downloaded.part');
  const openResource = async (url, kind) => {
    const body = kind === 'manifest'
      ? Buffer.from(manifestText)
      : await readFile(join(directory, url.pathname.split('/').pop()));
    return { response: Readable.from([body]), size: body.length, url };
  };
  await downloadHlsVod({ url: new URL('https://media.example.org/generated.m3u8') }, downloaded, item, {
    openResource, rootDirectory: directory,
  });
  assert((await stat(downloaded)).size > 1000);
  assert.equal(item.inputFormat, 'mp4');
  assert.equal(item.bytes, (await stat(downloaded)).size);
  await assert.rejects(stat(join(directory, 'test-vod.hls')));
});

test('offline HLS remuxes a local fMP4 playlist with its init fragment', async (t) => {
  const parent = resolve(process.cwd(), 'tests');
  const directory = await mkdtemp(join(parent, '.streamflix-fmp4-'));
  t.after(async () => {
    const absolute = resolve(directory);
    assert(absolute.startsWith(parent + sep));
    await rm(absolute, { recursive: true, force: true });
  });
  const generated = join(directory, 'generated.m3u8');
  const output = join(directory, 'offline.part');
  const creation = spawnSync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=160x90:r=10:d=2',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-c:v', 'libx264', '-c:a', 'aac',
    '-f', 'hls', '-hls_time', '1', '-hls_playlist_type', 'vod', '-hls_segment_type', 'fmp4',
    '-hls_fmp4_init_filename', 'init.mp4', '-hls_segment_filename', 'part%03d.m4s', 'generated.m3u8',
  ], { cwd: directory, windowsHide: true, timeout: 15000 });
  assert.equal(creation.status, 0, creation.stderr?.toString());
  const parsed = parseHlsPlaylist(await readFile(generated, 'utf8'), new URL('https://media.example.org/generated.m3u8'));
  assert(parsed.resources.some((resource) => resource.name.startsWith('init')));
  for (const resource of parsed.resources) {
    await copyFile(join(directory, resource.url.pathname.split('/').pop()), join(directory, resource.name));
  }
  const localManifest = join(directory, 'offline.m3u8');
  await writeFile(localManifest, parsed.localPlaylist);
  const remux = spawnSync('ffmpeg', buildHlsRemuxArgs(localManifest, output), { windowsHide: true, timeout: 15000 });
  assert.equal(remux.status, 0, remux.stderr?.toString());
  assert((await stat(output)).size > 1000);
});
