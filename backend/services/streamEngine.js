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
  'wss://tracker.openwebtorrent.com',
  'wss://tracker.btorrent.xyz',
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
      maxConns: 60,
      downloadLimit: -1,
      uploadLimit: 1024 * 512,
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

      const ext = path.extname(file.name).toLowerCase();
      const lowerName = file.name.toLowerCase();
      const isHevcOrAvi =
        ext === '.avi' ||
        lowerName.includes('hevc') ||
        lowerName.includes('x265') ||
        lowerName.includes('h265');

      // Solo usar FFmpeg cuando se solicita explícitamente (transcode=1 / audioEngine=aac) o es .avi,
      // permitiendo que HTTP 206 Range nativo arranque al instante en el navegador.
      const shouldUseFfmpeg =
        req.query.raw !== '1' && hasFfmpeg && (transcode === '1' || audioEngine === 'aac' || ext === '.avi');
      if (req.query.raw !== '1' && !hasFfmpeg && (transcode === '1' || audioEngine === 'aac')) return res.status(503).json({ error: 'FFmpeg no está instalado; usa el modo original o VLC.' });

      if (shouldUseFfmpeg) {
        if (req.method === 'HEAD') return res.status(200).type('video/mp4').end();
        // HTTP Range input lets FFmpeg read MP4 metadata at the end and seek without downloading the entire file first.
        const inputUrl = new URL(req.originalUrl, 'http://127.0.0.1:' + req.socket.localPort);
        inputUrl.searchParams.set('raw', '1'); inputUrl.searchParams.delete('startTime');
        const infoKey = infoHash.toLowerCase() + ':' + torrent.files.indexOf(file);
        if (!this.mediaInfo.has(infoKey)) {
          if (this.mediaInfo.size >= 20) this.mediaInfo.delete(this.mediaInfo.keys().next().value);
          const pending = probeMedia(inputUrl.href).then(info => { if (this.mediaInfo.has(infoKey)) this.mediaInfo.set(infoKey, info); return info; });
          this.mediaInfo.set(infoKey, pending);
        }
        const info = await this.mediaInfo.get(infoKey);
        if (req.aborted || res.destroyed) return;
        const track = selectAudioTrack(info.audioTracks, { ...req.query, manualAudio: req.query.manualAudio === '1' });
        const startTime = Math.max(0, Math.min(Number(req.query.startTime) || 0, Math.max(0, (info.duration || 86400) - 0.1)));
        streamFfmpeg(inputUrl.href, req, res, { audioTrack: track, startTime, transcodeVideo: isHevcOrAvi || ['hevc', 'av1', 'mpeg4', 'mpeg2video'].includes(info.videoCodec) });
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
    let torrent = this.torrentsMap.get(cleanHash);
    if (!torrent && this.client.torrents) {
      torrent = this.client.torrents.find((t) => t.infoHash === cleanHash);
    }

    if (!torrent) {
      return { active: false, status: 'idle', hasFfmpeg };
    }

    const file = this.selectTargetVideoFile(torrent, options);

    const cachedInfo = this.mediaInfo.get(cleanHash + ':' + torrent.files.indexOf(file));
    const info = cachedInfo && !cachedInfo.then ? cachedInfo : null;
    return {
      audioTracks: info?.audioTracks || [],
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
    const MAX_IDLE_TIME = 25 * 60 * 1000;

    for (const [hash, lastTime] of this.lastAccessMap.entries()) {
      if (now - lastTime > MAX_IDLE_TIME) {
        this.destroyTorrent(hash, true);
      }
    }
  }
}

export const streamEngine = new StreamEngine();
export default streamEngine;
