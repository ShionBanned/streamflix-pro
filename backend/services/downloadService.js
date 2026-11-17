import dns from 'node:dns/promises';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import https from 'node:https';
import net from 'node:net';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { spawn } from 'node:child_process';
import { buildHlsRemuxArgs, parseHlsPlaylist } from './hlsOffline.js';

let WebTorrentLib = null;
async function getWebTorrent() {
  if (WebTorrentLib) return WebTorrentLib;
  const mod = await import('webtorrent');
  WebTorrentLib = mod.default || mod;
  return WebTorrentLib;
}

const ROOT = path.resolve(process.cwd(), '.local', 'downloads');
const INDEX = path.join(ROOT, 'index.json');
const MAX_FILE = 2 * 1024 ** 3;
const MAX_INPUT = 4 * 1024 ** 3;
const MAX_TOTAL = 8 * 1024 ** 3; // Ampliado a 8 GB para albergar temporadas enteras cómodamente
const MAX_ACTIVE = 2;
const MAX_QUEUED = 24; // Soporta colas de temporadas completas (hasta 24 episodios en espera)
const jobs = new Map();
let persistChain = Promise.resolve();
let encodeChain = Promise.resolve();
let queueRunning = false;

export const OFFLINE_PROFILES = {
  marathon: {
    id: 'marathon',
    label: 'Temporada Completa (Netflix Season Saver · 576p HQ)',
    maxWidth: 1024,
    maxHeight: 576,
    fpsCap: 24,
    baseCrf: 31.8,
    maxrateKbps: 380,
    bufsizeKbps: 760,
    audioBitrate: '56k',
    denoise: '3.8:2.8:6.0:4.2',
    unsharp: '3:3:0.35:3:3:0.0',
    nr: 550,
    aqStrength: '0.75',
    psyRd: '0.50,0.00',
    level: '4.0',
  },
  compact: {
    id: 'compact',
    label: 'Compacta Perceptual (Netflix Per-Title · 720p HD)',
    maxWidth: 1280,
    maxHeight: 720,
    fpsCap: 30,
    baseCrf: 32.5,
    maxrateKbps: 560,
    bufsizeKbps: 1120,
    audioBitrate: '64k',
    denoise: '3.8:2.8:6.0:4.2',
    unsharp: '3:3:0.22:3:3:0.0',
    nr: 550,
    aqStrength: '0.70',
    psyRd: '0.45,0.00',
    level: '4.1',
  },
  original: {
    id: 'original',
    label: 'Original Directo (Sin recomprimir · hasta 2 GB)',
  },
};

function publicIp(address) {
  if (net.isIP(address) === 4) {
    const [a, b, c, d] = address.split('.').map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 192 && b === 0 && [0, 2].includes(c)) ||
      (a === 192 && b === 88 && c === 99) ||
      (a === 198 && b === 51 && c === 100) ||
      (a === 203 && b === 0 && c === 113) ||
      (a === 255 && d === 255)
    );
  }
  return false;
}

export function validateDownloadUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Introduce una URL HTTPS válida.');
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    net.isIP(url.hostname) ||
    url.hostname === 'localhost' ||
    !url.hostname.includes('.')
  ) {
    throw new Error('Se requiere un enlace HTTPS público sin credenciales ni puerto personalizado.');
  }
  const ext = path.posix.extname(url.pathname).toLowerCase();
  if (!['.mp4', '.webm', '.m3u8'].includes(ext)) {
    throw new Error('Solo se pueden guardar archivos directos MP4/WebM o listas HLS VOD .m3u8.');
  }
  return { url, ext };
}

export function validateOfflineSource({
  url,
  infoHash,
  fileIdx,
  season,
  episode,
  quality = 'compact',
  preferredLanguage = 'latino',
} = {}) {
  if (!['marathon', 'compact', 'original'].includes(quality)) {
    throw new Error('Calidad offline inválida.');
  }
  const cleanLang = ['latino', 'castellano', 'vose', 'en'].includes(preferredLanguage)
    ? preferredLanguage
    : 'latino';
  if (infoHash) {
    if (url || !/^[a-f0-9]{40}$/i.test(String(infoHash))) {
      throw new Error('Hash P2P inválido.');
    }
    if (
      fileIdx != null &&
      (!Number.isSafeInteger(Number(fileIdx)) || Number(fileIdx) < 0 || Number(fileIdx) > 9999)
    ) {
      throw new Error('Índice de archivo inválido.');
    }
    for (const value of [season, episode]) {
      if (
        value != null &&
        (!Number.isSafeInteger(Number(value)) || Number(value) < 1 || Number(value) > 999)
      ) {
        throw new Error('Episodio inválido.');
      }
    }
    return {
      infoHash: String(infoHash).toLowerCase(),
      fileIdx: fileIdx == null ? null : Number(fileIdx),
      season: season == null ? null : Number(season),
      episode: episode == null ? null : Number(episode),
      quality,
      preferredLanguage: cleanLang,
    };
  }
  return { ...validateDownloadUrl(url), quality, preferredLanguage: cleanLang };
}

