import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import {
  syncKeyToBackend,
  flushPendingSync,
  getPendingQueueSize,
  getPendingQueue,
  clearPendingQueue,
} from '../src/services/storageSync.js';

vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

describe('storageSync - Sincronización por lotes y prevención de cancelación', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clearPendingQueue();
    vi.clearAllMocks();
  });

  afterEach(() => {
    clearPendingQueue();
    vi.useRealTimers();
  });

  it('1. Cambios rápidos sucesivos en Mi lista y Continuar viendo no se cancelan y se envían en un único lote', async () => {
    axios.post.mockResolvedValueOnce({ data: { ok: true } });

    const watchlistData = [
      { id: 101, title: 'Breaking Bad', type: 'series' },
      { id: 102, title: 'Better Call Saul', type: 'series' },
    ];
    const continueWatchingData = [
      { id: 201, title: 'Inception', progress: 0.65, currentTime: 5400 },
    ];
    const profileData = { name: 'Santiago (Deku)', avatar: '🚀' };

    // Disparar ráfaga inmediata de cambios sobre claves distintas (< 5ms)
    syncKeyToBackend('streamflix_watchlist', watchlistData);
    syncKeyToBackend('streamflix_continue_watching', continueWatchingData);
    syncKeyToBackend('streamflix_profile_v1', profileData);

    // Ambas claves (y el perfil) deben coexistir en la cola sin cancelarse entre sí
    expect(getPendingQueueSize()).toBe(3);
    const queue = getPendingQueue();
    expect(queue.has('streamflix_watchlist')).toBe(true);
    expect(queue.has('streamflix_continue_watching')).toBe(true);
    expect(queue.has('streamflix_profile_v1')).toBe(true);

    // No debe haber enviado el POST antes de que expire el temporizador debounce
    expect(axios.post).not.toHaveBeenCalled();

    // Avanzar temporizador simulado (400ms)
    await vi.advanceTimersByTimeAsync(400);

    // Debe haberse enviado exactamente UN solo POST con el lote consolidado
    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(axios.post).toHaveBeenCalledWith(
      '/api/user/storage',
      expect.objectContaining({
        streamflix_watchlist: JSON.stringify(watchlistData),
        streamflix_continue_watching: JSON.stringify(continueWatchingData),
        streamflix_profile_v1: JSON.stringify(profileData),
      })
    );

    // La cola debe haber quedado vacía tras la confirmación
    expect(getPendingQueueSize()).toBe(0);
  });

  it('2. Ráfaga de actualizaciones sobre la misma clave conserva el valor más reciente', async () => {
    axios.post.mockResolvedValueOnce({ data: { ok: true } });

    // Progreso avanzando rápidamente durante la reproducción
    syncKeyToBackend('streamflix_continue_watching', [{ id: 500, progress: 0.1 }]);
    syncKeyToBackend('streamflix_continue_watching', [{ id: 500, progress: 0.25 }]);
    syncKeyToBackend('streamflix_continue_watching', [{ id: 500, progress: 0.85 }]);

    // Solo debe haber 1 entrada en la cola (la clave continue_watching actualizada)
    expect(getPendingQueueSize()).toBe(1);

    await vi.advanceTimersByTimeAsync(400);

    expect(axios.post).toHaveBeenCalledTimes(1);
    const sentPayload = axios.post.mock.calls[0][1];
    expect(JSON.parse(sentPayload.streamflix_continue_watching)).toEqual([
      { id: 500, progress: 0.85 },
    ]);
  });

  it('3. flushPendingSync vacía el lote pendiente de forma inmediata sin esperar temporizadores', async () => {
    axios.post.mockResolvedValueOnce({ data: { ok: true } });

    syncKeyToBackend('streamflix_watchlist', [{ id: 1, title: 'Stranger Things' }]);
    expect(getPendingQueueSize()).toBe(1);

    const result = await flushPendingSync();
    expect(result).toEqual({ ok: true });
    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(getPendingQueueSize()).toBe(0);
  });

  it('4. Si la red falla, los datos no confirmados se conservan en la cola para el siguiente reintento', async () => {
    axios.post.mockRejectedValueOnce(new Error('Network offline'));

    syncKeyToBackend('streamflix_watchlist', [{ id: 1, title: 'Dark' }]);
    expect(getPendingQueueSize()).toBe(1);

    await vi.advanceTimersByTimeAsync(400);

    expect(axios.post).toHaveBeenCalledTimes(1);
    // Debido al fallo, la clave debe volver a estar en la cola para reintento
    expect(getPendingQueueSize()).toBe(1);
    expect(getPendingQueue().has('streamflix_watchlist')).toBe(true);
  });
});
