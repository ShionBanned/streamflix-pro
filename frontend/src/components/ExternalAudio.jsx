import React, { useEffect, useRef, useState } from 'react';

const directMedia = url => {
  try { return /^https?:$/.test(new URL(url).protocol) && /\.(?:mp3|m4a|aac|wav|ogg|opus|flac|mp4|webm)$/i.test(new URL(url).pathname); }
  catch { return false; }
};

export default function ExternalAudio({ videoRef, videoKey, sourcePages = {}, cloudClock = null, onActiveChange, title = '', mediaType = 'movie', season = 1, episode = 1 }) {
  const audioRef = useRef(null);
  const objectUrlRef = useRef(null);
  const searchAbortRef = useRef(null);
  const previousMuteRef = useRef(false);
  const [fileName, setFileName] = useState('');
  const [offset, setOffset] = useState(0);
  const [urlInput, setUrlInput] = useState('');
  const [sourceSite, setSourceSite] = useState('other');
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState(title);
  const [candidates, setCandidates] = useState([]);
  const [tracks, setTracks] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchMessage, setSearchMessage] = useState('');
  const [resolvedPage, setResolvedPage] = useState('');

  useEffect(() => { setSearchQuery(title); setCandidates([]); setTracks([]); setSearchMessage(''); }, [title, videoKey]);
  useEffect(() => () => { searchAbortRef.current?.abort(); }, []);

  useEffect(() => {
    const video = videoRef?.current; const audio = audioRef.current;
    if (!video || !audio || !fileName) return;
    previousMuteRef.current = video.muted;
    video.muted = true;
    const sync = () => {
      const target = video.currentTime - offset;
      audio.playbackRate = video.playbackRate;
      if (target < 0 || video.paused || video.ended || video.seeking || video.readyState < 2) { audio.pause(); return; }
      if (audio.readyState >= 1 && Math.abs(audio.currentTime - target) > 0.15) {
        try { audio.currentTime = Math.max(0, target); } catch { /* Esperar a los metadatos */ }
      }
      if (audio.paused && audio.readyState >= 2) audio.play().catch(() => {});
    };
    for (const event of ['play', 'playing', 'pause', 'timeupdate', 'seeking', 'seeked', 'waiting', 'canplay', 'ratechange', 'ended']) video.addEventListener(event, sync);
    const keepOriginalMuted = () => { if (!video.muted) video.muted = true; };
    video.addEventListener('volumechange', keepOriginalMuted);
    audio.addEventListener('canplay', sync);
    const timer = window.setInterval(sync, 100);
    sync();
    return () => {
      window.clearInterval(timer);
      for (const event of ['play', 'playing', 'pause', 'timeupdate', 'seeking', 'seeked', 'waiting', 'canplay', 'ratechange', 'ended']) video.removeEventListener(event, sync);
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
      const running = !['paused', 'completed', 'ended'].includes(cloudClock.status);
      const elapsed = running && cloudClock.receivedAt ? Math.max(0, (performance.now() - cloudClock.receivedAt) / 1000) : 0;
      const target = cloudClock.time + elapsed - offset;
      if (target < 0 || ['paused', 'completed'].includes(cloudClock.status)) { audio.pause(); return; }
      if (audio.readyState >= 1 && Math.abs(audio.currentTime - target) > 0.2) {
        try { audio.currentTime = Math.max(0, target); } catch { /* Esperar metadatos */ }
      }
      if (audio.paused && audio.readyState >= 2) audio.play().catch(() => {});
    };
    audio.addEventListener('canplay', sync);
    const timer = window.setInterval(sync, 100);
    sync();
    return () => { window.clearInterval(timer); audio.removeEventListener('canplay', sync); };
  }, [cloudClock?.confirmed, cloudClock?.time, cloudClock?.status, cloudClock?.receivedAt, fileName, offset]);
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
  const activateUrl = (input, label = '') => {
    try {
      const url = new URL(input.trim());
      if (!directMedia(url.href) || url.username || url.password) throw new Error();
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
      const params = new URLSearchParams({ url: url.href });
      if (sourceSite !== 'other') {
        const expectedHost = { animeav1: 'animeav1.com', animeflv: 'animeflv.or.at', pelisplus: 'pelisplushd.la', cuevana: 'cuevana3t.pro' }[sourceSite];
        let referer = resolvedPage || sourcePages[sourceSite];
        try { if (new URL(referer).hostname !== expectedHost && !(sourceSite === 'cuevana' && new URL(referer).hostname === 'cuevana3w.pro')) referer = ''; } catch { referer = ''; }
        params.set('ref', referer || `https://${expectedHost}/`);
      }
      audioRef.current.src = `/api/iptv/proxy?${params}`;
      setFileName(label || url.hostname);
      setError('');
    } catch {
      setError('Pega una URL directa de audio o MP4/WebM. Una página iframe no es una pista de audio.');
    }
  };
  const applyAudioUrl = () => activateUrl(urlInput);
  const resolveCandidate = async (candidate, site = sourceSite, parentController = null) => {
    let controller = parentController;
    if (!controller) {
      searchAbortRef.current?.abort();
      controller = new AbortController();
      searchAbortRef.current = controller;
    }
    setSearching(true); setSearchMessage('Buscando pistas reproducibles…'); setTracks([]);
    try {
      const params = new URLSearchParams({ source: site, titleUrl: candidate.titleUrl, season: String(season), episode: String(episode) });
      const response = await fetch(`/api/site-resolve?${params}`, { signal: controller.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo abrir el título.');
      setResolvedPage(data.pageUrl || '');
      const found = (data.servers || []).filter(server => !server.pageOnly && directMedia(server.url));
      setTracks(found);
      if (found.length) {
        setCandidates([]);
        setSearchMessage('Elige una pista directa. El video actual seguirá reproduciéndose.');
      } else {
        setSearchMessage('Se encontró el título, pero esta página solo ofrece reproductores completos: no expone una pista de audio independiente. El video actual no se cambiará. Puedes cargar un archivo o pegar una URL directa.');
      }
    } catch (cause) {
      if (cause.name === 'AbortError') return;
      setSearchMessage(cause.message || 'No se pudieron buscar pistas.');
    } finally {
      if (searchAbortRef.current === controller) {
        setSearching(false);
      }
    }
  };
  const searchAudio = async (site = sourceSite, customQuery = null) => {
    const q = (customQuery !== null ? customQuery : searchQuery).trim();
    if (site === 'other' || q.length < 2) return;
    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;
    setSearching(true); setCandidates([]); setTracks([]); setSearchMessage('Buscando el título…');
    try {
      const params = new URLSearchParams({ source: site, title: q });
      const response = await fetch(`/api/site-search?${params}`, { signal: controller.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo buscar el título.');
      const allCandidates = data.candidates || [];
      const typeMatches = allCandidates.filter(c => site.startsWith('anime') || c.type === mediaType || (mediaType === 'tv' && c.type === 'serie') || (mediaType === 'movie' && c.type === 'pelicula'));
      const matches = typeMatches.length > 0 ? typeMatches : allCandidates;
      if (!matches.length) { setSearchMessage('No hubo coincidencias para este título. Prueba otro nombre.'); return; }
      if (matches[0].score === 1 && (matches.length === 1 || matches[1].score < 1)) {
        await resolveCandidate(matches[0], site, controller);
      } else {
        setCandidates(matches); setSearchMessage('Elige el título correcto para buscar sus pistas.');
      }
    } catch (cause) {
      if (cause.name === 'AbortError') return;
      setSearchMessage(cause.message || 'No se pudieron buscar pistas.');
    } finally {
      if (searchAbortRef.current === controller) {
        setSearching(false);
      }
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
      <select aria-label="Procedencia del enlace de audio" value={sourceSite} onChange={event => { const site = event.target.value; setSourceSite(site); setCandidates([]); setTracks([]); setResolvedPage(''); setSearchMessage(''); if (site !== 'other') searchAudio(site); }} className="min-w-0 w-full rounded bg-neutral-800 border border-white/10 px-2 py-1.5 text-white"><option value="other">Otra fuente</option><option value="cuevana">Cuevana</option><option value="animeav1">AnimeAV1</option><option value="pelisplus">PelisPlus</option><option value="animeflv">AnimeFLV</option></select>
      {sourceSite !== 'other' && <div className="col-span-2 flex gap-2"><input type="search" aria-label="Buscar título para audio" value={searchQuery} onChange={event => setSearchQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') searchAudio(); }} className="min-w-0 flex-1 rounded bg-neutral-800 border border-white/10 px-2 py-1.5 text-white" /><button type="button" onClick={() => searchAudio()} disabled={searching || searchQuery.trim().length < 2} className="rounded bg-[#E50914] px-3 py-1.5 font-semibold disabled:opacity-50">{searching ? 'Buscando…' : 'Buscar audio'}</button></div>}
      {sourceSite !== 'other' && candidates.length > 0 && <div className="col-span-2 max-h-32 overflow-y-auto space-y-1">{candidates.map(candidate => <button key={candidate.titleUrl} type="button" onClick={() => resolveCandidate(candidate)} className="block w-full rounded bg-neutral-800 px-2 py-1.5 text-left">{candidate.title}{candidate.year ? ` · ${candidate.year}` : ''}</button>)}</div>}
      {sourceSite !== 'other' && tracks.length > 0 && <div className="col-span-2 max-h-40 overflow-y-auto space-y-1">{tracks.map(track => <button key={track.url} type="button" onClick={() => activateUrl(track.url, `${track.name} · ${track.audioLabel}`)} className="block w-full rounded bg-neutral-800 px-2 py-1.5 text-left"><span className="block font-semibold">Usar audio · {track.name}</span><span className="text-neutral-400">{track.audioLabel}</span></button>)}</div>}
      {sourceSite !== 'other' && searchMessage && <p role="status" className="col-span-2 text-[11px] text-neutral-300">{searchMessage}</p>}
      <input type="url" aria-label="URL directa de audio" value={urlInput} onChange={event => setUrlInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') applyAudioUrl(); }} placeholder="URL de audio (.mp3, .m4a…)" className="col-span-2 w-full min-w-0 rounded bg-neutral-800 border border-white/10 px-2 py-1.5 text-white" />
      <button type="button" onClick={applyAudioUrl} disabled={!urlInput.trim()} className="col-span-2 rounded bg-neutral-700 px-2 py-1.5 text-left font-semibold disabled:opacity-50">Usar URL de audio</button>
    </div>
    <p className="text-[11px] text-neutral-400">Busca una pista directa por título, carga un archivo o pega una URL de audio. Las páginas de reproductor no contienen necesariamente una pista de audio independiente.</p>
    {error && <p role="alert" className="text-amber-300">{error}</p>}
    {fileName && <div className="flex flex-wrap gap-2 items-center"><span className="max-w-36 truncate" title={fileName}>{fileName}</span>{cloudClock && <button type="button" onClick={startCloudAudio} className="rounded bg-[#E50914] px-2 py-1 font-semibold">▶ Iniciar audio</button>}<label>Desfase (s) <input className="w-16 rounded bg-neutral-800 p-1" type="number" min="-120" max="120" step="0.1" value={offset} onChange={event => { const n = Number(event.target.value); if (Number.isFinite(n) && Math.abs(n) <= 120) changeOffset(n); }} /></label><button onClick={() => changeOffset(offset - 0.1)} className="rounded bg-neutral-800 px-2 py-1">−0.1 s</button><button onClick={() => changeOffset(offset + 0.1)} className="rounded bg-neutral-800 px-2 py-1">+0.1 s</button><button onClick={clear} className="rounded bg-neutral-700 px-2 py-1">Quitar audio</button></div>}
    {fileName && cloudClock && <p className="text-[11px] text-neutral-400">{cloudClock.confirmed ? 'Sincronización automática mientras el servidor comunique su posición, también después de saltar en el video.' : 'Este servidor no comunica su posición. Inicia el audio al mismo tiempo que el video y ajusta el desfase; después de cada salto tendrás que resincronizarlo manualmente. Silencia el audio original en el reproductor Cloud.'}</p>}
    <audio ref={audioRef} controls={Boolean(fileName)} onError={() => { if (fileName) setError('La pista no se pudo reproducir. Comprueba su formato y disponibilidad.'); }} className={fileName ? 'h-8 w-full' : 'hidden'} />
  </div>;
}