async function runMediaTool(command, args, { onStdoutLine, onSpawn } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    if (onSpawn) onSpawn(child);
    let output = '';
    let lineBuffer = '';
    child.stdout.on('data', (chunk) => {
      const str = chunk.toString();
      output = (output + str).slice(-20000);
      if (onStdoutLine) {
        lineBuffer += str;
        const lines = lineBuffer.split(/\r?\n/);
        lineBuffer = lines.pop() || '';
        for (const line of lines) onStdoutLine(line.trim());
      }
    });
    child.stderr.on('data', (chunk) => {
      output = (output + chunk).slice(-20000);
    });
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0
        ? resolve(output)
        : reject(new Error(`${command} terminó con código ${code}: ${output.slice(-250)}`))
    );
  });
}

async function probeMediaDetails(file) {
  try {
    const raw = await runMediaTool('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'format=duration,bit_rate:stream=index,codec_type,codec_name,width,height,r_frame_rate:stream_tags=language,title',
      '-of',
      'json',
      file,
    ]);
    const data = JSON.parse(raw);
    const duration = Number(data.format?.duration) || null;
    const streams = Array.isArray(data.streams) ? data.streams : [];
    const videoStream = streams.find((s) => s.codec_type === 'video') || {};
    const audioStreams = streams.filter((s) => s.codec_type === 'audio');
    let fps = 24;
    if (videoStream.r_frame_rate && videoStream.r_frame_rate.includes('/')) {
      const [num, den] = videoStream.r_frame_rate.split('/').map(Number);
      if (num > 0 && den > 0) fps = num / den;
    }
    if (duration && duration > 0) {
      return {
        duration,
        width: Number(videoStream.width) || 1280,
        height: Number(videoStream.height) || 720,
        fps,
        audioStreams,
      };
    }
  } catch (_err) {
    /* ffprobe no disponible en PATH o falló, se procede al fallback con ffmpeg */
  }

  // Fallback transparente: cuando ffprobe no está instalado en el sistema (ej. PATH de Node en Windows),
  // se invoca ffmpeg para extraer metadatos de duración, resolución y pistas en 0.05s
  try {
    const raw = await runMediaTool('ffmpeg', [
      '-hide_banner',
      '-i',
      file,
      '-t',
      '0',
      '-f',
      'null',
      '-',
    ]);
    const inputSection = raw.split(/Output\s+#\d+/i)[0] || raw;
    let duration = null;
    const durMatch = /Duration:\s*(\d+):(\d+):([0-9.]+)/.exec(inputSection);
    if (durMatch) {
      duration = Number(durMatch[1]) * 3600 + Number(durMatch[2]) * 60 + parseFloat(durMatch[3]);
    }
    let width = 1280;
    let height = 720;
    const resMatch = /Video:.*?,\s*(\d{2,5})x(\d{2,5})/.exec(inputSection);
    if (resMatch) {
      width = Number(resMatch[1]);
      height = Number(resMatch[2]);
    }
    let fps = 24;
    const fpsMatch = /Video:.*?,\s*([0-9.]+)\s*fps/.exec(inputSection);
    if (fpsMatch) {
      fps = parseFloat(fpsMatch[1]);
    }
    const audioStreams = [];
    const audioRegex = /Stream\s+#\d+:(\d+)(?:\[0x[0-9a-f]+\])?(?:\(([^)]+)\))?:\s*Audio:\s*([^,\n]+)/g;
    let m;
    while ((m = audioRegex.exec(inputSection)) !== null) {
      audioStreams.push({
        index: Number(m[1]),
        codec_type: 'audio',
        codec_name: m[3].trim(),
        tags: { language: m[2] || '', title: '' },
      });
    }
    return {
      duration,
      width,
      height,
      fps,
      audioStreams,
    };
  } catch {
    return { duration: null, width: 1280, height: 720, fps: 24, audioStreams: [] };
  }
}

async function mediaDuration(file) {
  const info = await probeMediaDetails(file);
  return info.duration;
}

/**
 * Selecciona la mejor pista de audio según el idioma preferido del usuario para guardarla en el MP4 offline.
 */
function pickBestAudioStreamIndex(audioStreams = [], preferredLanguage = 'latino') {
  if (!audioStreams.length) return 0;
  const matchers =
    preferredLanguage === 'latino'
      ? [/latino|latin|es-mx|es-la/i, /\b(spa|es)\b/i]
      : preferredLanguage === 'castellano'
      ? [/castellano|españa|es-es/i, /\b(spa|es)\b/i]
      : preferredLanguage === 'en'
      ? [/\b(eng|en|english|ingl[eé]s)\b/i]
      : [/\b(jpn|ja|kor|ko|eng|en)\b/i];

  for (const regex of matchers) {
    const idx = audioStreams.findIndex((s) => {
      const tag = `${s.tags?.language || ''} ${s.tags?.title || ''}`;
      return regex.test(tag);
    });
    if (idx !== -1) return idx;
  }
  return 0;
}

