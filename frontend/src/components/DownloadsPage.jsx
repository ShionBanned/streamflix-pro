import React, { useEffect, useRef, useState } from 'react';
import { Check, Clock3, Download, HardDrive, Play, RefreshCw, Trash2 } from 'lucide-react';
import api from '../services/api.js';
import OfflinePlayer from './OfflinePlayer.jsx';

const STORAGE_LIMIT = 8 * 1024 ** 3;
const ACTIVE_STATUSES = ['queued', 'downloading', 'compressing'];
const FILTERS = [
  { id: 'all', label: 'Todas' },
  { id: 'complete', label: 'Listas para ver' },
  { id: 'active', label: 'En proceso' },
];

function sizeLabel(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return 'Tamaño pendiente';
  return bytes >= 1024 ** 3
    ? `${(bytes / 1024 ** 3).toFixed(1)} GB`
    : `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function qualityLabel(quality) {
  if (quality === 'marathon') return '576p HQ';
  if (quality === 'compact') return '720p HD';
  return 'Calidad original';
}

function titleParts(title = '') {
  const [name, episode] = title.split(/\s·\s(?=T\d+:E\d+)/, 2);
  return { name: name || title || 'Video guardado', episode: episode || '' };
}

function normalizedTitle(title) {
  return title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function Poster({ title, posterPath }) {
  return (
    <div className="relative aspect-[2/3] w-28 shrink-0 overflow-hidden rounded-md bg-[radial-gradient(circle_at_75%_15%,#5c1b23_0%,#211317_38%,#101010_75%)] sm:w-36">
      {posterPath ? (
        <img src={`https://image.tmdb.org/t/p/w342${posterPath}`} alt="" loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex flex-col justify-between p-3 sm:p-4">
          <span className="text-[10px] font-black tracking-[0.3em] text-red-500">S</span>
          <span className="line-clamp-4 text-lg font-black leading-tight text-white/90 drop-shadow-lg sm:text-xl">{title}</span>
        </div>
      )}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
    </div>
  );
}

