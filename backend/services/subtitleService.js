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

/**
 * Consulta el endpoint público de subtítulos v3 compatible con Stremio (Zero-API-Key)
 * Soporta Español Latino, Español Castellano e Inglés CC
 */
export async function getSubtitles(type, imdbId, season = null, episode = null) {
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

    const latinoList = [];
    const spanishList = [];
    const englishList = [];

    for (const sub of data.subtitles) {
      const lang = (sub.lang || '').toLowerCase();
      if (!sub.url) continue;
      try { validateSubtitleUrl(sub.url); } catch { continue; }

      if (lang === 'spl' || lang === 'es-mx' || lang === 'es-la') {
        if (latinoList.length < 6) {
          latinoList.push({
            id: `lat-${sub.id || latinoList.length + 1}`,
            lang: 'es-MX',
            langGroup: 'latino',
            label: `🇲🇽 Español Latino #${latinoList.length + 1}`,
            release: String(sub.release || sub.name || sub.title || '').slice(0, 120), matching: 'unverified',
            vttUrl: registerSubtitle(sub.url),
          });
        }
      } else if (['spa', 'es', 'esp', 'spanish'].includes(lang)) {
        if (spanishList.length < 8) {
          spanishList.push({
            id: `spa-${sub.id || spanishList.length + 1}`,
            lang: 'es',
            langGroup: 'castellano',
            label: `🇪🇸 Español #${spanishList.length + 1}`,
            release: String(sub.release || sub.name || sub.title || '').slice(0, 120), matching: 'unverified',
            vttUrl: registerSubtitle(sub.url),
          });
        }
      } else if (['eng', 'en', 'english'].includes(lang)) {
        if (englishList.length < 4) {
          englishList.push({
            id: `eng-${sub.id || englishList.length + 1}`,
            lang: 'en',
            langGroup: 'en',
            label: `🇺🇸 English CC #${englishList.length + 1}`,
            release: String(sub.release || sub.name || sub.title || '').slice(0, 120), matching: 'unverified',
            vttUrl: registerSubtitle(sub.url),
          });
        }
      }
    }

    return [...latinoList, ...spanishList, ...englishList];
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
};
