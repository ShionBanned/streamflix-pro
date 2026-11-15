import React, { useEffect, useRef, useState } from 'react';

export default function ExternalAudio({ videoRef, videoKey }) {
  const audioRef = useRef(null);
  const objectUrlRef = useRef(null);
  const previousMuteRef = useRef(false);
  const [fileName, setFileName] = useState('');
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const video = videoRef.current; const audio = audioRef.current;
    if (!video || !audio || !fileName) return;
    previousMuteRef.current = video.muted;
    video.muted = true;
    const sync = () => {
      const target = video.currentTime - offset;
      audio.playbackRate = video.playbackRate;
      if (target < 0 || video.paused || video.ended) { audio.pause(); return; }
      if (Math.abs(audio.currentTime - target) > 0.25) audio.currentTime = Math.max(0, target);
      if (audio.paused) audio.play().catch(() => {});
    };
    for (const event of ['play', 'pause', 'timeupdate', 'seeking', 'seeked', 'ratechange', 'ended']) video.addEventListener(event, sync);
    sync();
    return () => {
      for (const event of ['play', 'pause', 'timeupdate', 'seeking', 'seeked', 'ratechange', 'ended']) video.removeEventListener(event, sync);
      audio.pause(); video.muted = previousMuteRef.current;
    };
  }, [videoRef, videoKey, fileName, offset]);
  useEffect(() => () => { if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current); }, []);
  const choose = event => {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = URL.createObjectURL(file);
    audioRef.current.src = objectUrlRef.current;
    setFileName(file.name);
  };
  const clear = () => {
    setFileName(''); audioRef.current?.pause(); audioRef.current?.removeAttribute('src');
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
  };
  return <div className="flex flex-wrap gap-2 items-center text-white text-xs">
    <label className="cursor-pointer rounded bg-neutral-800 px-2 py-1">Cargar audio latino / alternativo<input type="file" accept="audio/*,.m4a,.aac,.mp3,.opus,.wav" className="hidden" onChange={choose} /></label>
    {fileName && <><span className="max-w-36 truncate" title={fileName}>{fileName}</span><label>Desfase (s) <input className="w-16 rounded bg-neutral-800 p-1" type="number" min="-120" max="120" step="0.1" value={offset} onChange={event => { const n = Number(event.target.value); if (Number.isFinite(n) && Math.abs(n) <= 120) setOffset(n); }} /></label><button onClick={clear} className="rounded bg-neutral-700 px-2 py-1">Quitar audio</button></>}
    <audio ref={audioRef} controls={Boolean(fileName)} className={fileName ? 'h-7 max-w-36' : 'hidden'} />
  </div>;
}
