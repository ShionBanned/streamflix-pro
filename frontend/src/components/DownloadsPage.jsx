import React, { useEffect, useState } from 'react';
import { Download, Trash2, RefreshCw } from 'lucide-react';
import api from '../services/api.js';

function sizeLabel(bytes) {
  if (!Number.isFinite(bytes)) return 'Tamaño pendiente';
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

export default function DownloadsPage() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null);
  const refresh = async () => {
    try { setItems(await api.getDownloads()); setError(''); }
    catch (err) { setError(err.response?.data?.error || 'No se pudo consultar la biblioteca offline.'); }
  };
  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 2000);
    return () => clearInterval(timer);
  }, []);
  const remove = async id => {
    setBusy(id);
    try { await api.deleteDownload(id); await refresh(); }
    catch (err) { setError(err.response?.data?.error || 'No se pudo borrar la descarga.'); }
    finally { setBusy(null); }
  };
  return (
    <section className="pt-24 sm:pt-28 px-4 sm:px-8 lg:px-12 max-w-[1100px] mx-auto">
      <div className="flex items-center justify-between gap-4 mb-3">
        <h1 className="text-3xl font-black flex items-center gap-3"><Download className="text-emerald-400" /> Biblioteca offline</h1>
        <button type="button" onClick={refresh} className="text-neutral-300 hover:text-white" aria-label="Actualizar descargas"><RefreshCw size={20} /></button>
      </div>
      <p className="text-sm text-neutral-400 mb-8">Descarga desde la ficha de cada título o desde un enlace directo. La opción compacta convierte el video completo a 720p H.264/AAC y conserva el original si ya ocupa menos. Límite: 4 GB de origen, 2 GB finales por video y 5 GB en la biblioteca.</p>
      {error && <p role="alert" className="mb-4 text-red-300">{error}</p>}
      {items.length === 0 && <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-neutral-400">Aún no hay archivos guardados. Abre un título y pulsa «Descargar».</div>}
      <div className="space-y-4">
        {items.map(item => <article key={item.id} className="rounded-2xl border border-white/10 bg-neutral-900/80 p-5">
          <div className="flex justify-between gap-4">
            <div className="min-w-0"><h2 className="font-bold truncate">{item.title}</h2><p className="text-xs text-neutral-400 mt-1">{item.status === 'complete' ? `Listo · ${sizeLabel(item.bytes)} · ${item.quality === 'compact' ? 'Compacta' : 'Original'}` : item.status === 'downloading' ? `Descargando · ${sizeLabel(item.bytes)}${item.totalBytes ? ` de ${sizeLabel(item.totalBytes)}` : ''}` : item.status === 'compressing' ? 'Comprimiendo video completo…' : `Falló · ${item.error || 'Inténtalo de nuevo'}`}</p></div>
            {!['downloading', 'compressing'].includes(item.status) && <button type="button" onClick={() => remove(item.id)} disabled={busy === item.id} aria-label={`Borrar ${item.title}`} className="text-neutral-400 hover:text-red-300 disabled:opacity-50"><Trash2 size={19} /></button>}
          </div>
          {item.status === 'downloading' && item.totalBytes && <progress className="w-full mt-4 accent-emerald-500" value={item.bytes} max={item.totalBytes} />}
          {item.status === 'complete' && <video className="w-full mt-4 rounded-xl bg-black max-h-[65vh]" controls preload="metadata" src={`/api/downloads/${item.id}/stream`} />}
        </article>)}
      </div>
    </section>
  );
}
