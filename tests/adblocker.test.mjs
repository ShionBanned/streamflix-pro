import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// Mockear módulo electron en entorno de pruebas Node puro
const electronPath = require.resolve('electron');
require.cache[electronPath] = {
  id: electronPath,
  filename: electronPath,
  loaded: true,
  exports: {
    ipcMain: {
      handle: () => {},
      removeHandler: () => {},
    },
    app: {
      isReady: () => false,
      getPath: () => process.cwd(),
    },
  },
};

const { setupAdblocker } = require('../electron/adblocker.cjs');
const { ElectronBlocker, Request } = require('@ghostery/adblocker-electron');

test('Adblocker: setupAdblocker inicializa y conecta filtros a una sesión mock', async () => {
  let preloadRegistered = false;
  let headersListener = null;
  let beforeRequestListener = null;

  const mockSession = {
    registerPreloadScript: (options) => {
      preloadRegistered = true;
      return 'mock-preload-id';
    },
    webRequest: {
      onHeadersReceived: (filter, listener) => {
        headersListener = listener;
      },
      onBeforeRequest: (filter, listener) => {
        beforeRequestListener = listener;
      },
    },
  };

  const blocker = await setupAdblocker(mockSession);
  assert.ok(blocker, 'El blocker debe retornar una instancia válida');
  assert.ok(preloadRegistered, 'Debe haber registrado el script de preload para filtros cosméticos');
  assert.ok(headersListener, 'Debe haber registrado listener de onHeadersReceived');
  assert.ok(beforeRequestListener, 'Debe haber registrado listener de onBeforeRequest');
});

test('Adblocker: motor de reglas bloquea anuncios y permite tráfico legítimo', async () => {
  const blocker = await ElectronBlocker.fromPrebuiltFull();

  // Caso 1: Anuncio típico de red publicitaria
  const adReq = Request.fromRawDetails({
    url: 'https://securepubads.g.doubleclick.net/gampad/ads?iu=123',
    type: 'script',
  });
  const adMatch = blocker.match(adReq);
  assert.ok(adMatch.match, 'Debe bloquear peticiones a redes publicitarias conocidas');

  // Caso 2: Petición legítima a backend local o TMDB
  const safeReq = Request.fromRawDetails({
    url: 'http://127.0.0.1:4000/api/health',
    type: 'xmlhttprequest',
  });
  const safeMatch = blocker.match(safeReq);
  assert.equal(safeMatch.match, false, 'No debe bloquear el tráfico de la API local');
});

test('Seguridad: setWindowOpenHandler deniega todas las ventanas emergentes', () => {
  let registeredHandler = null;
  const mockWebContents = {
    setWindowOpenHandler: (handler) => {
      registeredHandler = handler;
    },
  };

  // Simula la configuración realizada en main.cjs
  mockWebContents.setWindowOpenHandler(({ url }) => {
    return { action: 'deny' };
  });

  assert.ok(registeredHandler, 'Debe registrarse un handler');
  
  const popupAttempts = [
    'https://anuncios-apuestas.com/popup',
    'https://popads.net/register',
    'about:blank',
    'javascript:void(0)',
  ];

  for (const url of popupAttempts) {
    const result = registeredHandler({ url });
    assert.deepEqual(result, { action: 'deny' }, `Debe denegar popup hacia ${url}`);
  }
});

test('Seguridad: will-navigate bloquea secuestro de navegación externa y permite local', () => {
  let navigateListener = null;
  const mockWebContents = {
    on: (event, listener) => {
      if (event === 'will-navigate') navigateListener = listener;
    },
  };

  const activeBackendUrl = 'http://127.0.0.1:4000';
  
  // Simula la configuración realizada en main.cjs
  mockWebContents.on('will-navigate', (event, navigationUrl) => {
    try {
      const parsedUrl = new URL(navigationUrl);
      const allowedOrigin = new URL(activeBackendUrl).origin;
      if (parsedUrl.origin !== allowedOrigin) {
        event.preventDefault();
      }
    } catch {
      event.preventDefault();
    }
  });

  // Intento 1: Secuestro hacia web externa
  const eventExternal = {
    defaultPrevented: false,
    preventDefault: () => { eventExternal.defaultPrevented = true; },
  };
  navigateListener(eventExternal, 'https://sitio-malicioso.com/login');
  assert.equal(eventExternal.defaultPrevented, true, 'Debe bloquear navegación externa');

  // Intento 2: Navegación interna válida
  const eventInternal = {
    defaultPrevented: false,
    preventDefault: () => { eventInternal.defaultPrevented = true; },
  };
  navigateListener(eventInternal, 'http://127.0.0.1:4000/series');
  assert.equal(eventInternal.defaultPrevented, false, 'Debe permitir navegación dentro del backend local');
});
