import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

test('Migración completa de descargas binarias y reproducción tras actualización', async () => {
  const tempBase = path.join(os.tmpdir(), `sf-migration-test-${Date.now()}`);
  const legacyDir = path.join(tempBase, 'legacy', '.local');
  const legacyDownloads = path.join(legacyDir, 'downloads');
  const newTargetDir = path.join(tempBase, 'new-user-data');

  fs.mkdirSync(legacyDownloads, { recursive: true });
  fs.mkdirSync(path.join(legacyDownloads, 'offline-hls-sample.hls'), { recursive: true });

  // Crear archivos simulados en legacy
  const sampleMp4Bytes = Buffer.from('FAKE-MP4-BINARY-STREAM-CONTENT-12345');
  fs.writeFileSync(path.join(legacyDownloads, 'video-001.mp4'), sampleMp4Bytes);
  fs.writeFileSync(path.join(legacyDownloads, 'offline-hls-sample.hls', 'master.m3u8'), '#EXTM3U\n#EXT-X-VERSION:3');

  const legacyIndex = [
    { id: 'video-001', title: 'Episodio 1', format: 'mp4', status: 'completed' },
    { id: 'offline-hls-sample', title: 'Episodio 2 HLS', format: 'hls', status: 'completed' },
  ];
  fs.writeFileSync(path.join(legacyDownloads, 'index.json'), JSON.stringify(legacyIndex, null, 2), 'utf8');

  // Configurar variable de entorno para simular DATA_DIR
  process.env.STREAMFLIX_DATA_DIR = newTargetDir;

  // Importar dinámicamente paths.js
  const pathsModule = await import(`../backend/config/paths.js?t=${Date.now()}`);
  
  // Ejecutar migración real apuntando al directorio legacy
  pathsModule.initDataDirectories(legacyDir);

  // Comprobar que todos los archivos se migraron al nuevo directorio persistente
  assert.ok(fs.existsSync(path.join(pathsModule.DOWNLOADS_DIR, 'video-001.mp4')), 'El archivo MP4 binario debe existir en el nuevo DATA_DIR');
  assert.ok(fs.existsSync(path.join(pathsModule.DOWNLOADS_DIR, 'offline-hls-sample.hls', 'master.m3u8')), 'La carpeta HLS debe existir en el nuevo DATA_DIR');
  
  const migratedIndex = JSON.parse(fs.readFileSync(pathsModule.DOWNLOADS_INDEX, 'utf8'));
  assert.equal(migratedIndex.length, 2, 'El índice de descargas debe contener los 2 títulos');

  // Verificar que el archivo de video es reproducible y su contenido binario es íntegro
  const readBack = fs.readFileSync(path.join(pathsModule.DOWNLOADS_DIR, 'video-001.mp4'));
  assert.deepEqual(readBack, sampleMp4Bytes, 'Los bytes del archivo de video son idénticos y reproducibles');

  // Limpiar
  fs.rmSync(tempBase, { recursive: true, force: true });
  delete process.env.STREAMFLIX_DATA_DIR;
});
