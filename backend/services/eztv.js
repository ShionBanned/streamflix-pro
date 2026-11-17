import axios from 'axios';

const API_URL = 'https://eztvx.to/api/get-torrents';
const PAGE_SIZE = 100;
const MAX_PAGES = 4;

function formatSize(bytes) {
  const size = Number(bytes);
  if (!Number.isFinite(size) || size <= 0) return null;
  return size >= 1024 ** 3
    ? `${(size / 1024 ** 3).toFixed(2)} GB`
    : `${Math.round(size / 1024 ** 2)} MB`;
}

export function normalizeEztvTorrents(torrents, { imdbId, season, episode }) {
  if (!Array.isArray(torrents) || !/^tt\d{7,10}$/.test(String(imdbId || ''))) return [];
  const showId = Number(imdbId.slice(2));
  const expectedSeason = Number(season);
  const expectedEpisode = Number(episode);
  if (!Number.isSafeInteger(expectedSeason) || expectedSeason < 1 || !Number.isSafeInteger(expectedEpisode) || expectedEpisode < 1) return [];

  const seen = new Set();
  const streams = [];
  for (const torrent of torrents.slice(0, PAGE_SIZE * MAX_PAGES)) {
    if (Number(torrent?.imdb_id) !== showId || Number(torrent.season) !== expectedSeason || Number(torrent.episode) !== expectedEpisode) continue;
    const hash = String(torrent.hash || '').toLowerCase();
    if (!/^[a-f0-9]{40}$/.test(hash) || seen.has(hash)) continue;
    const title = String(torrent.title || torrent.filename || '').trim().slice(0, 240);
    if (!title) continue;
    seen.add(hash);
    const seeds = Number(torrent.seeds);
    const size = formatSize(torrent.size_bytes);
    streams.push({
      infoHash: hash,
      name: 'EZTV Direct',
      title: `${title}\n👤 ${Number.isSafeInteger(seeds) && seeds > 0 ? seeds : 0}${size ? ` 💾 ${size}` : ''} 🌐 EZTV`,
      behaviorHints: { filename: String(torrent.filename || title).slice(0, 200) },
      addonSource: 'eztv',
    });
  }
  return streams;
}

export async function fetchEztvDirectStreams({ imdbId, season, episode, get = axios.get } = {}) {
  if (!/^tt\d{7,10}$/.test(String(imdbId || ''))) return [];
  if (!Number.isSafeInteger(Number(season)) || Number(season) < 1 || !Number.isSafeInteger(Number(episode)) || Number(episode) < 1) return [];

  const fetchPage = async (page) => {
    try {
      const response = await get(API_URL, {
        params: { imdb_id: imdbId.slice(2), limit: PAGE_SIZE, page },
        timeout: 4500,
        maxContentLength: 2_000_000,
        headers: { Accept: 'application/json' },
      });
      return response?.data && Array.isArray(response.data.torrents) ? response.data : null;
    } catch { return null; }
  };

  const first = await fetchPage(1);
  if (!first) return [];
  const firstMatches = normalizeEztvTorrents(first.torrents, { imdbId, season, episode });
  if (firstMatches.length) return firstMatches;

  const total = Number(first.torrents_count);
  const pageCount = Math.min(MAX_PAGES, Number.isFinite(total) && total > 0 ? Math.ceil(total / PAGE_SIZE) : 1);
  if (pageCount <= 1) return [];
  const remaining = await Promise.all(Array.from({ length: pageCount - 1 }, (_, i) => fetchPage(i + 2)));
  return normalizeEztvTorrents(remaining.flatMap((page) => page?.torrents || []), { imdbId, season, episode });
}
