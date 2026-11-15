import WebTorrent from 'webtorrent';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { spawn, execSync } from 'child_process';

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

// Detectar si FFmpeg está disponible en el sistema para remuxing/transcodificación en vivo de MKV/AVI/AC3
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
      maxConns: 55,
      downloadLimit: -1,
      uploadLimit: 1024 * 512,
    });

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
        existing = maybePromise && typeof maybePromise.then === 'function' ? await maybePromise : maybePromise;
      } catch {
        // Ignorar
      }
    }

    if (existing) {
      this.torrentsMap.set(cleanHash, existing);
      if (existing.ready) return existing;
      return new Promise((resolve) => {
        if (typeof existing.once === 'function') {
          existing.once('ready', () => resolve(existing));
          existing.once('error', () => resolve(existing));
        } else {
          resolve(existing);
        }
      });
    }

    const magnetUri = this.buildMagnet(cleanHash);

    return new Promise((resolve, reject) => {
      const torrent = this.client.add(magnetUri, { path: TEMP_DOWNLOAD_DIR }, (t) => {
        try {
          t.files.forEach((f) => f.deselect());
        } catch {
          // Safe ignore
        }
        this.torrentsMap.set(cleanHash, t);
        resolve(t);
      });

      torrent.on('error', (err) => {
        reject(err);
      });
    });
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

  async streamTorrent(infoHash, req, res) {
    try {
      const { fileIdx, s, e, transcode } = req.query;
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
      const shouldTranscode =
        hasFfmpeg && (transcode === '1' || ext === '.avi');

      // Modo Remux/Transcode en vivo con FFmpeg para archivos .avi o MKV con audio AC3/EAC3 incompatible con Chrome
      if (shouldTranscode) {
        res.writeHead(200, {
          'Content-Type': 'video/mp4',
          'Cache-Control': 'no-cache',
        });

        const rawStream = file.createReadStream();
        const ffmpegProc = spawn('ffmpeg', [
          '-i', 'pipe:0',
          '-c:v', 'libx264',
          '-preset', 'ultrafast',
          '-crf', '23',
          '-c:a', 'aac',
          '-ac', '2',
          '-b:a', '192k',
          '-f', 'mp4',
          '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
          'pipe:1',
        ]);

        rawStream.pipe(ffmpegProc.stdin).on('error', () => {});
        ffmpegProc.stdout.pipe(res);

        req.on('close', () => {
          try {
            rawStream.destroy();
            ffmpegProc.kill('SIGKILL');
          } catch {
            // Safe ignore
          }
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

        const stream = file.createReadStream();
        stream.on('error', () => {});
        req.on('close', () => {
          try {
            stream.destroy();
          } catch {
            // Safe ignore
          }
        });
        return stream.pipe(res);
      }

      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;

      if (isNaN(start) || start >= totalSize || end >= totalSize || start > end) {
        res.writeHead(416, {
          'Content-Range': `bytes */${totalSize}`,
        });
        return res.end();
      }

      const chunkSize = end - start + 1;

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${totalSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': mimeType,
        'Content-Disposition': `inline; filename="${encodeURIComponent(file.name)}"`,
      });

      const chunkStream = file.createReadStream({ start, end });
      chunkStream.on('error', () => {});
      req.on('close', () => {
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
      }
    }
  }

  getStatus(infoHash) {
    const cleanHash = infoHash.toLowerCase().trim();
    let torrent = this.torrentsMap.get(cleanHash);
    if (!torrent && this.client.torrents) {
      torrent = this.client.torrents.find((t) => t.infoHash === cleanHash);
    }

    if (!torrent) {
      return { active: false, status: 'idle', hasFfmpeg };
    }

    const file = this.selectTargetVideoFile(torrent);

    return {
      active: true,
      ready: Boolean(torrent.ready),
      hasFfmpeg,
      infoHash: cleanHash,
      name: torrent.name || 'Cargando stream P2P...',
      fileName: file ? file.name : null,
      fileSize: file ? file.length : (torrent.length || 0),
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
