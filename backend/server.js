import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import axios from 'axios';
import tmdbService from './services/tmdbService.js';
import torrentio from './services/torrentio.js';
import streamEngine from './services/streamEngine.js';
import iptvService from './services/iptvParser.js';
import subtitleService from './services/subtitleService.js';
import externalPlayer from './services/externalPlayer.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// Configuración de Middlewares
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Range', 'Authorization'],
  exposedHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length', 'Content-Type'],
}));

app.use(express.json());

// -------------------------------------------------------------
// RUTAS MÓDULO A: Catálogo, Metadatos, Anime y Hubs TMDB
// -------------------------------------------------------------

// Tendencias globales de la semana
app.get('/api/tmdb/trending', async (req, res) => {
  try {
    const { type = 'all', window = 'week', page = 1 } = req.query;
    const data = await tmdbService.getTrending(type, window, Number(page));
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Error obteniendo tendencias', message: err.message });
  }
});

// Películas en cartelera / recientes
app.get('/api/tmdb/now-playing', async (req, res) => {
  try {
    const { page = 1 } = req.query;
    const data = await tmdbService.getNowPlaying(Number(page));
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Error obteniendo cartelera', message: err.message });
  }
});

// Películas populares
app.get('/api/tmdb/popular-movies', async (req, res) => {
  try {
    const { page = 1 } = req.query;
    const data = await tmdbService.getPopularMovies(Number(page));
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Error obteniendo películas populares', message: err.message });
  }
});

// Series populares
app.get('/api/tmdb/popular-series', async (req, res) => {
  try {
    const { page = 1 } = req.query;
    const data = await tmdbService.getPopularSeries(Number(page));
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Error obteniendo series populares', message: err.message });
  }
});

// Películas mejor valoradas
app.get('/api/tmdb/top-rated', async (req, res) => {
  try {
    const { page = 1 } = req.query;
    const data = await tmdbService.getTopRated(Number(page));
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Error obteniendo mejor valoradas', message: err.message });
  }
});

// Buscador universal
app.get('/api/tmdb/search', async (req, res) => {
  try {
    const { query = '', page = 1 } = req.query;
    const data = await tmdbService.searchMulti(query, Number(page));
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Error en búsqueda', message: err.message });
  }
});

// Detalle de película
app.get('/api/tmdb/movie/:id', async (req, res) => {
  try {
    const data = await tmdbService.getMovieDetails(req.params.id);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Error obteniendo detalle de película', message: err.message });
  }
});

// Detalle de serie
app.get('/api/tmdb/tv/:id', async (req, res) => {
  try {
    const data = await tmdbService.getTvDetails(req.params.id);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Error obteniendo detalle de serie', message: err.message });
  }
});

// Detalle de temporada de serie
app.get('/api/tmdb/tv/:id/season/:seasonNumber', async (req, res) => {
  try {
    const data = await tmdbService.getSeasonDetails(req.params.id, req.params.seasonNumber);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Error obteniendo episodios de temporada', message: err.message });
  }
});

// MÓDULO ANIME: Descubrimiento de anime japonés estilo Crunchyroll
app.get('/api/catalog/anime', async (req, res) => {
  try {
    const { page = 1 } = req.query;
    const data = await tmdbService.getAnime(Number(page));
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Error obteniendo catálogo de anime', message: err.message });
  }
});

// MÓDULO HUBS: Filtrar catálogo por plataforma (Netflix, Prime, Disney+, Max, Apple TV+, Crunchyroll)
app.get('/api/catalog/provider/:providerId', async (req, res) => {
  try {
    const { providerId } = req.params;
    const { page = 1 } = req.query;
    const data = await tmdbService.getByProvider(Number(providerId), Number(page));
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Error obteniendo catálogo de la plataforma', message: err.message });
  }
});

// MÓDULO TRÁILERS: Obtener tráiler oficial de YouTube
app.get('/api/catalog/:type/:tmdbId/videos', async (req, res) => {
  try {
    const { type, tmdbId } = req.params;
    const trailer = await tmdbService.getTrailers(type, tmdbId);
    res.json({ trailer });
  } catch (err) {
    res.status(500).json({ error: 'Error obteniendo tráiler', message: err.message });
  }
});

