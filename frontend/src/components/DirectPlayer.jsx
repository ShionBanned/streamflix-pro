import React, { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { toWebVtt } from '../../../shared/subtitleUtils.mjs';
import { shiftSubtitleCues } from '../../../shared/playerUtils.mjs';
import AiSubtitleControl from './AiSubtitleControl.jsx';
import ExternalAudio from './ExternalAudio.jsx';

export default function DirectPlayer({ url, initialTime = 0, onProgress }) {
  const videoRef = useRef(null); const engineRef = useRef(null); const originals = useRef(new WeakMap()); const localRef = useRef(null);
  const progressRef = useRef(onProgress); progressRef.current = onProgress;
  const [message, setMessage] = useState('Conectando con la fuente directa…');
  const [audio, setAudio] = useState([]); const [subtitles, setSubtitles] = useState([]); const [local, setLocal] = useState(null); const [selectedSub, setSelectedSub] = useState('off'); const [offset, setOffset] = useState(0);
  useEffect(() => {
    const video = videoRef.current; let alive = true; let recovered = false;
    setAudio([]); setSubtitles([]); setSelectedSub('off'); setMessage('Conectando con la fuente directa…');
    const source = `/api/iptv/proxy?url=${encodeURIComponent(url)}`;
    const play = () => video.play().catch(error => { if (alive) setMessage(error.name === 'NotAllowedError' ? 'Pulsa ▶ para iniciar.' : 'No se pudo reproducir esta fuente. Revisa el formato y su disponibilidad.'); });
    const metadata = () => {
      if (initialTime > 0 && Number.isFinite(video.duration)) video.currentTime = Math.min(initialTime, Math.max(0, video.duration - 0.1));
      if (!engineRef.current) setAudio(Array.from(video.audioTracks || []).map((track, index) => ({ id: index, label: track.label || track.language || `Audio ${index + 1}` })));
    };
    const playing = () => setMessage('Reproduciendo fuente directa');
    const failed = () => setMessage('La fuente falló. Comprueba que entregue HLS o MP4 y que su enlace siga vigente.');
    video.addEventListener('loadedmetadata', metadata); video.addEventListener('playing', playing); video.addEventListener('error', failed);
    let hls;
    if (/\.m3u8(?:[?#]|$)/i.test(url) && Hls.isSupported()) {
      hls = engineRef.current = new Hls({ enableWorker: true, backBufferLength: 30 });
      hls.on(Hls.Events.MANIFEST_PARSED, play);
      hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => setAudio(hls.audioTracks.map((track, index) => ({ id: index, label: track.name || track.lang || `Audio ${index + 1}` }))));
      hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, () => setSubtitles(hls.subtitleTracks.map((track, index) => ({ id: index, label: track.name || track.lang || `Subtítulos ${index + 1}` }))));
      hls.on(Hls.Events.CUES_PARSED, (_, data) => shiftSubtitleCues(data.cues, Number(video.dataset.subtitleOffset) || 0, originals.current));
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (!data.fatal || !alive) return;
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !recovered) { recovered = true; hls.recoverMediaError(); }
        else { setMessage('El servidor directo falló o el navegador no admite su códec.'); hls.stopLoad(); }
      });
      hls.attachMedia(video); hls.loadSource(source);
    } else { video.src = source; play(); }
    return () => {
      alive = false; hls?.destroy(); engineRef.current = null;
      video.removeEventListener('loadedmetadata', metadata); video.removeEventListener('playing', playing); video.removeEventListener('error', failed);
      video.pause(); video.removeAttribute('src'); video.load();
    };
  }, [url]);
  useEffect(() => {
    const video = videoRef.current; const hls = engineRef.current;
    if (!video) return;
    for (const track of Array.from(video.textTracks)) track.mode = 'disabled';
    if (hls) { hls.subtitleDisplay = selectedSub.startsWith('hls:'); hls.subtitleTrack = selectedSub.startsWith('hls:') ? Number(selectedSub.split(':')[1]) : -1; }
    if (selectedSub === 'local') { const track = video.querySelector('track')?.track; if (track) track.mode = 'showing'; }
  }, [selectedSub, local]);
  const syncOffset = () => {
    const video = videoRef.current; if (!video) return;
    for (const track of Array.from(video.textTracks)) shiftSubtitleCues(track.cues, offset, originals.current);
  };
  useEffect(syncOffset, [offset, local]);
  useEffect(() => () => { if (localRef.current?.url?.startsWith('blob:')) URL.revokeObjectURL(localRef.current.url); }, []);
  const importSub = async event => {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error('El archivo no puede superar 2 MB.');
      const text = toWebVtt(await file.text()); if (!videoRef.current) return;
      if (localRef.current?.url?.startsWith('blob:')) URL.revokeObjectURL(localRef.current.url);
      const sub = { name: file.name, url: URL.createObjectURL(new Blob([text], { type: 'text/vtt' })) };
      localRef.current = sub; setLocal(sub); setSelectedSub('local');
    } catch (error) { setMessage(error.message); }
  };
  return <div className="w-full h-full flex flex-col bg-black">
    <video ref={videoRef} controls playsInline crossOrigin="anonymous" className="w-full min-h-0 flex-1" data-subtitle-offset={offset} onTimeUpdate={event => {
      const video = event.currentTarget; if (Number.isFinite(video.duration)) progressRef.current?.({ currentTime: video.currentTime, duration: video.duration });
    }}>
      {local && <track key={local.url} kind="subtitles" label={local.name} srcLang="und" src={local.url} default={selectedSub === 'local'} onLoad={event => { if (selectedSub === 'local') event.currentTarget.track.mode = 'showing'; syncOffset(); }} onError={() => setMessage('No se pudo interpretar ese subtítulo.')} />}
    </video>
    <div className="p-3 flex flex-wrap gap-3 text-xs items-center bg-neutral-950 text-white">
      <span role="status">{message}</span>
      {audio.length > 1 && <label>Audio <select className="bg-neutral-800 p-1" onChange={event => {
        const index = Number(event.target.value); if (engineRef.current) engineRef.current.audioTrack = index;
        else Array.from(videoRef.current.audioTracks || []).forEach((track, i) => { track.enabled = i === index; });
      }}>{audio.map(track => <option key={track.id} value={track.id}>{track.label}</option>)}</select></label>}
      <label>Subtítulos <select className="bg-neutral-800 p-1" value={selectedSub} onChange={event => setSelectedSub(event.target.value)}><option value="off">Desactivados</option>{local && <option value="local">{local.name}</option>}{subtitles.map(track => <option key={track.id} value={`hls:${track.id}`}>{track.label}</option>)}</select></label>
      <label className="max-w-48">Cargar SRT/VTT <input className="w-full text-[10px]" type="file" accept=".srt,.vtt" onChange={importSub} /></label>
      <ExternalAudio videoRef={videoRef} videoKey={url} />
      <AiSubtitleControl onReady={({ url: vttUrl, label }) => { if (localRef.current?.url?.startsWith('blob:')) URL.revokeObjectURL(localRef.current.url); const sub = { name: label, url: vttUrl }; localRef.current = sub; setLocal(sub); setSelectedSub('local'); }} />
      <label>Ajuste (s) <input className="w-16 bg-neutral-800 p-1" aria-label="Ajuste de subtítulos en segundos" type="number" min="-120" max="120" step="0.1" value={offset} onChange={event => { const value = Number(event.target.value); if (Number.isFinite(value) && Math.abs(value) <= 120) setOffset(value); }} /></label>
    </div>
  </div>;
}