/**
 * Analizador rápido de complejidad espacial/temporal ("Per-Title Complexity Probe" estilo Netflix).
 * Muestrea 1.5 segundos en el tercio inicial del video para detectar si es animación/escena limpia
 * (alta compresibilidad) o cine con grano/acción intensa, ajustando CRF, maxrate y denoise sin perder nitidez.
 */
async function analyzeSceneComplexity(file, duration) {
  try {
    const seekSec = duration && duration > 15 ? Math.min(60, Math.floor(duration * 0.25)) : 0;
    const args = [
      '-hide_banner',
      '-loglevel',
      'error',
      ...(seekSec > 0 ? ['-ss', String(seekSec)] : []),
      '-t',
      '1.5',
      '-i',
      file,
      '-vf',
      'fps=4,scale=320:-2,signalstats,metadata=print:file=-',
      '-an',
      '-f',
      'null',
      '-',
    ];
    const out = await runMediaTool('ffmpeg', args);
    const ydifMatches = [...out.matchAll(/lavfi\.signalstats\.YDIF=([0-9.]+)/g)].map((m) =>
      Number(m[1])
    );
    const satMatches = [...out.matchAll(/lavfi\.signalstats\.SATAVG=([0-9.]+)/g)].map((m) =>
      Number(m[1])
    );
    const avgMotion =
      ydifMatches.length > 0
        ? ydifMatches.reduce((a, b) => a + b, 0) / ydifMatches.length
        : 4.5;
    const avgSat =
      satMatches.length > 0
        ? satMatches.reduce((a, b) => a + b, 0) / satMatches.length
        : 35;

    // Animación o contenido plano tiene baja diferencia inter-cuadro o alta saturación uniforme
    const isAnimationOrClean = avgMotion < 3.2 || (avgSat > 55 && avgMotion < 5.0);
    const isHighMotionOrGrain = avgMotion > 9.5;
    return { avgMotion, avgSat, isAnimationOrClean, isHighMotionOrGrain };
  } catch {
    return { avgMotion: 4.5, avgSat: 35, isAnimationOrClean: false, isHighMotionOrGrain: false };
  }
}

/**
 * Construye los argumentos FFmpeg de la "Fórmula Netflix Per-Title" para compresión offline sin pérdida visual.
 * Exportado para verificación en pruebas unitarias.
 */