// -------------------------------------------------------------
// RUTAS MÓDULO B: Motor Híbrido de Video (Router Inteligente)
// -------------------------------------------------------------

/**
 * Resuelve la fuente óptima (P2P vs AutoEmbed) para cualquier película, serie o anime
 */
app.get('/api/resolve', async (req, res) => {
  try {
    let { tmdbId, imdbId, type = 'movie', season, episode, originalLanguage } = req.query;

    if (!imdbId && tmdbId) {
      imdbId = await tmdbService.getImdbId(type, tmdbId);
    }

    if (!imdbId) {
      return res.status(400).json({
        error: 'No se pudo obtener el imdb_id para este título',
        tmdbId,
        type,
      });
    }

    const resolution = await torrentio.getTorrentioStreams({
      imdbId,
      type,
      season: season ? Number(season) : null,
      episode: episode ? Number(episode) : null,
      originalLanguage,
    });

    res.json(resolution);
  } catch (err) {
    console.error('[API Resolve Error]:', err.message);
    res.status(500).json({ error: 'Error resolviendo fuentes de video', message: err.message });
  }
});

// -------------------------------------------------------------
// RUTAS P2P: Servidor de Streaming WebTorrent con HTTP Range 206
// -------------------------------------------------------------

// Stream directo del archivo de video dentro del torrent
app.get('/api/stream/:infoHash', async (req, res) => {
  const { infoHash } = req.params;
  if (!infoHash) {
    return res.status(400).json({ error: 'infoHash es requerido' });
  }
  await streamEngine.streamTorrent(infoHash, req, res);
});

// Estado en tiempo real del torrent (peers, velocidad, porcentaje)
app.get('/api/stream/:infoHash/status', (req, res) => {
  const { infoHash } = req.params;
  const status = streamEngine.getStatus(infoHash);
  res.json(status);
});

// Cierre explícito de reproducción para autolimpieza de almacenamiento en disco
app.post('/api/stream/close', (req, res) => {
  const { infoHash } = req.body;
  if (infoHash) {
    streamEngine.destroyTorrent(infoHash, true);
  }
  res.json({ success: true, message: 'Almacenamiento temporal liberado' });
});

// -------------------------------------------------------------
// MÓDULO EXPANSION: Motor de Subtítulos en Español (Zero-API-Key)
// -------------------------------------------------------------

// Obtener lista de subtítulos en español para un título
app.get('/api/subtitles/:type/:imdbId', async (req, res) => {
  try {
    const { type, imdbId } = req.params;
    const { season, episode } = req.query;

    const subtitles = await subtitleService.getSpanishSubtitles(type, imdbId, season, episode);
    res.json({
      imdbId,
      total: subtitles.length,
      subtitles,
    });
  } catch (err) {
    console.error('[Subtitles Route Error]:', err.message);
    res.status(500).json({ error: 'Error obteniendo subtítulos', message: err.message });
  }
});

