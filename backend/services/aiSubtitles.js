import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { probeMedia, selectAudioTrack } from './mediaTools.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.local');
const MODEL = process.env.WHISPER_MODEL || path.join(ROOT, 'whisper', 'ggml-base.bin');
const CLI = process.env.WHISPER_CLI || path.join(ROOT, 'whisper', 'Release', process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli');
const WORK = path.join(ROOT, 'ai-jobs');
const jobs = new Map();
let activeJob = null;

export function aiAvailable() { return fs.existsSync(MODEL) && fs.existsSync(CLI); }
export function getAiJob(id) { return jobs.get(id) || null; }
export function getAiVtt(id) { const job = getAiJob(id); return job?.status === 'done' && fs.existsSync(job.vttPath) ? job.vttPath : null; }
export function validateAiLanguage(value) { return ['auto', 'es', 'en', 'pt', 'fr', 'de', 'it', 'ja', 'ko'].includes(value) ? value : null; }

function run(exe, args, job, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(exe, args, { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-4000); });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('close', code => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`${path.basename(exe)} terminó con código ${code}: ${stderr.slice(-500)}`));
    });
  });
}

function start(input, { language = 'auto', audioTrack = 0, removeInput = false } = {}) {
  if (!aiAvailable()) throw new Error('Whisper local no está instalado.');
  if (activeJob) throw new Error('Ya se está generando otro subtítulo. Espera a que termine.');
  const lang = validateAiLanguage(language);
  if (!lang) throw new Error('Idioma no válido.');
  const track = Number(audioTrack);
  if (!Number.isInteger(track) || track < 0 || track > 30) throw new Error('Pista de audio no válida.');
  fs.mkdirSync(WORK, { recursive: true });
  const id = randomUUID();
  const folder = path.join(WORK, id);
  fs.mkdirSync(folder);
  const wav = path.join(folder, 'audio.wav');
  const output = path.join(folder, 'subtitles');
  const job = { id, status: 'extracting', language: lang, audioTrack: track, vttPath: output + '.vtt', error: null, createdAt: Date.now() };
  jobs.set(id, job); activeJob = id;
  (async () => {
    try {
      await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', input, '-map', `0:a:${track}`, '-vn', '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', wav], job, 4 * 60 * 60 * 1000);
      job.status = 'transcribing';
      await run(CLI, ['-m', MODEL, '-f', wav, '-l', lang, '-ovtt', '-of', output, '-ml', '42'], job, 8 * 60 * 60 * 1000);
      if (!fs.existsSync(job.vttPath) || fs.statSync(job.vttPath).size < 10) throw new Error('Whisper no generó subtítulos.');
      job.status = 'done';
    } catch (error) { job.status = 'error'; job.error = error.message; }
    finally {
      activeJob = null;
      fs.rmSync(wav, { force: true });
      if (removeInput) fs.rmSync(input, { force: true });
    }
  })();
  return job;
}

export async function startP2pJob({ infoHash, fileIdx, language, audioTrack, audioLang, originalLanguage, manualAudio, port }) {
  if (!/^[0-9a-f]{40}$/i.test(String(infoHash))) throw new Error('Identificador P2P no válido.');
  const index = Number(fileIdx);
  if (!Number.isInteger(index) || index < 0 || index > 9999) throw new Error('Archivo no válido.');
  const input = `http://127.0.0.1:${port}/api/stream/${infoHash}?fileIdx=${index}&raw=1`;
  const info = await probeMedia(input);
  if (!info.audioTracks.length) throw new Error('No se pudo detectar una pista de audio en esta fuente.');
  const selected = selectAudioTrack(info.audioTracks, { audioLang, originalLanguage, audioTrack, manualAudio: manualAudio === true });
  return start(input, { language, audioTrack: selected });
}

export async function receiveUpload(req, { maxBytes = 1024 * 1024 * 1024 } = {}) {
  if (activeJob) throw new Error('Ya se está generando otro subtítulo.');
  fs.mkdirSync(WORK, { recursive: true });
  const file = path.join(WORK, `upload-${randomUUID()}.media`);
  let bytes = 0;
  try {
    req.on('data', chunk => { bytes += chunk.length; if (bytes > maxBytes) req.destroy(new Error('El archivo supera 1 GB.')); });
    await pipeline(req, fs.createWriteStream(file));
    if (!bytes) throw new Error('Archivo vacío.');
    return file;
  } catch (error) { fs.rmSync(file, { force: true }); throw error; }
}

export function startUploadJob(file, options) {
  try { return start(file, { ...options, removeInput: true }); }
  catch (error) { fs.rmSync(file, { force: true }); throw error; }
}

export function publicAiJob(job) { return job ? { id: job.id, status: job.status, language: job.language, error: job.error } : null; }