export function buildNetflixEncodeArgs(
  input,
  output,
  {
    quality = 'compact',
    audioTrackIdx = 0,
    fps = 24,
    isAnimationOrClean = false,
    isHighMotionOrGrain = false,
  } = {}
) {
  const profile = OFFLINE_PROFILES[quality] || OFFLINE_PROFILES.compact;

  // Ajuste dinámico por título (Per-Title Complexity)
  const crfDelta = isAnimationOrClean ? 1.0 : isHighMotionOrGrain ? -0.5 : 0;
  const targetCrf = (profile.baseCrf + crfDelta).toFixed(1);
  const maxrate = isAnimationOrClean
    ? Math.round(profile.maxrateKbps * 0.82)
    : profile.maxrateKbps;
  const bufsize = maxrate * 2;
  const denoise = isHighMotionOrGrain ? '4.2:3.2:6.5:4.8' : profile.denoise;
  const nr = isHighMotionOrGrain ? profile.nr + 150 : profile.nr;

  // Cadena de filtros de video:
  // 1. Limitador de FPS inteligente si el origen es 50/60fps en modo maratón
  // 2. Escalado Lanczos de alta precisión con redondeo exacto de croma
  // 3. Denoiser espacial-temporal hqdn3d (elimina el grano invisible que infla el archivo hasta un 45%)
  // 4. Micro-nitidez perceptiva (unsharp suave en luma) para conservar bordes y rostros cristalinos
  const vfParts = [];
  if (quality === 'marathon' && fps > 30) {
    vfParts.push('fps=24');
  } else if (fps > 48) {
    vfParts.push('fps=30');
  }
  vfParts.push(
    `scale='min(${profile.maxWidth},iw)':'min(${profile.maxHeight},ih)':force_original_aspect_ratio=decrease:force_divisible_by=2:flags=bicubic+accurate_rnd`,
    `hqdn3d=${denoise}`,
    `unsharp=${profile.unsharp}`
  );

  // Parámetros psicovisuales x264 optimizados (Per-Title de Netflix balanceado):
  // - aq-mode=3 (Auto-Variance AQ con sesgo a escenas oscuras para evitar macrobloques en sombras)
  // - mbtree=1 + rc-lookahead=25 (reserva bits para primeros planos y los ahorra en fondos estáticos)
  // - ref=3 + bframes=6 + b-adapt=1 (máxima predicción inter-frame balanceada sin ahogar CPU)
  // - subme=4 + trellis=1 (cuantización óptima sin sobrecarga masiva de tiempo)
  // - keyint=240 (GOP largo de 10s que ahorra hasta 18% en keyframes repetitivos)
  const x264Params = [
    'aq-mode=3',
    `aq-strength=${profile.aqStrength}`,
    `psy-rd=${profile.psyRd}`,
    `nr=${nr}`,
    'rc-lookahead=25',
    'ref=3',
    'bframes=6',
    'b-adapt=1',
    'direct=auto',
    'subme=4',
    'trellis=1',
    'deblock=0,0',
    'keyint=240',
    'min-keyint=24',
    'qcomp=0.60',
    'mbtree=1',
  ].join(':');

  // Cadena de audio balanceada: filtro paso-alto sub-25Hz
  const afChain = 'highpass=f=25';

  return [
    '-hide_banner',
    '-loglevel',
    'error',
    '-threads',
    '0',
    '-nostdin',
    '-progress',
    'pipe:1',
    '-y',
    '-i',
    input,
    '-map',
    '0:v:0',
    '-map',
    `0:a:${audioTrackIdx}?`,
    '-vf',
    vfParts.join(','),
    '-c:v',
    'libx264',
    '-preset',
    'faster',
    '-crf',
    String(targetCrf),
    '-profile:v',
    'high',
    '-level',
    profile.level,
    '-x264-params',
    x264Params,
    '-maxrate',
    `${maxrate}k`,
    '-bufsize',
    `${bufsize}k`,
    '-pix_fmt',
    'yuv420p',
    '-af',
    afChain,
    '-c:a',
    'aac',
    '-b:a',
    profile.audioBitrate,
    '-ac',
    '2',
    '-sn',
    '-dn',
    '-map_metadata',
    '-1',
    '-movflags',
    '+faststart',
    '-f',
    'mp4',
    output,
  ];
}

async function compactVideo(input, output, item, preferredLanguage = 'latino') {
  const probe = await probeMediaDetails(input);
  const originalDuration = probe.duration;
  const complexity = await analyzeSceneComplexity(input, originalDuration);
  const audioTrackIdx = pickBestAudioStreamIndex(probe.audioStreams, preferredLanguage);

  item.encodeProgress = 0;
  const args = buildNetflixEncodeArgs(input, output, {
    quality: item.quality === 'marathon' ? 'marathon' : 'compact',
    audioTrackIdx,
    fps: probe.fps,
    isAnimationOrClean: complexity.isAnimationOrClean,
    isHighMotionOrGrain: complexity.isHighMotionOrGrain,
  });

  await runMediaTool('ffmpeg', args, {
    onSpawn: (child) => {
      item._cancel = () => {
        try {
          child.kill('SIGTERM');
        } catch (_e) {
          /* ignore process kill race */
        }
      };
    },
    onStdoutLine: (line) => {
      if (originalDuration && originalDuration > 0 && line.startsWith('out_time_us=')) {
        const us = Number(line.slice('out_time_us='.length));
        if (Number.isFinite(us) && us >= 0) {
          const pct = Math.min(99, Math.max(1, Math.round((us / 1_000_000 / originalDuration) * 100)));
          item.encodeProgress = pct;
        }
      } else if (line === 'progress=end') {
        item.encodeProgress = 100;
      }
    },
  });

  const encodedDuration = await mediaDuration(output);
  if (
    originalDuration &&
    (!encodedDuration ||
      Math.abs(originalDuration - encodedDuration) > Math.max(3, originalDuration * 0.01))
  ) {
    throw new Error('La versión compacta no conserva la duración completa.');
  }
  const size = (await fsp.stat(output)).size;
  if (!size) throw new Error('La versión compacta está vacía.');
  item.bytes = size;
  item.encodeProgress = 100;
}

