const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('node:path');
const http = require('node:http');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { UpdateEngine } = require('./updater.cjs');
const { setupAdblocker } = require('./adblocker.cjs');

let mainWindow = null;
let backendProcess = null;
let updateEngine = null;

let activePort = process.env.PORT || 4000;
let activeBackendUrl = `http://127.0.0.1:${activePort}`;

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

function getAppPaths() {
  if (app.isPackaged) {
    const appDir = path.join(process.resourcesPath, 'app');
    return {
      backendEntry: path.join(appDir, 'backend', 'server.js'),
      staticDir: path.join(appDir, 'frontend', 'dist'),
    };
  }
  return {
    backendEntry: path.resolve(__dirname, '..', 'backend', 'server.js'),
    staticDir: path.resolve(__dirname, '..', 'frontend', 'dist'),
  };
}

function getAvailablePort(preferredPort = 4000) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => {
      // Puerto preferido ocupado, asignar uno libre disponible por el sistema operativo
      const fallbackServer = net.createServer();
      fallbackServer.listen(0, '127.0.0.1', () => {
        const port = fallbackServer.address().port;
        fallbackServer.close(() => resolve(port));
      });
    });
    server.once('listening', () => {
      server.close(() => resolve(preferredPort));
    });
    server.listen(preferredPort, '127.0.0.1');
  });
}

function checkBackendHealth(targetUrl, timeoutMs = 15000) {
  const start = Date.now();
  return new Promise((resolve) => {
    const probe = () => {
      const req = http.get(`${targetUrl}/api/health`, (res) => {
        if (res.statusCode === 200) {
          let body = '';
          res.on('data', (c) => { body += c; });
          res.on('end', () => {
            try {
              const data = JSON.parse(body);
              if (data && data.status === 'online') {
                resolve(true);
                return;
              }
            } catch {
              // Respuesta incompleta o no-JSON durante arranque inicial; se reintentará en el siguiente probe
            }
            if (Date.now() - start < timeoutMs) {
              setTimeout(probe, 200);
            } else {
              resolve(false);
            }
          });
        } else if (Date.now() - start < timeoutMs) {
          setTimeout(probe, 200);
        } else {
          resolve(false);
        }
      });
      req.on('error', () => {
        if (Date.now() - start < timeoutMs) {
          setTimeout(probe, 200);
        } else {
          resolve(false);
        }
      });
      req.end();
    };
    probe();
  });
}

function startBackend(port) {
  const { backendEntry, staticDir } = getAppPaths();

  const env = {
    ...process.env,
    PORT: String(port),
    NODE_ENV: 'production',
    STREAMFLIX_STATIC_DIR: staticDir,
    ELECTRON_RUN_AS_NODE: '1',
  };

  const nodeBinary = process.execPath;

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
      `${activeBackendUrl}/api/system/shutdown`,
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

  // 1. Bloqueo total de ventanas emergentes (Popups y Popunders)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    console.log(`[Seguridad] Popup bloqueado hacia: ${url}`);
    return { action: 'deny' };
  });

  // 2. Bloqueo de secuestro de navegación (Anti-Hijack)
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    try {
      const parsedUrl = new URL(navigationUrl);
      const allowedOrigin = new URL(activeBackendUrl).origin;
      if (parsedUrl.origin !== allowedOrigin) {
        event.preventDefault();
        console.warn(`[Seguridad] Redirección no autorizada bloqueada: ${navigationUrl}`);
      }
    } catch {
      event.preventDefault();
    }
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.loadURL(activeBackendUrl);

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
  // En producción siempre levantar backend propio en un puerto disponible
  if (app.isPackaged) {
    activePort = await getAvailablePort(4000);
    activeBackendUrl = `http://127.0.0.1:${activePort}`;
    startBackend(activePort);
    await checkBackendHealth(activeBackendUrl, 15000);
  } else {
    // En desarrollo verificar si ya hay un backend corriendo en el puerto configurado
    const alreadyRunning = await checkBackendHealth(activeBackendUrl, 800);
    if (!alreadyRunning) {
      startBackend(activePort);
      await checkBackendHealth(activeBackendUrl, 15000);
    }
  }

  // Iniciar motor de bloqueo de publicidad y rastreo (Modo Completo: EasyList + EasyPrivacy + uBlock)
  setupAdblocker(session.defaultSession).catch((err) => {
    console.warn('[Adblock] Fallo no crítico al iniciar filtros:', err.message);
  });

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
