import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HOUR = 60 * 60 * 1000;
import { IPTV_HEALTH_FILE as DEFAULT_FILE } from '../config/paths.js';

export class ChannelHealth {
  constructor({ file = DEFAULT_FILE, now = Date.now } = {}) {
    this.file = file;
    this.now = now;
    this.records = new Map();
    this.known = new Set();
    this.urlHashCache = new Map();
    if (file) {
      try {
        const data = JSON.parse(readFileSync(file, 'utf8'));
        for (const [id, record] of Object.entries(data.records || {})) {
          if (/^[a-f0-9]{64}$/.test(id) && record && typeof record === 'object') {
            this.records.set(id, record);
          }
        }
      } catch (error) {
        if (error.code !== 'ENOENT') {
          console.warn('[IPTV Health] Estado anterior no disponible:', error.message);
        }
      }
    }
  }

  id(url) {
    let cached = this.urlHashCache.get(url);
    if (!cached) {
      cached = createHash('sha256').update(url).digest('hex');
      if (this.urlHashCache.size >= 25000) {
        this.urlHashCache.delete(this.urlHashCache.keys().next().value);
      }
      this.urlHashCache.set(url, cached);
    }
    return cached;
  }

  sourceStatus(id) {
    const record = this.records.get(id);
    if (!record) return 'unknown';
    if (!record.failures) return record.lastOnlineAt ? 'healthy' : 'unknown';
    if (record.failures < 3) return 'unstable';
    return record.lastFailedAt - record.firstFailedAt >= 24 * HOUR ? 'dead' : 'unstable';
  }

  decorate(channels, { includeHidden = false } = {}) {
    let hiddenCount = 0;
    const result = [];
    const rank = { healthy: 0, unknown: 1, unstable: 2, dead: 3 };
    for (const channel of channels) {
      const rawSources = channel.sources?.length ? channel.sources : [{ url: channel.url }];
      const sources = rawSources.map((source) => {
        const healthId = source.healthId || this.id(source.url);
        this.known.add(healthId);
        return { ...source, healthId, healthStatus: this.sourceStatus(healthId) };
      });
      if (sources.length > 1) {
        sources.sort((a, b) => rank[a.healthStatus] - rank[b.healthStatus]);
      }
      const hidden =
        sources.length > 0 &&
        sources.every((source) => {
          const record = this.records.get(source.healthId);
          return record?.failures >= 3 && record.lastFailedAt - record.firstFailedAt >= 48 * HOUR;
        });
      if (hidden) hiddenCount++;
      if (!hidden || includeHidden) {
        result.push({
          ...channel,
          url: sources[0]?.url || channel.url,
          sources,
          hidden,
        });
      }
    }
    return { channels: result, hiddenCount };
  }

  report(id, outcome) {
    if (
      typeof id !== 'string' ||
      !this.known.has(id) ||
      !['playing', 'network_error'].includes(outcome)
    ) {
      throw new Error('Fuente o resultado no válido.');
    }
    const current = this.records.get(id) || {
      failures: 0,
      firstFailedAt: null,
      lastFailedAt: null,
      lastOnlineAt: null,
    };
    const at = this.now();
    if (outcome === 'network_error' && current.lastFailedAt && at - current.lastFailedAt < 2 * 60_000) {
      return {
        status: this.sourceStatus(id),
        failures: current.failures,
        lastOnlineAt: current.lastOnlineAt,
      };
    }
    const next =
      outcome === 'playing'
        ? { failures: 0, firstFailedAt: null, lastFailedAt: null, lastOnlineAt: at }
        : {
            ...current,
            failures: Math.min(1000, current.failures + 1),
            firstFailedAt: current.firstFailedAt || at,
            lastFailedAt: at,
          };
    this.records.set(id, next);
    if (this.records.size > 10000) this.records.delete(this.records.keys().next().value);
    this.save();
    return {
      status: this.sourceStatus(id),
      failures: next.failures,
      lastOnlineAt: next.lastOnlineAt,
    };
  }

  save() {
    if (!this.file) return;
    mkdirSync(dirname(this.file), { recursive: true });
    const temporary = `${this.file}.tmp`;
    writeFileSync(temporary, JSON.stringify({ version: 1, records: Object.fromEntries(this.records) }));
    renameSync(temporary, this.file);
  }
}

export const channelHealth = new ChannelHealth();
