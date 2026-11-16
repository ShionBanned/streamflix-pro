import React, { useEffect, useRef, useState } from 'react';

export default function ExternalAudio({ videoRef, videoKey, sourcePages = {}, cloudClock = null, onActiveChange }) {
  const audioRef = useRef(null);
  const objectUrlRef = useRef(null);
  const previousMuteRef = useRef(false);
  const [fileName, setFileName] = useState('');
  const [offset, setOffset] = useState(0);
  const [urlInput, setUrlInput] = useState('');
  const [sourceSite, setSourceSite] = useState('other');
  const [error, setError] = useState('');

  useEffect(() => {
    const video = videoRef?.current; const audio = audioRef.current;
    if (!video || !audio || !fileName) return;
    previousMuteRef.current = video.muted;
    video.muted = true;
    const sync = () => {
      const target = video.currentTime - offset;
      audio.playbackRate = video.playbackRate;
      if (target < 0 || video.paused || video.ended) { audio.pause(); return; }
      if (audio.readyState >= 1 && Math.abs(audio.currentTime - target) > 0.25) {
        try { audio.currentTime = Math.max(0, target); } catch { /* Esperar a los metadatos */ }
      }
      if (audio.paused && audio.readyState >= 2) audio.play().catch(() => {});
    };
    for (const event of ['play', 'pause', 'timeupdate', 'seeking', 'seeked', 'ratechange', 'ended']) video.addEventListener(event, sync);
    const keepOriginalMuted = () => { if (!video.muted) video.muted = true; };
    video.addEventListener('volumechange', keepOriginalMuted);
    audio.addEventListener('canplay', sync);
    const timer = window.setInterval(sync, 250);
    sync();
    return () => {
      window.clearInterval(timer);
      for (const event of ['play', 'pause', 'timeupdate', 'seeking', 'seeked', 'ratechange', 'ended']) video.removeEventListener(event, sync);
      video.removeEventListener('volumechange', keepOriginalMuted);
      audio.removeEventListener('canplay', sync);
      audio.pause(); video.muted = previousMuteRef.current;
    };
  }, [videoRef, videoKey, fileName, offset]);
  useEffect(() => {
    if (!cloudClock || !fileName) return;
    const audio = audioRef.current;
    if (!audio) return;
    const sync = () => {
      if (!cloudClock.confirmed) return;
      const target = cloudClock.time - offset;
      if (target < 0 || ['paused', 'completed'].includes(cloudClock.status)) { audio.pause(); return; }
      if (audio.readyState >= 1 && Math.abs(audio.currentTime - target) > 0.45) {
        try { audio.currentTime = Math.max(0, target); } catch { /* Esperar metadatos */ }
      }
      if (audio.paused && audio.readyState >= 2) audio.play().catch(() => {});
    };
    audio.addEventListener('canplay', sync);
    sync();
    return () => audio.removeEventListener('canplay', sync);
  }, [cloudClock?.confirmed, cloudClock?.time, cloudClock?.status, fileName, offset]);
  useEffect(() => {
    onActiveChange?.(Boolean(fileName));
    return () => onActiveChange?.(false);
  }, [fileName, onActiveChange]);
  useEffect(() => {
    if (!cloudClock || !audioRef.current) return;
    audioRef.current.pause();
    try { audioRef.current.currentTime = 0; } catch { /* Pista aún sin metadatos */ }
  }, [videoKey]);
  useEffect(() => () => { if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current); }, []);
  const changeOffset = value => {
    const next = Math.max(-120, Math.min(120, Math.round(value * 10) / 10));
    if (cloudClock && !cloudClock.confirmed && audioRef.current?.readyState >= 1) {
      try { audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - (next - offset)); } catch { /* El audio todavía no admite saltos */ }
    }
    setOffset(next);
  };
  const startCloudAudio = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (cloudClock?.confirmed && audio.readyState >= 1) {
      try { audio.currentTime = Math.max(0, cloudClock.time - offset); } catch { /* Esperar metadatos */ }
    }
    audio.play().catch(() => setError('El navegador no pudo iniciar esta pista. Prueba el botón ▶ del control de audio.'));
  };
  const choose = event => {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = URL.createObjectURL(file);
    audioRef.current.src = objectUrlRef.current;
    setFileName(file.name);
    setError('');
  };
  const useUrl = () => {
    try {
      const url = new URL(urlInput.trim());
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || !/\.(?:mp3|m4a|aac|wav|ogg|opus|flac|mp4|webm)(?:$)/i.test(url.pathname)) throw new Error();
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
      const params = new URLSearchParams({ url: url.href });
      if (sourceSite !== 'other') {
        const expectedHost = sourceSite === 'animeav1' ? 'animeav1.com' : 'cuevana3t.pro';
        let referer = sourcePages[sourceSite];
        try { if (new URL(referer).hostname !== expectedHost && !(sourceSite === 'cuevana' && new URL(referer).hostname === 'cuevana3w.pro')) referer = ''; } catch { referer = ''; }
        params.set('ref', referer || `https://${expectedHost}/`);
      }
      audioRef.current.src = `/api/iptv/proxy?${params}`;
      setFileName(url.hostname);
      setError('');
    } catch {
      setError('Pega una URL directa de audio o MP4/WebM. Una página iframe no es una pista de audio.');
    }
  };
  const clear = () => {
    setFileName(''); audioRef.current?.pause(); audioRef.current?.removeAttribute('src');
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
  };
  return <div className="space-y-2 text-white text-xs">
    <p className="font-semibold">Audio alternativo sincronizado</p>
    <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2 items-center">
      <label className="cursor-pointer rounded bg-neutral-800 px-2 py-1.5">Cargar archivo<input type="file" accept="audio/*,.m4a,.aac,.mp3,.opus,.wav,.flac" className="hidden" onChange={choose} /></label>
      <select aria-label="Procedencia del enlace de audio" value={sourceSite} onChange={event => setSourceSite(event.target.value)} className="min-w-0 w-full rounded bg-neutral-800 border border-white/10 px-2 py-1.5 text-white"><option value="other">Otra fuente</option><option value="cuevana">Cuevana (URL directa)</option><option value="animeav1">AnimeAV1 (URL directa)</option></select>
      <input type="url" aria-label="URL directa de audio" value={urlInput} onChange={event => setUrlInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') useUrl(); }} placeholder="URL de audio (.mp3, .m4a…)" className="col-span-2 w-full min-w-0 rounded bg-neutral-800 border border-white/10 px-2 py-1.5 text-white" />
      <button type="button" onClick={useUrl} disabled={!urlInput.trim()} className="col-span-2 rounded bg-neutral-700 px-2 py-1.5 text-left font-semibold disabled:opacity-50">Usar URL de audio</button>
    </div>
    <p className="text-[11px] text-neutral-400">Carga un archivo de audio o pega la URL directa de una pista. Elegir Cuevana o AnimeAV1 solo configura la procedencia del enlace; no busca ni descarga el audio automáticamente.</p>
    {error && <p role="alert" className="text-amber-300">{error}</p>}
    {fileName && <div className="flex flex-wrap gap-2 items-center"><span className="max-w-36 truncate" title={fileName}>{fileName}</span>{cloudClock && <button type="button" onClick={startCloudAudio} className="rounded bg-[#E50914] px-2 py-1 font-semibold">▶ Iniciar audio</button>}<label>Desfase (s) <input className="w-16 rounded bg-neutral-800 p-1" type="number" min="-120" max="120" step="0.1" value={offset} onChange={event => { const n = Number(event.target.value); if (Number.isFinite(n) && Math.abs(n) <= 120) changeOffset(n); }} /></label><button onClick={() => changeOffset(offset - 0.1)} className="rounded bg-neutral-800 px-2 py-1">−0.1 s</button><button onClick={() => changeOffset(offset + 0.1)} className="rounded bg-neutral-800 px-2 py-1">+0.1 s</button><button onClick={clear} className="rounded bg-neutral-700 px-2 py-1">Quitar audio</button></div>}
    {fileName && cloudClock && <p className="text-[11px] text-neutral-400">{cloudClock.confirmed ? 'Sincronización automática por los eventos del servidor.' : 'Este servidor no comunica su posición. Inicia el audio al mismo tiempo que el video y ajusta el desfase; silencia el audio original en el reproductor Cloud.'}</p>}
    <audio ref={audioRef} controls={Boolean(fileName)} onError={() => { if (fileName) setError('La pista no se pudo reproducir. Comprueba su formato y disponibilidad.'); }} className={fileName ? 'h-8 w-full' : 'hidden'} />
  </div>;
}
