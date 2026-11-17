import fs from 'node:fs';
import { USER_STORAGE_FILE } from '../config/paths.js';

let memoryCache = null;

function loadStorage() {
  if (memoryCache !== null) return memoryCache;
  try {
    if (fs.existsSync(USER_STORAGE_FILE)) {
      const raw = fs.readFileSync(USER_STORAGE_FILE, 'utf8');
      memoryCache = JSON.parse(raw);
    } else {
      memoryCache = {};
    }
  } catch (error) {
    console.warn('[UserStorage] Error leyendo almacenamiento:', error.message);
    memoryCache = {};
  }
  return memoryCache;
}

export function getUserStorage() {
  return loadStorage();
}

export function saveUserStorage(updates = {}) {
  const current = loadStorage();
  const next = {
    ...current,
    ...updates,
    _updatedAt: new Date().toISOString(),
  };
  memoryCache = next;
  try {
    fs.writeFileSync(USER_STORAGE_FILE, JSON.stringify(next, null, 2), 'utf8');
  } catch (error) {
    console.error('[UserStorage] Error guardando almacenamiento:', error.message);
  }
  return next;
}
