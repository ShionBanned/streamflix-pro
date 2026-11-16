import { checkCloudHealth } from './services/cloudHealth.js';
import { getSiteServers, getResolvedSiteServers, searchSiteTitles } from './services/siteServers.js';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import axios from 'axios';
import tmdbService from './services/tmdbService.js';
import torrentio from './services/torrentio.js';
import streamEngine from './services/streamEngine.js';
import iptvService from './services/iptvParser.js';
import subtitleService from './services/subtitleService.js';
import { extractSubtitleVtt } from './services/mediaTools.js';
import externalPlayer from './services/externalPlayer.js';
import fs from 'node:fs';
import { aiAvailable, getAiJob, getAiVtt, publicAiJob, receiveUpload, startP2pJob, startUploadJob } from './services/aiSubtitles.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(
  cors({
    origin: (origin, callback) => callback(null, !origin || /^http:\/\/(?:localhost|127\.0\.0\.1):(?:4000|5173)$/.test(origin)),
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Range', 'Authorization'],
    exposedHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length', 'Content-Type'],
  })
);

app.use(express.json());

app.get('/api/ai/status', (_req, res) => res.json({ available: aiAvailable(), engine: 'Whisper local', privacy: 'El audio se procesa en este equipo.' }));
app.post('/api/ai/subtitles/p2p', async (req, res) => {
  try {
    const job = await startP2pJob({ ...req.body, port: PORT });
    res.status(202).json(publicAiJob(job));
  } catch (error) { res.status(error.message.includes('Ya se está') ? 409 : 400).json({ error: error.message }); }
});
app.post('/api/ai/subtitles/upload', async (req, res) => {
  if (req.headers['content-type'] !== 'application/octet-stream') return res.status(415).json({ error: 'Envía un archivo de audio o video.' });
  if (Number(req.headers['content-length']) > 1024 ** 3) return res.status(413).json({ error: 'El archivo supera 1 GB.' });
  try {
    const file = await receiveUpload(req);
    const job = startUploadJob(file, { language: req.query.language || 'auto', audioTrack: req.query.audioTrack || 0 });
    res.status(202).json(publicAiJob(job));
  } catch (error) { if (!res.headersSent && !res.destroyed) res.status(400).json({ error: error.message }); }
});
app.get('/api/ai/subtitles/:id', (req, res) => {
  const job = getAiJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Tarea no encontrada.' });
  res.setHeader('Cache-Control', 'no-store'); res.json(publicAiJob(job));
});
app.get('/api/ai/subtitles/:id/vtt', (req, res) => {
  const file = getAiVtt(req.params.id);
  if (!file) return res.status(404).json({ error: 'Subtítulos aún no disponibles.' });
  try { res.setHeader('Cache-Control', 'no-store'); res.type('text/vtt').send(fs.readFileSync(file, 'utf8')); }
  catch { res.status(500).json({ error: 'No se pudo leer el VTT generado.' }); }
});

// -------------------------------------------------------------
// RUTAS MÓDULO A: Catálogo, Explorador por Décadas/Géneros, Anime y Hubs TMDB
// -------------------------------------------------------------

app.get('/api/tmdb/trending', async (req, res) => {
  try {
    const { type = 'all', window = 'week', page = 1, lang = 'es-MX' } = req.query;
    const data = await tmdbService.getTrending(type, window, Number(page), lang);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Error obteniendo tendencias', message: err.message });
  }
});

app.get('/api/tmdb/now-playing', async (req, res) => {
  try {
    const { page = 1, lang = 'es-MX' } = req.query;
    const data = await tmdbService.getNowPlaying(Number(page), lang);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Error obteniendo cartelera', message: err.message });
  }
});

app.get('/api/tmdb/popular-movies', async (req, res) => {
  try {
    const { page = 1, lang = 'es-MX' } = req.query;
    const data = await tmdbService.getPopularMovies(Number(page), lang);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Error obteniendo películas populares', message: err.message });
  }
});

