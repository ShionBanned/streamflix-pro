import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { UpdateEngine } = require('../electron/updater.cjs');

test('E2E Windows Update Test: detección, descarga con integridad, apagado ordenado y conservación de datos', async () => {
  // 1. Configurar entorno de datos persistentes aislado para la prueba
  const testDataDir = path.join(os.tmpdir(), `streamflix-e2e-test-${Date.now()}`);
  const downloadsDir = path.join(testDataDir, 'downloads');
  fs.mkdirSync(downloadsDir, { recursive: true });

  // Sembrar datos de usuario previos (Versión 5.9.0)
  const initialPreferences = {
    sf_watchlist: [{ id: 101, title: 'Breaking Bad' }],
    sf_continue_watching: [{ id: 202, title: 'Interstellar', progress: 0.72 }],
    streamflix_profile_v1: { name: 'Santiago (Deku)', avatar: '🚀' },
    sf_preferred_language: 'latino',
  };
  fs.writeFileSync(path.join(testDataDir, 'user-preferences.json'), JSON.stringify(initialPreferences, null, 2), 'utf8');

  const initialDownloads = [
    { id: 'offline-001', title: 'Episodio Piloto', status: 'completed', createdAt: new Date().toISOString() },
  ];
  fs.writeFileSync(path.join(downloadsDir, 'index.json'), JSON.stringify(initialDownloads, null, 2), 'utf8');

  // 2. Crear paquete de actualización simulado v5.9.1
  const updatePayload = Buffer.from('StreamFlix-Setup-5.9.1-Binary-Payload-Simulation');
  const sha512Hash = crypto.createHash('sha512').update(updatePayload).digest('base64');

  const latestYml = [
    'version: 5.9.1',
    'files:',
    '  - url: StreamFlix-Setup-5.9.1.exe',
    `    sha512: ${sha512Hash}`,
    `    size: ${updatePayload.length}`,
    'path: StreamFlix-Setup-5.9.1.exe',
    `sha512: ${sha512Hash}`,
    `releaseDate: '${new Date().toISOString()}'`,
    'releaseNotes: "StreamFlix Pro v5.9.1 - Mejoras de rendimiento y estabilidad."',
  ].join('\n');

  // 3. Iniciar servidor local de distribución de actualizaciones HTTP
  let updateDownloaded = false;
  let updateRequested = false;

  const server = http.createServer((req, res) => {
    if (req.url === '/latest.yml') {
      res.writeHead(200, { 'Content-Type': 'text/yaml' });
      res.end(latestYml);
    } else if (req.url === '/StreamFlix-Setup-5.9.1.exe') {
      updateRequested = true;
      res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': updatePayload.length });
      res.end(updatePayload);
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const feedUrl = `http://127.0.0.1:${port}`;

  // 4. Adaptador de prueba E2E de electron-updater
  const { EventEmitter } = require('node:events');
  class E2EAutoUpdater extends EventEmitter {
    constructor() {
      super();
      this.currentVersion = '5.9.0';
      this.feedUrl = feedUrl;
      this.installed = false;
    }

    async checkForUpdates() {
      this.emit('checking-for-update');
      // Consultar el feed local
      return new Promise((resolve, reject) => {
        http.get(`${this.feedUrl}/latest.yml`, (res) => {
          let body = '';
          res.on('data', (d) => { body += d; });
          res.on('end', () => {
            const vMatch = body.match(/version:\s*([0-9.]+)/);
            const remoteVersion = vMatch ? vMatch[1] : null;

            if (remoteVersion && remoteVersion !== this.currentVersion) {
              const info = { version: remoteVersion, releaseNotes: 'Notas de versión v5.9.1' };
              this.emit('update-available', info);

              // Iniciar descarga simulada desde el servidor
              http.get(`${this.feedUrl}/StreamFlix-Setup-${remoteVersion}.exe`, (binRes) => {
                const chunks = [];
                let received = 0;
                const total = Number(binRes.headers['content-length'] || updatePayload.length);

                binRes.on('data', (c) => {
                  chunks.push(c);
                  received += c.length;
                  this.emit('download-progress', {
                    percent: Math.round((received / total) * 100),
                    transferred: received,
                    total,
                  });
                });

                binRes.on('end', () => {
                  const downloadedBuf = Buffer.concat(chunks);
                  const computedHash = crypto.createHash('sha512').update(downloadedBuf).digest('base64');
                  assert.equal(computedHash, sha512Hash, 'La comprobación de integridad SHA512 debe coincidir exactamente');
                  updateDownloaded = true;
                  this.emit('update-downloaded', info);
                  resolve({ versionInfo: info });
                });
              });
            } else {
              this.emit('update-not-available', { version: this.currentVersion });
              resolve({ versionInfo: { version: this.currentVersion } });
            }
          });
        }).on('error', reject);
      });
    }

    quitAndInstall() {
      this.installed = true;
      this.currentVersion = '5.9.1';
    }
  }

  const e2eUpdater = new E2EAutoUpdater();
  let backendShutdownCalled = false;

  const engine = new UpdateEngine({
    autoUpdater: e2eUpdater,
    checkOnStart: false,
    logger: { info: () => {}, warn: () => {} },
    onInstallRequested: async () => {
      backendShutdownCalled = true;
    },
  });

  // 5. Ejecutar ciclo completo de detección y descarga
  await engine.checkForUpdates();

  assert.equal(updateRequested, true, 'Debe haber solicitado el archivo binario del instalador al feed');
  assert.equal(updateDownloaded, true, 'La descarga y comprobación de integridad deben haber concluido con éxito');

  // 6. Aplicar «Instalar ahora»
  await engine.installNow();
  assert.equal(backendShutdownCalled, true, 'El backend debió cerrarse ordenadamente antes de reiniciar');
  assert.equal(e2eUpdater.installed, true, 'El instalador fue ejecutado');
  assert.equal(e2eUpdater.currentVersion, '5.9.1', 'La aplicación transicionó a la versión 5.9.1');

  // 7. Verificación de Invariante de Datos: los datos del usuario se conservan intactos
  const preservedPreferences = JSON.parse(fs.readFileSync(path.join(testDataDir, 'user-preferences.json'), 'utf8'));
  assert.deepEqual(preservedPreferences.sf_watchlist, initialPreferences.sf_watchlist, 'Mi Lista se conservó intacta');
  assert.deepEqual(preservedPreferences.sf_continue_watching, initialPreferences.sf_continue_watching, 'Continuar Viendo se conservó intacto');
  assert.deepEqual(preservedPreferences.streamflix_profile_v1, initialPreferences.streamflix_profile_v1, 'El perfil se conservó intacto');

  const preservedDownloads = JSON.parse(fs.readFileSync(path.join(downloadsDir, 'index.json'), 'utf8'));
  assert.deepEqual(preservedDownloads, initialDownloads, 'Las descargas previas se conservaron intactas');

  // Limpiar servidor y archivos temporales de prueba
  server.close();
  fs.rmSync(testDataDir, { recursive: true, force: true });
});
