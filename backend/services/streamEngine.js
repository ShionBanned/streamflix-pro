import WebTorrent from 'webtorrent';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import { parseByteRange } from '../../shared/playerUtils.mjs';
import { probeMedia, selectAudioTrack, streamFfmpeg, waitForTorrent } from './mediaTools.js';

const TEMP_DOWNLOAD_DIR = path.join(os.tmpdir(), 'streamflix-webtorrent-cache');
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mkv', '.webm', '.m4v', '.avi', '.mov', '.ts']);

const DEFAULT_TRACKERS = [
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://open.stealth.si:80/announce',
  'udp://tracker.torrent.eu.org:451/announce',
  'udp://explodie.org:6969/announce',
  'udp://tracker.coppersurfer.tk:6969/announce',
  'udp://tracker.openbittorrent.com:6969/announce',
  'udp://tracker.zerobytes.xyz:1337/announce',
  'udp://tracker.dler.org:6969/announce',
  'udp://p4p.arenabg.com:1337/announce',
  'udp://movies.zsw.ca:6969/announce',
  'udp://open.demonii.com:1337/announce',
  'udp://tracker.theoks.net:6969/announce',
  'udp://tracker.pomf.se:80/announce',
  'wss://tracker.openwebtorrent.com',
  'wss://tracker.btorrent.xyz',
  'wss://tracker.files.fm:7073/announce',
];

let hasFfmpeg = false;
try {
  execSync('ffmpeg -version', { stdio: 'ignore' });
  hasFfmpeg = true;
} catch {
  hasFfmpeg = false;
}

class StreamEngine {
  constructor() {
    this.cleanTempDirectory();

    this.client = new WebTorrent({
      maxConns: 120, // Elevado de 60 a 120 para maximizar conexiones con peers rápidos y saturar ancho de banda
      downloadLimit: -1, // Ilimitado para máxima velocidad de bajada en MB/s
      uploadLimit: 1024 * 1024 * 2, // 2 MB/s: activa el algoritmo Tit-for-Tat de BitTorrent para máxima prioridad en el enjambre
      dht: true,
    });

    this.mediaInfo = new Map();
    this.torrentsMap = new Map();
    this.lastAccessMap = new Map();
    this.activeStreamingHash = null;

    this.client.on('error', (err) => {
      console.error('[WebTorrent Engine Error]:', err.message);
    });

    setInterval(() => this.cleanupInactiveTorrents(), 5 * 60 * 1000);
  }

  cleanTempDirectory() {
    try {
      if (fs.existsSync(TEMP_DOWNLOAD_DIR)) {
        fs.rmSync(TEMP_DOWNLOAD_DIR, { recursive: true, force: true });
      }
      fs.mkdirSync(TEMP_DOWNLOAD_DIR, { recursive: true });
      console.log(`[StreamEngine] Directorio temporal limpio: ${TEMP_DOWNLOAD_DIR}`);
    } catch (err) {
      console.warn(`[StreamEngine] No se pudo limpiar carpeta temporal:`, err.message);
    }
  }

  buildMagnet(infoHash) {
    const cleanHash = infoHash.toLowerCase().trim();
    const trackersParam = DEFAULT_TRACKERS.map((t) => `&tr=${encodeURIComponent(t)}`).join('');
    return `magnet:?xt=urn:btih:${cleanHash}${trackersParam}`;
  }

  destroyTorrent(infoHash, destroyStore = true) {
    const cleanHash = infoHash ? infoHash.toLowerCase().trim() : null;
    if (!cleanHash) return false;

    let torrent = this.torrentsMap.get(cleanHash);
    if (!torrent && this.client.torrents) {
      torrent = this.client.torrents.find((t) => t.infoHash === cleanHash);
    }

    if (torrent && typeof torrent.destroy === 'function') {
      try {
        torrent.destroy({ destroyStore }, () => {});
      } catch (e) {
        console.warn(`[StreamEngine] Error al destruir torrent ${cleanHash}:`, e.message);
      }
    }

    this.torrentsMap.delete(cleanHash);
    for (const key of this.mediaInfo.keys()) if (key.startsWith(cleanHash + ':')) this.mediaInfo.delete(key);
    this.lastAccessMap.delete(cleanHash);
    if (this.activeStreamingHash === cleanHash) {
      this.activeStreamingHash = null;
    }
    return true;
  }