async function fetchTorrentFile(source, partial, item) {
  const WebTorrent = await getWebTorrent();
  const client = new WebTorrent({ maxConns: 100, dht: true });
  item._cancel = () => {
    try {
      client.destroy();
    } catch (_e) {
      /* ignore torrent client destroy race */
    }
  };
  const cache = path.join(ROOT, `${item.id}.torrent`);
  await fsp.mkdir(cache, { recursive: true });
  try {
    const trackers = [
      'udp://tracker.opentrackr.org:1337/announce',
      'udp://open.stealth.si:80/announce',
      'udp://tracker.torrent.eu.org:451/announce',
      'udp://tracker.openbittorrent.com:6969/announce',
      'wss://tracker.openwebtorrent.com',
    ];
    const magnet = `magnet:?xt=urn:btih:${source.infoHash}${trackers
      .map((url) => `&tr=${encodeURIComponent(url)}`)
      .join('')}`;
    const torrent = client.add(magnet, { path: cache });
    await new Promise((resolve, reject) => {
      if (torrent.ready) return resolve();
      const timer = setTimeout(
        () => reject(new Error('No se encontraron metadatos P2P en 90 segundos.')),
        90000
      );
      torrent.once('ready', () => {
        clearTimeout(timer);
        resolve();
      });
      torrent.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
    torrent.files.forEach((file) => file.deselect());
    const videos = torrent.files.filter((file) =>
      /\.(mp4|mkv|webm|m4v|avi|mov)$/i.test(file.name)
    );
    const episodePattern =
      source.season && source.episode
        ? new RegExp(
            `s0*${source.season}\\s*e0*${source.episode}\\b|\\b${source.season}x0*${source.episode}\\b|\\be0*${source.episode}\\b`,
            'i'
          )
        : null;
    const file =
      source.fileIdx == null
        ? videos.find((entry) => episodePattern?.test(entry.name)) ||
          videos.sort((a, b) => b.length - a.length)[0]
        : torrent.files[source.fileIdx];
    if (!file || !/\.(mp4|mkv|webm|m4v|avi|mov)$/i.test(file.name)) {
      throw new Error('El torrent no contiene el video solicitado.');
    }
    if (file.length > MAX_INPUT) {
      throw new Error('El archivo de origen supera 4 GB. Elige una versión de menor tamaño.');
    }
    item.totalBytes = file.length;
    item.sourceBytes = file.length;
    item.inputFormat = path.extname(file.name).slice(1).toLowerCase();
    file.select();
    const input = file.createReadStream();
    let idleTimer;
    const resetIdle = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(
        () => input.destroy(new Error('No llegaron datos P2P durante 90 segundos.')),
        90000
      );
    };
    resetIdle();
    const counter = new Transform({
      transform(chunk, _encoding, callback) {
        item.bytes += chunk.length;
        resetIdle();
        callback(
          item.bytes > MAX_INPUT ? new Error('Se superó el límite de 4 GB de origen.') : null,
          chunk
        );
      },
    });
    try {
      await pipeline(input, counter, fs.createWriteStream(partial, { flags: 'wx' }));
    } finally {
      clearTimeout(idleTimer);
    }
    if (item.bytes !== file.length) throw new Error('La descarga P2P terminó incompleta.');
  } finally {
    await new Promise((resolve) => client.destroy(resolve));
    await fsp.rm(cache, { recursive: true, force: true }).catch(() => {});
  }
}

async function openPublicResource(url, kind = 'file', redirects = 0) {
  if (url.protocol !== 'https:' || url.username || url.password || url.port || net.isIP(url.hostname) ||
      url.hostname === 'localhost' || !url.hostname.includes('.')) {
    throw new Error('La lista HLS contiene una URL que no es HTTPS pública.');
  }
  const addresses = await dns.lookup(url.hostname, { all: true, family: 4 });
  const address = addresses.find((entry) => publicIp(entry.address));
  if (!address || addresses.some((entry) => !publicIp(entry.address))) {
    throw new Error('El servidor no tiene una dirección pública segura.');
  }
  const response = await new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        lookup: (_host, options, callback) =>
          options.all
            ? callback(null, [address])
            : callback(null, address.address, address.family),
        timeout: 15000,
        headers: {
          'User-Agent': 'StreamFlix-Offline/2.0',
          Accept: kind === 'manifest' ? 'application/vnd.apple.mpegurl,application/x-mpegURL,text/plain' : '*/*',
        },
      },
      resolve
    );
    request.on('timeout', () =>
      request.destroy(new Error('El servidor tardó demasiado en responder.'))
    );
    request.on('error', reject);
  });
  if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
    response.destroy();
    if (redirects >= 3) throw new Error('Demasiadas redirecciones.');
    const next = new URL(response.headers.location || '', url);
    if (kind === 'file') validateDownloadUrl(next.href);
    return openPublicResource(next, kind, redirects + 1);
  }
  if (response.statusCode !== 200) {
    response.destroy();
    throw new Error(`El servidor respondió HTTP ${response.statusCode}.`);
  }
  response.setTimeout(30000, () =>
    response.destroy(new Error('La descarga se quedó sin datos.'))
  );
  const mime = String(response.headers['content-type'] || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  const allowedMime = kind === 'manifest'
    ? ['application/vnd.apple.mpegurl', 'application/x-mpegurl', 'audio/x-mpegurl', 'text/plain', 'application/octet-stream', '']
    : kind === 'segment'
      ? ['video/mp2t', 'video/mp4', 'audio/mp4', 'application/octet-stream', 'binary/octet-stream', '']
      : ['video/mp4', 'video/webm', 'application/octet-stream'];
  if (!allowedMime.includes(mime)) {
    response.destroy();
    throw new Error('El servidor no devolvió un recurso multimedia compatible.');
  }
  const size = Number(response.headers['content-length']);
  const perResourceLimit = kind === 'manifest' ? 1_000_000 : kind === 'segment' ? 100 * 1024 ** 2 : MAX_INPUT;
  if (Number.isFinite(size) && size > perResourceLimit) {
    response.destroy();
    throw new Error('El recurso supera el límite de tamaño permitido.');
  }
  return { response, size: Number.isFinite(size) && size > 0 ? size : null, url };
}

