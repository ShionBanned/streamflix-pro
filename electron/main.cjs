const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { UpdateEngine } = require('./updater.cjs');

let mainWindow = null;
let backendProcess = null;
let updateEngine = null;

const PORT = process.env.PORT || 4000;
const BACKEND_URL = `http://127.0.0.1:${PORT}`;

// Evitar múltiples instancias simultáneas
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

function checkBackendHealth(timeoutMs = 15000) {
  const start = Date.now();
  return new Promise((resolve) => {
    const probe = () => {
      const req = http.get(`${BACKEND_URL}/api/health`, (res) => {
        if (res.statusCode === 200) {
          resolve(true);
        } else if (Date.now() - start < timeoutMs) {
          setTimeout(probe, 250);
        } else {
          resolve(false);
        }
      });
      req.on('error', () => {
        if (Date.now() - start < timeoutMs) {
          setTimeout(probe, 250);
        } else {
          resolve(false);
        }
      });
      req.end();
    };
    probe();
  });
}

function startBackend() {
  const backendEntry = path.resolve(__dirname, '..', 'backend', 'server.js');
  const staticDir = path.resolve(__dirname, '..', 'frontend', 'dist');

  const env = {
    ...process.env,
    PORT: String(PORT),
    NODE_ENV: 'production',
    STREAMFLIX_STATIC_DIR: staticDir,
    ELECTRON_RUN_AS_NODE: '1',
  };

  // En Electron empaquetado, process.execPath con ELECTRON_RUN_AS_NODE=1 ejecuta Node.js nativo sin dependencias externas
  const nodeBinary = app.isPackaged ? process.execPath : process.execPath;

  backendProcess = spawn(nodeBinary, [backendEntry], {
    env,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  backendProcess.stdout?.on('data', (d) => {
    const msg = d.toString().trim();
    if (msg) console.log(`[Backend]: ${msg}`);
  });

  backendProcess.stderr?.on('data', (d) => {
    const msg = d.toString().trim();
    if (msg) console.warn(`[Backend Err]: ${msg}`);
  });

  backendProcess.on('exit', (code) => {
    console.log(`[Backend] Proceso finalizado con código: ${code}`);
    backendProcess = null;
  });
}

async function stopBackendGracefully() {
  if (!backendProcess) return;

  // Intentar apagado ordenado mediante endpoint
  await new Promise((resolve) => {
    const postData = JSON.stringify({});
    const req = http.request(
      `${BACKEND_URL}/api/system/shutdown`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
        },
        timeout: 2000,
      },
      () => resolve(true)
    );
    req.on('error', () => resolve(false));
    req.write(postData);
    req.end();
  });

  // Si sigue vivo tras 1 segundo, terminar proceso
  if (backendProcess) {
    try {
      backendProcess.kill();
    } catch {
      // Proceso ya finalizado o cerrado previamente
    }
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 600,
    title: 'StreamFlix Pro',
    backgroundColor: '#080808',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.loadURL(BACKEND_URL);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function setupAutoUpdater() {
  let rawUpdater = null;
  try {
    const { autoUpdater } = require('electron-updater');
    rawUpdater = autoUpdater;
  } catch (err) {
    console.warn('[Updater] electron-updater no disponible en este entorno:', err.message);
  }

  updateEngine = new UpdateEngine({
    autoUpdater: rawUpdater,
    pollIntervalMs: 2 * 60 * 60 * 1000, // Cada 2 horas
    checkOnStart: true,
    startDelayMs: 6000,
    onInstallRequested: stopBackendGracefully,
  });

  updateEngine.on('download-progress', (progress) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('updater:progress', progress);
    }
  });

  updateEngine.on('update-downloaded', (info) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('updater:downloaded', info);
    }
  });

  updateEngine.start();
}

app.whenReady().then(async () => {
  // Comprobar si el backend ya está corriendo externamente (por ejemplo, en desarrollo)
  const alreadyRunning = await checkBackendHealth(800);
  if (!alreadyRunning) {
    startBackend();
    await checkBackendHealth(15000);
  }

  createWindow();
  setupAutoUpdater();

  ipcMain.handle('app:get-version', () => app.getVersion());
  ipcMain.handle('updater:check', () => updateEngine?.checkForUpdates());
  ipcMain.handle('updater:install', () => updateEngine?.installNow());
  ipcMain.handle('updater:postpone', () => updateEngine?.postpone());

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', async (e) => {
  if (backendProcess) {
    e.preventDefault();
    await stopBackendGracefully();
    backendProcess = null;
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
