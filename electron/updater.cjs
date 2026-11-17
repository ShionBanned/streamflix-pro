const { EventEmitter } = require('node:events');

class UpdateEngine extends EventEmitter {
  constructor({
    autoUpdater,
    pollIntervalMs = 2 * 60 * 60 * 1000,
    checkOnStart = true,
    startDelayMs = 4000,
    logger = console,
    onInstallRequested = null,
  } = {}) {
    super();
    this.autoUpdater = autoUpdater;
    this.pollIntervalMs = pollIntervalMs;
    this.checkOnStart = checkOnStart;
    this.startDelayMs = startDelayMs;
    this.logger = logger;
    this.onInstallRequested = onInstallRequested;

    this.isChecking = false;
    this.postponed = false;
    this.timer = null;
    this.startTimer = null;
    this.latestDownloadedUpdate = null;

    if (this.autoUpdater) {
      this.bindAutoUpdaterEvents();
    }
  }

  bindAutoUpdaterEvents() {
    this.autoUpdater.autoDownload = true;
    this.autoUpdater.autoInstallOnAppQuit = false;

    this.autoUpdater.on('checking-for-update', () => {
      this.logger.info('[Updater] Comprobando canal de versiones...');
    });

    this.autoUpdater.on('update-available', (info) => {
      this.isChecking = false;
      this.logger.info(`[Updater] Nueva versión disponible: v${info?.version || ''}. Descargando en segundo plano...`);
      this.emit('update-available', info);
    });

    this.autoUpdater.on('update-not-available', (info) => {
      this.isChecking = false;
      this.logger.info('[Updater] La versión instalada está al día. Silencio absoluto.');
    });

    this.autoUpdater.on('error', (err) => {
      this.isChecking = false;
      this.logger.warn('[Updater] Comprobación no disponible (red o servidor):', err && err.message ? err.message : err);
    });

    this.autoUpdater.on('download-progress', (progressObj) => {
      if (this.postponed) return;
      this.emit('download-progress', {
        percent: progressObj?.percent || 0,
        bytesPerSecond: progressObj?.bytesPerSecond || 0,
        transferred: progressObj?.transferred || 0,
        total: progressObj?.total || 0,
      });
    });

    this.autoUpdater.on('update-downloaded', (info) => {
      this.isChecking = false;
      this.latestDownloadedUpdate = info;
      this.logger.info(`[Updater] Versión v${info?.version || ''} lista para instalar.`);
      if (!this.postponed) {
        this.emit('update-downloaded', info);
      }
    });
  }

  async checkForUpdates() {
    if (this.isChecking) {
      this.logger.info('[Updater] Ya hay una comprobación en curso. Omitiendo llamada concurrente.');
      return { skipped: true, reason: 'concurrent_check_prevented' };
    }

    if (!this.autoUpdater) {
      return { skipped: true, reason: 'no_updater_configured' };
    }

    this.isChecking = true;
    try {
      const checkResult = await this.autoUpdater.checkForUpdates();
      return checkResult;
    } catch (err) {
      this.isChecking = false;
      this.logger.warn('[Updater] Fallo silencioso en consulta:', err && err.message ? err.message : err);
      return { error: err && err.message ? err.message : String(err) };
    }
  }

  postpone() {
    this.postponed = true;
    this.logger.info('[Updater] Actualización pospuesta por el usuario.');
    this.emit('postponed');
  }

  async installNow() {
    if (this.onInstallRequested) {
      try {
        await this.onInstallRequested();
      } catch (err) {
        this.logger.warn('[Updater] Advertencia al cerrar backend:', err && err.message ? err.message : err);
      }
    }
    if (this.autoUpdater && typeof this.autoUpdater.quitAndInstall === 'function') {
      this.autoUpdater.quitAndInstall(false, true);
    }
  }

  start() {
    if (this.checkOnStart) {
      this.startTimer = setTimeout(() => {
        void this.checkForUpdates();
      }, this.startDelayMs);
    }

    this.timer = setInterval(() => {
      void this.checkForUpdates();
    }, this.pollIntervalMs);
  }

  stop() {
    if (this.startTimer) clearTimeout(this.startTimer);
    if (this.timer) clearInterval(this.timer);
    this.startTimer = null;
    this.timer = null;
  }
}

module.exports = { UpdateEngine };