// Proxy y Conversor automático de .SRT a WebVTT para etiquetas <track> de HTML5
app.get('/api/subtitles/vtt', async (req, res) => {
  const { url } = req.query;
  if (!url) {
    return res.status(400).send('WEBVTT\n\nURL no proporcionada');
  }

  try {
    const srtRes = await axios.get(url, {
      responseType: 'text',
      timeout: 9000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    const vttContent = subtitleService.convertSrtToVtt(srtRes.data);

    res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(vttContent);
  } catch (err) {
    console.error('[VTT Conversion Error]:', err.message);
    res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
    res.send('WEBVTT\n\n1\n00:00:01.000 --> 00:00:04.000\nSubtítulo no disponible');
  }
});

// -------------------------------------------------------------
// MÓDULO EXPANSION: Lanzador Nativo VLC / MPV (Audio AC3/DTS/Dolby)
// -------------------------------------------------------------

app.post('/api/player/launch', (req, res) => {
  try {
    const { player = 'vlc', streamUrl, subtitleUrl, title } = req.body;

    if (!streamUrl) {
      return res.status(400).json({ error: 'streamUrl es requerido' });
    }

    const result = externalPlayer.launchExternalPlayer(player, streamUrl, subtitleUrl, title);
    res.json(result);
  } catch (err) {
    console.error('[Player Launch Error]:', err.message);
    res.status(500).json({ error: 'Error lanzando reproductor', message: err.message });
  }
});

// -------------------------------------------------------------
// RUTAS MÓDULO C: Televisión en Vivo (Motor IPTV M3U)
// -------------------------------------------------------------

// Canales por país, categoría, o listas personalizadas agregadas
app.get('/api/iptv/channels', async (req, res) => {
  try {
    const {
      country,
      category,
      refresh = 'false',
      url,
      customUrls,
      server,
      username,
      password,
    } = req.query;

    const parsedCustomUrls = [];
    if (url) parsedCustomUrls.push(url);
    if (customUrls) {
      if (typeof customUrls === 'string') {
        try {
          const parsed = JSON.parse(customUrls);
          if (Array.isArray(parsed)) parsedCustomUrls.push(...parsed);
          else parsedCustomUrls.push(customUrls);
        } catch {
          parsedCustomUrls.push(...customUrls.split(',').map((u) => u.trim()));
        }
      } else if (Array.isArray(customUrls)) {
        parsedCustomUrls.push(...customUrls);
      }
    }

    const xtream = server && username && password ? { server, username, password } : null;

    let channels = await iptvService.getChannels({
      forceRefresh: refresh === 'true' || refresh === '1',
      customUrls: parsedCustomUrls,
      xtream,
    });

    if (country && country !== 'all') {
      channels = channels.filter((c) => c.country === country || c.country === 'custom');
    }
    if (category && category !== 'Todos') {
      channels = channels.filter((c) => c.category === category);
    }

    const categories = [
      'Todos',
      'Pluto TV 24/7',
      'Deportes',
      'Películas y Series',
      'Noticias',
      'Infantil y Anime',
      'Música',
      'Colombia',
      'México',
      'Argentina',
      'España',
      'Entretenimiento',
    ];

    res.json({
      total: channels.length,
      categories,
      sources: iptvService.DEFAULT_M3U_SOURCES,
      channels,
    });
  } catch (err) {
    res.status(500).json({ error: 'Error obteniendo canales IPTV', message: err.message });
  }
});

// Endpoint POST para consultar listas M3U y credenciales Xtream Codes dinámicamente
app.post('/api/iptv/custom', async (req, res) => {
  try {
    const { customUrls = [], xtream = null, forceRefresh = false } = req.body;
    const channels = await iptvService.getChannels({
      forceRefresh,
      customUrls,
      xtream,
    });
    res.json({
      total: channels.length,
      channels,
    });
  } catch (err) {
    res.status(500).json({ error: 'Error procesando listas personalizadas', message: err.message });
  }
});

// Países y fuentes disponibles
app.get('/api/iptv/countries', (req, res) => {
  res.json({
    countries: iptvService.COUNTRY_NAMES,
    sources: iptvService.DEFAULT_M3U_SOURCES,
  });
});

// Proxy de stream para canales con bloqueos CORS
app.get('/api/iptv/proxy', async (req, res) => {
  const { url } = req.query;
  if (!url) {
    return res.status(400).json({ error: 'Parámetro url es requerido para el proxy' });
  }
  await iptvService.proxyStream(url, req, res);
});

// -------------------------------------------------------------
// Health Check
// -------------------------------------------------------------
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    version: '2.2.0',
    platform: 'StreamFlix Pro: Hybrid Engine + Anime & Platform Hubs ($0 Cost)',
    timestamp: new Date().toISOString(),
  });
});

// Manejo global de excepciones para prevenir cierres por desconexiones prematuras de clientes HTTP
process.on('uncaughtException', (err) => {
  if (err.code === 'PREMATURE_CLOSE' || err.code === 'ERR_STREAM_PREMATURE_CLOSE') return;
  console.error('[Middleware Uncaught Exception]:', err.message);
});

process.on('unhandledRejection', (reason) => {
  console.error('[Middleware Unhandled Rejection]:', reason);
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🚀 StreamFlix Middleware activo en: http://localhost:${PORT}`);
  console.log(`📺 IPTV, Torrentio P2P, Anime, Hubs, OpenSubtitles & VLC/MPV listos`);
  console.log(`=======================================================`);
});
