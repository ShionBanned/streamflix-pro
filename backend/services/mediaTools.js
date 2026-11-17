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

const IMAGE_SUBTITLE_CODECS = /^(?:hdmv_pgs_subtitle|pgssub|dvd_subtitle|dvdsub|dvb_subtitle|dvbsub|xsub)$/i;

const ISO_LANG_MAP = {
  spa: 'Español Latino',
  es: 'Español Latino',
  'es-mx': 'Español Latino',
  'es-la': 'Español Latino',
  'es-es': 'Castellano',
  eng: 'Inglés',
  en: 'Inglés',
  jpn: 'Japonés',
  ja: 'Japonés',
  fra: 'Francés',
  fre: 'Francés',
  fr: 'Francés',
  ita: 'Italiano',
  it: 'Italiano',
  ger: 'Alemán',
  deu: 'Alemán',
  de: 'Alemán',
  por: 'Portugués',
  pt: 'Portugués',
  rus: 'Ruso',
  ru: 'Ruso',
  kor: 'Coreano',
  ko: 'Coreano',
  chi: 'Chino',
  zho: 'Chino',
  zh: 'Chino',
};

export function parseMediaInfo(text) {
  const durationMatch = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(text);
  const duration = durationMatch ? Number(durationMatch[1]) * 3600 + Number(durationMatch[2]) * 60 + Number(durationMatch[3]) : null;
  const audioTracks = [];
  const subtitleTracks = [];
  const videoCodec = /Stream #0:\d+[^\r\n]*?: Video:\s*([^,\s]+)/.exec(text)?.[1] || null;

  const lines = text.split(/\r?\n/);
  let currentTrack = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const audioMatch = /Stream #0:(\d+)(.*?): Audio:\s*([^,\s]+)/i.exec(line);
    if (audioMatch) {
      const streamIndex = Number(audioMatch[1]);
      const extra = audioMatch[2] || '';
      const codec = audioMatch[3];
      const lang = /\(([a-z]{2,3}(?:-[a-z0-9]{2,4})?)\)/i.exec(extra)?.[1]?.toLowerCase() || 'und';
      if (!audioTracks.some(t => t.streamIndex === streamIndex)) {
        currentTrack = {
          type: 'audio',
          index: audioTracks.length,
          streamIndex,
          lang,
          codec,
          title: null,
          handlerName: null,
        };
        audioTracks.push(currentTrack);
      } else {
        currentTrack = null;
      }
      continue;
    }

    const subMatch = /Stream #0:(\d+)(.*?): Subtitle:\s*([^,\s]+)/i.exec(line);
    if (subMatch) {
      const streamIndex = Number(subMatch[1]);
      const extra = subMatch[2] || '';
      const codec = subMatch[3];
      const lang = /\(([a-z]{2,3}(?:-[a-z0-9]{2,4})?)\)/i.exec(extra)?.[1]?.toLowerCase() || 'und';
      const textBased = !IMAGE_SUBTITLE_CODECS.test(codec);
      if (!subtitleTracks.some(t => t.streamIndex === streamIndex)) {
        currentTrack = {
          type: 'subtitle',
          index: subtitleTracks.length,
          streamIndex,
          lang,
          codec,
          textBased,
          title: null,
          handlerName: null,
        };
        subtitleTracks.push(currentTrack);
      } else {
        currentTrack = null;
      }
      continue;
    }

    if (/^\s*Stream #0:\d+/i.test(line)) {
      currentTrack = null;
      continue;
    }

    if (currentTrack) {
      const titleMatch = /^\s*title\s*:\s*(.+)$/i.exec(line);
      if (titleMatch && !currentTrack.title) {
        currentTrack.title = titleMatch[1].trim();
      }
      const handlerMatch = /^\s*handler_name\s*:\s*(.+)$/i.exec(line);
      if (handlerMatch && !currentTrack.handlerName) {
        currentTrack.handlerName = handlerMatch[1].trim();
      }
      const langMetaMatch = /^\s*language\s*:\s*([a-z]{2,3}(?:-[a-z0-9]{2,4})?)\b/i.exec(line);
      if (langMetaMatch && currentTrack.lang === 'und') {
        currentTrack.lang = langMetaMatch[1].toLowerCase();
      }
    }
  }

  for (const track of audioTracks) {
    const rawTitle = track.title || (track.handlerName && !/^sound(?:media)?handler$/i.test(track.handlerName) ? track.handlerName : null);
    const title = rawTitle && rawTitle.trim() ? rawTitle.trim() : null;
    track.title = title;
    delete track.handlerName;
    delete track.type;

    const codecUpper = (track.codec || '').toUpperCase();
    const lang = (track.lang || 'und').toLowerCase();

    let label;
    if (lang === 'und') {
      if (title) {
        label = codecUpper && !title.toUpperCase().includes(codecUpper) ? `${title} · ${codecUpper}` : title;
      } else {
        label = codecUpper ? `Pista ${track.index + 1} · ${codecUpper}` : `Pista ${track.index + 1}`;
      }
    } else {
      let friendlyLang;
      if (lang === 'es-es' || /castellano|españa/i.test(title || '')) {
        friendlyLang = 'Castellano';
      } else if (lang === 'es-mx' || lang === 'es-la' || /latino|latin/i.test(title || '')) {
        friendlyLang = title && /latino|latin/i.test(title) ? 'Español' : 'Español Latino';
      } else if (lang === 'spa' || lang === 'es') {
        friendlyLang = title && /latino|latin/i.test(title) ? 'Español' : 'Español Latino';
      } else {
        friendlyLang = ISO_LANG_MAP[lang] || lang.toUpperCase();
      }

      if (title) {
        label = codecUpper ? `${friendlyLang} (${codecUpper}) · ${title}` : `${friendlyLang} · ${title}`;
      } else {
        label = codecUpper ? `${friendlyLang} · ${codecUpper}` : friendlyLang;
      }
    }
    track.label = label;
  }

  for (const track of subtitleTracks) {
    const rawTitle = track.title || (track.handlerName && !/^subtitle(?:media)?handler$/i.test(track.handlerName) ? track.handlerName : null);
    const title = rawTitle && rawTitle.trim() ? rawTitle.trim() : null;
    track.title = title;
    delete track.handlerName;
    delete track.type;
    const titlePart = title ? ` · ${title}` : '';
    track.label = `⚡ Integrado (${track.lang.toUpperCase()}) · ${track.codec}${titlePart}`;
  }

  return { duration, audioTracks, subtitleTracks, videoCodec };
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

