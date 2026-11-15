import WebTorrent from 'webtorrent';
import os from 'os';
import path from 'path';
import fs from 'fs';

// Directorio temporal para fragmentos de descarga secuencial
const TEMP_DOWNLOAD_DIR = path.join(os.tmpdir(), 'streamflix-webtorrent-cache');

// Lista de trackers públicos de alta velocidad para máxima aceleración DHT/P2P
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

class StreamEngine {
  constructor() {
    // 1. Limpieza inicial del directorio temporal al arrancar el servidor
    this.cleanTempDirectory();

    this.client = new WebTorrent({
      maxConns: 55,
      downloadLimit: -1,
      uploadLimit: 1024 * 512, // 512 KB/s max upload para no saturar la red local
    });

    this.torrentsMap = new Map();
    this.lastAccessMap = new Map();
    this.activeStreamingHash = null;

    this.client.on('error', (err) => {
      console.error('[WebTorrent Engine Error]:', err.message);
    });

    // Limpieza periódica de torrents inactivos (> 25 min sin solicitudes)
    setInterval(() => this.cleanupInactiveTorrents(), 5 * 60 * 1000);
  }

  /**
   * Limpia el directorio temporal en disco para evitar que se llene
   */
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

  /**
   * Genera el Magnet URI completo con trackers
   */
  buildMagnet(infoHash) {
    const cleanHash = infoHash.toLowerCase().trim();
    const trackersParam = DEFAULT_TRACKERS.map((t) => `&tr=${encodeURIComponent(t)}`).join('');
    return `magnet:?xt=urn:btih:${cleanHash}${trackersParam}`;
  }