export default function DownloadsPage({ onExplore }) {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null);
  const [filter, setFilter] = useState('all');
  const [playing, setPlaying] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [posters, setPosters] = useState({});
  const searchedTitles = useRef(new Set());

  const refresh = async () => {
    try {
      setItems(await api.getDownloads());
      setError('');
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo consultar la biblioteca sin conexión.');
    }
  };

  useEffect(() => {
    void refresh();
    const timer = setInterval(refresh, 2000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!navigator.onLine) return;
    for (const item of items) {
      const name = titleParts(item.title).name;
      if (!name || searchedTitles.current.has(name)) continue;
      searchedTitles.current.add(name);
      void api.searchMulti(name).then((results) => {
        const match = results.find((result) =>
          result.poster_path && normalizedTitle(result.title || result.name || '') === normalizedTitle(name)
        );
        if (match) setPosters((current) => ({ ...current, [name]: match.poster_path }));
      }).catch(() => {});
    }
  }, [items]);

  const remove = async (id) => {
    setBusy(id);
    try {
      await api.deleteDownload(id);
      if (playing?.id === id) setPlaying(null);
      setPendingDelete(null);
      await refresh();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo eliminar la descarga.');
    } finally {
      setBusy(null);
    }
  };

  const readyCount = items.filter((item) => item.status === 'complete').length;
  const activeCount = items.filter((item) => ACTIVE_STATUSES.includes(item.status)).length;
  const usedBytes = items.reduce((sum, item) => sum + (item.status === 'complete' ? item.bytes || 0 : 0), 0);
  const savedBytes = items.reduce((sum, item) => {
    const original = item.sourceBytes || item.totalBytes;
    return sum + (item.status === 'complete' && original > item.bytes ? original - item.bytes : 0);
  }, 0);
  const visibleItems = items.filter((item) => filter === 'all' || (filter === 'active' ? ACTIVE_STATUSES.includes(item.status) : item.status === 'complete'));
  const usedPercent = Math.min(100, (usedBytes / STORAGE_LIMIT) * 100);

  return (
    <section className="mx-auto max-w-[1480px] px-4 pb-20 pt-24 font-netflix sm:px-8 sm:pt-28 lg:px-12">
      <p className="mb-4 text-base font-black uppercase tracking-[0.14em] sm:text-lg" style={{ color: '#E50914' }}>
        Tu biblioteca sin conexión
      </p>
      <header className="relative mb-8 overflow-hidden rounded-xl border border-white/10 bg-[radial-gradient(circle_at_85%_15%,#46131a_0%,#1c1516_35%,#141414_72%)] px-6 py-8 shadow-2xl sm:px-10 sm:py-10">
        <div className="pointer-events-none absolute -right-12 -top-24 h-72 w-72 rounded-full border border-red-500/10 sm:h-96 sm:w-96" />
        <div className="relative flex flex-wrap items-end justify-between gap-8">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-white sm:text-5xl">Mis descargas</h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-neutral-300 sm:text-base">Tus películas y episodios guardados, listos cuando quieras verlos.</p>
            <div className="mt-5 flex flex-wrap gap-2 text-xs font-semibold text-neutral-200">
              <span className="rounded-full bg-white/10 px-3 py-1.5">{readyCount} {readyCount === 1 ? 'lista para ver' : 'listas para ver'}</span>
              {activeCount > 0 && <span className="rounded-full bg-red-600/25 px-3 py-1.5 text-red-100">{activeCount} en proceso</span>}
            </div>
          </div>
          <div className="w-full max-w-xs rounded-lg border border-white/10 bg-black/30 p-4 backdrop-blur-sm">
            <div className="mb-3 flex items-center justify-between gap-2 text-xs text-neutral-300">
              <span className="flex items-center gap-2"><HardDrive size={15} /> Espacio utilizado</span>
              <strong className="text-white">{sizeLabel(usedBytes)} / 8 GB</strong>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/15" role="progressbar" aria-label="Espacio utilizado" aria-valuenow={Math.round(usedPercent)} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-red-600 transition-[width] duration-500" style={{ width: `${usedPercent}%` }} />
            </div>
            {savedBytes > 0 && <p className="mt-3 text-xs text-neutral-300">Has ahorrado <strong className="text-white">{sizeLabel(savedBytes)}</strong> de espacio.</p>}
          </div>
        </div>
      </header>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2 overflow-x-auto" role="group" aria-label="Filtrar descargas">
          {FILTERS.map((option) => (
            <button key={option.id} type="button" onClick={() => setFilter(option.id)} aria-pressed={filter === option.id} style={filter === option.id ? { backgroundColor: '#E50914', color: '#fff' } : undefined} className={`whitespace-nowrap rounded-md px-4 py-2 text-sm font-bold transition ${filter === option.id ? '' : 'bg-[#252525] text-neutral-200 hover:bg-[#363636]'}`}>{option.label}</button>
          ))}
        </div>
        <button type="button" onClick={refresh} className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-neutral-300 transition hover:bg-white/10 hover:text-white" aria-label="Actualizar descargas"><RefreshCw size={16} /> Actualizar</button>
      </div>

      {error && <p role="alert" className="mb-5 rounded-md border border-red-500/30 bg-red-950/40 px-4 py-3 text-sm text-red-100">{error}</p>}

      {items.length === 0 ? (
        <div className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-white/10 bg-[#1b1b1b] px-6 py-10 text-center">
          <div className="mb-4 rounded-full bg-red-600/15 p-4 text-red-500"><Download size={30} /></div>
          <h2 className="text-xl font-bold text-white">Tu biblioteca empieza aquí</h2>
          <p className="mt-2 max-w-sm text-sm text-neutral-400">Abre una película o serie y pulsa «Descargar» para guardarla en este equipo.</p>
          {onExplore && <button type="button" onClick={onExplore} className="mt-5 rounded-md bg-white px-5 py-2.5 text-sm font-bold text-black transition hover:bg-neutral-200">Explorar títulos</button>}
        </div>
      ) : visibleItems.length === 0 ? (
        <div className="rounded-lg border border-white/10 bg-[#1b1b1b] px-6 py-10 text-center text-sm text-neutral-400">No hay descargas en esta vista.</div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {visibleItems.map((item) => {
            const { name, episode } = titleParts(item.title);
            const complete = item.status === 'complete';
            const progress = item.status === 'compressing'
              ? Math.min(100, Math.max(0, item.encodeProgress || 0))
              : item.totalBytes ? Math.min(100, Math.max(0, (item.bytes / item.totalBytes) * 100)) : 0;
            const statusText = complete ? 'Disponible sin conexión'
              : item.status === 'queued' ? 'En espera'
              : item.status === 'downloading' ? 'Descargando'
              : item.status === 'compressing' ? 'Preparando para ver'
              : 'No se pudo descargar';
            return (
              <article key={item.id} className="group flex min-w-0 gap-4 rounded-xl border border-white/10 bg-[#1b1b1b] p-3 transition duration-200 hover:border-white/25 hover:bg-[#222] sm:gap-5 sm:p-4">
                <Poster title={name} posterPath={posters[name]} />
                <div className="flex min-w-0 flex-1 flex-col py-1">
                  <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider">
                    {complete ? <Check size={14} className="text-emerald-400" /> : <Clock3 size={14} className={item.status === 'failed' ? 'text-red-400' : 'text-red-500'} />}
                    <span className={complete ? 'text-emerald-300' : item.status === 'failed' ? 'text-red-300' : 'text-neutral-300'}>{statusText}</span>
                  </div>
                  <h2 className="mt-2 line-clamp-2 text-base font-bold leading-snug text-white sm:text-xl">{name}</h2>
                  {episode && <p className="mt-1 truncate text-sm text-neutral-300">{episode}</p>}
                  <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-neutral-400">
                    <span className="rounded border border-white/15 px-1.5 py-0.5 font-bold text-neutral-200">{qualityLabel(item.quality)}</span>
                    {complete && <span>{sizeLabel(item.bytes)}</span>}
                    {complete && (item.sourceBytes || item.totalBytes) > item.bytes && <span>· Ahorraste {sizeLabel((item.sourceBytes || item.totalBytes) - item.bytes)}</span>}
                  </div>
                  {['downloading', 'compressing'].includes(item.status) && (
                    <div className="mt-4" role="progressbar" aria-label={`Progreso de ${name}`} aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}>
                      <div className="h-1.5 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-red-600 transition-[width] duration-500" style={{ width: `${progress}%` }} /></div>
                      <p className="mt-1.5 text-xs text-neutral-400">{item.status === 'compressing' ? `${Math.round(progress)}% preparado` : item.totalBytes ? `${Math.round(progress)}% · ${sizeLabel(item.bytes)} de ${sizeLabel(item.totalBytes)}` : `${sizeLabel(item.bytes)} descargados`}</p>
                    </div>
                  )}
                  {item.status === 'failed' && <p className="mt-2 line-clamp-2 text-xs text-red-200">{item.error || 'Vuelve a intentarlo desde la ficha del título.'}</p>}
                  <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
                    {complete && <button type="button" onClick={() => setPlaying(item)} className="flex items-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-bold text-black transition hover:bg-neutral-200"><Play size={16} fill="currentColor" /> Reproducir</button>}
                    {pendingDelete === item.id ? (
                      <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-200">
                        <span>¿{complete ? 'Eliminar' : 'Cancelar'}?</span>
                        <button type="button" onClick={() => remove(item.id)} disabled={busy === item.id} className="rounded bg-red-600 px-2.5 py-1.5 font-bold text-white hover:bg-red-500 disabled:opacity-50">Sí, {complete ? 'eliminar' : 'cancelar'}</button>
                        <button type="button" onClick={() => setPendingDelete(null)} className="rounded px-2 py-1.5 hover:bg-white/10">No</button>
                      </div>
                    ) : (
                      <button type="button" onClick={() => setPendingDelete(item.id)} disabled={busy === item.id} className="flex items-center gap-1.5 rounded-md px-2 py-2 text-xs font-semibold text-neutral-400 transition hover:bg-red-600/15 hover:text-red-300 disabled:opacity-50" aria-label={`${complete ? 'Eliminar' : 'Cancelar'} ${item.title}`}><Trash2 size={15} /> {complete ? 'Eliminar' : 'Cancelar'}</button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {playing && <OfflinePlayer item={playing} onClose={() => setPlaying(null)} />}
    </section>
  );
}