export function extractSubtitleVtt(input, trackIndex = 0, { spawnImpl = spawn, timeoutMs = 45000 } = {}) {
  return new Promise((resolve, reject) => {
    const idx = Number(trackIndex);
    if (!Number.isInteger(idx) || idx < 0 || idx > 50) return reject(new Error('Pista de subtítulo no válida.'));
    const child = spawnImpl('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', input, '-map', `0:s:${idx}`, '-f', 'webvtt', 'pipe:1'], { windowsHide: true });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finishError = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    };
    const timer = setTimeout(() => { child.kill(); finishError(new Error('Tiempo agotado extrayendo subtítulo integrado.')); }, timeoutMs);
    child.stdout.on('data', chunk => { if (stdout.length < 4 * 1024 * 1024) stdout += chunk.toString('utf8'); });
    child.stderr.on('data', chunk => { if (stderr.length < 4096) stderr += chunk.toString('utf8'); });
    child.once('error', finishError);
    child.once('close', code => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0 && stdout.trim().startsWith('WEBVTT')) resolve(stdout);
      else finishError(new Error(stderr.trim() || 'No se pudo extraer la pista de subtítulos integrada.'));
    });
  });
}

let activeTranscode = false;
const transcodeQueue = [];

export function streamFfmpeg(input, req, res, { audioTrack = 0, transcodeVideo = false, startTime = 0, audioOffset = 0, spawnImpl = spawn } = {}) {
  const start = () => {
  activeTranscode = true;
  const seekArgs = startTime > 0 ? ['-noaccurate_seek', '-ss', String(startTime)] : [];

  const audioFilters = [];
  const offsetNum = Number(audioOffset) || 0;
  if (offsetNum > 0) {
    const ms = Math.round(offsetNum * 1000);
    audioFilters.push(`adelay=${ms}|${ms}`);
  } else if (offsetNum < 0) {
    const sec = Math.abs(offsetNum);
    audioFilters.push(`atrim=start=${sec}`, 'asetpts=PTS-STARTPTS');
  }
  audioFilters.push('aresample=async=1000');

  const args = [
    '-hide_banner',
    '-loglevel', 'error',
    ...seekArgs,
    '-i', input,
    '-map', '0:v:0',
    '-map', `0:a:${audioTrack}?`,
    ...(transcodeVideo
      ? ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p']
      : ['-c:v', 'copy']),
    '-c:a', 'aac',
    '-ac', '2',
    '-b:a', '192k',
    '-af', audioFilters.join(','),
    '-avoid_negative_ts', 'make_zero',
    '-max_muxing_queue_size', '1024',
    '-sn',
    '-dn',
    '-f', 'mp4',
    '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
    'pipe:1'
  ];
  const child = spawnImpl('ffmpeg', args, { windowsHide: true });
  let closed = false; let started = false;
  const stop = () => { if (!closed) child.kill(); };
  res.once('close', stop); req.once('aborted', stop);
  const cleanup = () => {
    if (closed) return;
    closed = true; res.off('close', stop); req.off('aborted', stop);
    activeTranscode = false;
    while (transcodeQueue.length) {
      const next = transcodeQueue.shift();
      if (!next.cancelled) { next.start(); break; }
    }
  };
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
  };
  if (!activeTranscode) return start();
  if (transcodeQueue.length >= 2) { res.status(429).json({ error: 'El conversor está ocupado. Reintenta en unos segundos.' }); return null; }
  const pending = { cancelled: false, start: () => { res.off('close', cancel); req.off('aborted', cancel); if (!pending.cancelled) start(); } };
  const cancel = () => { pending.cancelled = true; res.off('close', cancel); req.off('aborted', cancel); };
  res.once('close', cancel); req.once('aborted', cancel);
  transcodeQueue.push(pending);
  return null;
}