app.get('/api/tmdb/popular-series', async (req, res) => {
  try {
    const { page = 1, lang = 'es-MX' } = req.query;
    const data = await tmdbService.getPopularSeries(Number(page), lang);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Error obteniendo series populares', message: err.message });
  }
});

app.get('/api/tmdb/top-rated', async (req, res) => {
  try {
    const { page = 1, lang = 'es-MX' } = req.query;
    const data = await tmdbService.getTopRated(Number(page), lang);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Error obteniendo mejor valoradas', message: err.message });
  }
});

// Explorador avanzado por tipo, género, década (70s, 80s, 90s, 2000s, 2010s, 2020s) y cadena de TV
app.get('/api/tmdb/discover', async (req, res) => {
  try {
    const {
      type = 'movie',
      genre = null,
      decade = null,
      network = null,
      originalLanguage = null,
      sortBy = 'popularity.desc',
      page = 1,
      lang = 'es-MX',
    } = req.query;

    const data = await tmdbService.discoverCatalog({
      type,
      genre,
      decade,
      network,
      originalLanguage,
      sortBy,
      page: Number(page),
      language: lang,
    });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Error explorando catálogo', message: err.message });
  }
});

// Secciones curadas de Películas (incluye taquilla, géneros y clásicos 80s/90s integrados pasivamente)
app.get('/api/tmdb/movie-sections', async (req, res) => {
  try {
    const { lang = 'es-MX' } = req.query;
    const sections = await tmdbService.getMovieSections(lang);
    res.json(sections);
  } catch (err) {
    res.status(500).json({ error: 'Error obteniendo secciones de películas', message: err.message });
  }
});

// Secciones curadas de Series (incluye K-Dramas, sitcoms y clásicos 80s/90s integrados pasivamente)
app.get('/api/tmdb/series-sections', async (req, res) => {
  try {
    const { lang = 'es-MX' } = req.query;
    const sections = await tmdbService.getSeriesSections(lang);
    res.json(sections);
  } catch (err) {
    res.status(500).json({ error: 'Error obteniendo secciones de series', message: err.message });
  }
});

// Secciones curadas de Anime (7 carruseles dedicados: Top 10, Shonen, Isekai, Seinen, Romance, Películas y Clásicos 80s/90s)
app.get('/api/tmdb/anime-sections', async (req, res) => {
  try {
    const { lang = 'es-MX' } = req.query;
    const sections = await tmdbService.getAnimeSections(lang);
    res.json(sections);
  } catch (err) {
    res.status(500).json({ error: 'Error obteniendo secciones de anime', message: err.message });
  }
});

app.get('/api/tmdb/search', async (req, res) => {
  try {
    const { query = '', page = 1, lang = 'es-MX' } = req.query;
    const data = await tmdbService.searchMulti(query, Number(page), lang);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Error en búsqueda', message: err.message });
  }
});

app.get('/api/tmdb/movie/:id', async (req, res) => {
  try {
    const { lang = 'es-MX' } = req.query;
    const data = await tmdbService.getMovieDetails(req.params.id, lang);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Error obteniendo detalle de película', message: err.message });
  }
});

app.get('/api/tmdb/tv/:id', async (req, res) => {
  try {
    const { lang = 'es-MX' } = req.query;
    const data = await tmdbService.getTvDetails(req.params.id, lang);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Error obteniendo detalle de serie', message: err.message });
  }
});

app.get('/api/tmdb/tv/:id/season/:seasonNumber', async (req, res) => {
  try {
    const { lang = 'es-MX' } = req.query;
    const data = await tmdbService.getSeasonDetails(req.params.id, req.params.seasonNumber, lang);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Error obteniendo episodios de temporada', message: err.message });
  }
});

app.get('/api/catalog/anime', async (req, res) => {
  try {
    const { page = 1, lang = 'es-MX' } = req.query;
    const data = await tmdbService.getAnime(Number(page), lang);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Error obteniendo catálogo de anime', message: err.message });
  }
});

