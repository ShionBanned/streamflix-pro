import axios from 'axios';

const SYNCED_KEYS = [
  'streamflix_profile_v1',
  'streamflix_watchlist',
  'streamflix_continue_watching',
  'streamflix_taste_history',
  'streamflix_preferred_language',
  'streamflix_audio_engine_preset',
  'streamflix_iptv_favorites',
  'streamflix_custom_iptv_sources',
  'sf_sub_size',
  'sf_sub_pos',
  'sf_sub_bg',
  'sf_site_pages',
  'sf_site_titles',
];

const pendingQueue = new Map();
let batchTimeout = null;

export async function initStorageSync() {
  try {
    const res = await axios.get('/api/user/storage', { timeout: 4000 });
    const serverData = res.data || {};
    let shouldPush = false;
    const initialUpload = {};
    const hydratedData = {};
    let hydratedCount = 0;

    for (const key of SYNCED_KEYS) {
      const localVal = localStorage.getItem(key);
      const serverVal = serverData[key];

      if ((localVal === null || localVal === '[]' || localVal === '{}') && serverVal !== undefined && serverVal !== null) {
        const valStr = typeof serverVal === 'string' ? serverVal : JSON.stringify(serverVal);
        localStorage.setItem(key, valStr);
        hydratedData[key] = serverVal;
        hydratedCount++;
      } else if (localVal !== null && (serverVal === undefined || serverVal === null)) {
        initialUpload[key] = localVal;
        shouldPush = true;
      }
    }

    if (hydratedCount > 0) {
      window.dispatchEvent(new CustomEvent('streamflix:storage-hydrated', { detail: hydratedData }));
    }

    if (shouldPush) {
      axios.post('/api/user/storage', initialUpload).catch(() => {});
    }
  } catch {
    // Si el backend no está disponible temporalmente, la interfaz continúa en memoria/localStorage
  }
}

export async function flushPendingSync() {
  if (batchTimeout) {
    clearTimeout(batchTimeout);
    batchTimeout = null;
  }
  if (pendingQueue.size === 0) return null;

  const payload = {};
  for (const [k, v] of pendingQueue.entries()) {
    payload[k] = v;
  }
  pendingQueue.clear();

  try {
    const res = await axios.post('/api/user/storage', payload);
    return res.data;
  } catch {
    // Si falla la red, reinsertar en la cola las claves que no hayan recibido un valor más nuevo
    for (const [k, v] of Object.entries(payload)) {
      if (!pendingQueue.has(k)) {
        pendingQueue.set(k, v);
      }
    }
    return null;
  }
}

export function syncKeyToBackend(key, value) {
  if (!SYNCED_KEYS.includes(key)) return;
  pendingQueue.set(key, typeof value === 'string' ? value : JSON.stringify(value));

  // Debounce por lote: restablecer el temporizador para consolidar ráfagas de cambios
  if (batchTimeout) {
    clearTimeout(batchTimeout);
  }
  batchTimeout = setTimeout(() => {
    batchTimeout = null;
    void flushPendingSync();
  }, 400);
}

export function getPendingQueueSize() {
  return pendingQueue.size;
}

export function getPendingQueue() {
  return new Map(pendingQueue);
}

export function clearPendingQueue() {
  if (batchTimeout) {
    clearTimeout(batchTimeout);
    batchTimeout = null;
  }
  pendingQueue.clear();
}