  /**
   * Destruye un torrent específico y elimina de forma segura sus archivos temporales de disco
   */
  destroyTorrent(infoHash, destroyStore = true) {
    const cleanHash = infoHash ? infoHash.toLowerCase().trim() : null;
    if (!cleanHash) return false;

    let torrent = this.torrentsMap.get(cleanHash);
    if (!torrent && this.client.torrents) {
      torrent = this.client.torrents.find((t) => t.infoHash === cleanHash);
    }

    if (torrent && typeof torrent.destroy === 'function') {
      console.log(`[StreamEngine] Destruyendo torrent y borrando archivos temporales: ${cleanHash}`);
      try {
        torrent.destroy({ destroyStore: true }, () => {
          console.log(`[StreamEngine] Archivos temporales eliminados para: ${cleanHash}`);
        });
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

  /**
   * Obtiene un torrent activo o lo añade al cliente
   */
  async getOrAddTorrent(infoHash) {
    const cleanHash = infoHash.toLowerCase().trim();
    this.lastAccessMap.set(cleanHash, Date.now());

    // Si había otro torrent transmitiendo anteriormente y es diferente, limpiar el anterior para preservar disco
    if (this.activeStreamingHash && this.activeStreamingHash !== cleanHash) {
      console.log(`[StreamEngine] Cambio de título detectado. Liberando torrent anterior: ${this.activeStreamingHash}`);
      this.destroyTorrent(this.activeStreamingHash, true);
    }
    this.activeStreamingHash = cleanHash;

    // Buscar en el mapa local o en la lista síncrona del cliente
    let existing = this.torrentsMap.get(cleanHash);
    if (!existing && this.client.torrents) {
      existing = this.client.torrents.find((t) => t.infoHash === cleanHash);
    }
    if (!existing && typeof this.client.get === 'function') {
      try {
        const maybePromise = this.client.get(cleanHash);
        existing = maybePromise && typeof maybePromise.then === 'function' ? await maybePromise : maybePromise;
      } catch (err) {
        // Safe to ignore if torrent is not registered in this client yet
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
        console.log(`[StreamEngine] Torrent cargado: ${t.name} (Hash: ${cleanHash})`);
        this.torrentsMap.set(cleanHash, t);
        resolve(t);
      });

      torrent.on('error', (err) => {
        console.error(`[StreamEngine] Error en torrent ${cleanHash}:`, err.message);
        reject(err);
      });

      // Timeout de aviso en caso de infoHash sin semillas inmediatas
      setTimeout(() => {
        if (!torrent.ready && torrent.numPeers === 0) {
          console.warn(`[StreamEngine] Conectando con peers para ${cleanHash}...`);
        }
      }, 15000);
    });
  }

  /**
   * Encuentra el archivo de video principal (el de mayor tamaño)
   */
  getLargestVideoFile(torrent) {
    if (!torrent.files || torrent.files.length === 0) return null;
    return torrent.files.reduce((largest, file) => {
      return file.length > largest.length ? file : largest;
    }, torrent.files[0]);
  }

  /**
   * Determina el MIME type según la extensión del archivo
   */
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
   * Manejador de streaming HTTP con soporte para cabeceras Range (HTTP 206)
   */
  async streamTorrent(infoHash, req, res) {
    try {
      const torrent = await this.getOrAddTorrent(infoHash);
      const file = this.getLargestVideoFile(torrent);

      if (!file) {
        return res.status(404).json({ error: 'No se encontró un archivo de video en el torrent' });
      }

      this.lastAccessMap.set(infoHash.toLowerCase(), Date.now());

      // Priorizar la descarga secuencial de este archivo
      file.select();

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
        stream.on('error', (err) => {
          if (err.code !== 'PREMATURE_CLOSE' && err.code !== 'ERR_STREAM_PREMATURE_CLOSE') {
            console.warn('[StreamEngine] Error en readStream:', err.message);
          }
        });
        req.on('close', () => {
          try {
            stream.destroy();
          } catch (err) {
            // Safe to ignore if stream is already closed by client
          }
        });
        return stream.pipe(res);
      }

      // Procesamiento de HTTP 206 Partial Content (Adelantar y atrasar al instante)
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;

      if (start >= totalSize || end >= totalSize || start > end) {
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
      chunkStream.on('error', (err) => {
        if (err.code !== 'PREMATURE_CLOSE' && err.code !== 'ERR_STREAM_PREMATURE_CLOSE') {
          console.warn('[StreamEngine] Error en chunkStream:', err.message);
        }
      });
      req.on('close', () => {
        try {
          chunkStream.destroy();
        } catch (err) {
          // Safe to ignore if chunk stream was already finalized
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

  /**
   * Estado en tiempo real del torrent (peers, velocidad, progreso)
   */
  getStatus(infoHash) {
    const cleanHash = infoHash.toLowerCase().trim();
    let torrent = this.torrentsMap.get(cleanHash);
    if (!torrent && this.client.torrents) {
      torrent = this.client.torrents.find((t) => t.infoHash === cleanHash);
    }

    if (!torrent) {
      return { active: false, status: 'idle' };
    }

    const file = this.getLargestVideoFile(torrent);

    return {
      active: true,
      ready: Boolean(torrent.ready),
      infoHash: cleanHash,
      name: torrent.name || 'Cargando stream P2P...',
      fileName: file ? file.name : null,
      fileSize: file ? file.length : (torrent.length || 0),
      downloadSpeed: torrent.downloadSpeed || 0, // bytes/sec
      uploadSpeed: torrent.uploadSpeed || 0,
      progress: Math.round((torrent.progress || 0) * 100),
      downloaded: torrent.downloaded || 0,
      numPeers: torrent.numPeers || 0,
      timeRemaining: torrent.timeRemaining || null,
    };
  }

  /**
   * Limpieza periódica de torrents inactivos (> 25 min sin uso) borrando almacenamiento
   */
  cleanupInactiveTorrents() {
    const now = Date.now();
    const MAX_IDLE_TIME = 25 * 60 * 1000;

    for (const [hash, lastTime] of this.lastAccessMap.entries()) {
      if (now - lastTime > MAX_IDLE_TIME) {
        console.log(`[StreamEngine] Liberando torrent inactivo por tiempo: ${hash}`);
        this.destroyTorrent(hash, true);
      }
    }
  }
}

export const streamEngine = new StreamEngine();
export default streamEngine;