async function openPublicFile(url) {
  return openPublicResource(url, 'file');
}

async function readHlsManifest(url, openResource = openPublicResource) {
  const { response, url: finalUrl } = await openResource(url, 'manifest');
  let body = '';
  for await (const chunk of response) {
    body += chunk.toString('utf8');
    if (body.length > 1_000_000) {
      response.destroy();
      throw new Error('La lista HLS supera 1 MB.');
    }
  }
  return parseHlsPlaylist(body, finalUrl);
}

export async function downloadHlsVod(source, partial, item, {
  openResource = openPublicResource,
  runTool = runMediaTool,
  rootDirectory = ROOT,
} = {}) {
  const directory = path.join(rootDirectory, `${item.id}.hls`);
  await fsp.mkdir(directory, { recursive: true });
  try {
    let playlist = await readHlsManifest(source.url, openResource);
    if (playlist.kind === 'master') playlist = await readHlsManifest(playlist.url, openResource);
    if (playlist.kind !== 'media') throw new Error('La lista HLS contiene demasiados niveles.');
    item.totalBytes = null;
    for (const resource of playlist.resources) {
      if (item.status === 'failed') throw new Error('Descarga cancelada.');
      const { response, size } = await openResource(resource.url, 'segment');
      if (size && item.bytes + size > MAX_INPUT) {
        response.destroy();
        throw new Error('El HLS supera el límite de 4 GB.');
      }
      item._cancel = () => response.destroy(new Error('Descarga cancelada.'));
      let received = 0;
      const counter = new Transform({
        transform(chunk, _encoding, callback) {
          received += chunk.length;
          item.bytes += chunk.length;
          callback(item.bytes > MAX_INPUT ? new Error('El HLS supera el límite de 4 GB.') : null, chunk);
        },
      });
      await pipeline(response, counter, fs.createWriteStream(path.join(directory, resource.name), { flags: 'wx' }));
      if (size && received !== size) throw new Error('Un segmento HLS terminó incompleto.');
    }
    const manifest = path.join(directory, 'offline.m3u8');
    await fsp.writeFile(manifest, playlist.localPlaylist, 'utf8');
    await runTool('ffmpeg', buildHlsRemuxArgs(manifest, partial), {
      onSpawn: (child) => { item._cancel = () => child.kill('SIGTERM'); },
    });
    item.inputFormat = 'mp4';
    item.bytes = (await fsp.stat(partial)).size;
  } finally {
    delete item._cancel;
    await fsp.rm(directory, { recursive: true, force: true }).catch(() => {});
  }
}

function persist() {
  persistChain = persistChain
    .catch(() => {})
    .then(async () => {
      await fsp.mkdir(ROOT, { recursive: true });
      const temp = `${INDEX}.tmp`;
      const serializable = [...jobs.values()].map(({ _sourceConfig, ...rest }) => rest);
      await fsp.writeFile(temp, JSON.stringify(serializable), 'utf8');
      await fsp.rename(temp, INDEX);
    });
  return persistChain;
}

