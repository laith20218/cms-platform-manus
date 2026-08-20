/**
 * IndexedDB wrapper for storing offline exam packages and answers.
 * Uses a simple Promise-based API over the IndexedDB.
 *
 * Database: cms-offline
 * Stores:
 *  - packages: encrypted offline envelopes and safe metadata only (no plaintext questions or raw AES keys)
 *  - answers: offline answers waiting to sync
 */

const DB_NAME = 'cms-offline';
const DB_VERSION = 2;
const PACKAGES_STORE = 'packages';
const ANSWERS_STORE = 'answers';

// ===== Database Initialization =====

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Packages store
      if (!db.objectStoreNames.contains(PACKAGES_STORE)) {
        const pkgStore = db.createObjectStore(PACKAGES_STORE, { keyPath: 'packageId' });
        pkgStore.createIndex('subjectId', 'subjectId', { unique: false });
        pkgStore.createIndex('expiresAt', 'expiresAt', { unique: false });
      }

      // Answers store
      if (!db.objectStoreNames.contains(ANSWERS_STORE)) {
        const ansStore = db.createObjectStore(ANSWERS_STORE, { keyPath: 'id', autoIncrement: true });
        ansStore.createIndex('packageId', 'packageId', { unique: false });
        ansStore.createIndex('synced', 'synced', { unique: false });
      }
    };
  });
}

// ===== Package Operations =====

export async function savePackage(pkg: OfflinePackageData): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PACKAGES_STORE, 'readwrite');
    const store = tx.objectStore(PACKAGES_STORE);
    const request = store.put(pkg);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getPackage(packageId: string): Promise<OfflinePackageData | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PACKAGES_STORE, 'readonly');
    const store = tx.objectStore(PACKAGES_STORE);
    const request = store.get(packageId);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getAllPackages(): Promise<OfflinePackageData[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PACKAGES_STORE, 'readonly');
    const store = tx.objectStore(PACKAGES_STORE);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

export async function deletePackage(packageId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([PACKAGES_STORE, ANSWERS_STORE], 'readwrite');

    // Delete the package
    tx.objectStore(PACKAGES_STORE).delete(packageId);

    // Delete associated unsynced answers
    const ansStore = tx.objectStore(ANSWERS_STORE);
    const ansIndex = ansStore.index('packageId');
    const cursorReq = ansIndex.openCursor(IDBKeyRange.only(packageId));
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ===== Answer Operations =====

export async function saveAnswer(answer: OfflineAnswerRecord): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ANSWERS_STORE, 'readwrite');
    const store = tx.objectStore(ANSWERS_STORE);
    const request = store.add(answer);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getUnsyncedAnswers(packageId?: string): Promise<OfflineAnswerRecord[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ANSWERS_STORE, 'readonly');
    const store = tx.objectStore(ANSWERS_STORE);

    if (packageId) {
      const index = store.index('packageId');
      const request = index.getAll(IDBKeyRange.only(packageId));
      request.onsuccess = () => resolve((request.result || []).filter(a => !a.synced));
      request.onerror = () => reject(request.error);
    } else {
      const request = store.getAll();
      request.onsuccess = () => resolve((request.result || []).filter(a => !a.synced));
      request.onerror = () => reject(request.error);
    }
  });
}

export async function markAnswersSynced(ids: number[]): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ANSWERS_STORE, 'readwrite');
    const store = tx.objectStore(ANSWERS_STORE);

    ids.forEach(id => {
      const getRequest = store.get(id);
      getRequest.onsuccess = () => {
        if (getRequest.result) {
          const updated = { ...getRequest.result, synced: true, syncedAt: new Date().toISOString() };
          store.put(updated);
        }
      };
    });

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearSyncedAnswers(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ANSWERS_STORE, 'readwrite');
    const store = tx.objectStore(ANSWERS_STORE);
    const index = store.index('synced');
    const request = index.openCursor(IDBKeyRange.only(1));

    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getUnsyncedCount(): Promise<number> {
  const answers = await getUnsyncedAnswers();
  return answers.length;
}

// ===== Cleanup =====

/** Removes all legacy Offline payloads and queued answers. Use only when the
 * server disables Offline because the current package security contract is no
 * longer trusted. */
export async function clearAllOfflineData(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([PACKAGES_STORE, ANSWERS_STORE], 'readwrite');
    tx.objectStore(PACKAGES_STORE).clear();
    tx.objectStore(ANSWERS_STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function cleanupExpiredPackages(): Promise<number> {
  const packages = await getAllPackages();
  const now = new Date();
  let deleted = 0;

  for (const pkg of packages) {
    if (new Date(pkg.expiresAt) < now) {
      await deletePackage(pkg.packageId);
      deleted++;
    }
  }

  return deleted;
}

// ===== Types =====

export interface OfflinePackageData {
  packageId: string;
  subjectId: string;
  examId?: string;
  subjectName: string;
  examTitle?: string;
  questionsCount: number;
  downloadedAt: string;
  expiresAt: string;
  manifest: {
    packageId: string;
    userId: string;
    installationId: string;
    contentVersion: number;
    allowedSubjects: string[];
    issuedAt: string;
    expiresAt: string;
    nonceBase64Url: string;
    aadHashBase64Url: string;
    signatureBase64Url: string;
  };
  ciphertextBase64Url: string;
  tagBase64Url: string;
  wrappedKeyBase64Url: string;
  keyReleaseToken: string;
}

export interface OfflineAnswerRecord {
  id?: number;
  packageId: string;
  questionId: string;
  selectedOptionId: string;
  durationSeconds: number;
  answeredAt: string;
  isCorrect: boolean;
  synced: 0 | 1; // IndexedDB doesn't support boolean indexes
  syncedAt?: string;
}
