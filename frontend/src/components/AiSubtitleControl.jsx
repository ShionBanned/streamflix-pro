import React, { useEffect, useRef, useState } from 'react';

export default function AiSubtitleControl({ p2p = null, onReady }) {
  const [language, setLanguage] = useState('auto');
  const [job, setJob] = useState(null);
  const [message, setMessage] = useState('');
  const finishedRef = useRef(null);
  const readyRef = useRef(onReady); readyRef.current = onReady;

  useEffect(() => {
    if (!job?.id || ['done', 'error'].includes(job.status)) return;
    let stopped = false;
    const poll = async () => {
      try {
        const response = await fetch(`/api/ai/subtitles/${job.id}`);
        const next = await response.json();
        if (stopped) return;
        setJob(next);
        if (next.status === 'done' && finishedRef.current !== next.id) {
          finishedRef.current = next.id;
          readyRef.current?.({ id: next.id, url: `/api/ai/subtitles/${next.id}/vtt`, label: `IA · ${next.language === 'auto' ? 'idioma detectado' : next.language}` });
        }
      } catch { if (!stopped) setMessage('No se pudo consultar la tarea de IA.'); }
    };
    const timer = setInterval(poll, 2500);
    poll();
    return () => { stopped = true; clearInterval(timer); };
  }, [job?.id, job?.status]);

  const create = async (file = null) => {
    setMessage('Preparando subtítulos…'); setJob(null);
    try {
      const url = file ? `/api/ai/subtitles/upload?language=${language}` : '/api/ai/subtitles/p2p';
      const response = await fetch(url, file ? { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: file } : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...p2p, language }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo iniciar Whisper.');
      setMessage('Whisper trabaja localmente. Una película puede tardar bastante en CPU.');
      setJob(data);
    } catch (error) { setMessage(error.message); }
  };

  return (
    <div
      className="space-y-2 rounded-lg border border-white/15 bg-black/50 p-2.5 text-xs text-white animate-nfAccordion"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="font-semibold">Subtítulos con IA · Whisper local</div>
      <label className="flex items-center justify-between gap-2">
        <span>Idioma del audio</span>
        <select
          className="bg-neutral-800 border border-white/10 p-1 rounded text-white focus:border-[#E50914] outline-none transition-colors"
          value={language}
          onChange={(event) => setLanguage(event.target.value)}
        >
          <option value="auto">Detectar</option>
          <option value="es">Español</option>
          <option value="en">Inglés</option>
          <option value="pt">Portugués</option>
          <option value="fr">Francés</option>
          <option value="ja">Japonés</option>
          <option value="ko">Coreano</option>
        </select>
      </label>
      <div className="flex flex-wrap items-center gap-2">
        {p2p && (
          <button
            disabled={job && !['done', 'error'].includes(job.status)}
            className="nf-btn rounded bg-[#E50914] hover:bg-red-700 px-2.5 py-1 font-semibold disabled:opacity-50"
            onClick={() => create()}
          >
            Generar desde esta pista
          </button>
        )}
        <label className="nf-btn cursor-pointer rounded bg-neutral-700 hover:bg-neutral-600 px-2.5 py-1 font-semibold">
          Elegir archivo de audio/video
          <input
            type="file"
            accept="audio/*,video/*,.mkv"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) create(file);
            }}
          />
        </label>
      </div>
      {job && (
        <p role="status" className="text-emerald-300 font-semibold animate-nfTabContent">
          {job.status === 'extracting'
            ? 'Extrayendo audio…'
            : job.status === 'transcribing'
            ? 'Transcribiendo…'
            : job.status === 'done'
            ? 'Subtítulos listos.'
            : job.error || 'Procesando…'}
        </p>
      )}
      {message && <p className="text-neutral-300 animate-nfTabContent">{message}</p>}
      <p className="text-neutral-400">Usa el mismo corte y pista de audio que el video. Puedes ajustar el desfase después.</p>
    </div>
  );
}
