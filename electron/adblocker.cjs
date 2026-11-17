const path = require('node:path');
const fs = require('node:fs/promises');
const { app } = require('electron');
const { ElectronBlocker } = require('@ghostery/adblocker-electron');
const fetch = require('cross-fetch');

let activeBlocker = null;

/**
 * Inicializa el motor de bloqueo de publicidad, rastreo y popups (Modo Completo).
 * Combina EasyList, EasyPrivacy, filtros cosméticos y listas de uBlock Origin.
 *
 * @param {import('electron').Session} targetSession
 * @returns {Promise<ElectronBlocker|null>}
 */
async function setupAdblocker(targetSession) {
  if (activeBlocker) {
    try {
      activeBlocker.enableBlockingInSession(targetSession);
    } catch {
      // Ya activo o vinculado
    }
    return activeBlocker;
  }

  try {
    const os = require('node:os');
    const userDataPath = (app && typeof app.isReady === 'function' && app.isReady())
      ? app.getPath('userData')
      : os.tmpdir();
    const cachePath = path.join(userDataPath, 'adblocker-full-engine.bin');

    const caching = {
      path: cachePath,
      read: (p) => fs.readFile(p),
      write: (p, data) => fs.writeFile(p, data),
    };

    console.log('[Adblock] Inicializando motor de filtrado Completo (EasyList + EasyPrivacy + uBlock)...');

    // Modo Completo: bloquea peticiones de anuncios, trackers y aplica filtrado cosmético en páginas e iframes
    activeBlocker = await ElectronBlocker.fromPrebuiltFull(fetch, caching);
    activeBlocker.enableBlockingInSession(targetSession);

    console.log('[Adblock] Escudo activo: Anuncios, popups y scripts de rastreo bloqueados');
    return activeBlocker;
  } catch (err) {
    console.warn('[Adblock] Error cargando listas completas, intentando modo esencial:', err.message);
    try {
      activeBlocker = await ElectronBlocker.fromPrebuiltAdsAndTracking(fetch);
      activeBlocker.enableBlockingInSession(targetSession);
      console.log('[Adblock] Escudo activo (Modo esencial: Ads & Tracking)');
      return activeBlocker;
    } catch (fallbackErr) {
      console.warn('[Adblock] No se pudo inicializar el adblocker:', fallbackErr.message);
      return null;
    }
  }
}

module.exports = {
  setupAdblocker,
};
