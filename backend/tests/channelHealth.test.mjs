import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { ChannelHealth } from '../services/channelHealth.js';

const HOUR = 60 * 60 * 1000;

test('channel health keeps sources, hides only repeated failures spread over 48 hours and restores on playback', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'streamflix-health-'));
  t.after(async () => {
    const absolute = resolve(dir);
    assert(absolute.startsWith(resolve(tmpdir()) + sep));
    await rm(absolute, { recursive: true, force: true });
  });
  const file = join(dir, 'health.json');
  let now = 1000;
  const health = new ChannelHealth({ file, now: () => now });
  const first = 'https://example.com/live.m3u8?token=private-one';
  const second = 'https://example.com/backup.m3u8?token=private-two';
  const channel = { id: 'test', name: 'Canal de prueba', url: first, sources: [{ url: first }, { url: second }] };
  const ids = health.decorate([channel]).channels[0].sources.map(source => source.healthId);
  assert.equal(health.decorate([channel]).channels.length, 1);
  for (const id of ids) health.report(id, 'network_error');
  now += 30_000;
  for (const id of ids) health.report(id, 'network_error');
  assert.equal(health.records.get(ids[0]).failures, 1);
  now += 3 * 60_000;
  for (const id of ids) health.report(id, 'network_error');
  now += 24 * HOUR;
  for (const id of ids) health.report(id, 'network_error');
  assert.equal(health.decorate([channel]).hiddenCount, 0);
  now += 25 * HOUR;
  for (const id of ids) health.report(id, 'network_error');
  assert.equal(health.decorate([channel]).hiddenCount, 1);
  assert.equal(health.decorate([channel]).channels.length, 0);
  assert.equal(health.decorate([channel], { includeHidden: true }).channels[0].hidden, true);
  const saved = await readFile(file, 'utf8');
  assert(!saved.includes('private-one') && !saved.includes('example.com'));
  const reloaded = new ChannelHealth({ file, now: () => now });
  assert.equal(reloaded.decorate([channel]).hiddenCount, 1);
  reloaded.report(ids[1], 'playing');
  const restored = reloaded.decorate([channel]);
  assert.equal(restored.hiddenCount, 0);
  assert.equal(restored.channels[0].sources[0].healthId, ids[1]);
  await assert.rejects(async () => reloaded.report('invalid', 'playing'));
});
