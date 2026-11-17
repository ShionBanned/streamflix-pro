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
import WebTorrent from 'webtorrent';

const ROOT = path.resolve(process.cwd(), '.local', 'downloads');
const INDEX = path.join(ROOT, 'index.json');
const MAX_FILE = 2 * 1024 ** 3;
const MAX_INPUT = 4 * 1024 ** 3;
const MAX_TOTAL = 5 * 1024 ** 3;
const MAX_ACTIVE = 2;
const jobs = new Map();
let persistChain = Promise.resolve();
let encodeChain = Promise.resolve();

function publicIp(address) {
  if (net.isIP(address) === 4) {
    const [a, b, c, d] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19)) || (a === 192 && b === 0 && [0, 2].includes(c)) || (a === 192 && b === 88 && c === 99) || (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113) || (a === 255 && d === 255));
  }
  return false;
}

export function validateDownloadUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Introduce una URL HTTPS válida.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || net.isIP(url.hostname) || url.hostname === 'localhost' || !url.hostname.includes('.')) {
    throw new Error('Se requiere un enlace HTTPS público sin credenciales ni puerto personalizado.');
  }
  const ext = path.posix.extname(url.pathname).toLowerCase();
  if (!['.mp4', '.webm'].includes(ext)) throw new Error('Solo se pueden guardar archivos directos MP4 o WebM.');
  return { url, ext };
}

export function validateOfflineSource({ url, infoHash, fileIdx, season, episode, quality = 'compact' } = {}) {
  if (!['compact', 'original'].includes(quality)) throw new Error('Calidad offline inválida.');
  if (infoHash) {
    if (url || !/^[a-f0-9]{40}$/i.test(String(infoHash))) throw new Error('Hash P2P inválido.');
    if (fileIdx != null && (!Number.isSafeInteger(Number(fileIdx)) || Number(fileIdx) < 0 || Number(fileIdx) > 9999)) throw new Error('Índice de archivo inválido.');
    for (const value of [season, episode]) if (value != null && (!Number.isSafeInteger(Number(value)) || Number(value) < 1 || Number(value) > 999)) throw new Error('Episodio inválido.');
    return { infoHash: String(infoHash).toLowerCase(), fileIdx: fileIdx == null ? null : Number(fileIdx), season: season == null ? null : Number(season), episode: episode == null ? null : Number(episode), quality };
  }
  return { ...validateDownloadUrl(url), quality };
}

async function runMediaTool(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', chunk => { output = (output + chunk).slice(-20000); });
    child.stderr.on('data', chunk => { output = (output + chunk).slice(-20000); });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(output) : reject(new Error(`${command} terminó con código ${code}: ${output.slice(-250)}`)));
  });
}

async function mediaDuration(file) {
  try {
    const data = JSON.parse(await runMediaTool('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', file]));
    return Number(data.format?.duration) || null;
  } catch { return null; }
}

