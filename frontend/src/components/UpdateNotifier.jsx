import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Download, Sparkles, RefreshCw, AlertTriangle, X } from 'lucide-react';

export default function UpdateNotifier() {
  const [status, setStatus] = useState('idle'); // 'idle' | 'downloading' | 'downloaded'
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [updateInfo, setUpdateInfo] = useState(null);
  const [isInstalling, setIsInstalling] = useState(false);
  const [warningPrompt, setWarningPrompt] = useState(null); // { activeDownloads, hasPlayback } | null

  useEffect(() => {
    if (!window.electronAPI) return;

    const unsubProgress = window.electronAPI.onUpdateProgress?.((data) => {
      setStatus('downloading');
      setDownloadProgress(Math.round(data?.percent || 0));
    });

    const unsubDownloaded = window.electronAPI.onUpdateDownloaded?.((data) => {
      setStatus('downloaded');
      setUpdateInfo(data || {});
    });

    return () => {
      unsubProgress?.();
      unsubDownloaded?.();
    };
  }, []);

  const handlePostpone = useCallback(() => {
    setStatus('idle');
    if (window.electronAPI?.postponeUpdate) {
      window.electronAPI.postponeUpdate();
    }
  }, []);

  const executeInstall = useCallback(async () => {
    setIsInstalling(true);
    setWarningPrompt(null);
    try {
      if (window.electronAPI?.installUpdate) {
        await window.electronAPI.installUpdate();
      }
    } catch (err) {
      console.warn('[UpdateNotifier] Error al solicitar instalación:', err);
      setIsInstalling(false);
    }
  }, []);

  const handleInstallClick = useCallback(async () => {
    try {
      const res = await axios.get('/api/system/activity', { timeout: 3000 });
      const activity = res.data || {};
      if (activity.hasActiveDownloads || activity.hasActivePlayback) {
        setWarningPrompt({
          activeDownloads: activity.activeDownloadsCount || 0,
          hasPlayback: Boolean(activity.hasActivePlayback),
        });
        return;
      }
    } catch {
      // Si la consulta falla, procedemos directamente
    }
    await executeInstall();
  }, [executeInstall]);

  if (!window.electronAPI || status === 'idle') {
    return null;
  }

  return (
    <>
      {/* Banner flotante en esquina inferior derecha */}
      <div className="fixed bottom-6 right-6 z-50 max-w-md w-full bg-[#181818]/95 border border-white/15 rounded-xl shadow-2xl backdrop-blur-xl p-4 text-white font-netflix animate-fadeIn transition-all">
        {status === 'downloading' && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-white/90">
                <Download className="w-4 h-4 text-[#E50914] animate-bounce" />
                <span>Descargando actualización en segundo plano...</span>
              </div>
              <span className="text-xs text-white/60 font-mono">{downloadProgress}%</span>
            </div>
            <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-[#E50914] h-full transition-all duration-300"
                style={{ width: `${downloadProgress}%` }}
              />
            </div>
          </div>
        )}

        {status === 'downloaded' && (
          <div>
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-400 flex-shrink-0" />
                <div>
                  <h4 className="text-sm font-bold text-white">
                    Actualización lista: v{updateInfo?.version || 'nueva'}
                  </h4>
                  <p className="text-xs text-white/70">
                    Se aplicará la versión más reciente al reiniciar.
                  </p>
                </div>
              </div>
              <button
                onClick={handlePostpone}
                className="text-white/40 hover:text-white transition p-1"
                title="Cerrar aviso"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center justify-end gap-2.5 mt-3 pt-2 border-t border-white/10">
              <button
                onClick={handlePostpone}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white/75 hover:text-white hover:bg-white/10 transition"
              >
                Más tarde
              </button>
              <button
                onClick={handleInstallClick}
                disabled={isInstalling}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold bg-[#E50914] hover:bg-red-700 text-white transition shadow-lg shadow-red-950/40 disabled:opacity-50"
              >
                {isInstalling ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Reiniciando...</span>
                  </>
                ) : (
                  <span>Instalar ahora</span>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal de Advertencia de Actividad Activa */}
      {warningPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fadeIn">
          <div className="bg-[#1f1f1f] border border-white/20 rounded-2xl max-w-md w-full p-6 text-white shadow-2xl">
            <div className="flex items-center gap-3 text-amber-400 mb-4">
              <AlertTriangle className="w-6 h-6 flex-shrink-0" />
              <h3 className="text-lg font-bold">Actividad en curso</h3>
            </div>
            <p className="text-sm text-white/80 mb-4">
              {warningPrompt.activeDownloads > 0 && warningPrompt.hasPlayback
                ? `Tienes ${warningPrompt.activeDownloads} descarga(s) y una reproducción activa.`
                : warningPrompt.activeDownloads > 0
                ? `Tienes ${warningPrompt.activeDownloads} descarga(s) activa(s) en segundo plano.`
                : 'Tienes una reproducción en curso.'}
              <br />
              Si instalas ahora, el backend se cerrará de forma ordenada para actualizar StreamFlix.
            </p>
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
              <button
                onClick={() => setWarningPrompt(null)}
                className="px-4 py-2 rounded-xl text-sm font-semibold hover:bg-white/10 text-white/70 transition"
              >
                Cancelar
              </button>
              <button
                onClick={executeInstall}
                className="px-5 py-2 rounded-xl text-sm font-bold bg-[#E50914] hover:bg-red-700 text-white transition shadow-lg"
              >
                Detener e instalar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
