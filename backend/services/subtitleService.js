import axios from 'axios';

/**
 * Consulta el endpoint público de subtítulos v3 compatible con Stremio (Zero-API-Key)
 */
export async function getSpanishSubtitles(type, imdbId, season = null, episode = null) {
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

    // Filtrar solo subtítulos en español / latino
    const spanishSubs = data.subtitles
      .filter((sub) => {
        const lang = (sub.lang || '').toLowerCase();
        return ['spa', 'es', 'spl', 'esp', 'spanish'].includes(lang);
      })
      .slice(0, 10) // Tomar los 10 mejores resultados
      .map((sub, index) => {
        const isLatino = (sub.lang || '').toLowerCase() === 'spl';
        const labelText = isLatino
          ? `Español Latino (Opción ${index + 1})`
          : `Español (Opción ${index + 1})`;

        return {
          id: sub.id || `spa-${index + 1}`,
          lang: 'es',
          label: labelText,
          originalUrl: sub.url,
          // URL proxificada y convertida a WebVTT para el reproductor HTML5
          vttUrl: `http://localhost:4000/api/subtitles/vtt?url=${encodeURIComponent(sub.url)}`,
        };
      });

    return spanishSubs;
  } catch (error) {
    console.error('[SubtitleService Error]:', error.message);
    return [];
  }
}

/**
 * Convierte un texto SRT tradicional a formato WebVTT estándar
 */
export function convertSrtToVtt(srtContent = '') {
  if (!srtContent) return 'WEBVTT\n\n';

  // Si ya es WebVTT, devolver limpio
  if (srtContent.trim().startsWith('WEBVTT')) {
    return srtContent;
  }

  // Normalizar saltos de línea
  const cleanSrt = srtContent.replace(/\r\n|\r/g, '\n');

  // Reemplazar comas de milisegundos (00:01:23,456) por puntos (00:01:23.456)
  const vttBody = cleanSrt.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');

  return `WEBVTT\n\n${vttBody}`;
}

export default {
  getSpanishSubtitles,
  convertSrtToVtt,
};