  async getOrAddTorrent(infoHash) {
    const cleanHash = infoHash.toLowerCase().trim();
    this.lastAccessMap.set(cleanHash, Date.now());

    if (this.activeStreamingHash && this.activeStreamingHash !== cleanHash) {
      this.destroyTorrent(this.activeStreamingHash, true);
    }
    this.activeStreamingHash = cleanHash;

    let existing = this.torrentsMap.get(cleanHash);
    if (!existing && this.client.torrents) {
      existing = this.client.torrents.find((t) => t.infoHash === cleanHash);
    }
    if (!existing && typeof this.client.get === 'function') {
      try {
        const maybePromise = this.client.get(cleanHash);
        existing =
          maybePromise && typeof maybePromise.then === 'function'
            ? await maybePromise
            : maybePromise;
      } catch {
        // Ignorar
      }
    }

    if (existing) {
      this.torrentsMap.set(cleanHash, existing);
      if (existing.ready) return existing;
      return waitForTorrent(existing);
    }

    const magnetUri = this.buildMagnet(cleanHash);

    const torrent = this.client.add(magnetUri, { path: TEMP_DOWNLOAD_DIR });
    this.torrentsMap.set(cleanHash, torrent);
    try {
      await waitForTorrent(torrent);
      torrent.files.forEach(file => file.deselect());
      return torrent;
    } catch (error) { this.destroyTorrent(cleanHash, true); throw error; }
  }

  selectTargetVideoFile(torrent, { fileIdx = null, season = null, episode = null } = {}) {
    if (!torrent.files || torrent.files.length === 0) return null;

    if (fileIdx !== null && fileIdx !== undefined && !isNaN(Number(fileIdx))) {
      const idx = Number(fileIdx);
      if (torrent.files[idx]) {
        return torrent.files[idx];
      }
    }

    const videoFiles = torrent.files.filter((f) =>
      VIDEO_EXTENSIONS.has(path.extname(f.name).toLowerCase())
    );
    const pool = videoFiles.length > 0 ? videoFiles : torrent.files;

    if (season && episode) {
      const sPad = String(season).padStart(2, '0');
      const ePad = String(episode).padStart(2, '0');
      const patterns = [
        new RegExp(`s${sPad}\\s*e${ePad}\\b`, 'i'),
        new RegExp(`\\b${Number(season)}x${ePad}\\b`, 'i'),
        new RegExp(`\\be${ePad}\\b`, 'i'),
        new RegExp(`\\bepisod(?:e|io)\\s*0*${Number(episode)}\\b`, 'i'),
        new RegExp(`\\s-\\s*0*${Number(episode)}\\b`, 'i'),
      ];

      for (const regex of patterns) {
        const matched = pool.find((f) => regex.test(f.name));
        if (matched) return matched;
      }
    }

    return pool.reduce((largest, file) => (file.length > largest.length ? file : largest), pool[0]);
  }

  getVideoMimeType(fileName = '') {
    const ext = path.extname(fileName).toLowerCase();
    switch (ext) {
      case '.mp4':
      case '.m4v':
        return 'video/mp4';
      case '.webm':
        return 'video/webm';
      case '.mkv':
        return 'video/x-matroska';
      case '.avi':
        return 'video/x-msvideo';
      case '.mov':
        return 'video/quicktime';
      default:
        return 'video/mp4';
    }
  }

  /**
   * Sirve el stream P2P priorizando HTTP 206 Partial Content nativo para máxima velocidad de arranque,
   * y activando el Transcodificador / Remuxer FFmpeg AAC 2.0 cuando `transcode=1` o `.avi`.
   */
  prioritizeStreamingWindow(torrent, file, byteStart = 0) {
    try {
      if (!torrent || !file || typeof file._startPiece !== 'number') return;
      const pieceLength = torrent.pieceLength;
      if (!pieceLength || pieceLength <= 0) return;

      const fileStartPiece = file._startPiece;
      const fileEndPiece = file._endPiece;

      // 1. Prioridad Crítica en Cabecera (Head) y Cola (Tail / moov atom para MP4 y Cues para MKV)
      // Asegura arranque instantáneo en menos de 2 segundos sin esperar a leer todo el archivo
      if (typeof torrent.critical === 'function') {
        const headEnd = Math.min(fileEndPiece, fileStartPiece + 4);
        torrent.critical(fileStartPiece, headEnd);

        const tailStart = Math.max(fileStartPiece, fileEndPiece - 4);
        torrent.critical(tailStart, fileEndPiece);
      }

      // 2. Ventana de Anticipación (Lookahead Buffer):
      // Mantiene un colchón de ~50 MB por delante del cursor de reproducción actual
      const currentPiece = fileStartPiece + Math.floor(byteStart / pieceLength);
      const lookaheadBytes = 50 * 1024 * 1024;
      const lookaheadPieces = Math.max(12, Math.ceil(lookaheadBytes / pieceLength));
      const endLookahead = Math.min(fileEndPiece, currentPiece + lookaheadPieces);

      if (currentPiece <= endLookahead) {
        // Los 4 pieces inmediatos se marcan como críticos (descarga prioritaria inmediata)
        if (typeof torrent.critical === 'function') {
          const immediateEnd = Math.min(endLookahead, currentPiece + 4);
          torrent.critical(currentPiece, immediateEnd);
        }
        // El resto de la ventana de anticipación se selecciona con alta prioridad
        if (typeof torrent.select === 'function') {
          torrent.select(currentPiece, endLookahead, 1);
        }
      }
    } catch {
      // Ignorar fallos de priorización silenciosamente
    }
  }

