import React, { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { toWebVtt, parseWebVttCues } from '../../../shared/subtitleUtils.mjs';
import SubtitleOverlay from './SubtitleOverlay.jsx';
import { shiftSubtitleCues } from '../../../shared/playerUtils.mjs';
import AiSubtitleControl from './AiSubtitleControl.jsx';
import ExternalAudio from './ExternalAudio.jsx';
import { Settings2, Subtitles, Volume2, X } from 'lucide-react';

export default function DirectPlayer({ url, initialTime = 0, onProgress }) {
  const videoRef = useRef(null); const engineRef = useRef(null); const originals = useRef(new WeakMap()); const localRef = useRef(null);
  const progressRef = useRef(onProgress); progressRef.current = onProgress;
  const [message, setMessage] = useState('Conectando con la fuente directa…');
  const [showTools, setShowTools] = useState(false);
  const [audio, setAudio] = useState([]); const [subtitles, setSubtitles] = useState([]); const [local, setLocal] = useState(null); const [localCues, setLocalCues] = useState([]); const [selectedSub, setSelectedSub] = useState('off'); const [offset, setOffset] = useState(0);
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
    if (selectedSub === 'local' && local?.url) {
      fetch(local.url).then(r => r.text()).then(t => setLocalCues(parseWebVttCues(/^WEBVTT/.test(t.trim()) ? t : toWebVtt(t)))).catch(() => setLocalCues([]));
    } else { setLocalCues([]); }
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
  return <div className="relative w-full h-full flex flex-col bg-black">
    <video ref={videoRef} controls playsInline crossOrigin="anonymous" className="w-full min-h-0 flex-1 object-contain" data-subtitle-offset={offset} onTimeUpdate={event => {
      const video = event.currentTarget; if (Number.isFinite(video.duration)) progressRef.current?.({ currentTime: video.currentTime, duration: video.duration });
    }}>
    </video>
    {selectedSub === 'local' && localCues.length > 0 && (
      <SubtitleOverlay
        videoRef={videoRef}
        cues={localCues}
        offset={offset}
        hudVisible={true}
        size={localStorage.getItem('sf_sub_size') || 'large'}
        position={localStorage.getItem('sf_sub_pos') || 'raised'}
        backdrop={localStorage.getItem('sf_sub_bg') === '1'}
      />
    )}
    <div className="relative z-10 min-h-14 px-4 sm:px-6 py-2.5 flex items-center justify-between gap-3 bg-[#111]/95 border-t border-white/10 text-white">
      <span role="status" className="min-w-0 flex items-center gap-2 text-xs text-neutral-300"><span className={`w-2 h-2 rounded-full shrink-0 ${message.startsWith('Reproduciendo') ? 'bg-emerald-400' : 'bg-amber-400'}`} /><span className="truncate">{message}</span></span>
      <button type="button" onClick={() => setShowTools(value => !value)} aria-expanded={showTools} className={`shrink-0 flex items-center gap-2 px-3 py-2 rounded-md text-xs font-semibold border transition ${showTools ? 'bg-white text-black border-white' : 'bg-white/10 text-white border-white/15 hover:bg-white/20'}`}><Settings2 className="w-4 h-4" /> Audio y subtítulos</button>
    </div>
    {showTools && <div className="absolute right-3 sm:right-6 bottom-16 z-30 w-[410px] max-w-[calc(100vw-24px)] max-h-[65vh] overflow-y-auto rounded-xl border border-white/15 bg-[#171717]/98 shadow-[0_24px_80px_rgba(0,0,0,0.9)] backdrop-blur-2xl p-4 text-white space-y-4 animate-fadeIn">
      <div className="flex items-center justify-between border-b border-white/10 pb-2"><h3 className="text-sm font-bold">Audio y subtítulos</h3><button type="button" onClick={() => setShowTools(false)} aria-label="Cerrar ajustes" className="p-1 text-neutral-400 hover:text-white"><X className="w-4 h-4" /></button></div>
      {audio.length > 1 && <label className="flex items-center gap-2 text-xs text-neutral-300"><Volume2 className="w-4 h-4" /> Pista de audio <select className="ml-auto min-w-0 max-w-[58%] bg-neutral-800 border border-white/15 rounded-md px-2 py-1.5 text-white" onChange={event => {
        const index = Number(event.target.value); if (engineRef.current) engineRef.current.audioTrack = index;
        else Array.from(videoRef.current.audioTracks || []).forEach((track, i) => { track.enabled = i === index; });
      }}>{audio.map(track => <option key={track.id} value={track.id}>{track.label}</option>)}</select></label>}
      <label className="flex items-center gap-2 text-xs text-neutral-300"><Subtitles className="w-4 h-4" /> Subtítulos <select className="ml-auto min-w-0 max-w-[58%] bg-neutral-800 border border-white/15 rounded-md px-2 py-1.5 text-white" value={selectedSub} onChange={event => setSelectedSub(event.target.value)}><option value="off">Desactivados</option>{local && <option value="local">{local.name}</option>}{subtitles.map(track => <option key={track.id} value={`hls:${track.id}`}>{track.label}</option>)}</select></label>
      <label className="block text-xs text-neutral-300">Cargar archivo SRT/VTT<input className="block w-full mt-2 text-[11px] text-neutral-400" type="file" accept=".srt,.vtt" onChange={importSub} /></label>
      <div className="border-t border-white/10 pt-3"><AiSubtitleControl onReady={({ url: vttUrl, label }) => { if (localRef.current?.url?.startsWith('blob:')) URL.revokeObjectURL(localRef.current.url); const sub = { name: label, url: vttUrl }; localRef.current = sub; setLocal(sub); setSelectedSub('local'); }} /></div>
      <label className="flex items-center justify-between gap-2 text-xs text-neutral-300">Ajuste de subtítulos <input className="w-20 bg-neutral-800 border border-white/15 rounded-md px-2 py-1.5 text-white" aria-label="Ajuste de subtítulos en segundos" type="number" min="-120" max="120" step="0.1" value={offset} onChange={event => { const value = Number(event.target.value); if (Number.isFinite(value) && Math.abs(value) <= 120) setOffset(value); }} /><span>s</span></label>
      <div className="border-t border-white/10 pt-3"><ExternalAudio videoRef={videoRef} videoKey={url} /></div>
    </div>}
  </div>;
}
