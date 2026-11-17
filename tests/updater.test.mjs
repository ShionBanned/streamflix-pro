import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { UpdateEngine } = require('../electron/updater.cjs');

class MockAutoUpdater extends EventEmitter {
  constructor() {
    super();
    this.autoDownload = false;
    this.autoInstallOnAppQuit = true;
    this.checkCount = 0;
    this.quitAndInstallCalled = false;
    this.shouldHangCheck = false;
    this.shouldThrowError = null;
  }

  async checkForUpdates() {
    this.checkCount++;
    if (this.shouldThrowError) {
      throw this.shouldThrowError;
    }
    if (this.shouldHangCheck) {
      return new Promise(() => {}); // never resolves
    }
    this.emit('update-not-available', { version: '5.9.0' });
    return { version: '5.9.0' };
  }

  quitAndInstall(isSilent, isForceRunAfter) {
    this.quitAndInstallCalled = true;
    this.quitArgs = { isSilent, isForceRunAfter };
  }
}

test('1. Prevención de consultas simultáneas: evita comprobaciones concurrentes', async () => {
  const mock = new MockAutoUpdater();
  mock.shouldHangCheck = true; // Simular petición de red en vuelo

  const engine = new UpdateEngine({
    autoUpdater: mock,
    checkOnStart: false,
    logger: { info: () => {}, warn: () => {} },
  });

  // Primera llamada: inicia comprobación y queda en espera
  const firstPromise = engine.checkForUpdates();
  assert.equal(engine.isChecking, true);
  assert.equal(mock.checkCount, 1);

  // Segunda llamada simultánea: debe omitirse inmediatamente
  const secondResult = await engine.checkForUpdates();
  assert.equal(secondResult.skipped, true);
  assert.equal(secondResult.reason, 'concurrent_check_prevented');
  assert.equal(mock.checkCount, 1); // No incrementa llamadas
});

test('2. Versión actual sin aviso: silencio absoluto cuando no hay versión nueva', async () => {
  const mock = new MockAutoUpdater();
  const engine = new UpdateEngine({
    autoUpdater: mock,
    checkOnStart: false,
    logger: { info: () => {}, warn: () => {} },
  });

  let eventFired = false;
  engine.on('update-available', () => { eventFired = true; });
  engine.on('update-downloaded', () => { eventFired = true; });

  // Simular evento de electron-updater indicando que la versión instalada está al día
  mock.emit('update-not-available', { version: '5.9.0' });

  assert.equal(eventFired, false, 'No debe emitir ninguna notificación ni evento a la interfaz');
  assert.equal(engine.isChecking, false);
});

test('3. Versión nueva con aviso y progreso: descarga en segundo plano y emite progreso', async () => {
  const mock = new MockAutoUpdater();
  const engine = new UpdateEngine({
    autoUpdater: mock,
    checkOnStart: false,
    logger: { info: () => {}, warn: () => {} },
  });

  let updateAvailableInfo = null;
  const progressRecords = [];

  engine.on('update-available', (info) => { updateAvailableInfo = info; });
  engine.on('download-progress', (prog) => { progressRecords.push(prog); });

  mock.emit('update-available', { version: '5.9.1', releaseDate: '2026-11-17' });
  assert.deepEqual(updateAvailableInfo, { version: '5.9.1', releaseDate: '2026-11-17' });

  mock.emit('download-progress', { percent: 25, transferred: 25000000, total: 100000000 });
  mock.emit('download-progress', { percent: 100, transferred: 100000000, total: 100000000 });

  assert.equal(progressRecords.length, 2);
  assert.equal(progressRecords[0].percent, 25);
  assert.equal(progressRecords[1].percent, 100);
});

test('4. Descarga terminada con opciones «Instalar ahora» y «Más tarde»', async () => {
  const mock = new MockAutoUpdater();
  let backendShutdownCalled = false;

  const engine = new UpdateEngine({
    autoUpdater: mock,
    checkOnStart: false,
    logger: { info: () => {}, warn: () => {} },
    onInstallRequested: async () => {
      backendShutdownCalled = true;
    },
  });

  let downloadedInfo = null;
  engine.on('update-downloaded', (info) => { downloadedInfo = info; });

  mock.emit('update-downloaded', { version: '5.9.1' });
  assert.deepEqual(downloadedInfo, { version: '5.9.1' });

  // Prueba de «Instalar ahora»: debe apagar backend y llamar a quitAndInstall
  await engine.installNow();
  assert.equal(backendShutdownCalled, true, 'Debe invocar el cierre ordenado del backend');
  assert.equal(mock.quitAndInstallCalled, true, 'Debe solicitar quitAndInstall a electron-updater');
  assert.deepEqual(mock.quitArgs, { isSilent: false, isForceRunAfter: true });
});

test('5. Opción «Más tarde»: pospone la actualización sin reiniciar ni interrumpir', async () => {
  const mock = new MockAutoUpdater();
  const engine = new UpdateEngine({
    autoUpdater: mock,
    checkOnStart: false,
    logger: { info: () => {}, warn: () => {} },
  });

  let postponedFired = false;
  engine.on('postponed', () => { postponedFired = true; });

  engine.postpone();
  assert.equal(postponedFired, true);
  assert.equal(engine.postponed, true);

  // Tras posponer, eventos posteriores no deben perturbar al usuario
  let downloadedAfterPostpone = false;
  engine.on('update-downloaded', () => { downloadedAfterPostpone = true; });
  mock.emit('update-downloaded', { version: '5.9.1' });

  assert.equal(downloadedAfterPostpone, false, 'No debe emitir si fue pospuesta');
  assert.equal(mock.quitAndInstallCalled, false, 'Bajo ninguna circunstancia debe reiniciar sin elección explícita');
});

test('6. Error de red o GitHub caído: fallo silencioso sin interrumpir al usuario', async () => {
  const mock = new MockAutoUpdater();
  mock.shouldThrowError = new Error('getaddrinfo ENOTFOUND github.com');

  const engine = new UpdateEngine({
    autoUpdater: mock,
    checkOnStart: false,
    logger: { info: () => {}, warn: () => {} },
  });

  const res = await engine.checkForUpdates();
  assert.match(res.error, /ENOTFOUND/);
  assert.equal(engine.isChecking, false, 'El estado isChecking se libera para el siguiente ciclo');

  // Simular evento 'error' directo de electron-updater
  mock.emit('error', new Error('HTTP 503 Service Unavailable'));
  assert.equal(engine.isChecking, false);
});

test('7. Temporizador simulado de comprobación periódica cada 2 horas', async () => {
  const mock = new MockAutoUpdater();
  let checksTriggered = 0;

  // Temporizador acelerado simulando 2 horas en 20ms para prueba rápida
  const engine = new UpdateEngine({
    autoUpdater: mock,
    pollIntervalMs: 20,
    checkOnStart: true,
    startDelayMs: 5,
    logger: { info: () => {}, warn: () => {} },
  });

  engine.start();

  await new Promise((r) => setTimeout(r, 65));
  engine.stop();

  assert.ok(mock.checkCount >= 2, `Se esperaba al menos 2 comprobaciones periódicas, ocurrieron: ${mock.checkCount}`);
});
