import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateDownloadUrl,
  validateOfflineSource,
  parseDownloadRange,
  buildNetflixEncodeArgs,
  OFFLINE_PROFILES,
} from '../services/downloadService.js';

test('solo acepta archivos directos HTTPS en hosts públicos', () => {
  assert.equal(validateDownloadUrl('https://media.example.org/movie.mp4?token=abc').ext, '.mp4');
  assert.equal(validateDownloadUrl('https://media.example.org/movie.webm').ext, '.webm');
  for (const url of [
    'http://media.example.org/movie.mp4',
    'https://127.0.0.1/movie.mp4',
    'https://localhost/movie.mp4',
    'https://user:pass@media.example.org/movie.mp4',
    'https://media.example.org:8443/movie.mp4',
  ]) {
    assert.throws(() => validateDownloadUrl(url));
  }
});

test('acepta una fuente P2P concreta y las calidades offline reconocidas (incluyendo marathon)', () => {
  assert.equal(validateOfflineSource({ infoHash: 'a'.repeat(40), fileIdx: 2, quality: 'compact' }).fileIdx, 2);
  assert.equal(validateOfflineSource({ infoHash: 'b'.repeat(40), season: 1, episode: 3, quality: 'marathon' }).quality, 'marathon');
  assert.equal(validateOfflineSource({ url: 'https://media.example.org/video.mp4', quality: 'original' }).quality, 'original');
  for (const source of [
    { infoHash: 'bad' },
    { infoHash: 'a'.repeat(40), url: 'https://media.example.org/video.mp4' },
    { infoHash: 'a'.repeat(40), fileIdx: -1 },
    { url: 'https://media.example.org/video.mp4', quality: 'tiny' },
  ]) {
    assert.throws(() => validateOfflineSource(source));
  }
});

test('genera argumentos FFmpeg con fórmula psicovisual Per-Title de Netflix para compact y marathon', () => {
  assert.ok(OFFLINE_PROFILES.marathon);
  assert.ok(OFFLINE_PROFILES.compact);
  const compactArgs = buildNetflixEncodeArgs('in.mkv', 'out.mp4', {
    quality: 'compact',
    audioTrackIdx: 1,
    fps: 24,
    isAnimationOrClean: false,
  });
  assert(compactArgs.includes('-x264-params'));
  const x264Idx = compactArgs.indexOf('-x264-params');
  assert.match(compactArgs[x264Idx + 1], /aq-mode=3/);
  assert.match(compactArgs[x264Idx + 1], /bframes=6/);
  assert.match(compactArgs[x264Idx + 1], /mbtree=1/);
  assert(compactArgs.includes('0:a:1?'));

  const marathonArgs = buildNetflixEncodeArgs('in.mkv', 'out.mp4', {
    quality: 'marathon',
    fps: 60,
    isAnimationOrClean: true,
  });
  const vfIdx = marathonArgs.indexOf('-vf');
  assert.match(marathonArgs[vfIdx + 1], /fps=24/);
  assert.match(marathonArgs[vfIdx + 1], /1024/);
  assert.match(marathonArgs[vfIdx + 1], /576/);
});

test('interpreta rangos para reproducción local y rechaza rangos inválidos', () => {
  assert.deepEqual(parseDownloadRange(undefined, 100), { start: 0, end: 99, partial: false });
  assert.deepEqual(parseDownloadRange('bytes=10-19', 100), { start: 10, end: 19, partial: true });
  assert.deepEqual(parseDownloadRange('bytes=-20', 100), { start: 80, end: 99, partial: true });
  assert.deepEqual(parseDownloadRange('bytes=95-', 100), { start: 95, end: 99, partial: true });
  assert.equal(parseDownloadRange('bytes=100-', 100), null);
  assert.equal(parseDownloadRange('bytes=10-5', 100), null);
  assert.equal(parseDownloadRange('bytes=0-1,5-6', 100), null);
});
