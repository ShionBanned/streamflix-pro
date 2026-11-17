import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDownloadUrl, validateOfflineSource, parseDownloadRange } from '../services/downloadService.js';

test('solo acepta archivos directos HTTPS en hosts públicos', () => {
  assert.equal(validateDownloadUrl('https://media.example.org/movie.mp4?token=abc').ext, '.mp4');
  assert.equal(validateDownloadUrl('https://media.example.org/movie.webm').ext, '.webm');
  for (const url of ['http://media.example.org/movie.mp4', 'https://127.0.0.1/movie.mp4', 'https://localhost/movie.mp4', 'https://media.example.org/movie.m3u8', 'https://user:pass@media.example.org/movie.mp4', 'https://media.example.org:8443/movie.mp4']) {
    assert.throws(() => validateDownloadUrl(url));
  }
});

test('acepta una fuente P2P concreta y una calidad offline reconocida', () => {
  assert.equal(validateOfflineSource({ infoHash: 'a'.repeat(40), fileIdx: 2, quality: 'compact' }).fileIdx, 2);
  assert.equal(validateOfflineSource({ url: 'https://media.example.org/video.mp4', quality: 'original' }).quality, 'original');
  for (const source of [{ infoHash: 'bad' }, { infoHash: 'a'.repeat(40), url: 'https://media.example.org/video.mp4' }, { infoHash: 'a'.repeat(40), fileIdx: -1 }, { url: 'https://media.example.org/video.mp4', quality: 'tiny' }]) assert.throws(() => validateOfflineSource(source));
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