async function compactVideo(input, output, item) {
  const originalDuration = await mediaDuration(input);
  const args = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-i', input, '-map', '0:v:0', '-map', '0:a:0?', '-vf', "scale='min(1280,iw)':'min(720,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2", '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '30', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '96k', '-ac', '2', '-movflags', '+faststart', '-f', 'mp4', output];
  await runMediaTool('ffmpeg', args);
  const encodedDuration = await mediaDuration(output);
  if (originalDuration && (!encodedDuration || Math.abs(originalDuration - encodedDuration) > Math.max(3, originalDuration * 0.01))) throw new Error('La versión compacta no conserva la duración completa.');
  const size = (await fsp.stat(output)).size;
  if (!size) throw new Error('La versión compacta está vacía.');
  item.bytes = size;
}

async function fetchTorrentFile(source, partial, item) {
  const client = new WebTorrent({ maxConns: 80, dht: true });
  const cache = path.join(ROOT, `${item.id}.torrent`);
  await fsp.mkdir(cache, { recursive: true });
  try {
    const trackers = ['udp://tracker.opentrackr.org:1337/announce', 'udp://tracker.torrent.eu.org:451/announce', 'wss://tracker.openwebtorrent.com'];
    const magnet = `magnet:?xt=urn:btih:${source.infoHash}${trackers.map(url => `&tr=${encodeURIComponent(url)}`).join('')}`;
    const torrent = client.add(magnet, { path: cache });
    await new Promise((resolve, reject) => {
      if (torrent.ready) return resolve();
      const timer = setTimeout(() => reject(new Error('No se encontraron metadatos P2P en 90 segundos.')), 90000);
      torrent.once('ready', () => { clearTimeout(timer); resolve(); });
      torrent.once('error', error => { clearTimeout(timer); reject(error); });
    });
    torrent.files.forEach(file => file.deselect());
    const videos = torrent.files.filter(file => /\.(mp4|mkv|webm|m4v|avi|mov)$/i.test(file.name));
    const episodePattern = source.season && source.episode ? new RegExp(`s${String(source.season).padStart(2, '0')}e${String(source.episode).padStart(2, '0')}|${source.season}x${String(source.episode).padStart(2, '0')}`, 'i') : null;
    const file = source.fileIdx == null ? (videos.find(entry => episodePattern?.test(entry.name)) || videos.sort((a, b) => b.length - a.length)[0]) : torrent.files[source.fileIdx];
    if (!file || !/\.(mp4|mkv|webm|m4v|avi|mov)$/i.test(file.name)) throw new Error('El torrent no contiene el video solicitado.');
    if (file.length > MAX_INPUT) throw new Error('El archivo de origen supera 4 GB. Elige una versión de menor tamaño.');
    item.totalBytes = file.length;
    item.inputFormat = path.extname(file.name).slice(1).toLowerCase();
    file.select();
    const input = file.createReadStream();
    let idleTimer;
    const resetIdle = () => { clearTimeout(idleTimer); idleTimer = setTimeout(() => input.destroy(new Error('No llegaron datos P2P durante 90 segundos.')), 90000); };
    resetIdle();
    const counter = new Transform({ transform(chunk, _encoding, callback) {
      item.bytes += chunk.length;
      resetIdle();
      callback(item.bytes > MAX_INPUT ? new Error('Se superó el límite de 4 GB de origen.') : null, chunk);
    } });
    try { await pipeline(input, counter, fs.createWriteStream(partial, { flags: 'wx' })); }
    finally { clearTimeout(idleTimer); }
    if (item.bytes !== file.length) throw new Error('La descarga P2P terminó incompleta.');
  } finally {
    await new Promise(resolve => client.destroy(resolve));
    await fsp.rm(cache, { recursive: true, force: true }).catch(() => {});
  }
}

async function openPublicFile(url, redirects = 0) {
  const addresses = await dns.lookup(url.hostname, { all: true, family: 4 });
  const address = addresses.find(entry => publicIp(entry.address));
  if (!address || addresses.some(entry => !publicIp(entry.address))) throw new Error('El servidor no tiene una dirección pública segura.');
  const response = await new Promise((resolve, reject) => {
    const request = https.get(url, {
      lookup: (_host, options, callback) => options.all ? callback(null, [address]) : callback(null, address.address, address.family),
      timeout: 15000,
      headers: { 'User-Agent': 'StreamFlix-Offline/1.0', Accept: 'video/mp4,video/webm,application/octet-stream' },
    }, resolve);
    request.on('timeout', () => request.destroy(new Error('El servidor tardó demasiado en responder.')));
    request.on('error', reject);
  });
  if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
    response.destroy();
    if (redirects >= 3) throw new Error('Demasiadas redirecciones.');
    const next = validateDownloadUrl(new URL(response.headers.location || '', url).href);
    return openPublicFile(next.url, redirects + 1);
  }
  if (response.statusCode !== 200) { response.destroy(); throw new Error(`El servidor respondió HTTP ${response.statusCode}.`); }
  response.setTimeout(30000, () => response.destroy(new Error('La descarga se quedó sin datos.')));
  const mime = String(response.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (!['video/mp4', 'video/webm', 'application/octet-stream'].includes(mime)) { response.destroy(); throw new Error('El servidor no devolvió un archivo de video directo.'); }
  const size = Number(response.headers['content-length']);
  if (Number.isFinite(size) && size > MAX_INPUT) { response.destroy(); throw new Error('El origen supera el límite de 4 GB.'); }
  return { response, size: Number.isFinite(size) && size > 0 ? size : null };
}

function persist() {
  persistChain = persistChain.catch(() => {}).then(async () => {
    await fsp.mkdir(ROOT, { recursive: true });
    const temp = `${INDEX}.tmp`;
    await fsp.writeFile(temp, JSON.stringify([...jobs.values()]), 'utf8');
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
      if (['downloading', 'compressing'].includes(item.status)) {
        item.status = 'failed'; item.error = 'La aplicación se cerró durante la descarga.';
        await Promise.all([`${item.id}.source.part`, `${item.id}.encoded.part`, `${item.id}.torrent`, `${item.id}.mp4`, `${item.id}.webm`].map(name => fsp.rm(path.join(ROOT, name), { recursive: name.endsWith('.torrent'), force: true }).catch(() => {})));
      }
      jobs.set(item.id, item);
    }
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await persist();
}

export function listDownloads() { return [...jobs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }
export function getDownload(id) { return jobs.get(id) || null; }
export function downloadFile(item) { return path.join(ROOT, `${item.id}.${item.format}`); }

export async function startDownload({ url: rawUrl, infoHash, fileIdx, season, episode, title, quality = 'compact' }) {
  const source = validateOfflineSource({ url: rawUrl, infoHash, fileIdx, season, episode, quality });
  if ([...jobs.values()].filter(item => ['downloading', 'compressing'].includes(item.status)).length >= MAX_ACTIVE) throw new Error('Ya hay dos descargas en curso.');
  const used = [...jobs.values()].reduce((sum, item) => sum + (item.status === 'complete' ? item.bytes : 0), 0);
  if (used >= MAX_TOTAL) throw new Error('La biblioteca offline alcanzó el límite de 5 GB.');
  const item = { id: randomUUID(), title: String(title || source.url?.pathname.split('/').pop() || 'Video').slice(0, 120), format: quality === 'compact' ? 'mp4' : (source.ext?.slice(1) || 'mp4'), quality, status: 'downloading', bytes: 0, totalBytes: null, createdAt: new Date().toISOString(), error: null };
  jobs.set(item.id, item);
  await persist();
  void (async () => {
    const partial = path.join(ROOT, `${item.id}.source.part`);
    const encoded = path.join(ROOT, `${item.id}.encoded.part`);
    try {
      if (source.infoHash) await fetchTorrentFile(source, partial, item);
      else {
        const { response, size } = await openPublicFile(source.url);
        item.totalBytes = size;
        if (size && size > MAX_INPUT) { response.destroy(); throw new Error('El origen supera 4 GB.'); }
        const counter = new Transform({ transform(chunk, _encoding, callback) {
          item.bytes += chunk.length;
          callback(item.bytes > MAX_INPUT ? new Error('Se superó el límite de 4 GB de origen.') : null, chunk);
        } });
        await pipeline(response, counter, fs.createWriteStream(partial, { flags: 'wx' }));
        item.inputFormat = source.ext.slice(1);
        if (size && item.bytes !== size) throw new Error('La descarga terminó incompleta.');
      }
      if (item.bytes === 0) throw new Error('El archivo está vacío.');
      if (quality === 'compact') {
        item.status = 'compressing';
        await persist();
        const previousEncode = encodeChain;
        let releaseEncode;
        encodeChain = new Promise(resolve => { releaseEncode = resolve; });
        await previousEncode;
        try { await compactVideo(partial, encoded, item); }
        finally { releaseEncode(); }
        const inputSize = (await fsp.stat(partial)).size;
        if (inputSize <= item.bytes && ['mp4', 'webm'].includes(item.inputFormat) && inputSize <= MAX_FILE) {
          item.format = item.inputFormat;
          item.bytes = inputSize;
        } else {
          if (item.bytes > MAX_FILE) throw new Error('La versión compacta supera 2 GB; prueba otra fuente de menor tamaño.');
          await fsp.rename(encoded, downloadFile(item));
        }
      } else {
        if (!['mp4', 'webm'].includes(item.inputFormat)) throw new Error('El formato original no se puede reproducir offline; elige «Compacta».');
        item.format = item.inputFormat;
        if (item.bytes > MAX_FILE) throw new Error('El archivo original supera 2 GB. Selecciona «Compacta».');
      }
      if (!fs.existsSync(downloadFile(item))) {
        if (item.format === 'mp4' || item.format === 'webm') await fsp.rename(partial, downloadFile(item));
        else throw new Error('El formato original no se puede reproducir offline; elige «Compacta».');
      }
      await fsp.rm(partial, { force: true });
      await fsp.rm(encoded, { force: true });
      const occupied = [...jobs.values()].reduce((sum, other) => sum + (other.id !== item.id && other.status === 'complete' ? other.bytes : 0), 0);
      if (occupied + item.bytes > MAX_TOTAL) throw new Error('La descarga supera la cuota de 5 GB.');
      item.status = 'complete';
    } catch (error) {
      item.status = 'failed'; item.error = error.message;
      await fsp.rm(partial, { force: true }).catch(() => {});
      await fsp.rm(encoded, { force: true }).catch(() => {});
      await fsp.rm(downloadFile(item), { force: true }).catch(() => {});
    }
    await persist();
  })();
  return item;
}

export async function deleteDownload(id) {
  const item = jobs.get(id);
  if (!item) return false;
  if (['downloading', 'compressing'].includes(item.status)) throw new Error('Espera a que termine la descarga para borrarla.');
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
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start) return null;
  end = Math.min(end, size - 1);
  return { start, end, partial: true };
}
