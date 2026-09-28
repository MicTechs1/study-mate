import type {
  CompanionSettings,
  DayRecord,
  ReviewCard,
  StudyDocument,
} from "./types";

const DB_NAME = "studymate";
const DB_VERSION = 2;
const DOCS = "documents";
const DAYS = "days";
const REVIEWS = "reviews";
const SETTINGS_KEY = "studymate-settings";
const DATA_EVENT = "studymate:data-changed";

function notifyDataChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(DATA_EVENT));
}

/**
 * Subscribe to local study-data mutations (imports, erases, other tabs) so
 * mounted views can reload instead of showing stale lists.
 */
export function subscribeDataChanges(onChange: () => void) {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(DATA_EVENT, onChange);
  return () => window.removeEventListener(DATA_EVENT, onChange);
}

const defaultSettings: CompanionSettings = {
  voiceEnabled: true,
  voiceRate: 1,
  autoSpeak: true,
  compactTranscript: true,
  onboarded: false,
  dailyGoalMinutes: 20,
};

export class StorageUnavailableError extends Error {
  constructor() {
    super("Local storage is not available in this browser context.");
    this.name = "StorageUnavailableError";
  }
}

export class StorageQuotaError extends Error {
  constructor() {
    super("This device is out of storage space. Remove a document and try again.");
    this.name = "StorageQuotaError";
  }
}

function isQuotaError(error: unknown) {
  if (error instanceof DOMException && error.name === "QuotaExceededError") {
    return true;
  }
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: unknown }).name === "QuotaExceededError"
  );
}

function normalizeError(error: unknown): unknown {
  if (isQuotaError(error)) return new StorageQuotaError();
  return error;
}

function hasIndexedDb() {
  return typeof indexedDB !== "undefined";
}

let dbPromise: Promise<IDBDatabase> | null = null;

function runUpgrade(db: IDBDatabase) {
  if (!db.objectStoreNames.contains(DOCS)) {
    db.createObjectStore(DOCS, { keyPath: "id" });
  }
  if (!db.objectStoreNames.contains(DAYS)) {
    db.createObjectStore(DAYS, { keyPath: "dateKey" });
  }
  if (!db.objectStoreNames.contains(REVIEWS)) {
    db.createObjectStore(REVIEWS, { keyPath: "id" });
  }
}

function openDb(): Promise<IDBDatabase> {
  if (!hasIndexedDb()) {
    return Promise.reject(new StorageUnavailableError());
  }
  if (dbPromise) return dbPromise;

  const pending = new Promise<IDBDatabase>((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (error) {
      reject(normalizeError(error));
      return;
    }
    request.onupgradeneeded = () => runUpgrade(request.result);
    request.onblocked = () =>
      reject(new Error("Close other StudyMate tabs to finish upgrading local storage."));
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    request.onerror = () => reject(normalizeError(request.error));
  });

  dbPromise = pending;
  void pending.then(
    () => undefined,
    () => {
      if (dbPromise === pending) dbPromise = null;
    },
  );
  return pending;
}

/** Drop the cached handle so the next call reopens (used after a failed upgrade). */
export function resetDatabaseHandle() {
  const pending = dbPromise;
  dbPromise = null;
  void pending?.then(
    (db) => db.close(),
    () => undefined,
  );
}

async function readAll<T>(store: string): Promise<T[]> {  if (!hasIndexedDb()) return [];
  const db = await openDb();
  return new Promise<T[]>((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(normalizeError(req.error));
    tx.onabort = () =>
      reject(
        normalizeError(
          tx.error ?? new DOMException("Transaction aborted", "AbortError"),
        ),
      );
  });
}

async function getOne<T>(store: string, key: IDBValidKey): Promise<T | null> {
  if (!hasIndexedDb()) return null;
  const db = await openDb();
  return new Promise<T | null>((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve((req.result as T | undefined) ?? null);
    req.onerror = () => reject(normalizeError(req.error));
  });
}

async function writeOne(store: string, value: unknown, mode: IDBTransactionMode = "readwrite") {
  if (!hasIndexedDb()) throw new StorageUnavailableError();
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    try {
      const tx = db.transaction(store, mode);
      tx.objectStore(store).put(value);
      tx.oncomplete = () => {
        notifyDataChanged();
        resolve();
      };
      tx.onerror = () => reject(normalizeError(tx.error));
      tx.onabort = () =>
        reject(
          normalizeError(
            tx.error ?? new DOMException("Transaction aborted", "AbortError"),
          ),
        );
    } catch (error) {
      reject(normalizeError(error));
    }
  });
}

async function deleteOne(store: string, key: IDBValidKey) {
  if (!hasIndexedDb()) throw new StorageUnavailableError();
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => {
      notifyDataChanged();
      resolve();
    };
    tx.onerror = () => reject(normalizeError(tx.error));
    tx.onabort = () =>
      reject(
        normalizeError(
          tx.error ?? new DOMException("Transaction aborted", "AbortError"),
        ),
      );
  });
}

