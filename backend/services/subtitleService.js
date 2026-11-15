import axios from 'axios';

/**
 * Consulta el endpoint público de subtítulos v3 compatible con Stremio (Zero-API-Key)
 * Soporta Español Latino, Español Castellano e Inglés CC
 */
export async function getSubtitles(type, imdbId, season = null, episode = null) {
  try {
    if (!imdbId) return [];

    const isSeries = type === 'series' || type === 'tv' || Boolean(season && episode);
    const queryId = isSeries ? `${imdbId}:${season || 1}:${episode || 1}` : imdbId;
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

      if (lang === 'spl' || lang === 'es-mx' || lang === 'es-la') {
        if (latinoList.length < 6) {
          latinoList.push({
            id: sub.id || `lat-${latinoList.length + 1}`,
            lang: 'es-MX',
            langGroup: 'latino',
            label: `🇲🇽 Español Latino #${latinoList.length + 1}`,
            originalUrl: sub.url,
            vttUrl: `/api/subtitles/vtt?url=${encodeURIComponent(sub.url)}`,
          });
        }
      } else if (['spa', 'es', 'esp', 'spanish'].includes(lang)) {
        if (spanishList.length < 8) {
          spanishList.push({
            id: sub.id || `spa-${spanishList.length + 1}`,
            lang: 'es',
            langGroup: 'castellano',
            label: `🇪🇸 Español #${spanishList.length + 1}`,
            originalUrl: sub.url,
            vttUrl: `/api/subtitles/vtt?url=${encodeURIComponent(sub.url)}`,
          });
        }
      } else if (['eng', 'en', 'english'].includes(lang)) {
        if (englishList.length < 4) {
          englishList.push({
            id: sub.id || `eng-${englishList.length + 1}`,
            lang: 'en',
            langGroup: 'en',
            label: `🇺🇸 English CC #${englishList.length + 1}`,
            originalUrl: sub.url,
            vttUrl: `/api/subtitles/vtt?url=${encodeURIComponent(sub.url)}`,
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
  if (!srtContent) return 'WEBVTT\n\n';

  if (srtContent.trim().startsWith('WEBVTT')) {
    return srtContent;
  }

  const cleanSrt = srtContent.replace(/\r\n|\r/g, '\n');
  const vttBody = cleanSrt.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');

  return `WEBVTT\n\n${vttBody}`;
}

export default {
  getSubtitles,
  getSpanishSubtitles,
  convertSrtToVtt,
};