export async function initDownloads() {
  await fsp.mkdir(ROOT, { recursive: true });
  try {
    const saved = JSON.parse(await fsp.readFile(INDEX, 'utf8'));
    for (const item of saved) {
      if (!/^[0-9a-f-]{36}$/i.test(item.id) || !['mp4', 'webm'].includes(item.format)) continue;
      if (['queued', 'downloading', 'compressing'].includes(item.status)) {
        item.status = 'failed';
        item.error = 'La aplicación se cerró durante la descarga.';
        await Promise.all(
          [
            `${item.id}.source.part`,
            `${item.id}.encoded.part`,
            `${item.id}.torrent`,
            `${item.id}.hls`,
            `${item.id}.mp4`,
            `${item.id}.webm`,
          ].map((name) =>
            fsp
              .rm(path.join(ROOT, name), { recursive: name.endsWith('.torrent') || name.endsWith('.hls'), force: true })
              .catch(() => {})
          )
        );
      }
      if (item.status === 'complete') {
        if (!item.sourceBytes && item.totalBytes) item.sourceBytes = item.totalBytes;
        if (item.savedRatio == null && item.sourceBytes && item.sourceBytes > item.bytes) {
          item.savedRatio = Math.round((1 - item.bytes / item.sourceBytes) * 100);
        }
      }
      jobs.set(item.id, item);
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  await persist();
}

export function listDownloads() {
  return [...jobs.values()]
    .map(({ _sourceConfig, ...rest }) => rest)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getDownload(id) {
  return jobs.get(id) || null;
}

export function downloadFile(item) {
  return path.join(ROOT, `${item.id}.${item.format}`);
}

async function executeJob(item, source) {
  const partial = path.join(ROOT, `${item.id}.source.part`);
  const encoded = path.join(ROOT, `${item.id}.encoded.part`);
  item.status = 'downloading';
  await persist();
  try {
    if (source.infoHash) {
      await fetchTorrentFile(source, partial, item);
    } else if (source.ext === '.m3u8') {
      await downloadHlsVod(source, partial, item);
    } else {
      const { response, size } = await openPublicFile(source.url);
      item.totalBytes = size;
      item.sourceBytes = size;
      if (size && size > MAX_INPUT) {
        response.destroy();
        throw new Error('El origen supera 4 GB.');
      }
      const counter = new Transform({
        transform(chunk, _encoding, callback) {
          item.bytes += chunk.length;
          callback(
            item.bytes > MAX_INPUT ? new Error('Se superó el límite de 4 GB de origen.') : null,
            chunk
          );
        },
      });
      await pipeline(response, counter, fs.createWriteStream(partial, { flags: 'wx' }));
      item.inputFormat = source.ext.slice(1);
      if (size && item.bytes !== size) throw new Error('La descarga terminó incompleta.');
    }
    if (item.bytes === 0) throw new Error('El archivo está vacío.');

    const inputSize = (await fsp.stat(partial)).size;
    item.sourceBytes = inputSize;

    if (item.quality === 'compact' || item.quality === 'marathon') {
      item.status = 'compressing';
      item.encodeProgress = 0;
      await persist();
      const previousEncode = encodeChain;
      let releaseEncode;
      encodeChain = new Promise((resolve) => {
        releaseEncode = resolve;
      });
      await previousEncode;
      try {
        await compactVideo(partial, encoded, item, source.preferredLanguage);
      } finally {
        releaseEncode();
      }
      if (
        inputSize <= item.bytes &&
        ['mp4', 'webm'].includes(item.inputFormat) &&
        inputSize <= MAX_FILE
      ) {
        item.format = item.inputFormat;
        item.bytes = inputSize;
        item.savedRatio = 0;
      } else {
        if (item.bytes > MAX_FILE) {
          throw new Error('La versión compacta supera 2 GB; prueba otra fuente de menor tamaño.');
        }
        item.savedRatio =
          inputSize > 0 ? Math.max(0, Math.round((1 - item.bytes / inputSize) * 100)) : 0;
        await fsp.rename(encoded, downloadFile(item));
      }
    } else {
      if (!['mp4', 'webm'].includes(item.inputFormat)) {
        throw new Error('El formato original no se puede reproducir offline; elige «Compacta» o «Temporada Completa».');
      }
      item.format = item.inputFormat;
      if (item.bytes > MAX_FILE) {
        throw new Error('El archivo original supera 2 GB. Selecciona «Compacta».');
      }
    }
    if (!fs.existsSync(downloadFile(item))) {
      if (item.format === 'mp4' || item.format === 'webm') {
        await fsp.rename(partial, downloadFile(item));
      } else {
        throw new Error('El formato original no se puede reproducir offline; elige «Compacta».');
      }
    }
    await fsp.rm(partial, { force: true });
    await fsp.rm(encoded, { force: true });
    const occupied = [...jobs.values()].reduce(
      (sum, other) => sum + (other.id !== item.id && other.status === 'complete' ? other.bytes : 0),
      0
    );
    if (occupied + item.bytes > MAX_TOTAL) {
      throw new Error('La descarga supera la cuota de 8 GB de la biblioteca.');
    }
    item.status = 'complete';
    item.encodeProgress = 100;
  } catch (error) {
    item.status = 'failed';
    item.error = error.message;
    await fsp.rm(partial, { force: true }).catch(() => {});
    await fsp.rm(encoded, { force: true }).catch(() => {});
    await fsp.rm(downloadFile(item), { force: true }).catch(() => {});
  } finally {
    delete item._sourceConfig;
    await persist();
    pumpDownloadQueue();
  }
}

function pumpDownloadQueue() {
  if (queueRunning) return;
  queueRunning = true;
  try {
    while (true) {
      const activeCount = [...jobs.values()].filter((item) =>
        ['downloading', 'compressing'].includes(item.status)
      ).length;
      if (activeCount >= MAX_ACTIVE) break;
      const nextJob = [...jobs.values()]
        .filter((item) => item.status === 'queued' && item._sourceConfig)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
      if (!nextJob) break;
      const source = nextJob._sourceConfig;
      nextJob.status = 'downloading';
      void executeJob(nextJob, source);
    }
  } finally {
    queueRunning = false;
  }
}

export async function startDownload({
  url: rawUrl,
  infoHash,
  fileIdx,
  season,
  episode,
  title,
  quality = 'compact',
  preferredLanguage = 'latino',
  allowQueue = false,
}) {
  const source = validateOfflineSource({
    url: rawUrl,
    infoHash,
    fileIdx,
    season,
    episode,
    quality,
    preferredLanguage,
  });
  const activeCount = [...jobs.values()].filter((item) =>
    ['downloading', 'compressing'].includes(item.status)
  ).length;
  const queuedCount = [...jobs.values()].filter((item) => item.status === 'queued').length;

  if (!allowQueue && activeCount >= MAX_ACTIVE) {
    throw new Error('Ya hay dos descargas en curso. Usa la cola de temporada o espera a que terminen.');
  }
  if (queuedCount >= MAX_QUEUED) {
    throw new Error(`La cola de descargas alcanzó el máximo de ${MAX_QUEUED} episodios.`);
  }
  const used = [...jobs.values()].reduce(
    (sum, item) => sum + (item.status === 'complete' ? item.bytes : 0),
    0
  );
  if (used >= MAX_TOTAL) {
    throw new Error('La biblioteca offline alcanzó el límite de 8 GB.');
  }

  const shouldQueue = activeCount >= MAX_ACTIVE;
  const item = {
    id: randomUUID(),
    title: String(title || source.url?.pathname.split('/').pop() || 'Video').slice(0, 120),
    format: quality === 'compact' || quality === 'marathon' || source.ext === '.m3u8' ? 'mp4' : source.ext?.slice(1) || 'mp4',
    quality,
    status: shouldQueue ? 'queued' : 'downloading',
    bytes: 0,
    totalBytes: null,
    sourceBytes: null,
    savedRatio: null,
    encodeProgress: 0,
    season: source.season || null,
    episode: source.episode || null,
    createdAt: new Date().toISOString(),
    error: null,
    _sourceConfig: source,
  };
  jobs.set(item.id, item);
  await persist();
  if (!shouldQueue) {
    void executeJob(item, source);
  } else {
    pumpDownloadQueue();
  }
  const { _sourceConfig, ...publicItem } = item;
  return publicItem;
}

/**
 * Encola un lote de episodios (por ejemplo, una temporada completa) usando el motor de cola inteligente.
 */
export async function startBatchDownloads({ items = [], quality = 'marathon', preferredLanguage = 'latino' } = {}) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('Selecciona al menos un episodio para descargar.');
  }
  if (items.length > MAX_QUEUED) {
    throw new Error(`Puedes encolar hasta ${MAX_QUEUED} episodios por lote.`);
  }
  const created = [];
  for (const entry of items) {
    const started = await startDownload({
      ...entry,
      quality: entry.quality || quality,
      preferredLanguage: entry.preferredLanguage || preferredLanguage,
      allowQueue: true,
    });
    created.push(started);
  }
  return created;
}

export async function deleteDownload(id) {
  const item = jobs.get(id);
  if (!item) return false;
  if (item.status === 'queued') {
    jobs.delete(id);
    await persist();
    return true;
  }
  if (['downloading', 'compressing'].includes(item.status)) {
    if (typeof item._cancel === 'function') {
      try {
        item._cancel();
      } catch (_e) {
        /* ignore cancel race */
      }
    }
    item.status = 'failed';
    item.error = 'Descarga cancelada por el usuario.';
    jobs.delete(id);
    await persist();
    await fsp.rm(path.join(ROOT, `${id}.source.part`), { force: true }).catch(() => {});
    await fsp.rm(path.join(ROOT, `${id}.encoded.part`), { force: true }).catch(() => {});
    await fsp.rm(path.join(ROOT, `${id}.torrent`), { recursive: true, force: true }).catch(() => {});
    await fsp.rm(path.join(ROOT, `${id}.hls`), { recursive: true, force: true }).catch(() => {});
    await fsp.rm(downloadFile(item), { force: true }).catch(() => {});
    return true;
  }
  await fsp.rm(downloadFile(item), { force: true });
  jobs.delete(id);
  await persist();
  return true;
}

export function parseDownloadRange(header, size) {
  if (!header) return { start: 0, end: size - 1, partial: false };
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2])) return null;
  let start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  let end = match[2] && match[1] ? Number(match[2]) : size - 1;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    start >= size ||
    end < start
  ) {
    return null;
  }
  end = Math.min(end, size - 1);
  return { start, end, partial: true };
}
