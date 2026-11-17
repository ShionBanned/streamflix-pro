import { useCallback, useEffect, useState } from 'react';
import api from '../services/api.js';

export default function useStreamSource({ storageKey, title, setActiveServer, setActiveDrawer, setLaunchMessage }) {
  const [directInput, setDirectInput] = useState('');
  const [directUrl, setDirectUrl] = useState('');
  const [savedDirectSources, setSavedDirectSources] = useState([]);

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) || '[]');
      setSavedDirectSources(Array.isArray(stored)
        ? stored.filter((value) => typeof value === 'string' && /^https?:\/\//.test(value)).slice(0, 20)
        : []);
    } catch {
      setSavedDirectSources([]);
    }
  }, [storageKey]);

  const openDirectSource = useCallback(() => {
    let url;
    try {
      url = new URL(directInput.trim());
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error();
    } catch {
      setLaunchMessage({ type: 'error', text: 'Introduce la URL HTTP/HTTPS de un archivo HLS, MP4 o WebM disponible para ti.' });
      return;
    }
    setDirectUrl(url.href);
    setActiveServer('direct');
    setActiveDrawer(null);
    const next = [url.href, ...savedDirectSources.filter((value) => value !== url.href)].slice(0, 20);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* La reproducción sigue en memoria. */ }
    setSavedDirectSources(next);
  }, [directInput, savedDirectSources, storageKey, setActiveServer, setActiveDrawer, setLaunchMessage]);

  const saveDirectOffline = useCallback(async () => {
    try {
      await api.startDownload(directInput.trim(), title);
      setLaunchMessage({ type: 'success', text: 'Descarga iniciada. Sigue el progreso en Offline.' });
    } catch (error) {
      setLaunchMessage({ type: 'error', text: error.response?.data?.error || error.message || 'No se pudo iniciar la descarga.' });
    }
  }, [directInput, title, setLaunchMessage]);

  return { directInput, setDirectInput, directUrl, setDirectUrl, openDirectSource, saveDirectOffline };
}