app.get('/api/catalog/provider/:providerId', async (req, res) => {
  try {
    const { providerId } = req.params;
    const { page = 1, lang = 'es-MX' } = req.query;
    const data = await tmdbService.getByProvider(Number(providerId), Number(page), lang);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Error obteniendo catálogo de la plataforma', message: err.message });
  }
});

app.get('/api/catalog/:type/:tmdbId/videos', async (req, res) => {
  try {
    const { type, tmdbId } = req.params;
    const { lang = 'es-MX' } = req.query;
    const trailer = await tmdbService.getTrailers(type, tmdbId, lang);
    res.json({ trailer });
  } catch (err) {
    res.status(500).json({ error: 'Error obteniendo tráiler', message: err.message });
  }
});

// -------------------------------------------------------------
// RUTAS MÓDULO B: Motor Híbrido Universal de Video (TMDB + IMDb + YTS MP4/AAC)
// -------------------------------------------------------------

app.get('/api/cloud/health', async (req, res) => {
  const { tmdbId, imdbId, type = 'movie', season = 1, episode = 1, serverId, mirrorId } = req.query;
  if (!/^\d+$/.test(String(tmdbId || '')) || !['movie', 'tv', 'series'].includes(type) || !/^\d+$/.test(String(season)) || Number(season) < 1 || !/^\d+$/.test(String(episode)) || Number(episode) < 1) return res.status(400).json({ error: 'Identificador o episodio inválido' });
  res.setHeader('Cache-Control', 'no-store');
  res.json(await checkCloudHealth({ tmdbId, imdbId, isSeries: type !== 'movie', season: Number(season), episode: Number(episode), serverId, mirrorId }));
});

app.get('/api/site-servers', async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    res.json(await getSiteServers(req.query.source, req.query.url));
  } catch (error) {
    const invalid = /URL|enlace|Fuente|página del título|debe ser/.test(error.message);
    res.status(invalid ? 400 : 502).json({ error: error.message });
  }
});

app.get('/api/site-search', async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    res.json(await searchSiteTitles(req.query.source, req.query.title));
  } catch (error) {
    res.status(/título|Fuente|enlace/.test(error.message) ? 400 : 502).json({ error: error.message });
  }
});

app.get('/api/site-resolve', async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    res.json(await getResolvedSiteServers(req.query.source, req.query.titleUrl, req.query.season || 1, req.query.episode || 1));
  } catch (error) {
    res.status(/URL|enlace|Fuente|inválido|no pertenece|no aparece|temporadas/.test(error.message) ? 400 : 502).json({ error: error.message });
  }
});

app.get('/api/resolve', async (req, res) => {
  try {
    let {
      tmdbId,
      imdbId,
      type = 'movie',
      season,
      episode,
      originalLanguage,
      preferredLanguage = 'latino',
    } = req.query;

    if (!imdbId && tmdbId) {
      imdbId = await tmdbService.getImdbId(type, tmdbId);
    }

    if (!imdbId && !tmdbId) {
      return res.status(400).json({
        error: 'No se pudo obtener el identificador para este título',
        tmdbId,
        type,
      });
    }

    const resolution = await torrentio.getTorrentioStreams({
      imdbId: imdbId || null,
      tmdbId,
      type,
      season: season ? Number(season) : null,
      episode: episode ? Number(episode) : null,
      originalLanguage,
      preferredLanguage,
    });

    res.json(resolution);
  } catch (err) {
    console.error('[API Resolve Error]:', err.message);
    res.status(500).json({ error: 'Error resolviendo fuentes de video', message: err.message });
  }
});

// -------------------------------------------------------------
// RUTAS P2P: Servidor de Streaming WebTorrent con HTTP Range 206 + FFmpeg AAC Live Remux
// -------------------------------------------------------------

app.get('/api/stream/:infoHash', async (req, res) => {
  const { infoHash } = req.params;
  if (!infoHash) {
    return res.status(400).json({ error: 'infoHash es requerido' });
  }
  await streamEngine.streamTorrent(infoHash, req, res);
});

