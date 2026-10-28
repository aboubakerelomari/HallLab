// HallLab — stockage local : mesures dans IndexedDB, réglages dans localStorage.

const DB_NAME = 'halllab';
const DB_VERSION = 1;
const STORE = 'measurements';
const SETTINGS_KEY = 'halllab.settings';

let dbPromise = null;
let memoryFallback = null; // si IndexedDB est indisponible (navigation privée…)

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) {
      reject(new Error('IndexedDB indisponible'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('date', 'date');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }).catch((err) => {
    console.warn('Stockage en mémoire seulement :', err);
    memoryFallback = new Map();
    return null;
  });
  return dbPromise;
}

function tx(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const result = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(result?.result ?? result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export async function isPersistent() {
  await openDB();
  return memoryFallback === null;
}

export async function listMeasurements() {
  const db = await openDB();
  const all = db ? await tx(db, 'readonly', (s) => s.getAll()) : [...memoryFallback.values()];
  return all.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export async function getMeasurement(id) {
  const db = await openDB();
  return db ? tx(db, 'readonly', (s) => s.get(id)) : memoryFallback.get(id);
}

export async function saveMeasurement(record) {
  const db = await openDB();
  if (db) await tx(db, 'readwrite', (s) => s.put(record));
  else memoryFallback.set(record.id, record);
  return record;
}

export async function saveMany(records) {
  const db = await openDB();
  if (db) await tx(db, 'readwrite', (s) => records.forEach((r) => s.put(r)));
  else records.forEach((r) => memoryFallback.set(r.id, r));
}

export async function deleteMeasurement(id) {
  const db = await openDB();
  if (db) await tx(db, 'readwrite', (s) => s.delete(id));
  else memoryFallback.delete(id);
}

export function newId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

// --- Réglages -------------------------------------------------------------

const DEFAULT_SETTINGS = {
  material: 'Si',
  dopant: 'P',
  units: {}, // id du champ → unité choisie
  thickness: { value: '', unit: 'nm' },
  invertHallSign: false,
  lastSample: '',
  tab: 'vdp',
};

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const saved = raw ? JSON.parse(raw) : {};
    return { ...DEFAULT_SETTINGS, ...saved, units: { ...(saved.units || {}) } };
  } catch {
    return { ...DEFAULT_SETTINGS, units: {} };
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* stockage bloqué : les réglages ne survivront pas au rechargement */
  }
}