export async function listDocuments(): Promise<StudyDocument[]> {
  const docs = await readAll<StudyDocument>(DOCS);
  return docs.sort((a, b) => b.createdAt - a.createdAt);
}

export function saveDocument(doc: StudyDocument) {
  return writeOne(DOCS, doc);
}

export function deleteDocument(id: string) {
  return deleteOne(DOCS, id);
}

export function loadSettings(): CompanionSettings {
  if (typeof localStorage === "undefined") return defaultSettings;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaultSettings;
    return { ...defaultSettings, ...JSON.parse(raw) };
  } catch {
    return defaultSettings;
  }
}

export function saveSettings(settings: CompanionSettings) {
  if (typeof localStorage === "undefined") throw new StorageUnavailableError();
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function clearSettings() {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(SETTINGS_KEY);
}

export function getDay(dateKey: string): Promise<DayRecord | null> {
  return getOne<DayRecord>(DAYS, dateKey);
}

export function saveDay(day: DayRecord) {
  return writeOne(DAYS, day);
}

export async function listRecentDays(limit = 365): Promise<DayRecord[]> {
  const days = await readAll<DayRecord>(DAYS);
  return days
    .sort((a, b) => (a.dateKey < b.dateKey ? 1 : -1))
    .slice(0, limit);
}

export function listReviewCards(): Promise<ReviewCard[]> {
  return readAll<ReviewCard>(REVIEWS);
}

export function saveReviewCard(card: ReviewCard) {
  return writeOne(REVIEWS, card);
}

export function deleteReviewCard(id: string) {
  return deleteOne(REVIEWS, id);
}

export async function storageCounts(): Promise<{
  documents: number;
  reviewCards: number;
  days: number;
}> {
  const empty = { documents: 0, reviewCards: 0, days: 0 };
  if (!hasIndexedDb()) return empty;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([DOCS, REVIEWS, DAYS], "readonly");
    const result = { ...empty };
    const docs = tx.objectStore(DOCS).count();
    const reviews = tx.objectStore(REVIEWS).count();
    const days = tx.objectStore(DAYS).count();
    docs.onsuccess = () => {
      result.documents = docs.result;
    };
    reviews.onsuccess = () => {
      result.reviewCards = reviews.result;
    };
    days.onsuccess = () => {
      result.days = days.result;
    };
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(normalizeError(tx.error));
    tx.onabort = () =>
      reject(
        normalizeError(
          tx.error ?? new DOMException("Transaction aborted", "AbortError"),
        ),
      );
  });
}

export function saveDocuments(docs: StudyDocument[]) {
  return writeMany(DOCS, docs);
}

export function saveReviewCards(cards: ReviewCard[]) {
  return writeMany(REVIEWS, cards);
}

async function writeMany(store: string, values: unknown[]) {
  if (values.length === 0) return;
  if (!hasIndexedDb()) throw new StorageUnavailableError();
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    try {
      const tx = db.transaction(store, "readwrite");
      const objectStore = tx.objectStore(store);
      for (const value of values) objectStore.put(value);
      tx.oncomplete = () => {
        notifyDataChanged();
        resolve();
      };
      tx.onerror = () => reject(normalizeError(tx.error));
      tx.onabort = () =>
        reject(
          normalizeError(
            tx.error ?? new DOMException("Transaction aborted", "AbortError"),
          ),
        );
    } catch (error) {
      reject(normalizeError(error));
    }
  });
}

export function clearDayRecords() {
  return clearStores([DAYS]);
}

export function clearStudyData() {
  return clearStores([DOCS, REVIEWS, DAYS]);
}

/** Erase every trace of local study data, including settings. */
export async function clearAllData() {
  await clearStudyData();
  clearSettings();
}

async function clearStores(stores: string[]) {
  if (!hasIndexedDb()) throw new StorageUnavailableError();
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(stores, "readwrite");
    for (const store of stores) tx.objectStore(store).clear();
    tx.oncomplete = () => {
      notifyDataChanged();
      resolve();
    };
    tx.onerror = () => reject(normalizeError(tx.error));
    tx.onabort = () =>
      reject(
        normalizeError(
          tx.error ?? new DOMException("Transaction aborted", "AbortError"),
        ),
      );
  });
}

export async function storageEstimate(): Promise<{
  usage: number | null;
  quota: number | null;
}> {
  if (typeof navigator === "undefined" || !navigator.storage?.estimate) {
    return { usage: null, quota: null };
  }
  try {
    const estimate = await navigator.storage.estimate();
    return { usage: estimate.usage ?? null, quota: estimate.quota ?? null };
  } catch {
    return { usage: null, quota: null };
  }
}

export { defaultSettings, DB_NAME, DB_VERSION, SETTINGS_KEY };
