import type { FisheyeParams } from '../types/index.ts';

const DB_NAME = 'eyes-of-fish';
const DB_VERSION = 1;
const STORE_NAME = 'assets';
const IMAGE_KEY = 'source-image';
const PARAMS_KEY = 'eof-params';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveImage(blob: Blob): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(blob, IMAGE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadImage(): Promise<Blob | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(IMAGE_KEY);
    req.onsuccess = () => resolve((req.result as Blob) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export function saveParams(params: FisheyeParams): void {
  localStorage.setItem(PARAMS_KEY, JSON.stringify(params));
}

export function loadParams(): FisheyeParams | null {
  const raw = localStorage.getItem(PARAMS_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as FisheyeParams;
  } catch {
    return null;
  }
}
