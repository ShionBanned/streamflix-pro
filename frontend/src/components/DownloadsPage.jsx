import React, { useEffect, useState } from 'react';
import { Download, Trash2, RefreshCw, Clock } from 'lucide-react';
import api from '../services/api.js';

function sizeLabel(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return 'Tamaño pendiente';
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function qualityBadgeLabel(quality) {
  if (quality === 'marathon') return 'Temporada · 576p HQ';
  if (quality === 'compact') return 'Compacta · 720p HD';
  return 'Original';
}

export default function DownloadsPage() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null);

  const refresh = async () => {
    try {
      setItems(await api.getDownloads());
      setError('');
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo consultar la biblioteca offline.');
    }
  };

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 2000);
    return () => clearInterval(timer);
  }, []);

  const remove = async (id) => {
    setBusy(id);
    try {
      await api.deleteDownload(id);
      await refresh();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo borrar la descarga.');
    } finally {
      setBusy(null);
    }
  };

  const totalUsedBytes = items.reduce(
    (sum, item) => sum + (item.status === 'complete' ? item.bytes || 0 : 0),
    0
  );
  const totalSavedBytes = items.reduce((sum, item) => {
    const orig = item.sourceBytes || item.totalBytes;
    if (item.status === 'complete' && orig && orig > item.bytes) {
      return sum + (orig - item.bytes);
    }
    return sum;
  }, 0);

  return (
    <section className="pt-24 sm:pt-28 pb-16 px-4 sm:px-8 lg:px-12 max-w-[1100px] mx-auto font-netflix">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-3">
        <div className="flex items-center gap-3">
          <span className="w-1.5 h-7 bg-[#E50914] rounded-sm inline-block" />
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
            Mis descargas
          </h1>
        </div>
        <div className="flex items-center gap-2.5">
          {totalUsedBytes > 0 && (
            <span className="text-xs font-medium px-3 py-1.5 rounded-[4px] bg-[#232323] border border-white/10 text-[#b3b3b3]">
              Ocupado: <strong className="text-white">{sizeLabel(totalUsedBytes)}</strong> / 8 GB
            </span>
          )}
          {totalSavedBytes > 0 && (
            <span className="text-xs font-bold px-3 py-1.5 rounded-[4px] bg-[#E50914]/15 border border-[#E50914]/40 text-white">
              Ahorrado: {sizeLabel(totalSavedBytes)}
            </span>
          )}
          <button
            type="button"
            onClick={refresh}
            className="text-neutral-300 hover:text-white p-2 rounded-[4px] bg-[#232323] hover:bg-[#2f2f2f] border border-white/10 transition"
            aria-label="Actualizar descargas"
          >
            <RefreshCw size={17} />
          </button>
        </div>
      </div>

      <p className="text-xs sm:text-sm text-[#b3b3b3] mb-8 max-w-3xl">
        Guarda películas o temporadas completas desde la ficha de cada título. El motor{' '}
        <strong className="text-white">Per-Title (AQ-3 + Lanczos + Denoise)</strong> reduce el
        tamaño hasta un 70% conservando la nitidez original.
      </p>

      {error && (
        <p role="alert" className="mb-4 text-[#E50914] text-sm font-medium">
          {error}
        </p>
      )}

      {items.length === 0 && (
        <div className="rounded-md border border-white/10 bg-[#181818] p-8 text-[#b3b3b3] flex items-center gap-4">
          <Download className="w-6 h-6 text-[#E50914] shrink-0" />
          <span className="text-sm">
            Aún no tienes videos guardados. Abre cualquier película o serie y pulsa «Descargar».
          </span>
        </div>
      )}

      <div className="space-y-3.5">
        {items.map((item) => (
          <article
            key={item.id}
            className="rounded-md border border-white/10 bg-[#181818] p-5 shadow-lg"
          >
            <div className="flex justify-between items-start gap-4">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-bold text-white text-base truncate">{item.title}</h2>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-[2px] bg-[#2a2a2a] border border-white/15 text-neutral-200">
                    {qualityBadgeLabel(item.quality)}
                  </span>
                  {item.status === 'complete' &&
                    ((item.savedRatio != null && item.savedRatio > 0) ||
                      ((item.sourceBytes || item.totalBytes) &&
                        (item.sourceBytes || item.totalBytes) > item.bytes)) && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-[2px] bg-[#E50914] text-white">
                        −
                        {item.savedRatio != null && item.savedRatio > 0
                          ? item.savedRatio
                          : Math.round(
                              (1 - item.bytes / (item.sourceBytes || item.totalBytes)) * 100
                            )}
                        % peso
                      </span>
                    )}
                </div>

                <p className="text-xs text-[#b3b3b3]">
                  {item.status === 'complete'
                    ? `Listo para ver offline · ${sizeLabel(item.bytes)}${
                        (item.sourceBytes || item.totalBytes) &&
                        (item.sourceBytes || item.totalBytes) > item.bytes
                          ? ` (original ${sizeLabel(item.sourceBytes || item.totalBytes)})`
                          : ''
                      }`
                    : item.status === 'queued'
                    ? 'En cola de temporada · Esperando turno automático…'
                    : item.status === 'downloading'
                    ? `Descargando · ${sizeLabel(item.bytes)}${
                        item.totalBytes ? ` de ${sizeLabel(item.totalBytes)}` : ''
                      }`
                    : item.status === 'compressing'
                    ? `Optimizando video sin pérdida visual… ${
                        item.encodeProgress != null ? `${item.encodeProgress}%` : ''
                      }`
                    : `Error · ${item.error || 'Inténtalo de nuevo'}`}
                </p>
              </div>

              <button
                type="button"
                onClick={() => remove(item.id)}
                disabled={busy === item.id}
                aria-label={`Borrar o cancelar ${item.title}`}
                className="text-neutral-400 hover:text-white disabled:opacity-50 p-1.5 rounded bg-[#232323] hover:bg-[#E50914] transition"
                title={
                  item.status === 'queued'
                    ? 'Cancelar de la cola'
                    : ['downloading', 'compressing'].includes(item.status)
                    ? 'Cancelar descarga en curso'
                    : 'Eliminar descarga'
                }
              >
                {item.status === 'queued' ? (
                  <Clock size={16} />
                ) : (
                  <Trash2 size={16} />
                )}
              </button>
            </div>

            {item.status === 'downloading' && item.totalBytes && (
              <div className="w-full h-1.5 bg-[#2a2a2a] rounded-full overflow-hidden mt-4">
                <div
                  className="h-full bg-[#E50914] transition-all duration-300"
                  style={{
                    width: `${Math.min(100, Math.round((item.bytes / item.totalBytes) * 100))}%`,
                  }}
                />
              </div>
            )}

            {item.status === 'compressing' && (
              <div className="w-full h-1.5 bg-[#2a2a2a] rounded-full overflow-hidden mt-4">
                <div
                  className="h-full bg-[#E50914] transition-all duration-300"
                  style={{ width: `${Math.min(100, Math.max(3, item.encodeProgress || 0))}%` }}
                />
              </div>
            )}

            {item.status === 'complete' && (
              <video
                className="w-full mt-4 rounded-[4px] bg-black max-h-[65vh]"
                controls
                preload="metadata"
                src={`/api/downloads/${item.id}/stream`}
              />
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
