import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function getDataDir() {
  if (process.env.STREAMFLIX_DATA_DIR) {
    return path.resolve(process.env.STREAMFLIX_DATA_DIR);
  }
  if (process.platform === 'win32') {
    const base = process.env.APPDATA || (process.env.USERPROFILE ? path.join(process.env.USERPROFILE, 'AppData', 'Roaming') : os.homedir());
    return path.join(base, 'StreamFlix');
  }
  return path.join(os.homedir(), '.streamflix');
}

export const DATA_DIR = getDataDir();
export const DOWNLOADS_DIR = path.join(DATA_DIR, 'downloads');
export const DOWNLOADS_INDEX = path.join(DOWNLOADS_DIR, 'index.json');
export const IPTV_CACHE_FILE = path.join(DATA_DIR, 'iptv-channels-cache.json');
export const IPTV_HEALTH_FILE = path.join(DATA_DIR, 'iptv-health.json');
export const AI_JOBS_DIR = path.join(DATA_DIR, 'ai-jobs');
export const USER_STORAGE_FILE = path.join(DATA_DIR, 'user-preferences.json');

export function initDataDirectories(customLegacyDir = null) {
  try {
    fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
    fs.mkdirSync(AI_JOBS_DIR, { recursive: true });

    const legacyDirs = [
      customLegacyDir,
      path.resolve(process.cwd(), '.local'),
      path.resolve(__dirname, '..', '.local'),
      path.resolve(__dirname, '..', '..', '.local'),
    ].filter(Boolean);

    for (const legacyDir of legacyDirs) {
      if (fs.existsSync(legacyDir) && path.resolve(legacyDir) !== path.resolve(DATA_DIR)) {
        const legacyIptv = path.join(legacyDir, 'iptv-channels-cache.json');
        if (fs.existsSync(legacyIptv) && !fs.existsSync(IPTV_CACHE_FILE)) {
          fs.copyFileSync(legacyIptv, IPTV_CACHE_FILE);
        }

        const legacyHealth = path.join(legacyDir, 'iptv-health.json');
        if (fs.existsSync(legacyHealth) && !fs.existsSync(IPTV_HEALTH_FILE)) {
          fs.copyFileSync(legacyHealth, IPTV_HEALTH_FILE);
        }

        const legacyDownloads = path.join(legacyDir, 'downloads');
        if (fs.existsSync(legacyDownloads)) {
          const entries = fs.readdirSync(legacyDownloads);
          for (const entry of entries) {
            const srcPath = path.join(legacyDownloads, entry);
            const destPath = path.join(DOWNLOADS_DIR, entry);
            const shouldOverwriteEmptyIndex = entry === 'index.json' && fs.existsSync(destPath) && fs.readFileSync(destPath, 'utf8').trim() === '[]';
            if (!fs.existsSync(destPath) || shouldOverwriteEmptyIndex) {
              try {
                const stat = fs.statSync(srcPath);
                if (stat.isDirectory()) {
                  fs.cpSync(srcPath, destPath, { recursive: true });
                } else {
                  fs.copyFileSync(srcPath, destPath);
                }
              } catch (copyErr) {
                console.warn(`[Paths] Error migrando archivo de descarga ${entry}:`, copyErr.message);
              }
            }
          }
        }
      }
    }

    if (!fs.existsSync(DOWNLOADS_INDEX)) {
      fs.writeFileSync(DOWNLOADS_INDEX, '[]', 'utf8');
    }
  } catch (error) {
    console.warn('[Paths] Fallo inicializando directorios persistentes:', error.message);
  }
}