app.get('/api/stream/:infoHash/status', (req, res) => {
  const { infoHash } = req.params;
  const status = streamEngine.getStatus(infoHash, { fileIdx: req.query.fileIdx, season: req.query.s, episode: req.query.e });
  res.json(status);
});

app.get('/api/stream/:infoHash/subtitle/:trackIndex', async (req, res) => {
  const { infoHash, trackIndex } = req.params;
  if (!/^[0-9a-f]{40}$/i.test(String(infoHash || ''))) return res.status(400).json({ error: 'infoHash inválido' });
  const idx = Number(trackIndex);
  if (!Number.isInteger(idx) || idx < 0 || idx > 50) return res.status(400).json({ error: 'Pista inválida' });
  try {
    const fileIdx = Number.isInteger(Number(req.query.fileIdx)) ? Number(req.query.fileIdx) : 0;
    const rawUrl = `http://127.0.0.1:${req.socket.localPort}/api/stream/${infoHash}?fileIdx=${fileIdx}&raw=1`;
    const vtt = await extractSubtitleVtt(rawUrl, idx);
    res.setHeader('Cache-Control', 'no-store');
    res.type('text/vtt').send(vtt);
  } catch (err) {
    res.status(502).json({ error: err.message || 'No se pudo extraer el subtítulo integrado' });
  }
});

app.post('/api/stream/close', (req, res) => {
  const { infoHash } = req.body;
  if (infoHash) {
    streamEngine.destroyTorrent(infoHash, true);
  }
  res.json({ success: true, message: 'Almacenamiento temporal liberado' });
});

// -------------------------------------------------------------
// MÓDULO EXPANSION: Motor de Subtítulos Multi-Idioma
// -------------------------------------------------------------

app.get('/api/subtitles/:type/:imdbId', async (req, res) => {
  try {
    const { type, imdbId } = req.params;
    const { season, episode, release = '' } = req.query;

    const subtitles = await subtitleService.getSubtitles(type, imdbId, season, episode, release);
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

app.get('/api/subtitles/vtt', async (req, res) => {
  if (typeof req.query.id !== 'string') return res.status(400).json({ error: 'Identificador de subtítulos requerido' });
  try {
    const content = await subtitleService.fetchSubtitle(req.query.id);
    res.setHeader('Cache-Control', 'no-store'); res.type('text/vtt').send(content);
  } catch (error) { res.status(error.status || 502).json({ error: error.message || 'No se pudo cargar el subtítulo' }); }
});

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

app.get('/api/iptv/countries', (req, res) => {
  res.json({
    countries: iptvService.COUNTRY_NAMES,
    sources: iptvService.DEFAULT_M3U_SOURCES,
  });
});

app.get('/api/iptv/proxy', async (req, res) => {
  const { url } = req.query;
  if (!url) {
    return res.status(400).json({ error: 'Parámetro url es requerido para el proxy' });
  }
  await iptvService.proxyStream(url, req, res);
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    version: '5.3.0',
    capabilities: { ffmpeg: streamEngine.getStatus('').hasFfmpeg, cloudDiagnostics: true, aiSubtitles: aiAvailable() },
    platform: 'StreamFlix Pro v5.2 — Netflix Ultra Edition ($0 Cost)',
    timestamp: new Date().toISOString(),
  });
});

process.on('uncaughtException', (err) => {
  if (err.code === 'PREMATURE_CLOSE' || err.code === 'ERR_STREAM_PREMATURE_CLOSE') return;
  console.error('[Middleware Uncaught Exception]:', err.message);
});

process.on('unhandledRejection', (reason) => {
  console.error('[Middleware Unhandled Rejection]:', reason);
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`=======================================================`);
  console.log(`🚀 StreamFlix Pro v5.3 activo en: http://localhost:${PORT}`);
  console.log(`🎬 Diagnóstico Cloud, reproducción directa y conversión de audio disponibles`);
  console.log(`=======================================================`);
});
