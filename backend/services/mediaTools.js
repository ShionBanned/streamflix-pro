import { spawn } from 'node:child_process';

export function waitForTorrent(torrent, { timeoutMs = 45000 } = {}) {
  if (torrent.ready) return Promise.resolve(torrent);
  return new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timeout); torrent.off('ready', ready); torrent.off('error', failed); torrent.off('close', closed); };
    const ready = () => { cleanup(); resolve(torrent); };
    const failed = error => { cleanup(); reject(error); };
    const closed = () => failed(new Error('La fuente se cerró antes de recibir metadatos'));
    const timeout = setTimeout(() => failed(new Error('La fuente no entregó metadatos a tiempo')), timeoutMs);
    torrent.once('ready', ready); torrent.once('error', failed); torrent.once('close', closed);
  });
}

export function parseMediaInfo(text) {
  const durationMatch = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(text);
  const duration = durationMatch ? Number(durationMatch[1]) * 3600 + Number(durationMatch[2]) * 60 + Number(durationMatch[3]) : null;
  const audioTracks = [];
  for (const line of text.split(/\r?\n/)) {
    const audio = /Stream #0:(\d+)(.*?): Audio:\s*([^,\s]+)/.exec(line);
    if (!audio) continue;
    const lang = /\(([a-z]{2,3}(?:-[a-z]{2})?)\)/i.exec(audio[2])?.[1] || 'und';
    if (!audioTracks.some(track => track.streamIndex === Number(audio[1]))) audioTracks.push({ index: audioTracks.length, streamIndex: Number(audio[1]), lang, codec: audio[3], label: `${lang.toUpperCase()} · ${audio[3]}` });
  }
  return { duration, audioTracks, videoCodec: /Stream #0:\d+[^\r\n]*?: Video:\s*([^,\s]+)/.exec(text)?.[1] || null };
}

export function selectAudioTrack(tracks, { audioLang = 'vose', originalLanguage, audioTrack = 0, manualAudio = false } = {}) {
  if (!tracks.length) return 0;
  const index = Number(audioTrack);
  if (manualAudio) return Number.isInteger(index) && tracks[index] ? index : 0;
  const languages = audioLang === 'latino' ? ['es-mx', 'es-la', 'spa', 'es'] : audioLang === 'castellano' ? ['es-es', 'spa', 'es'] : audioLang === 'en' ? ['eng', 'en'] : ({ ja: ['jpn', 'ja'], en: ['eng', 'en'], es: ['spa', 'es'], ko: ['kor', 'ko'], fr: ['fra', 'fre', 'fr'], pt: ['por', 'pt'] }[originalLanguage] || [originalLanguage].filter(Boolean));
  for (const lang of languages) { const found = tracks.findIndex(track => track.lang.toLowerCase() === lang); if (found >= 0) return found; }
  return 0;
}

export function probeMedia(input, { spawnImpl = spawn, timeoutMs = 20000 } = {}) {
  return new Promise(resolve => {
    let stderr = ''; let settled = false;
    const process = spawnImpl('ffmpeg', ['-hide_banner', '-i', input, '-t', '0', '-f', 'null', '-'], { windowsHide: true });
    const finish = () => { if (settled) return; settled = true; clearTimeout(timeout); resolve(parseMediaInfo(stderr)); };
    const timeout = setTimeout(() => { process.kill(); finish(); }, timeoutMs);
    process.stderr.on('data', chunk => { if (stderr.length < 65536) stderr += chunk.toString(); });
    process.stdout.resume(); process.once('error', finish); process.once('close', finish);
  });
}

export function streamFfmpeg(input, req, res, { audioTrack = 0, transcodeVideo = false, startTime = 0, spawnImpl = spawn } = {}) {
  const args = ['-hide_banner', '-loglevel', 'error', ...(startTime > 0 ? ['-ss', String(startTime)] : []), '-i', input,
    '-map', '0:v:0', '-map', `0:a:${audioTrack}?`, ...(transcodeVideo ? ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p'] : ['-c:v', 'copy']),
    '-c:a', 'aac', '-ac', '2', '-b:a', '192k', '-af', 'aresample=async=1:first_pts=0', '-sn', '-dn', '-f', 'mp4', '-movflags', 'frag_keyframe+empty_moov+default_base_moof', 'pipe:1'];
  const child = spawnImpl('ffmpeg', args, { windowsHide: true });
  let closed = false; let started = false;
  const stop = () => { if (!closed) child.kill(); };
  res.once('close', stop); req.once('aborted', stop);
  const cleanup = () => { closed = true; res.off('close', stop); req.off('aborted', stop); };
  child.stderr.resume();
  child.stdout.once('data', () => {
    started = true;
    if (!res.headersSent) res.writeHead(200, { 'Content-Type': 'video/mp4', 'Cache-Control': 'no-store', 'X-Audio-Engine': 'FFmpeg-AAC-2.0', 'X-Stream-Start': String(startTime) });
  });
  child.stdout.pipe(res, { end: false });
  const failure = () => {
    if (res.destroyed || res.writableEnded) return;
    if (res.headersSent) res.destroy();
    else res.status(502).json({ error: 'FFmpeg no pudo convertir esta fuente. Prueba otra pista o abre el archivo en VLC.' });
  };
  child.once('error', () => { cleanup(); failure(); });
  child.once('close', code => { cleanup(); if (code === 0 && started) res.end(); else failure(); });
  return child;
}
