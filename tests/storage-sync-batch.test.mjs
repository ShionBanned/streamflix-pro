import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import axios from '../frontend/node_modules/axios/index.js';
import { syncKeyToBackend, flushPendingSync, getPendingQueueSize } from '../frontend/src/services/storageSync.js';

test('Sincronización por lotes: cambios rápidos en Mi lista y Continuar viendo no se cancelan entre sí', async () => {
  let receivedPayload = null;
  let requestCount = 0;

  // Servidor mock para /api/user/storage
  const server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/api/user/storage') {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        requestCount++;
        receivedPayload = JSON.parse(body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      });
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;

  // Configurar baseURL de axios temporalmente para la prueba
  const originalBase = axios.defaults.baseURL;
  axios.defaults.baseURL = `http://127.0.0.1:${port}`;

  try {
    const watchlistData = [{ id: 101, title: 'Breaking Bad' }];
    const continueWatchingData = [{ id: 202, title: 'Better Call Saul', progress: 0.45 }];
    const profileData = { name: 'Santiago (Deku)', avatar: '🚀' };

    // Disparar mutaciones consecutivas inmediatas (< 5ms de diferencia)
    syncKeyToBackend('streamflix_watchlist', watchlistData);
    syncKeyToBackend('streamflix_continue_watching', continueWatchingData);
    syncKeyToBackend('streamflix_profile_v1', profileData);

    assert.equal(getPendingQueueSize(), 3, 'Las 3 claves deben estar en cola sin cancelarse mutuamente');

    // Forzar el vaciado del lote
    await flushPendingSync();

    assert.equal(requestCount, 1, 'Debe haber enviado un solo POST agrupado por lotes');
    assert.ok(receivedPayload, 'El payload debe haber sido recibido por el backend');

    // Verificar que NINGUNA clave fue descartada
    assert.deepEqual(JSON.parse(receivedPayload.streamflix_watchlist), watchlistData, 'Mi lista debe estar presente en el lote');
    assert.deepEqual(JSON.parse(receivedPayload.streamflix_continue_watching), continueWatchingData, 'Continuar viendo debe estar presente en el lote');
    assert.deepEqual(JSON.parse(receivedPayload.streamflix_profile_v1), profileData, 'El perfil debe estar presente en el lote');
    assert.equal(getPendingQueueSize(), 0, 'La cola debe quedar vacía tras el envío exitoso');
  } finally {
    axios.defaults.baseURL = originalBase;
    server.close();
  }
});