  async streamTorrent(infoHash, req, res) {
    try {
      const {
        fileIdx,
        s,
        e,
        transcode,
        audioEngine,
        audioTrack = '0',
      } = req.query;

      const torrent = await this.getOrAddTorrent(infoHash);
      const file = this.selectTargetVideoFile(torrent, {
        fileIdx,
        season: s,
        episode: e,
      });

      if (!file) {
        return res.status(404).json({ error: 'No se encontró un archivo de video en el torrent' });
      }

      this.lastAccessMap.set(infoHash.toLowerCase(), Date.now());
      file.select();
      this.prioritizeStreamingWindow(torrent, file, 0);

      const ext = path.extname(file.name).toLowerCase();
      const lowerName = file.name.toLowerCase();
      const isHevcOrAvi =
        ext === '.avi' ||
        lowerName.includes('hevc') ||
        lowerName.includes('x265') ||
        lowerName.includes('h265');

      // Solo usar FFmpeg cuando se solicita explícitamente (transcode=1 / audioEngine=aac), es .avi,
      // o se solicita una pista de audio específica/manual (Chrome no puede conmutar pistas en contenedor raw).
      const isManualOrSpecificTrack =
        req.query.manualAudio === '1' ||
        (req.query.audioTrack !== undefined && req.query.audioTrack !== '0');

      const shouldUseFfmpeg =
        req.query.raw !== '1' &&
        hasFfmpeg &&
        (transcode === '1' || audioEngine === 'aac' || ext === '.avi' || isManualOrSpecificTrack);

      if (req.query.raw !== '1' && !hasFfmpeg && (transcode === '1' || audioEngine === 'aac' || isManualOrSpecificTrack)) {
        return res.status(503).json({ error: 'FFmpeg no está instalado; usa el modo original o VLC.' });
      }

      const infoKey = infoHash.toLowerCase() + ':' + torrent.files.indexOf(file);

      // Sonda en segundo plano para streams nativos: si hasFfmpeg y no es raw=1, precargar mediaInfo
      if (req.query.raw !== '1' && hasFfmpeg && !this.mediaInfo.has(infoKey)) {
        if (this.mediaInfo.size >= 20) this.mediaInfo.delete(this.mediaInfo.keys().next().value);
        const probeUrl = new URL(req.originalUrl, `http://127.0.0.1:${req.socket?.localPort || 4000}`);
        probeUrl.searchParams.set('raw', '1');
        probeUrl.searchParams.delete('startTime');
        const pending = probeMedia(probeUrl.href)
          .then(info => {
            if (this.mediaInfo.has(infoKey)) this.mediaInfo.set(infoKey, info);
            return info;
          })
          .catch(err => {
            console.warn(`[StreamEngine] Error en probeMedia para ${infoKey}:`, err.message);
            return null;
          });
        this.mediaInfo.set(infoKey, pending);
      }

      if (shouldUseFfmpeg) {
        if (req.method === 'HEAD') return res.status(200).type('video/mp4').end();
        // HTTP Range input lets FFmpeg read MP4 metadata at the end and seek without downloading the entire file first.
        const inputUrl = new URL(req.originalUrl, `http://127.0.0.1:${req.socket?.localPort || 4000}`);
        inputUrl.searchParams.set('raw', '1');
        inputUrl.searchParams.delete('startTime');

        const cached = this.mediaInfo.get(infoKey);
        const info = (cached && typeof cached.then === 'function') ? await cached : cached;
        if (req.aborted || res.destroyed) return;
        const audioTracks = info?.audioTracks || [];
        const track = selectAudioTrack(audioTracks, { ...req.query, manualAudio: req.query.manualAudio === '1' });
        const startTime = Math.max(0, Math.min(Number(req.query.startTime) || 0, Math.max(0, (info?.duration || 86400) - 0.1)));
        streamFfmpeg(inputUrl.href, req, res, {
          audioTrack: track,
          startTime,
          audioOffset: Number(req.query.audioOffset || 0),
          transcodeVideo: isHevcOrAvi || ['hevc', 'av1', 'mpeg4', 'mpeg2video'].includes(info?.videoCodec)
        });
        return;
      }

      const totalSize = file.length;
      const range = req.headers.range;
      const mimeType = this.getVideoMimeType(file.name);

      if (!range) {
        res.writeHead(200, {
          'Content-Length': totalSize,
          'Content-Type': mimeType,
          'Accept-Ranges': 'bytes',
          'Content-Disposition': `inline; filename="${encodeURIComponent(file.name)}"`,
        });

        if (req.method === 'HEAD') return res.end();
        const stream = file.createReadStream();
        stream.on('error', () => res.destroy());
        res.on('close', () => {
          try {
            stream.destroy();
          } catch {
            // Safe ignore
          }
        });
        return stream.pipe(res);
      }

      const parsedRange = parseByteRange(range, totalSize);
      if (parsedRange.status === 416) {
        res.writeHead(416, { 'Content-Range': 'bytes */' + totalSize }); return res.end();
      }
      const { start, end, length: chunkSize } = parsedRange;
      this.prioritizeStreamingWindow(torrent, file, start);

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${totalSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': mimeType,
        'Content-Disposition': `inline; filename="${encodeURIComponent(file.name)}"`,
      });

      if (req.method === 'HEAD') return res.end();
      const chunkStream = file.createReadStream({ start, end });
      chunkStream.on('error', () => res.destroy());
      res.on('close', () => {
        try {
          chunkStream.destroy();
        } catch {
          // Safe ignore
        }
      });
      return chunkStream.pipe(res);
    } catch (err) {
      console.error(`[StreamEngine] Error sirviendo stream de ${infoHash}:`, err.message);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Error al inicializar stream P2P', details: err.message });
      } else { res.destroy(); }
    }
  }

  getStatus(infoHash, options = {}) {
    const cleanHash = infoHash.toLowerCase().trim();
    this.lastAccessMap.set(cleanHash, Date.now());
    let torrent = this.torrentsMap.get(cleanHash);
    if (!torrent && this.client.torrents) {
      torrent = this.client.torrents.find((t) => t.infoHash === cleanHash);
    }

    if (!torrent) {
      return { active: false, status: 'idle', hasFfmpeg };
    }

    const file = this.selectTargetVideoFile(torrent, options);
    const fileIdx = file && torrent.files ? torrent.files.indexOf(file) : -1;

    const cachedInfo = fileIdx >= 0 ? this.mediaInfo.get(cleanHash + ':' + fileIdx) : null;
    const info = cachedInfo && typeof cachedInfo.then !== 'function' ? cachedInfo : null;
    return {
      audioTracks: info?.audioTracks || [],
      subtitleTracks: info?.subtitleTracks || [],
      mediaDuration: info?.duration || null,
      active: true,
      ready: Boolean(torrent.ready),
      hasFfmpeg,
      infoHash: cleanHash,
      name: torrent.name || 'Cargando stream P2P...',
      fileName: file ? file.name : null,
      fileSize: file ? file.length : torrent.length || 0,
      downloadSpeed: torrent.downloadSpeed || 0,
      uploadSpeed: torrent.uploadSpeed || 0,
      progress: Math.round((torrent.progress || 0) * 100),
      downloaded: torrent.downloaded || 0,
      numPeers: torrent.numPeers || 0,
      timeRemaining: torrent.timeRemaining || null,
    };
  }

  cleanupInactiveTorrents() {
    const now = Date.now();
    const MAX_IDLE_TIME = 2 * 60 * 60 * 1000; // 2 horas de inactividad real para películas/series extensas

    for (const [hash, lastTime] of this.lastAccessMap.entries()) {
      // Nunca destruir el torrent que el usuario está reproduciendo activamente
      if (this.activeStreamingHash === hash) continue;

      const torrent = this.torrentsMap.get(hash);
      // Nunca destruir si hay actividad de subida o bajada
      if (torrent && (torrent.downloadSpeed > 0 || torrent.uploadSpeed > 0)) continue;

      if (now - lastTime > MAX_IDLE_TIME) {
        this.destroyTorrent(hash, true);
      }
    }
  }
}

export const streamEngine = new StreamEngine();
export default streamEngine;
