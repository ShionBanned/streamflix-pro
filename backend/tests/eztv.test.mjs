import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchEztvDirectStreams, normalizeEztvTorrents } from '../services/eztv.js';

const episode = { imdbId: 'tt1234567', season: 2, episode: 3 };
const valid = { imdb_id: '1234567', season: 2, episode: 3, hash: 'A'.repeat(40), title: 'Example S02E03 1080p', filename: 'Example.S02E03.mp4', seeds: 18, size_bytes: 1_500_000_000 };

test('EZTV accepts only the requested episode and valid hashes', () => {
  const streams = normalizeEztvTorrents([
    valid,
    { ...valid, hash: 'B'.repeat(40), episode: 4 },
    { ...valid, hash: 'C'.repeat(40), imdb_id: '7654321' },
    { ...valid, hash: 'not-a-hash' },
    valid,
  ], episode);
  assert.equal(streams.length, 1);
  assert.equal(streams[0].infoHash, 'a'.repeat(40));
  assert.equal(streams[0].addonSource, 'eztv');
  assert.match(streams[0].title, /👤 18/);
  assert.equal(streams[0].behaviorHints.filename, 'Example.S02E03.mp4');
});

test('EZTV checks later pages only when the first page lacks the requested episode', async () => {
  const pages = [];
  const get = async (_url, { params }) => {
    pages.push(params.page);
    assert.equal(params.imdb_id, '1234567');
    return { data: { torrents_count: 180, torrents: params.page === 2 ? [valid] : [{ ...valid, episode: 9 }] } };
  };
  const streams = await fetchEztvDirectStreams({ ...episode, get });
  assert.deepEqual(pages, [1, 2]);
  assert.equal(streams.length, 1);
});

test('EZTV failure leaves the other stream providers available', async () => {
  const streams = await fetchEztvDirectStreams({ ...episode, get: async () => { throw new Error('network unavailable'); } });
  assert.deepEqual(streams, []);
});
