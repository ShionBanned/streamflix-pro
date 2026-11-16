import axios from 'axios';
import { randomUUID } from 'node:crypto';
import { toWebVtt } from '../../shared/subtitleUtils.mjs';

const downloads = new Map();
function validateSubtitleUrl(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port && !['80', '443'].includes(url.port) || /^(localhost|.*\.localhost|.*\.local|\d+(?:\.\d+){3}|\[.*\])$/i.test(url.hostname)) throw new Error('Origen de subtítulos no permitido');
  return url.href;
}
function registerSubtitle(value) {
  const url = validateSubtitleUrl(value); const id = randomUUID();
  for (const [key, entry] of downloads) if (entry.expiresAt <= Date.now()) downloads.delete(key);
  if (downloads.size >= 1000) downloads.delete(downloads.keys().next().value);
  downloads.set(id, { url, expiresAt: Date.now() + 30 * 60 * 1000 });
  return `/api/subtitles/vtt?id=${id}`;
}

export async function fetchSubtitle(id) {
  const entry = downloads.get(id);
  if (!entry || entry.expiresAt <= Date.now()) throw Object.assign(new Error('El enlace de subtítulos venció. Vuelve a buscar la pista.'), { status: 410 });
  const response = await axios.get(entry.url, {
    responseType: 'text', timeout: 9000, maxContentLength: 2 * 1024 * 1024, maxBodyLength: 2 * 1024 * 1024, maxRedirects: 3,
    beforeRedirect: options => validateSubtitleUrl(`${options.protocol}//${options.hostname}${options.port ? ':' + options.port : ''}${options.path}`),
  });
  return toWebVtt(response.data);
}

const STOP_TOKENS = new Set(['1080p', '720p', '2160p', '4k', 'x264', 'x265', 'h264', 'h265', 'hevc', 'av1', 'aac', 'ac3', 'eac3', 'dts', 'ddp', 'ddp5', 'atmos', '10bit', 'hdr', 'dv', 'sdr', 'mkv', 'mp4', 'avi', 'srt', 'vtt', 'latino', 'spanish', 'english', 'esp', 'eng', 'sub', 'subs']);

function tokenizeRelease(value = '') {
  return String(value)
    .toLowerCase()
    .replace(/\.[a-z0-9]{2,4}$/i, '')
    .split(/[^a-z0-9]+/)
    .filter(token => token.length >= 2);
}

function extractSourceType(tokens) {
  const joined = tokens.join(' ');
  if (/\b(?:web\s*dl|webdl)\b/.test(joined)) return 'web-dl';
  if (/\b(?:web\s*rip|webrip|web)\b/.test(joined)) return 'webrip';
  if (/\b(?:blu\s*ray|bluray|bdrip|brrip|remux)\b/.test(joined)) return 'bluray';
  if (/\b(?:hdtv|pdtv)\b/.test(joined)) return 'hdtv';
  if (/\b(?:hdrip|dvdrip)\b/.test(joined)) return 'hdrip';
  return null;
}

export function scoreSubtitleRelease(subRelease = '', targetRelease = '') {
  if (!targetRelease || !subRelease) return 0;
  const targetTokens = tokenizeRelease(targetRelease);
  const subTokens = tokenizeRelease(subRelease);
  if (!targetTokens.length || !subTokens.length) return 0;

  let score = 0;
  const subSet = new Set(subTokens);
  const targetSource = extractSourceType(targetTokens);
  const subSource = extractSourceType(subTokens);
  if (targetSource && subSource) {
    score += targetSource === subSource ? 30 : -10;
  }

  // Último token suele ser el release group (e.g. SPARKS, YTS, NTb, FLUX)
  const targetGroup = targetTokens[targetTokens.length - 1];
  const subGroup = subTokens[subTokens.length - 1];
  if (targetGroup && !STOP_TOKENS.has(targetGroup) && targetGroup.length >= 3) {
    if (subGroup === targetGroup) score += 50;
    else if (subSet.has(targetGroup)) score += 35;
  }

  for (const token of targetTokens) {
    if (STOP_TOKENS.has(token)) {
      if (subSet.has(token)) score += 6;
    } else if (token.length >= 3 && subSet.has(token)) {
      score += 12;
    }
  }

  if (/\b(?:hi|sdh|hearing)\b/i.test(subRelease)) score -= 3;
  return score;
}

/**
 * Consulta el endpoint público de subtítulos v3 compatible con Stremio (Zero-API-Key)
 * Soporta Español Latino, Español Castellano e Inglés CC con puntuación por release
 */
export async function getSubtitles(type, imdbId, season = null, episode = null, release = '') {
  try {
    if (!/^tt\d+$/.test(String(imdbId))) return [];

    const isSeries = type === 'series' || type === 'tv' || Boolean(season && episode);
    if (isSeries && (!Number.isInteger(Number(season || 1)) || Number(season || 1) < 1 || !Number.isInteger(Number(episode || 1)) || Number(episode || 1) < 1)) return [];
    const queryId = isSeries ? `${imdbId}:${Number(season || 1)}:${Number(episode || 1)}` : imdbId;
    const url = `https://opensubtitles-v3.strem.io/subtitles/${isSeries ? 'series' : 'movie'}/${queryId}.json`;

    const { data } = await axios.get(url, {
      timeout: 8000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!data || !data.subtitles || !Array.isArray(data.subtitles)) {
      return [];
    }

    const latinoPool = [];
    const spanishPool = [];
    const englishPool = [];

    for (const sub of data.subtitles) {
      const lang = (sub.lang || '').toLowerCase();
      if (!sub.url) continue;
      try { validateSubtitleUrl(sub.url); } catch { continue; }
      const subRelease = String(sub.release || sub.name || sub.title || '').slice(0, 120);
      const score = scoreSubtitleRelease(subRelease, release);
      const matching = score >= 30 ? 'release-matched' : 'unverified';
      const entry = { raw: sub, subRelease, score, matching };

      if (lang === 'spl' || lang === 'es-mx' || lang === 'es-la') {
        latinoPool.push(entry);
      } else if (['spa', 'es', 'esp', 'spanish'].includes(lang)) {
        spanishPool.push(entry);
      } else if (['eng', 'en', 'english'].includes(lang)) {
        englishPool.push(entry);
      }
    }

    const sortAndSlice = (pool, limit, prefix, langCode, langGroup, baseLabel) =>
      pool
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map((item, idx) => ({
          id: `${prefix}-${item.raw.id || idx + 1}`,
          lang: langCode,
          langGroup,
          label: `${item.matching === 'release-matched' ? '✓ Sync · ' : ''}${baseLabel} #${idx + 1}`,
          release: item.subRelease,
          score: item.score,
          matching: item.matching,
          vttUrl: registerSubtitle(item.raw.url),
        }));

    return [
      ...sortAndSlice(latinoPool, 6, 'lat', 'es-MX', 'latino', '🇲🇽 Español Latino'),
      ...sortAndSlice(spanishPool, 8, 'spa', 'es', 'castellano', '🇪🇸 Español'),
      ...sortAndSlice(englishPool, 4, 'eng', 'en', 'en', '🇺🇸 English CC'),
    ];
  } catch (error) {
    console.error('[SubtitleService Error]:', error.message);
    return [];
  }
}

export const getSpanishSubtitles = getSubtitles;

/**
 * Convierte un texto SRT tradicional a formato WebVTT estándar
 */
export function convertSrtToVtt(srtContent = '') {
  return toWebVtt(srtContent);
}

export default {
  getSubtitles,
  getSpanishSubtitles,
  convertSrtToVtt,
  fetchSubtitle,
  scoreSubtitleRelease,
};
